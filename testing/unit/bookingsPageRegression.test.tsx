// testing/unit/bookingsPageRegression.test.tsx
// ขอบเขต: Phase 3 (ก) — Regression: Silent failure ตอนบันทึก booking + (ค) 3 edge case เพิ่มเติมนอกแผนเดิม
// (ดู testing/TEST_PLAN.md Phase 3 และ PROJECT_STATUS.md หัวข้อ "แก้บั๊กหน้าบันทึกงานนวด")
//
// เดิม onSubmit ของ src/app/bookings/page.tsx เรียก addOrUpdateBooking แบบ fire-and-forget (ไม่ await)
// แล้วปิด Modal ทันที ถ้า Firestore เขียนล้มเหลวผู้ใช้จะไม่เห็น error ใดๆ เลย ("กดบันทึกแล้วไม่มีอะไรเกิดขึ้น")
// แก้แล้วเป็น async/await + try/catch + ปุ่ม "กำลังบันทึก..." กันกดซ้ำ — ไฟล์นี้พิสูจน์พฤติกรรมที่แก้แล้วจริง
// ด้วยการจำลอง Firestore write ล้มเหลว (mock reject) ผ่านการ mock module "@/utils/db" (เหตุผล Why:
// AppContext.tsx เรียก `db.saveBooking(...)` ผ่าน `import * as db from "@/utils/db"` — mock เฉพาะฟังก์ชันนี้
// ทำให้จำลอง Firestore ล้มเหลวได้ตรงจุดจริง โดยฟังก์ชัน CRUD อื่นของ db.ts ยังทำงานปกติ (fallback localStorage)

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import type { Mock } from "vitest";
import { AppProvider } from "@/context/AppContext";
import BookingsPage from "@/app/bookings/page";
import { Service, Therapist, Booking } from "@/data/initialData";
import * as db from "@/utils/db";

// Mock เฉพาะ saveBooking — ฟังก์ชัน CRUD อื่นทั้งหมดยังเป็นของจริง (fallback localStorage) เพื่อไม่ต้อง
// mock ทั้งโมดูล (ลดความเสี่ยง mock ซ้อน mock ตามกฎ Cost-Effective Abstraction ใน testing/AGENTS.md)
vi.mock("@/utils/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/utils/db")>();
  return {
    ...actual,
    saveBooking: vi.fn(actual.saveBooking),
  };
});

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

const THERAPIST_NAME = "ทดสอบรีเกรสชัน";

const SERVICE_A: Service = {
  id: "svc_regression_a",
  category: "นวด",
  name: "นวดแผนไทยรีเกรสชัน",
  duration: 1,
  price: 300,
  commission: 150,
};

const buildTherapist = (): Therapist => ({
  id: "ther_regression_1",
  name: THERAPIST_NAME,
  type: "full-time",
  dailyGuarantee: 200,
  bankName: "ธนาคารทดสอบ",
  bankAccount: "333-3-33333-3",
  bankAccountName: "Regression Tester",
  phone: "0833333333",
});

const EXISTING_CUSTOMER_NAME = "ลูกค้าเดิมก่อนแก้ไข";

// booking ที่มีอยู่แล้วในระบบก่อนเปิดหน้า — ใช้สำหรับเคส "แก้ไข booking เดิมแล้ว Firestore ล้มเหลว"
// ต้องตั้งวันที่เป็น "วันนี้" เสมอ เพราะ canEditBooking() บล็อก role admin (ค่า default ของ AppContext)
// ไม่ให้แก้ไขรายการของวันอื่น (ดู bookings/page.tsx บรรทัด canEditBooking)
const buildExistingBooking = (todayStr: string): Booking => ({
  id: "bkg_existing_regression",
  date: todayStr,
  round: 1,
  therapistName: THERAPIST_NAME,
  timeSlot: "09.00-10.00",
  services: [
    {
      serviceId: SERVICE_A.id,
      serviceName: SERVICE_A.name,
      price: SERVICE_A.price,
      commission: SERVICE_A.commission,
      quantity: 1,
    },
  ],
  payment: { cash: 300, transfer: 0, card: 0, tip: 0 },
  customerName: EXISTING_CUSTOMER_NAME,
  remark: "",
  updateDate: new Date().toISOString(),
  updateBy: "seed",
});

