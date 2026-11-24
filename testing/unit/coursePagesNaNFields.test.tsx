// testing/unit/coursePagesNaNFields.test.tsx
// ขอบเขต: Phase 3 (ข) — Regression: ช่องโหว่ NaN ของฟิลด์ defaultPrice (src/app/settings/courses/page.tsx)
// และ price/commissionPercent (src/app/courses/page.tsx) ดู testing/TEST_PLAN.md
// รวมถึง Phase 3 (ค) เคสเพิ่มเติมนอกแผนเดิม: กรอกฟิลด์ NaN-prone หลายฟิลด์ผิดพร้อมกันในฟอร์มเดียว
// (ฟอร์มยอดขายคอร์สมี price+commissionPercent ครบ 2 ฟิลด์ในฟอร์มเดียวกัน)
//
// เหตุผลที่ต้อง render หน้าเต็มจริง (Why): onSubmit ของทั้งสองฟอร์มเป็น local function ภายใน component
// ไม่ได้ export เป็น pure function แยก ต้องทดสอบผ่าน React Testing Library เหมือนแนวทางเดียวกับไฟล์เทส
// Phase 2/3 อื่นในโปรเจกต์ (ห่อด้วย AppProvider จริง ใช้ localStorage fallback แทน Firestore จริง)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { AppProvider } from "@/context/AppContext";
import SettingsCoursesPage from "@/app/settings/courses/page";
import CourseSalesPage from "@/app/courses/page";
import { Therapist } from "@/data/initialData";

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

const TEST_THERAPIST: Therapist = {
  id: "ther_course_1",
  name: "ทดสอบคอร์ส",
  type: "full-time",
  dailyGuarantee: 200,
  bankName: "ธนาคารทดสอบ",
  bankAccount: "222-2-22222-2",
  bankAccountName: "Course Tester",
  phone: "0822222222",
};

// currentRole default ของ AppContext คือ 'admin' ซึ่งฟอร์มขายคอร์ส/เทมเพลตคอร์สไม่ได้ล็อกสิทธิ์ตาม role
// สำหรับหน้า settings/courses (แค่ block admin เข้าถึงทั้งหน้าเลย) จึงต้องตั้ง session เป็น manager
// เพื่อให้เข้าถึงฟอร์มเทมเพลตคอร์สได้ (ดู settings/courses/page.tsx guard `if (currentRole === "admin")`)
const seedLocalStorage = (): void => {
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([TEST_THERAPIST]));
  mockLocalStorage.setItem("demo_spa_services", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_bookings", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(0));
  mockLocalStorage.setItem("demo_spa_service_categories", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  // AppContext.tsx จับคู่ session_user กับรายชื่อใน demo_spa_system_users ตอนโหลดหน้าเสมอ
  // (ถ้าไม่ตรงกันจะถูกลบ session ทิ้งอัตโนมัติ) จึงต้อง seed ผู้ใช้ที่ตรงกันไว้ล่วงหน้าด้วย
  // หมายเหตุ (Why ต้องมี "admin_user" ปนอยู่ด้วย): db.ts::initializeDatabase() ตรวจว่ามีผู้ใช้ชื่อ
  // "admin_user" ที่มี fullName อยู่หรือไม่ ถ้าไม่มีจะ seed ผู้ใช้ default ทับข้อมูลที่เราตั้งใจใส่ไว้ทันที
  // (ป้องกันเคส localStorage เก่าค้างข้อมูลผิดรูปแบบ) จึงต้องมี entry นี้กันโดน seed ทับ
  const managerTestUser = {
    username: "manager_test",
    password: "x",
    role: "manager",
    displayName: "ผู้จัดการทดสอบ",
    fullName: "ผู้จัดการทดสอบ",
  };
  const placeholderAdminUser = {
    username: "admin_user",
    password: "x",
    role: "admin",
    displayName: "Admin User",
    fullName: "Admin User",
  };
  mockLocalStorage.setItem(
    "demo_spa_system_users",
    JSON.stringify([managerTestUser, placeholderAdminUser]),
  );
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
  // session ผู้จัดการ — settings/courses/page.tsx บล็อก role "admin" ไม่ให้เข้าฟอร์มเทมเพลตคอร์สทั้งหน้า
  mockLocalStorage.setItem("session_user", JSON.stringify(managerTestUser));
};

describe("Course template page (settings/courses) — Phase 3 regression: ช่องโหว่ NaN ของ defaultPrice", () => {
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

  it("เคลียร์ช่อง 'ราคาเริ่มต้น' (defaultPrice) ให้ว่างแล้วส่งฟอร์ม ต้องเห็น error message จริง ไม่ใช่หลุดผ่านเงียบๆ", async () => {
    seedLocalStorage();
    const { container } = render(
      <AppProvider>
        <SettingsCoursesPage />
      </AppProvider>,
    );

    // ปุ่มเปิด Modal และหัวข้อ Modal ตอนเพิ่มใหม่ใช้ข้อความ "เพิ่มคอร์สใหม่" เหมือนกัน — ต้องคลิกก่อน
    // Modal จะเปิด (ตอนนั้นมีแค่ 1 elements ที่ match) แล้วค่อย query ฟิลด์ในฟอร์มต่อแบบ scoped กับ container
    const openButton = await screen.findByText("เพิ่มคอร์สใหม่");
    fireEvent.click(openButton);
    await waitFor(() => {
      expect(container.querySelector('input[name="name"]')).toBeTruthy();
    });

    const categorySelect = container.querySelector('select[name="category"]') as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: "คอร์สสปาตัว" } });
    const nameInput = container.querySelector('input[name="name"]') as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "คอร์สทดสอบ" } });

    const defaultPriceInput = container.querySelector(
      'input[name="defaultPrice"]',
    ) as HTMLInputElement;
    expect(defaultPriceInput).toBeTruthy();

    // กรอกแล้วลบให้ว่างสนิท (จำลองผู้ใช้พิมพ์ผิดแล้วลบทิ้ง)
    fireEvent.change(defaultPriceInput, { target: { value: "1000" } });
    fireEvent.change(defaultPriceInput, { target: { value: "" } });

    const form = defaultPriceInput.closest("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(await screen.findByText("กรุณากรอกราคา")).toBeInTheDocument();
  });
});

