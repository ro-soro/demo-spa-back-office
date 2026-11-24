// testing/unit/authEdgeCases.test.tsx
//
// ขอบเขตของไฟล์นี้ (Phase 4 — Authentication & System Accounts, 3 edge case เพิ่มเติมนอกแผนเดิม
// ตามคำสั่ง Main Chat — ดู testing/TEST_PLAN.md และคำสั่งงานที่แนบมา):
//   Edge case 2: เซสชันหมดอายุ/token invalid ระหว่างใช้งาน (ไม่ใช่แค่ตอน login ผิด)
//   Edge case 3: ล็อกอินพร้อมกันหลาย session/หลายแท็บด้วยบัญชีเดียวกัน (รายงานพฤติกรรมจริง ไม่ตัดสินเอง)
//   Edge case 4: เอกสาร systemUsers ถูกลบ/ไม่มีอยู่ระหว่างพยายามล็อกอิน (admin_user/manager_user)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";
import * as fs from "fs";
import * as path from "path";
import { AppProvider, useApp } from "@/context/AppContext";
import { SystemUser, Therapist } from "@/data/initialData";
import * as db from "@/utils/db";

vi.mock("@/utils/firebase", () => ({
  auth: null, // จำลองสภาพแวดล้อมทั่วไปของ vitest — ไม่มี Firebase App เชื่อมต่อ (auth เป็น null เสมอ)
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

const seedSystemUsers = (): void => {
  mockLocalStorage.setItem("demo_spa_system_users", JSON.stringify([ADMIN_USER]));
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_services", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_bookings", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(0));
  mockLocalStorage.setItem("demo_spa_service_categories", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
};

beforeEach(() => {
  Object.defineProperty(window, "localStorage", {
    value: mockLocalStorage,
    writable: true,
  });
  mockLocalStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Edge case 2 — เซสชันหมดอายุ/token invalid ระหว่างใช้งาน (ไม่ใช่แค่ตอน login ผิด)", () => {
  // เหตุผลของเทสนี้ (Why): ตรวจสอบโครงสร้างไฟล์จริงแทนการ mock event ที่ไม่มีอยู่จริงในโค้ด — เพราะ
  // src/context/AppContext.tsx ไม่เคย import onAuthStateChanged/onIdTokenChanged จาก firebase/auth เลย
  // (ยืนยันด้วย grep ก่อนเขียนเทสนี้) การพยายาม mock event ที่ไม่มีใครเรียกจะไม่พิสูจน์อะไรเลย ("false
  // green") จึงต้องยืนยันที่ source code ตรงๆ ว่าไม่มีการ subscribe สถานะ auth แบบ real-time อยู่จริง
  it("[FAIL — พบความเสี่ยง] AppContext.tsx ต้องไม่มีกลไก subscribe การเปลี่ยนแปลงสถานะ Firebase Auth แบบ real-time เลย (พิสูจน์ว่าไม่มีทางตรวจจับ token หมดอายุระหว่างใช้งานได้)", () => {
    const appContextSourcePath = path.resolve(
      __dirname,
      "../../src/context/AppContext.tsx",
    );
    const sourceCode = fs.readFileSync(appContextSourcePath, "utf-8");

    // Actual: ไม่พบการเรียก onAuthStateChanged หรือ onIdTokenChanged ที่ไหนเลยในไฟล์นี้ — แปลว่าเมื่อ
    // Firebase ID token ของ super_manager_user หมดอายุ/ถูกเพิกถอนระหว่างใช้งานอยู่ แอปจะไม่มีทางรู้ตัวเลย
    // สถานะ currentUser ใน React Context ยังคงอยู่เหมือนเดิมทุกประการจนกว่าผู้ใช้จะกด logout เอง
    const hasOnAuthStateChanged = sourceCode.includes("onAuthStateChanged");
    const hasOnIdTokenChanged = sourceCode.includes("onIdTokenChanged");

    // Expected (พฤติกรรมที่ปลอดภัยที่ควรมีตามคำสั่ง Main Chat): ต้องมีกลไกอย่างใดอย่างหนึ่งข้างต้น
    // เพื่อตรวจจับและตอบสนองต่อ token หมดอายุ/ถูกเพิกถอนระหว่างใช้งาน
    expect(hasOnAuthStateChanged || hasOnIdTokenChanged).toBe(true);
  });

  it("[FAIL — พบความเสี่ยง] เมื่อการเรียก Firestore ระหว่างใช้งาน (ไม่ใช่ตอน login) ล้มเหลวด้วย error สไตล์ auth หมดอายุ ระบบต้อง 'ไม่' ปล่อยให้ currentUser ยังคงสถานะล็อกอินอยู่เฉยๆ โดยไม่มีการแจ้งเตือน/ไม่มีการ redirect ใดๆ เลย", async () => {
    seedSystemUsers();

    const { result } = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    await act(async () => {
      await result.current.login("admin_user", "123456");
    });
    expect(result.current.currentUser).not.toBeNull();

    // จำลอง token หมดอายุระหว่างใช้งาน — Firestore ปฏิเสธ request ด้วย error สไตล์ที่ Firebase ส่งจริง
    // เมื่อสิทธิ์ authentication ใช้ไม่ได้แล้ว (permission-denied จาก security rules ที่พึ่งพา auth token)
    const tokenExpiredError = Object.assign(new Error("Missing or insufficient permissions."), {
      code: "permission-denied",
    });
    const saveTherapistSpy = vi
      .spyOn(db, "saveTherapist")
      .mockRejectedValueOnce(tokenExpiredError);

    const staleTherapist: Therapist = {
      id: "ther_edge_case_2",
      name: "ทดสอบ Edge case 2",
      type: "full-time",
      dailyGuarantee: 100,
      bankName: "",
      bankAccount: "",
      bankAccountName: "",
      phone: "",
    };

    await expect(
      act(async () => {
        await result.current.addOrUpdateTherapist(staleTherapist);
      }),
    ).rejects.toThrow();

    // Actual: currentUser ยังคงอยู่เหมือนเดิมทุกประการ — AppContext ไม่มี logic ใดๆ ที่ setCurrentUser(null)
    // หรือเรียก logout() อัตโนมัติเมื่อพบ error สไตล์ auth หมดอายุจาก Firestore เลย ผู้ใช้จะเห็นหน้าจอ
    // เหมือนเดิมทุกอย่าง (ไม่ redirect ไป /login, ไม่มี toast/banner แจ้งเตือนเรื่องเซสชันโดยเฉพาะ) — ถ้า
    // ฟีเจอร์ที่เรียกใช้ฟังก์ชันนี้ไม่มี try-catch ของตัวเอง (เช่นเดียวกับที่เคยเจอใน Phase 3) ผู้ใช้จะเห็น
    // เพียง error ทั่วไปเท่านั้น ไม่ใช่ข้อความ "เซสชันหมดอายุ กรุณาเข้าสู่ระบบใหม่" ที่ควรมีเฉพาะเจาะจง
    //
    // Expected (พฤติกรรมที่ปลอดภัยที่ควรมี): currentUser ควรถูกล้าง (null) และผู้ใช้ควรถูกพาไปหน้า login
    // พร้อมข้อความแจ้งเตือนเฉพาะเจาะจงว่าเซสชันหมดอายุ ไม่ใช่แค่ error ทั่วไปที่ปนกับ error เครือข่ายอื่นๆ
    expect(result.current.currentUser).toBeNull();

    saveTherapistSpy.mockRestore();
  });
});

describe("Edge case 3 — ล็อกอินพร้อมกันหลาย session/หลายแท็บด้วยบัญชีเดียวกัน (รายงานพฤติกรรมจริง ไม่ตัดสินว่าเป็นบั๊ก)", () => {
  // เหตุผลของวิธีจำลอง (Why): jsdom ใน 1 ไฟล์เทสมี window.localStorage เป็น instance เดียวที่ใช้ร่วมกัน
  // เหมือนกับเบราว์เซอร์จริงที่แชร์ localStorage ข้ามแท็บของ origin เดียวกัน — การ render AppProvider
  // สอง instance แยกกัน (คนละ React tree ไม่แชร์ state กัน) จึงจำลอง "เปิด 2 แท็บ" ได้ตรงกับพฤติกรรมจริง
  it("(รายงานพฤติกรรมจริง) ล็อกอินบัญชีเดียวกันพร้อมกันใน 2 แท็บ (จำลองด้วย 2 AppProvider instance แยกกัน) ทั้งคู่สำเร็จพร้อมกันโดยไม่มีฝ่ายใดถูกเตะออกหรือถูกปฏิเสธ", async () => {
    seedSystemUsers();

    const tabA = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });
    const tabB = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });

    await waitFor(() => expect(tabA.result.current.isInitialLoading).toBe(false));
    await waitFor(() => expect(tabB.result.current.isInitialLoading).toBe(false));

    let loginSuccessA = false;
    let loginSuccessB = false;

    await act(async () => {
      loginSuccessA = await tabA.result.current.login("admin_user", "123456");
    });
    await act(async () => {
      loginSuccessB = await tabB.result.current.login("admin_user", "123456");
    });

    // พฤติกรรมจริงที่พบ: ทั้ง 2 แท็บล็อกอินสำเร็จพร้อมกันด้วยบัญชีเดียวกัน — ไม่มีกลไกใดๆ ในระบบที่ตรวจสอบ
    // หรือจำกัดจำนวน session พร้อมกันต่อบัญชี (ไม่มี server-side session table, localStorage เป็นแค่ที่
    // เก็บ session ต่อเบราว์เซอร์/แท็บเท่านั้น ไม่ได้ sync แบบ real-time ข้ามแท็บด้วย storage event listener)
    expect(loginSuccessA).toBe(true);
    expect(loginSuccessB).toBe(true);
    expect(tabA.result.current.currentUser?.username).toBe("admin_user");
    expect(tabB.result.current.currentUser?.username).toBe("admin_user");

    // แท็บ A ไม่ถูกกระทบ (ไม่ถูกเตะออก/ไม่มี error ใดๆ) หลังแท็บ B ล็อกอินด้วยบัญชีเดียวกันสำเร็จ
    expect(tabA.result.current.currentUser?.username).toBe("admin_user");
  });
});

