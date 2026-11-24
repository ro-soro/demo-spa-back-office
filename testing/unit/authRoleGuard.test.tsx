// testing/unit/authRoleGuard.test.tsx
//
// ขอบเขตของไฟล์นี้ (Phase 4 — Authentication & System Accounts, ดู testing/TEST_PLAN.md):
// **Edge case 1 (ทำก่อนเป็นอันดับแรก — ความเสี่ยงสูงสุด ตามคำสั่ง Main Chat):** Privilege escalation
// ผ่าน URL โดยตรง — ล็อกอินด้วย role หนึ่งแล้วพยายามเข้าหน้าที่เป็นสิทธิ์ของอีก role โดยพิมพ์ URL ตรง
// (ไม่ใช่คลิกผ่านเมนู) ต้องถูก block จริง ไม่ใช่แค่ซ่อนเมนูแต่หน้ายังเข้าถึงได้ถ้ารู้ URL
//
// วิธีจำลอง "พิมพ์ URL ตรง" ในสภาพแวดล้อม RTL (Why ต้องทำแบบนี้): mock `usePathname` ของ next/navigation
// ให้คืนค่า path เป้าหมายโดยตรง (ไม่ได้มาจากการคลิกลิงก์ในแอป) แล้ว render <MainLayout> ที่ห่อ page
// component จริงของ path นั้นเข้าไป — วิธีนี้จำลองสถานการณ์ผู้ใช้พิมพ์ URL ในแอดเดรสบาร์เบราว์เซอร์ตรงๆ
// ได้แม่นยำกว่าเทส unit ทั่วไป เพราะ MainLayout คือจุดเดียวที่ควบคุม Route Guard ทั้งระบบ (ดู
// src/components/MainLayout.tsx — ตัวแปร navItems + ฟังก์ชัน hasAccess)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { AppProvider } from "@/context/AppContext";
import { MainLayout } from "@/components/MainLayout";
import SettingsPage from "@/app/settings/page";
import SettingsCategoriesPage from "@/app/settings/categories/page";
import UsersPage from "@/app/users/page";
import { SystemUser } from "@/data/initialData";

// ตัวแปร module-level เก็บ pathname ปัจจุบันที่จะให้ usePathname() คืนค่า — เปลี่ยนได้ก่อน render
// แต่ละเทส เพื่อจำลอง "ผู้ใช้พิมพ์ URL ปลายทางต่างกัน" (Why ต้องใช้ตัวแปร module-level: vi.mock ถูก
// hoist ขึ้นไปด้านบนไฟล์ก่อนโค้ดอื่นเสมอ จึงต้องอ้างอิงผ่านตัวแปรที่ประกาศนอก scope ของ mock factory)
let currentMockPathname = "/";
const mockRouterPush = vi.fn();
const mockRouterReplace = vi.fn();

vi.mock("next/navigation", () => ({
  usePathname: () => currentMockPathname,
  useRouter: () => ({ push: mockRouterPush, replace: mockRouterReplace }),
}));

// เหตุผลที่ต้อง mock localStorage เอง (Why): db.ts fallback ไปใช้ localStorage เสมอตอนรัน vitest
// (firestore เป็น null เพราะไม่มี env จริงถูกโหลดเข้ามาตอนรันเทส) — pattern เดียวกับ
// testing/unit/bookingsPageIntegration.test.tsx ที่มีอยู่แล้วในโปรเจกต์
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

const MANAGER_USER: SystemUser = {
  username: "manager_user",
  password: "123456",
  role: "manager",
  displayName: "Manager User",
  fullName: "สมหญิง มีสุข",
  email: "manager_user@example.com",
};

const SUPER_MANAGER_USER: SystemUser = {
  username: "super_manager_user",
  password: "123456",
  role: "super-manager",
  displayName: "Super Manager",
  fullName: "วิชัย เก่งงาน",
  email: "super_manager@example.com",
};