describe("Course sales page (courses) — Phase 3 regression: ช่องโหว่ NaN ของ price/commissionPercent", () => {
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

  it("Phase 3 (ค) เคสเพิ่มเติม — เคลียร์ price+commissionPercent ทั้ง 2 ฟิลด์ให้ว่างพร้อมกันแล้วส่งฟอร์ม ต้องเห็น error message ครบทั้ง 2 ฟิลด์ ไม่ทับซ้อน/สับสนกัน", async () => {
    seedLocalStorage();
    const { container } = render(
      <AppProvider>
        <CourseSalesPage />
      </AppProvider>,
    );

    const addButton = await screen.findByText("บันทึกการขายคอร์สใหม่");
    fireEvent.click(addButton);
    await screen.findByText(/หมอนวดผู้เสนอขาย/);

    const therapistSelect = container.querySelector(
      'select[name="therapistName"]',
    ) as HTMLSelectElement;
    fireEvent.change(therapistSelect, { target: { value: TEST_THERAPIST.name } });

    const categorySelect = container.querySelector(
      'select[name="courseCategory"]',
    ) as HTMLSelectElement;
    fireEvent.change(categorySelect, { target: { value: "คอร์สสปาตัว" } });

    const courseTypeInput = container.querySelector(
      'input[name="courseType"]',
    ) as HTMLInputElement;
    fireEvent.change(courseTypeInput, { target: { value: "คอร์สทดสอบขาย" } });

    const priceInput = container.querySelector('input[name="price"]') as HTMLInputElement;
    const commissionPercentInput = container.querySelector(
      'input[name="commissionPercent"]',
    ) as HTMLInputElement;

    // กรอกค่าที่ถูกต้องก่อน แล้วลบทิ้งพร้อมกันทั้ง 2 ช่อง
    fireEvent.change(priceInput, { target: { value: "1500" } });
    fireEvent.change(commissionPercentInput, { target: { value: "10" } });
    fireEvent.change(priceInput, { target: { value: "" } });
    fireEvent.change(commissionPercentInput, { target: { value: "" } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    expect(await screen.findByText("กรุณากรอกราคาจำหน่าย")).toBeInTheDocument();
    expect(screen.getByText("กรุณากรอกเปอร์เซ็นต์ค่าคอม")).toBeInTheDocument();

    // ฟอร์มต้องไม่ถูกส่งสำเร็จ — Modal ต้องยังเปิดอยู่
    expect(screen.getByText(/หมอนวดผู้เสนอขาย/)).toBeInTheDocument();
  });

  it("กรอกค่าตัวเลขถูกต้องครบทั้ง price และ commissionPercent ต้องบันทึกสำเร็จ ไม่มี error ค้าง", async () => {
    seedLocalStorage();
    const { container } = render(
      <AppProvider>
        <CourseSalesPage />
      </AppProvider>,
    );

    const addButton = await screen.findByText("บันทึกการขายคอร์สใหม่");
    fireEvent.click(addButton);
    await screen.findByText(/หมอนวดผู้เสนอขาย/);

    fireEvent.change(
      container.querySelector('select[name="therapistName"]') as HTMLSelectElement,
      { target: { value: TEST_THERAPIST.name } },
    );
    fireEvent.change(
      container.querySelector('select[name="courseCategory"]') as HTMLSelectElement,
      { target: { value: "คอร์สสปาตัว" } },
    );
    fireEvent.change(container.querySelector('input[name="courseType"]') as HTMLInputElement, {
      target: { value: "คอร์สทดสอบขาย" },
    });
    fireEvent.change(container.querySelector('input[name="price"]') as HTMLInputElement, {
      target: { value: "1500" },
    });
    fireEvent.change(
      container.querySelector('input[name="commissionPercent"]') as HTMLInputElement,
      { target: { value: "10" } },
    );

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(screen.queryByText(/หมอนวดผู้เสนอขาย/)).not.toBeInTheDocument();
    });
    expect(screen.queryByText("กรุณากรอกราคาจำหน่าย")).not.toBeInTheDocument();
    expect(screen.queryByText("กรุณากรอกเปอร์เซ็นต์ค่าคอม")).not.toBeInTheDocument();
  });
});