const seedLocalStorage = (existingBooking?: Booking): void => {
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([buildTherapist()]));
  mockLocalStorage.setItem("demo_spa_services", JSON.stringify([SERVICE_A]));
  mockLocalStorage.setItem(
    "demo_spa_bookings",
    JSON.stringify(existingBooking ? [existingBooking] : []),
  );
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(0));
  mockLocalStorage.setItem("demo_spa_service_categories", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_system_users", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
};

const renderBookingsPage = async (): Promise<ReturnType<typeof render>> => {
  return render(
    <AppProvider>
      <BookingsPage />
    </AppProvider>,
  );
};

// เปิด Modal "บันทึกงานนวดใหม่" แล้วกรอกฟอร์มให้ครบขั้นต่ำสุดที่ผ่าน validation ได้ (หมอนวด, เวลา, บริการ, รอบ)
const openAddModalAndFillMinimumValidForm = (container: HTMLElement): void => {
  fireEvent.click(screen.getByText("บันทึกงานนวดใหม่"));

  const selects = container.querySelectorAll("select");
  fireEvent.change(selects[0], { target: { value: THERAPIST_NAME } }); // เลือกหมอนวด

  const timeInputs = container.querySelectorAll('input[type="time"]');
  fireEvent.change(timeInputs[0], { target: { value: "09:00" } }); // เวลาเข้า

  fireEvent.change(selects[1], { target: { value: SERVICE_A.id } }); // เลือกบริการ
  fireEvent.click(screen.getByText("เพิ่มงาน")); // กดเพิ่มงานเข้าตาราง

  const roundInput = container.querySelector(
    'input[type="number"][placeholder="เช่น 1"]',
  ) as HTMLInputElement;
  fireEvent.change(roundInput, { target: { value: "1" } });
};

const getSubmitButton = (container: HTMLElement): HTMLButtonElement =>
  container.querySelector('button[type="submit"]') as HTMLButtonElement;

