// testing/unit/authTwoPaths.test.tsx
//
// ขอบเขตของไฟล์นี้ (Phase 4 — Authentication & System Accounts, ดู testing/TEST_PLAN.md):
// 1. แยกพฤติกรรม 2 เส้นทาง auth ของ src/context/AppContext.tsx ฟังก์ชัน `login`:
//    (ก) เส้นทาง Firebase `signInWithEmailAndPassword` จริง — ใช้เมื่อบัญชีนั้นมีบัญชี Firebase Auth
//        จริงลงทะเบียนไว้แล้ว (กรณีจริงในระบบ: super_manager_user) — สำเร็จโดยไม่ต้องพึ่งฟิลด์ password
//        ในเอกสาร Firestore เลย
//    (ข) เส้นทางตรวจ password จากเอกสาร Firestore/local โดยตรง — ใช้เป็น fallback เมื่อ Firebase Auth
//        ปฏิเสธ (กรณีจริงในระบบ: admin_user/manager_user ที่มีแค่เอกสาร systemUsers แต่ไม่มีบัญชี Firebase
//        Auth จริงผูกไว้) — อ่านโค้ดจริงยืนยันว่า AppContext ไม่ได้แยกเส้นทางตาม role ตรงๆ แต่แยกตาม
//        "ผลลัพธ์การเรียก Firebase Auth จริง" ว่าสำเร็จหรือไม่ต่างหาก
// 2. ยืนยันว่า seed arrays ว่างจริง ([]) ไม่มี mock data หลุดไปแสดงในระบบจริงโดยไม่ตั้งใจ

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import { AppProvider, useApp } from "@/context/AppContext";
import {
  initialBookings,
  initialServices,
  initialTherapists,
  initialCourseSales,
  initialCourseTemplates,
  initialAdvanceDeductionLedger,
  initialSystemUsers,
  initialServiceCategories,
  SystemUser,
} from "@/data/initialData";
import type { UserCredential } from "firebase/auth";

// เหตุผลที่ต้อง mock 2 โมดูลนี้ (Why): ในสภาพแวดล้อม vitest ปกติ src/utils/firebase.ts จะ export
// `auth = null` เสมอ (ไม่มี NEXT_PUBLIC_FIREBASE_* env ถูกโหลด) ทำให้โค้ดจริงตกไปที่ fallback
// ทุกครั้งโดยอัตโนมัติ — เพื่อทดสอบเส้นทาง Firebase Auth จริงแยกออกมาให้เห็นชัดเจน ต้อง mock ให้ `auth`
// เป็นค่า truthy (จำลองว่ามี Firebase App เชื่อมต่ออยู่) แล้วควบคุมผลลัพธ์ของ signInWithEmailAndPassword
// เองในแต่ละเทส (resolve/reject) — ไม่ใช่ mock ซ้อน mock เกินจำเป็น เพราะนี่คือจุดตัดสินใจเดียวที่ทำให้
// โค้ดจริงเลือกเดินเส้นทางไหนใน AppContext.tsx
const mockSignInWithEmailAndPassword = vi.fn();
const mockSignOut = vi.fn();

vi.mock("firebase/auth", () => ({
  signInWithEmailAndPassword: (...args: unknown[]) =>
    mockSignInWithEmailAndPassword(...args),
  signOut: (...args: unknown[]) => mockSignOut(...args),
  // เพิ่มหลังแก้บั๊ก Edge case 2 (2026-07-10, ดู PROJECT_STATUS.md): AppContext.tsx เรียก onIdTokenChanged
  // จริงตอน mount เพื่อตรวจจับ token หมดอายุระหว่างใช้งาน — ต้อง mock ไว้ด้วย ไม่เช่นนั้นจะพังตั้งแต่ตอน
  // mount (ก่อนถึงเทสที่เกี่ยวกับ login) เพราะ `auth` ในไฟล์นี้ถูก mock ให้ truthy อยู่แล้วด้านล่าง คืน
  // unsubscribe เปล่าๆ พอ เพราะไฟล์นี้ไม่ได้ทดสอบพฤติกรรม token หมดอายุ (ดูไฟล์นั้นแยกต่างหากที่
  // testing/unit/authEdgeCases.test.tsx)
  onIdTokenChanged: () => () => {},
}));