// จำลองเซสชันที่ "ล็อกอินสำเร็จแล้วอยู่ก่อนหน้านี้" — AppContext อ่านค่านี้ตอน mount เพื่อ restore session
// (ดู src/context/AppContext.tsx บรรทัด "session_user") ไม่ใช่การคลิก login ผ่านฟอร์มจริง เพราะเป้าหมาย
// ของเทสนี้คือพิสูจน์ Route Guard เมื่อ "ล็อกอินอยู่แล้ว" แล้วพิมพ์ URL ตรง ไม่ใช่ทดสอบฟอร์ม login เอง
const seedLocalStorageWithLoggedInSession = (loggedInUser: SystemUser): void => {
  mockLocalStorage.setItem(
    "demo_spa_system_users",
    JSON.stringify([ADMIN_USER, MANAGER_USER, SUPER_MANAGER_USER]),
  );
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_services", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_bookings", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(0));
  mockLocalStorage.setItem("demo_spa_service_categories", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
  mockLocalStorage.setItem("session_user", JSON.stringify(loggedInUser));
};

// รอให้ MainLayout โหลดเซสชันเสร็จ (isInitialLoading กลายเป็น false) ก่อนตรวจผลลัพธ์ — ใช้การรอให้
// ข้อความจอโหลดเต็มจอหายไป แทนการรอเวลาคงที่ที่ไม่น่าเชื่อถือ
const waitForSessionToLoad = async (): Promise<void> => {
  await waitFor(() => {
    expect(screen.queryByText("กำลังโหลดระบบ...")).not.toBeInTheDocument();
  });
};

