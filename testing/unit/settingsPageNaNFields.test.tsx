// testing/unit/settingsPageNaNFields.test.tsx
// ขอบเขต: Phase 3 (ข) — Regression: ช่องโหว่ NaN ของฟิลด์ dailyGuarantee (ฟอร์มพนักงาน) และ
// duration/price/commission (ฟอร์มบริการ) ในหน้า src/app/settings/page.tsx (ดู testing/TEST_PLAN.md)
// รวมถึง Phase 3 (ค) เคสเพิ่มเติมนอกแผนเดิม: กรอกฟิลด์ NaN-prone หลายฟิลด์ผิดพร้อมกันในฟอร์มเดียว
// (ฟอร์มบริการมี duration+price+commission ครบ 3 ฟิลด์ในฟอร์มเดียวกัน เหมาะสำหรับเคสนี้โดยตรง)
//
// เหตุผลที่ต้อง render หน้าเต็มจริง (Why): onSubmitTherapist/onSubmitService เป็น local function
// ภายใน component ไม่ได้ export เป็น pure function แยก ต้องทดสอบผ่าน React Testing Library เหมือนแนวทาง
// เดียวกับ testing/unit/bookingsPageIntegration.test.tsx (ห่อด้วย AppProvider จริง ใช้ localStorage
// fallback แทน Firestore จริง — ปลอดภัยกับข้อมูลจริงของร้าน)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AppProvider } from "@/context/AppContext";
import SettingsPage from "@/app/settings/page";
import { ServiceCategory, SystemUser } from "@/data/initialData";

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

const TEST_CATEGORY: ServiceCategory = {
  id: "cat_test",
  name: "นวดทดสอบ",
  description: "หมวดหมู่สำหรับเทส",
  colorClass: "teal",
};

// บัญชีทดสอบ role manager — จำเป็นหลังแก้บั๊ก Privilege Escalation (2026-07-10, ดู PROJECT_STATUS.md):
// src/app/settings/page.tsx เพิ่ม guard บล็อก role admin แล้ว (currentRole เริ่มต้นของ AppContext คือ
// 'admin' เสมอถ้าไม่ได้ล็อกอิน) หน้านี้ทดสอบ validation ของฟอร์ม ไม่ได้ทดสอบเรื่องสิทธิ์การเข้าถึง จึงต้อง
// จำลองเซสชันของ manager ไว้ล่วงหน้าเพื่อให้ผ่าน guard เข้าไปทดสอบฟอร์มได้ตามเจตนาเดิมของไฟล์นี้
//
// ใช้ username "manager_user" ตรงกับ initialSystemUsers จริงใน src/data/initialData.ts (ไม่ตั้งชื่อทดสอบ
// เอง) เพราะ src/utils/db.ts (initializeDatabase) มี legacy fallback ที่จะ "เขียนทับ" ค่า systemUsers ที่
// เราตั้งเองด้วย initialSystemUsers ทันที ถ้าตรวจไม่พบบัญชี "admin_user" ที่มี fullName อยู่ในลิสต์เดิม —
// การจำลองด้วยบัญชีจริงจึงเลี่ยงปัญหาถูกเขียนทับระหว่างการทดสอบได้ตรงไปตรงมาที่สุด
const TEST_MANAGER_USER: SystemUser = {
  username: "manager_user",
  password: "123456",
  role: "manager",
  displayName: "Manager User",
  fullName: "สมหญิง มีสุข",
  email: "manager_user@example.com",
};

const seedLocalStorage = (): void => {
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_services", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_bookings", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(0));
  mockLocalStorage.setItem(
    "demo_spa_service_categories",
    JSON.stringify([TEST_CATEGORY]),
  );
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  mockLocalStorage.removeItem("demo_spa_system_users");
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
  mockLocalStorage.setItem("session_user", JSON.stringify(TEST_MANAGER_USER));
};

const renderSettingsPage = async (): Promise<ReturnType<typeof render>> => {
  const rendered = render(
    <AppProvider>
      <SettingsPage />
    </AppProvider>,
  );
  // รอให้ AppProvider โหลดข้อมูลตั้งต้น (async) เสร็จก่อนจึงเริ่ม interact กับฟอร์ม
  await screen.findByText("เพิ่มพนักงานใหม่");
  return rendered;
};