describe("Bookings page — Phase 3 (ก) Regression: Silent failure ตอนบันทึก booking", () => {
  let alertSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.clear();
    // ฟอร์มบันทึกงานนวดใช้ window.confirm ตอนลบรายการ และ window.alert ตอนแจ้ง error — mock ไว้ป้องกัน
    // jsdom โยน "Not implemented" error และเพื่อดักจับข้อความ error ที่ระบบส่งให้ผู้ใช้เห็นจริง
    alertSpy = vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    alertSpy.mockRestore();
    vi.clearAllMocks();
    cleanup();
  });

  it("Firestore write ล้มเหลวตอนสร้าง booking ใหม่ — ต้องแสดง error ให้ผู้ใช้เห็นจริง และ Modal ต้องไม่ปิด", async () => {
    seedLocalStorage();
    const FIRESTORE_ERROR_MESSAGE = "จำลอง Firestore ปฏิเสธการเขียน (Permission denied)";
    (db.saveBooking as unknown as Mock).mockRejectedValue(new Error(FIRESTORE_ERROR_MESSAGE));

    const { container } = await renderBookingsPage();
    await screen.findByText("บันทึกงานนวดใหม่");
    openAddModalAndFillMinimumValidForm(container);

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    const alertMessage = alertSpy.mock.calls[0][0] as string;
    expect(alertMessage).toContain("บันทึกข้อมูลไม่สำเร็จ");
    expect(alertMessage).toContain(FIRESTORE_ERROR_MESSAGE);

    // Modal ต้องยังเปิดอยู่ — ไม่ปิดตัวเองทั้งที่บันทึกไม่สำเร็จจริง (นี่คือบั๊กเดิมที่เคยเกิด)
    expect(screen.getByText("บันทึกงานนวดสปาประจำวันใหม่")).toBeInTheDocument();
  });

  it("ปุ่มบันทึกต้องเปลี่ยนเป็น 'กำลังบันทึก...' และถูก disable ทันทีระหว่างรอผลจาก Firestore กันกดซ้ำ", async () => {
    seedLocalStorage();
    let resolveSave: (() => void) | undefined;
    (db.saveBooking as unknown as Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { container } = await renderBookingsPage();
    await screen.findByText("บันทึกงานนวดใหม่");
    openAddModalAndFillMinimumValidForm(container);

    const submitButton = getSubmitButton(container);
    expect(submitButton.disabled).toBe(false);
    expect(submitButton.textContent).toContain("บันทึกงานนวด");

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    // ทันทีหลัง submit (ก่อน Firestore ตอบกลับ) ปุ่มต้อง disable และข้อความเปลี่ยนเป็น "กำลังบันทึก..."
    await waitFor(() => {
      expect(getSubmitButton(container).disabled).toBe(true);
    });
    expect(getSubmitButton(container).textContent).toContain("กำลังบันทึก...");

    // ปลดล็อกให้ Firestore บันทึกสำเร็จ แล้ว Modal ต้องปิดตามปกติ
    resolveSave?.();
    await waitFor(() => {
      expect(screen.queryByText("บันทึกงานนวดสปาประจำวันใหม่")).not.toBeInTheDocument();
    });
  });
});