vi.mock("@/utils/firebase", () => ({
  // ค่า object ว่างเปล่าแต่ truthy เพียงพอ เพราะ AppContext เช็คแค่ `if (auth)` ไม่เคยเรียกเมธอดของ
  // auth ตรงๆ (ส่งต่อให้ signInWithEmailAndPassword/signOut/onIdTokenChanged ที่ mock ไว้แล้วด้านบนทั้งหมด)
  auth: {},
  firestore: null,
}));

class LocalStorageMock {
  private store: Record<string, string> = {};

  clear(): void {
    this.store = {};
  }

  getItem(key: string): string | null {
    return this.store[key] || null;
  }

  setItem(key: string, value: string): void {
    this.store[key] = String(value);
  }

  removeItem(key: string): void {
    delete this.store[key];
  }
}

const mockLocalStorage = new LocalStorageMock();

const ADMIN_USER: SystemUser = {
  username: "admin_user",
  password: "123456",
  role: "admin",
  displayName: "Admin User",
  fullName: "สมชาย ใจดี",
  email: "admin_user@example.com",
};

const SUPER_MANAGER_USER: SystemUser = {
  username: "super_manager_user",
  password: "123456",
  role: "super-manager",
  displayName: "Super Manager",
  fullName: "วิชัย เก่งงาน",
  email: "super_manager@example.com",
};

const seedSystemUsers = (): void => {
  mockLocalStorage.setItem(
    "demo_spa_system_users",
    JSON.stringify([ADMIN_USER, SUPER_MANAGER_USER]),
  );
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_services", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_bookings", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(0));
  mockLocalStorage.setItem("demo_spa_service_categories", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
};

// สร้าง fake UserCredential ขั้นต่ำที่ AppContext ต้องใช้ (แค่ .user.email) — ไม่ใส่ field อื่นที่ไม่ได้ใช้
// จริงเพื่อไม่ให้เทสดูซับซ้อนเกินจำเป็น (Cost-Effective Abstraction)
const buildFakeUserCredential = (email: string): UserCredential =>
  ({ user: { email } } as unknown as UserCredential);

describe("AppContext.login — แยกพฤติกรรม 2 เส้นทาง auth (Phase 4, ตาม Definition of Done เดิม)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.clear();
    mockSignInWithEmailAndPassword.mockReset();
    mockSignOut.mockReset();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("เส้นทาง Firebase Auth: บัญชีที่มี Firebase Auth จริงผูกไว้ (จำลอง super_manager_user) ต้องเรียก signInWithEmailAndPassword และสำเร็จโดยไม่ต้องพึ่ง password ในเอกสาร Firestore เลย", async () => {
    seedSystemUsers();
    mockSignInWithEmailAndPassword.mockResolvedValueOnce(
      buildFakeUserCredential(SUPER_MANAGER_USER.email as string),
    );

    const { result } = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    let loginSuccess = false;
    await act(async () => {
      // ตั้งใจส่ง password ที่ "ผิด" ไปกับเอกสาร Firestore เพื่อพิสูจน์ว่าเส้นทางนี้ไม่สนใจฟิลด์
      // password ในเอกสารเลย — ยึดผลลัพธ์จาก Firebase Auth เพียงอย่างเดียวเท่านั้น
      loginSuccess = await result.current.login(
        "super_manager_user",
        "ไม่ตรงกับที่เก็บไว้ในเอกสาร",
      );
    });

    expect(loginSuccess).toBe(true);
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledWith(
      {},
      SUPER_MANAGER_USER.email,
      "ไม่ตรงกับที่เก็บไว้ในเอกสาร",
    );
    expect(result.current.currentUser?.username).toBe("super_manager_user");
    expect(result.current.currentRole).toBe("super-manager");
  });

  it("เส้นทาง Firestore fallback: บัญชีที่ไม่มี Firebase Auth จริงผูกไว้ (จำลอง admin_user) เมื่อ Firebase Auth ปฏิเสธ ต้องตกไปตรวจ password จากเอกสาร Firestore แทน และสำเร็จถ้ารหัสตรงกัน", async () => {
    seedSystemUsers();
    // จำลอง Firebase Auth ปฏิเสธด้วย error จริงที่ Firebase ส่งกลับเมื่อไม่มีบัญชีนี้ในระบบ Auth
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(
      new Error("Firebase: Error (auth/invalid-credential)."),
    );

    const { result } = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    let loginSuccess = false;
    await act(async () => {
      loginSuccess = await result.current.login("admin_user", "123456");
    });

    expect(mockSignInWithEmailAndPassword).toHaveBeenCalledTimes(1);
    expect(loginSuccess).toBe(true);
    expect(result.current.currentUser?.username).toBe("admin_user");
    expect(result.current.currentRole).toBe("admin");
  });

  it("เส้นทาง Firestore fallback: รหัสผ่านผิดตอน Firebase Auth ปฏิเสธ ต้องล็อกอินไม่สำเร็จ (ไม่ปล่อยผ่านเงียบๆ)", async () => {
    seedSystemUsers();
    mockSignInWithEmailAndPassword.mockRejectedValueOnce(
      new Error("Firebase: Error (auth/invalid-credential)."),
    );

    const { result } = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    let loginSuccess = true;
    await act(async () => {
      loginSuccess = await result.current.login("admin_user", "รหัสผ่านผิดแน่นอน");
    });

    expect(loginSuccess).toBe(false);
    expect(result.current.currentUser).toBeNull();
  });
});