describe("Edge case 4 — เอกสาร systemUsers ถูกลบ/ไม่มีอยู่ระหว่างพยายามล็อกอิน (admin_user/manager_user)", () => {
  it("[ผ่าน] เมื่อ getSystemUsers() คืนอาร์เรย์ว่างเปล่า (จำลองเอกสารถูกลบทั้งหมด) login() ต้องคืนค่า false ทันทีโดยไม่ throw/ไม่ hang", async () => {
    const getSystemUsersSpy = vi.spyOn(db, "getSystemUsers").mockResolvedValue([]);

    const { result } = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    let loginSuccess = true;
    let threwError = false;
    await act(async () => {
      try {
        loginSuccess = await result.current.login("admin_user", "123456");
      } catch {
        threwError = true;
      }
    });

    expect(threwError).toBe(false);
    expect(loginSuccess).toBe(false);
    expect(result.current.currentUser).toBeNull();
    // isLoading ต้องกลับมาเป็น false เสมอ (ยืนยันว่าไม่ค้าง/ไม่ hang อยู่ในสถานะกำลังโหลด)
    expect(result.current.isLoading).toBe(false);

    getSystemUsersSpy.mockRestore();
  });

  it("[ผ่าน] เมื่อ getSystemUsers() reject จริง (จำลอง Firestore ปฏิเสธเพราะ collection ถูกลบ/สิทธิ์เปลี่ยน) login() ต้อง catch เองและคืนค่า false โดยไม่ throw/ไม่ hang", async () => {
    // ใช้ mockRejectedValue (ไม่ใช่ Once) เพราะ getSystemUsers ถูกเรียกทั้งตอน AppProvider mount ครั้งแรก
    // (loadDatabaseAsync) และตอนเรียก login() อีกครั้ง — ต้อง reject สม่ำเสมอทั้ง 2 ครั้งเพื่อจำลอง
    // สถานการณ์ "collection หายไปแล้วตลอด" ไม่ใช่แค่ครั้งเดียวตอน mount (ถ้าใช้ Once ครั้งที่ 2 จะหลุด
    // ไปเรียก implementation จริงที่ fallback เป็น localStorage แล้ว seed บัญชีเริ่มต้นให้เงียบๆ ทำให้
    // เทสนี้ผ่านโดยไม่ได้ทดสอบสถานการณ์ที่ต้องการจริงๆ)
    const getSystemUsersSpy = vi
      .spyOn(db, "getSystemUsers")
      .mockRejectedValue(new Error("Collection systemUsers not found"));

    const { result } = renderHook(() => useApp(), {
      wrapper: ({ children }) => <AppProvider>{children}</AppProvider>,
    });

    await waitFor(() => expect(result.current.isInitialLoading).toBe(false));

    let loginSuccess = true;
    let threwError = false;
    await act(async () => {
      try {
        loginSuccess = await result.current.login("admin_user", "123456");
      } catch {
        threwError = true;
      }
    });

    expect(threwError).toBe(false);
    expect(loginSuccess).toBe(false);
    expect(result.current.isLoading).toBe(false);

    getSystemUsersSpy.mockRestore();
  });
});