describe("Settings page — Phase 3 regression: ช่องโหว่ NaN ของ dailyGuarantee/duration/price/commission", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  it("ฟอร์มพนักงาน — เคลียร์ช่อง 'ประกันมือขั้นต่ำ' (dailyGuarantee) ให้ว่างแล้วส่งฟอร์ม ต้องเห็น error message จริง ไม่ใช่หลุดผ่านเงียบๆ", async () => {
    seedLocalStorage();
    await renderSettingsPage();

    fireEvent.click(screen.getByText("เพิ่มพนักงานใหม่"));
    await screen.findByText("เพิ่มพนักงานนวดสปาคนใหม่");

    const nameInput = document.querySelector('input[name="name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "หมอทดสอบ" } });

    const dailyGuaranteeInput = document.querySelector(
      'input[name="dailyGuarantee"]',
    ) as HTMLInputElement;
    expect(dailyGuaranteeInput).toBeTruthy();

    // จงใจกรอกแล้วลบให้ว่างสนิท (จำลองพฤติกรรมผู้ใช้จริงที่พิมพ์ผิดแล้วลบทิ้ง)
    fireEvent.change(dailyGuaranteeInput, { target: { value: "300" } });
    fireEvent.change(dailyGuaranteeInput, { target: { value: "" } });

    const form = dailyGuaranteeInput.closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(
      await screen.findByText("กรุณากรอกจำนวนเงินประกันมือ"),
    ).toBeInTheDocument();
  });

  it("Phase 3 (ค) เคสเพิ่มเติม — ฟอร์มบริการ: เคลียร์ duration+price+commission ทั้ง 3 ฟิลด์ให้ว่างพร้อมกันแล้วส่งฟอร์ม ต้องเห็น error message ครบทั้ง 3 ฟิลด์ ไม่ทับซ้อน/สับสนกัน", async () => {
    seedLocalStorage();
    const { container } = await renderSettingsPage();

    fireEvent.click(screen.getByText("เพิ่มบริการใหม่"));
    await screen.findByText("เพิ่มรายการบริการใหม่");

    // เลือกหมวดหมู่และกรอกชื่อให้ผ่านก่อน (โฟกัสเทสเฉพาะ 3 ฟิลด์ตัวเลขที่เคยมีช่องโหว่)
    const categorySelect = container.querySelector(
      'select[name="category"]',
    ) as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: TEST_CATEGORY.name } });
    const nameInput = screen.getByPlaceholderText("เช่น ขัดผิวมะขามทานาคา");
    fireEvent.change(nameInput, { target: { value: "นวดทดสอบ 60 นาที" } });

    const durationInput = container.querySelector(
      'input[name="duration"]',
    ) as HTMLInputElement;
    const priceInput = container.querySelector(
      'input[name="price"]',
    ) as HTMLInputElement;
    const commissionInput = container.querySelector(
      'input[name="commission"]',
    ) as HTMLInputElement;

    // กรอกค่าที่ถูกต้องก่อน แล้วลบทิ้งพร้อมกันทั้ง 3 ช่อง (จำลองผู้ใช้แก้ไขฟอร์มแล้วเผลอลบผิดหลายช่อง)
    fireEvent.change(durationInput, { target: { value: "1" } });
    fireEvent.change(priceInput, { target: { value: "300" } });
    fireEvent.change(commissionInput, { target: { value: "150" } });
    fireEvent.change(durationInput, { target: { value: "" } });
    fireEvent.change(priceInput, { target: { value: "" } });
    fireEvent.change(commissionInput, { target: { value: "" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    // ยืนยันว่า error message ของทั้ง 3 ฟิลด์ปรากฏพร้อมกันจริง แยกกันชัดเจน ไม่ทับซ้อนกัน
    expect(await screen.findByText("กรุณากรอกเวลาบริการ")).toBeInTheDocument();
    expect(screen.getByText("กรุณากรอกราคา")).toBeInTheDocument();
    expect(screen.getByText("กรุณากรอกค่ามือ")).toBeInTheDocument();

    // ฟอร์มต้องไม่ถูกส่งสำเร็จ — Modal ต้องยังเปิดอยู่ (ไม่มีการปิดตัวเองทั้งที่ข้อมูลไม่ครบ)
    expect(screen.getByText("เพิ่มรายการบริการใหม่")).toBeInTheDocument();
  });

  it("ฟอร์มบริการ — กรอกค่าตัวเลขถูกต้องครบทั้ง 3 ฟิลด์ ต้องไม่มี error message ใดๆ ค้างอยู่ (กัน over-fix จนกรอกถูกแล้วยัง error)", async () => {
    seedLocalStorage();
    const { container } = await renderSettingsPage();

    fireEvent.click(screen.getByText("เพิ่มบริการใหม่"));
    await screen.findByText("เพิ่มรายการบริการใหม่");

    const categorySelect = container.querySelector(
      'select[name="category"]',
    ) as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: TEST_CATEGORY.name } });
    fireEvent.change(screen.getByPlaceholderText("เช่น ขัดผิวมะขามทานาคา"), {
      target: { value: "นวดทดสอบ 60 นาที" },
    });

    const durationInput = container.querySelector('input[name="duration"]') as HTMLInputElement;
    const priceInput = container.querySelector('input[name="price"]') as HTMLInputElement;
    const commissionInput = container.querySelector('input[name="commission"]') as HTMLInputElement;

    fireEvent.change(durationInput, { target: { value: "1" } });
    fireEvent.change(priceInput, { target: { value: "300" } });
    fireEvent.change(commissionInput, { target: { value: "150" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    // บันทึกสำเร็จ -> Modal (หัวข้อ "เพิ่มรายการบริการใหม่") ต้องปิดไป ไม่มี error ใดๆ ค้างอยู่
    await waitFor(() => {
      expect(screen.queryByText("เพิ่มรายการบริการใหม่")).not.toBeInTheDocument();
    });
    expect(screen.queryByText("กรุณากรอกเวลาบริการ")).not.toBeInTheDocument();
    expect(screen.queryByText("กรุณากรอกราคา")).not.toBeInTheDocument();
    expect(screen.queryByText("กรุณากรอกค่ามือ")).not.toBeInTheDocument();
    // ยืนยันบริการใหม่ถูกบันทึกจริงในตาราง
    expect(await screen.findByText("นวดทดสอบ 60 นาที")).toBeInTheDocument();
  });
});