describe("Route Guard — Privilege Escalation ผ่าน URL โดยตรง (Phase 4 Edge case 1, ความเสี่ยงสูงสุด)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.clear();
    currentMockPathname = "/";
    mockRouterPush.mockClear();
    mockRouterReplace.mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  // ---------------------------------------------------------------------------------------------
  // เคสหลักที่ต้อง block จริง — บัญชี admin พิมพ์ URL "/settings" ตรงๆ (ไม่ได้คลิกผ่านเมนู เพราะเมนู
  // "ตั้งค่าร้าน" ถูกซ่อนสำหรับ admin อยู่แล้วใน Sidebar — hasAccess('manager') ใน MainLayout.tsx)
  //
  // Input: session_user = admin_user (role: 'admin'), currentMockPathname = "/settings"
  // Expected (พฤติกรรมที่ปลอดภัยที่ระบบควรมี): ต้องเห็นข้อความปฏิเสธสิทธิ์ (เช่น "สิทธิ์ไม่เพียงพอ")
  //           และต้อง "ไม่เห็น" เนื้อหาที่แก้ไขข้อมูลพนักงาน/บริการได้จริง เช่น ปุ่ม "เพิ่มพนักงานใหม่"
  // ---------------------------------------------------------------------------------------------
  it("[ความเสี่ยงสูงสุด] admin ต้องถูก block เมื่อพิมพ์ URL '/settings' ตรงๆ แม้เมนูจะถูกซ่อนไว้แล้วก็ตาม", async () => {
    seedLocalStorageWithLoggedInSession(ADMIN_USER);
    currentMockPathname = "/settings";

    render(
      <AppProvider>
        <MainLayout>
          <SettingsPage />
        </MainLayout>
      </AppProvider>,
    );

    await waitForSessionToLoad();

    // แก้ไขแล้ว (2026-07-10 โดย frontend-dev ตามคำสั่ง Main Chat): src/app/settings/page.tsx เพิ่ม guard
    // ตรวจ currentRole ในตัวหน้าเอง (pattern เดียวกับ settings/categories/page.tsx) ทำให้ admin ถูก block
    // จริงแม้พิมพ์ URL "/settings" ตรงๆ — ลบ 2 assertion เดิมที่ยืนยันพฤติกรรมช่องโหว่ทิ้งแล้วตามที่ระบุไว้
    // ในคอมเมนต์เดิมของไฟล์นี้ เหลือไว้แค่ชุดยืนยันพฤติกรรมที่ปลอดภัยด้านล่างนี้เท่านั้น
    expect(screen.getByText(/สิทธิ์ไม่เพียงพอ/)).toBeInTheDocument();
    expect(screen.queryByText("เพิ่มพนักงานใหม่")).not.toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------------------------
  // เคสเปรียบเทียบ (Contrast) — พิสูจน์ว่ากลไก guard "เป็นไปได้จริง" และมีอยู่แล้วบางจุด เพื่อชี้ชัดว่า
  // ปัญหาไม่ใช่ "ทำไม่ได้" แต่คือ "ทำไม่ครบทุกหน้า" — /settings/categories มี guard ในตัวเองอยู่แล้ว
  // ---------------------------------------------------------------------------------------------
  it("(เปรียบเทียบ — ผ่าน) admin พิมพ์ URL '/settings/categories' ตรงๆ ถูก block ได้จริงด้วย guard ในหน้านั้นเอง", async () => {
    seedLocalStorageWithLoggedInSession(ADMIN_USER);
    currentMockPathname = "/settings/categories";

    render(
      <AppProvider>
        <MainLayout>
          <SettingsCategoriesPage />
        </MainLayout>
      </AppProvider>,
    );

    await waitForSessionToLoad();

    expect(
      screen.getByText("สิทธิ์ไม่เพียงพอ — เฉพาะ Manager ขึ้นไปเท่านั้น"),
    ).toBeInTheDocument();
  });

  // ---------------------------------------------------------------------------------------------
  // เคสเปรียบเทียบ (Contrast) — /users อยู่ใน navItems ของ MainLayout จริง (minRole: 'super-manager')
  // จึงถูก MainLayout เองบล็อกได้ถูกต้องเมื่อ admin พิมพ์ URL ตรง — พิสูจน์ว่ากลไกระดับ Layout ทำงาน
  // ถูกต้องสำหรับหน้าที่ถูกลงทะเบียนไว้ใน navItems เท่านั้น (ต่างจาก /settings ที่ไม่ได้ลงทะเบียนไว้เลย)
  // ---------------------------------------------------------------------------------------------
  it("(เปรียบเทียบ — ผ่าน) admin พิมพ์ URL '/users' ตรงๆ ถูก MainLayout บล็อกถูกต้อง (อยู่ใน navItems)", async () => {
    seedLocalStorageWithLoggedInSession(ADMIN_USER);
    currentMockPathname = "/users";

    render(
      <AppProvider>
        <MainLayout>
          <UsersPage />
        </MainLayout>
      </AppProvider>,
    );

    await waitForSessionToLoad();

    expect(screen.getByText("สิทธิ์ไม่เพียงพอในการเข้าถึง")).toBeInTheDocument();
  });

  it("(เปรียบเทียบ — ผ่าน) manager พิมพ์ URL '/users' ตรงๆ ก็ถูกบล็อกเช่นกัน (ต้องเป็น super-manager เท่านั้น)", async () => {
    seedLocalStorageWithLoggedInSession(MANAGER_USER);
    currentMockPathname = "/users";

    render(
      <AppProvider>
        <MainLayout>
          <UsersPage />
        </MainLayout>
      </AppProvider>,
    );

    await waitForSessionToLoad();

    expect(screen.getByText("สิทธิ์ไม่เพียงพอในการเข้าถึง")).toBeInTheDocument();
  });

  it("(เปรียบเทียบ — ผ่าน) super-manager พิมพ์ URL '/users' ตรงๆ เข้าถึงได้ตามสิทธิ์จริง", async () => {
    seedLocalStorageWithLoggedInSession(SUPER_MANAGER_USER);
    currentMockPathname = "/users";

    render(
      <AppProvider>
        <MainLayout>
          <UsersPage />
        </MainLayout>
      </AppProvider>,
    );

    await waitForSessionToLoad();

    expect(screen.queryByText("สิทธิ์ไม่เพียงพอในการเข้าถึง")).not.toBeInTheDocument();
  });
});