describe("Seed arrays ต้องว่างจริง ([]) — ไม่มี mock data ธุรกิจหลุดเข้าระบบจริงโดยไม่ตั้งใจ (Phase 4 Definition of Done)", () => {
  // เหตุผลที่ตรวจแบบเจาะจงทีละอาร์เรย์ (Why): ถ้าใช้ loop ตรวจทุกตัวรวมกันแล้วมีตัวใดตัวหนึ่ง fail
  // ข้อความ error จะไม่บอกชัดว่าอาร์เรย์ไหนหลุด ทำให้ debug ช้าลง — แยกเป็นเคสย่อยชัดเจนแทน
  it("initialBookings ต้องว่างเปล่า (ไม่มีประวัติการจองจำลองหลุดเข้าระบบจริง)", () => {
    expect(initialBookings).toEqual([]);
  });

  it("initialServices ต้องว่างเปล่า (ไม่มีเมนูบริการจำลองหลุดเข้าระบบจริง)", () => {
    expect(initialServices).toEqual([]);
  });

  it("initialTherapists ต้องว่างเปล่า (ไม่มีรายชื่อพนักงานจำลองหลุดเข้าระบบจริง)", () => {
    expect(initialTherapists).toEqual([]);
  });

  it("initialCourseSales ต้องว่างเปล่า (ไม่มีประวัติขายคอร์สจำลองหลุดเข้าระบบจริง)", () => {
    expect(initialCourseSales).toEqual([]);
  });

  it("initialCourseTemplates ต้องว่างเปล่า (ไม่มีคอร์สสปาแม่แบบจำลองหลุดเข้าระบบจริง)", () => {
    expect(initialCourseTemplates).toEqual([]);
  });

  it("initialAdvanceDeductionLedger ต้องว่างเปล่า (ไม่มีประวัติหักเบิกจำลองหลุดเข้าระบบจริง)", () => {
    expect(initialAdvanceDeductionLedger).toEqual([]);
  });

  // ข้อยกเว้นที่ตั้งใจไม่ให้ว่าง — ต้องตรวจสอบว่ามีแค่เนื้อหาที่ตั้งใจไว้จริงเท่านั้น ไม่มีอะไรงอกเพิ่ม
  it("initialSystemUsers ตั้งใจไม่ว่างเปล่า (ต้องมีแค่ 3 บัญชีระบบตั้งต้นสำหรับล็อกอินครั้งแรกเท่านั้น ไม่มีบัญชีอื่นหลุดปน)", () => {
    expect(initialSystemUsers).toHaveLength(3);
    const usernames = initialSystemUsers.map((u) => u.username).sort();
    expect(usernames).toEqual(["admin_user", "manager_user", "super_manager_user"]);
  });

  it("initialServiceCategories ตั้งใจไม่ว่างเปล่า (ต้องมีแค่หมวดหมู่พื้นฐาน 5 หมวดตามที่ตั้งใจไว้เท่านั้น ไม่มีหมวดหมู่ธุรกิจจำลองปนมา)", () => {
    expect(initialServiceCategories).toHaveLength(5);
  });
});