describe("Bookings page — Phase 3 (ค) 3 edge case เพิ่มเติมนอกแผนเดิม (สั่งเพิ่มโดย Main Chat)", () => {
  beforeEach(() => {
    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.clear();
    vi.spyOn(window, "alert").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
    cleanup();
  });

  it("ค.1 — กดปุ่มบันทึกรัวๆ 3 ครั้งติดกันเร็วๆ ต้องเรียก Firestore write แค่ครั้งเดียวเท่านั้น (unit-level proof ของกลไก disable ปุ่ม — ยืนยันซ้ำด้วย E2E จริงบน Firestore test project แยกต่างหาก)", async () => {
    seedLocalStorage();
    // ควบคุมจังหวะ resolve เองแทน mockResolvedValue เฉยๆ (เหตุผล Why: ถ้า resolve ทันที Modal จะปิดเร็ว
    // เกินกว่าจะทันตรวจสอบสถานะ disabled ของปุ่มระหว่างบันทึก — ต้อง "ค้าง" ไว้ก่อนจนกว่าจะยืนยันครบ)
    let resolveSave: (() => void) | undefined;
    (db.saveBooking as unknown as Mock).mockImplementation(
      () =>
        new Promise<void>((resolve) => {
          resolveSave = resolve;
        }),
    );

    const { container } = await renderBookingsPage();
    await screen.findByText("บันทึกงานนวดใหม่");
    openAddModalAndFillMinimumValidForm(container);

    const submitButton = getSubmitButton(container);
    // จำลองผู้ใช้กดรัวๆ 3 ครั้งติดกัน — คลิกแรกกระตุ้น validation (async เพราะ zodResolver) ก่อน แล้วรอให้
    // ปุ่มเปลี่ยนเป็น disabled จริงบน DOM (สะท้อนพฤติกรรมจริงที่ React ต้อง re-render ก่อนคลิกถัดไปจะมาถึง)
    // จากนั้นจึงคลิกซ้ำอีก 2 ครั้งบนปุ่มที่ disabled แล้ว — jsdom เคารพ attribute disabled ของปุ่มจริง
    // จึงไม่ trigger submit ซ้ำ พิสูจน์ว่ากลไกกันกดซ้ำทำงานจริงระดับ DOM ไม่ใช่แค่ทฤษฎี
    fireEvent.click(submitButton);
    await waitFor(() => {
      expect(getSubmitButton(container).disabled).toBe(true);
    });
    fireEvent.click(submitButton);
    fireEvent.click(submitButton);

    expect(db.saveBooking).toHaveBeenCalledTimes(1);

    // ปลดล็อกให้บันทึกสำเร็จ แล้วยืนยัน Modal ปิดตามปกติ (ไม่ค้างสถานะ "กำลังบันทึก..." ตลอดไป)
    resolveSave?.();
    await waitFor(() => {
      expect(screen.queryByText("บันทึกงานนวดสปาประจำวันใหม่")).not.toBeInTheDocument();
    });
    expect(db.saveBooking).toHaveBeenCalledTimes(1);
  });

  it("ค.3 — Firestore write ล้มเหลวตอนแก้ไข booking เดิม (ไม่ใช่สร้างใหม่) ข้อมูลเดิมต้องไม่เสียหาย/ไม่ถูก overwrite ด้วยค่าครึ่งๆ กลางๆ", async () => {
    const { getTodayDateString } = await import("@/utils/dateHelpers");
    const todayStr = getTodayDateString();
    const existingBooking = buildExistingBooking(todayStr);
    seedLocalStorage(existingBooking);

    const FIRESTORE_ERROR_MESSAGE = "จำลอง Firestore ล้มเหลวตอนแก้ไข";
    (db.saveBooking as unknown as Mock).mockRejectedValue(new Error(FIRESTORE_ERROR_MESSAGE));

    const { container } = await renderBookingsPage();
    // ยืนยันข้อมูลเดิมแสดงถูกต้องก่อนแก้ไขใดๆ
    await screen.findByText(EXISTING_CUSTOMER_NAME);

    const editButton = screen.getByTitle("แก้ไขรายการ");
    fireEvent.click(editButton);
    await screen.findByText("แก้ไขบันทึกงานนวดประจำวัน");

    const NEW_UNSAVED_CUSTOMER_NAME = "ลูกค้าใหม่ที่ยังไม่ถูกบันทึกจริง";
    const customerNameInput = container.querySelector(
      'input[placeholder="กรอกชื่อลูกค้า"]',
    ) as HTMLInputElement;
    fireEvent.change(customerNameInput, { target: { value: NEW_UNSAVED_CUSTOMER_NAME } });

    const form = container.querySelector("form") as HTMLFormElement;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(window.alert).toHaveBeenCalled();
    });
    // Modal ต้องยังเปิดอยู่ (ยังไม่ปิดตัวเองทั้งที่บันทึกไม่สำเร็จ)
    expect(screen.getByText("แก้ไขบันทึกงานนวดประจำวัน")).toBeInTheDocument();

    // ปิด Modal ด้วยปุ่มยกเลิก (ไม่กดบันทึกซ้ำ) แล้วตรวจว่าข้อมูลเดิมในตารางยังเป็นค่าเดิมเป๊ะ ไม่ถูก
    // overwrite ด้วยค่าครึ่งๆ กลางๆ ของฟอร์มที่แก้ไขค้างไว้ (เพราะ AppContext.addOrUpdateBooking จะ
    // setBookings() ก็ต่อเมื่อ db.saveBooking() สำเร็จเท่านั้น — ดู src/context/AppContext.tsx)
    fireEvent.click(screen.getByText("ยกเลิก"));
    await waitFor(() => {
      expect(screen.queryByText("แก้ไขบันทึกงานนวดประจำวัน")).not.toBeInTheDocument();
    });

    expect(screen.getByText(EXISTING_CUSTOMER_NAME)).toBeInTheDocument();
    expect(screen.queryByText(NEW_UNSAVED_CUSTOMER_NAME)).not.toBeInTheDocument();
  });
});
