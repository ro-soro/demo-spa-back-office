// testing/unit/bookingsPageIntegration.test.tsx
// ขอบเขตของไฟล์นี้ (Phase 2 — Booking Financial Calculations, ดู testing/TEST_PLAN.md):
// เทสสำหรับ formTotalReceived (ยอดรับเงินรวม สด+โอน+บัตร+ทิป) และ syncTimeEndWithTotalHours
// (การ auto sync เวลาสิ้นสุดกับผลรวมชั่วโมงจริงของรายการบริการ) ของหน้า src/app/bookings/page.tsx
// ทั้งสองฟังก์ชันนี้ไม่ได้ถูก export ออกมาเป็น pure function เดี่ยวๆ (เป็น local const/function
// ที่คำนวณจาก useWatch/state ภายใน component) จึงต้อง render หน้า BookingsPage จริงทั้งหน้าแล้ว
// จำลองการกรอกฟอร์มผ่าน React Testing Library เหมือนแนวทางเดียวกับ testing/unit/payrollPageIntegration.test.tsx
// (ห่อด้วย AppProvider จริง ใช้ localStorage fallback แทน Firestore จริง — ปลอดภัยกับข้อมูลจริงของร้าน)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, within, cleanup, waitFor } from "@testing-library/react";
import { AppProvider } from "@/context/AppContext";
import BookingsPage from "@/app/bookings/page";
import { Service, Therapist } from "@/data/initialData";

// เหตุผลที่ต้องมี mock นี้ (Why): db.ts fallback ไปใช้ localStorage เสมอตอนรัน vitest (firestore
// เป็น null เพราะไม่มี env จริงถูกโหลดเข้ามาตอนรันเทส) จึงต้อง mock localStorage ให้ AppProvider/db.ts
// ทำงานได้จริงในสภาพแวดล้อม jsdom เหมือนกับ testing/unit/payrollPageIntegration.test.tsx ที่มีอยู่แล้ว
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

const THERAPIST_NAME = "ทดสอบ";

// บริการทดสอบ 4 รายการ ระยะเวลาต่างกันเพื่อให้เห็นผลรวมชั่วโมงชัดเจนเวลาเพิ่ม/ลบสลับกัน
const SERVICE_A: Service = { id: "svc_a", category: "นวด", name: "นวดแผนไทย", duration: 1, price: 300, commission: 150 };
const SERVICE_B: Service = { id: "svc_b", category: "นวด", name: "นวดน้ำมัน", duration: 2, price: 600, commission: 300 };
const SERVICE_C: Service = { id: "svc_c", category: "นวด", name: "นวดเท้า", duration: 1.5, price: 400, commission: 200 };
const SERVICE_D: Service = { id: "svc_d", category: "ผิวพรรณ", name: "ขัดผิว", duration: 1, price: 350, commission: 175 };

const buildTherapist = (): Therapist => ({
  id: "ther_booking_1",
  name: THERAPIST_NAME,
  type: "full-time",
  dailyGuarantee: 200,
  bankName: "ธนาคารทดสอบ",
  bankAccount: "111-1-11111-1",
  bankAccountName: "Booking Tester",
  phone: "0811111111",
});

// เติมข้อมูลตั้งต้นลง localStorage ก่อน render — จำลองข้อมูลที่มีอยู่แล้วในระบบก่อนเปิดหน้า bookings
const seedLocalStorage = (): void => {
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([buildTherapist()]));
  mockLocalStorage.setItem(
    "demo_spa_services",
    JSON.stringify([SERVICE_A, SERVICE_B, SERVICE_C, SERVICE_D]),
  );
  mockLocalStorage.setItem("demo_spa_bookings", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(0));
  mockLocalStorage.setItem("demo_spa_service_categories", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_system_users", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
};

const renderBookingsPage = async (): Promise<ReturnType<typeof render>> => {
  const rendered = render(
    <AppProvider>
      <BookingsPage />
    </AppProvider>,
  );
  // รอให้ AppProvider โหลดข้อมูลตั้งต้น (async) เสร็จก่อน แล้วเปิด Modal บันทึกงานนวดใหม่เสมอ
  const addButton = await screen.findByText("บันทึกงานนวดใหม่");
  fireEvent.click(addButton);
  await screen.findByText("บันทึกงานนวดสปาประจำวันใหม่");
  return rendered;
};

// ช่องกรอกเงิน 4 ช่อง (สด/โอน/บัตร/ทิป) ไม่มี htmlFor/id เชื่อมกับ label โดยตรง จึงต้องหา <label>
// ด้วยข้อความก่อน แล้วค่อยหา <input> ที่อยู่ใน <div> เดียวกัน (Why ต้องมี helper นี้: ลดการเขียนโค้ด
// ซ้ำ 4 ครั้งสำหรับ 4 ช่องเงิน และกันพลาดเรื่อง selector ผิดช่อง)
const getPaymentInput = (container: HTMLElement, labelText: string): HTMLInputElement => {
  const label = within(container).getByText(labelText);
  const wrapperDiv = label.closest("div");
  if (!wrapperDiv) {
    throw new Error(`ไม่พบ wrapper div ของช่องกรอก "${labelText}"`);
  }
  const input = wrapperDiv.querySelector("input");
  if (!input) {
    throw new Error(`ไม่พบ input ของช่องกรอก "${labelText}"`);
  }
  return input as HTMLInputElement;
};

const getCashInput = (container: HTMLElement): HTMLInputElement =>
  getPaymentInput(container, "เงินสด (฿) (ไม่บังคับ)");
const getTransferInput = (container: HTMLElement): HTMLInputElement =>
  getPaymentInput(container, "เงินโอน (฿) (ไม่บังคับ)");
const getCardInput = (container: HTMLElement): HTMLInputElement =>
  getPaymentInput(container, "บัตรเครดิต (฿) (ไม่บังคับ)");
const getTipInput = (container: HTMLElement): HTMLInputElement =>
  getPaymentInput(container, "ทิปหมอพิเศษ (฿) (ไม่บังคับ)");

// ข้อความ "ยอดรับเงินรวม: X ฿" ถูกแยกเป็น <span>ยอดรับเงินรวม: <strong>X ฿</strong></span> — ข้อความเต็ม
// จึงกระจายอยู่คนละ text node กัน ต้องอ่านจาก textContent ของ <span> ที่ครอบทั้งคู่แทนการ getByText ตรงๆ
const getTotalReceivedText = (container: HTMLElement): string => {
  const spans = Array.from(container.querySelectorAll("span"));
  const target = spans.find((el) => el.textContent?.includes("ยอดรับเงินรวม"));
  return target?.textContent?.trim() ?? "";
};

const getTotalPriceText = (container: HTMLElement): string => {
  const spans = Array.from(container.querySelectorAll("span"));
  const target = spans.find((el) => el.textContent?.includes("ราคารวมบริการ"));
  return target?.textContent?.trim() ?? "";
};

// เลือกหมอนวดในฟอร์ม (select ตัวแรกในหน้า Modal คือช่องเลือกหมอนวด)
const selectTherapist = (container: HTMLElement): void => {
  const selects = container.querySelectorAll("select");
  fireEvent.change(selects[0], { target: { value: THERAPIST_NAME } });
};

// select ตัวที่สองในหน้า Modal คือ Dropdown เลือกรายการบริการนวด
const getServiceSelect = (container: HTMLElement): HTMLSelectElement =>
  container.querySelectorAll("select")[1] as HTMLSelectElement;

// input[type="time"] ตัวแรก = เวลาเข้า, ตัวที่สอง = เวลาออก
const getTimeStartInput = (container: HTMLElement): HTMLInputElement =>
  container.querySelectorAll('input[type="time"]')[0] as HTMLInputElement;
const getTimeEndInput = (container: HTMLElement): HTMLInputElement =>
  container.querySelectorAll('input[type="time"]')[1] as HTMLInputElement;

// กดปุ่ม "เพิ่มงาน" เพื่อเพิ่มบริการที่เลือกอยู่ลงตาราง
const clickAddServiceButton = (): void => {
  fireEvent.click(screen.getByText("เพิ่มงาน"));
};

// เพิ่มบริการ 1 รายการเข้าฟอร์มให้ครบขั้นตอน (เลือกจาก dropdown แล้วกดเพิ่มงาน)
const addServiceToForm = (container: HTMLElement, serviceId: string): void => {
  fireEvent.change(getServiceSelect(container), { target: { value: serviceId } });
  clickAddServiceButton();
};

// กดปุ่ม "ลบ" ของแถวบริการที่มีชื่อ serviceName ในตารางรายการบริการที่เลือกไว้
const removeServiceFromTable = (serviceName: string): void => {
  const row = screen.getByText(serviceName).closest("tr") as HTMLElement;
  const removeButton = within(row).getByRole("button");
  fireEvent.click(removeButton);
};

describe("Bookings page — formTotalReceived and syncTimeEndWithTotalHours (component integration, ไม่แตะ Firestore จริง)", () => {
  beforeEach(() => {
    // ใช้ vi.stubGlobal ผ่าน import จาก vitest แยกต่างหาก — ทำแบบเดียวกับ payrollPageIntegration.test.tsx
    Object.defineProperty(window, "localStorage", {
      value: mockLocalStorage,
      writable: true,
    });
    mockLocalStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  describe("formTotalReceived — ยอดรับเงินรวม (สด+โอน+บัตร+ทิป)", () => {
    it("รวมยอดถูกต้องเมื่อไม่มีทิป (สด+โอนเท่านั้น)", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      fireEvent.change(getCashInput(container), { target: { value: "300" } });
      fireEvent.change(getTransferInput(container), { target: { value: "200" } });

      expect(getTotalReceivedText(container)).toContain("500 ฿");
    });

    it("รวมยอดถูกต้องเมื่อมีทิปด้วย", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      fireEvent.change(getCashInput(container), { target: { value: "300" } });
      fireEvent.change(getTransferInput(container), { target: { value: "200" } });
      fireEvent.change(getCardInput(container), { target: { value: "100" } });
      fireEvent.change(getTipInput(container), { target: { value: "50" } });

      // 300 + 200 + 100 + 50 = 650
      expect(getTotalReceivedText(container)).toContain("650 ฿");
    });

    it("รวมยอดถูกต้องเมื่อกรอกครบทุกช่องทางชำระ (สด+โอน+บัตร+ทิป ครบทั้ง 4 ช่อง)", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      fireEvent.change(getCashInput(container), { target: { value: "1000" } });
      fireEvent.change(getTransferInput(container), { target: { value: "500" } });
      fireEvent.change(getCardInput(container), { target: { value: "800" } });
      fireEvent.change(getTipInput(container), { target: { value: "100" } });

      // 1000 + 500 + 800 + 100 = 2,400
      expect(getTotalReceivedText(container)).toContain("2,400 ฿");
    });

    it("ยังไม่กรอกช่องใดเลย ต้องรวมได้ 0 ฿ ไม่ใช่ NaN หรือช่องว่าง", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      expect(getTotalReceivedText(container)).toContain("0 ฿");
      expect(getTotalReceivedText(container)).not.toContain("NaN");
    });
  });

  describe("syncTimeEndWithTotalHours — auto sync เวลาสิ้นสุดกับผลรวมชั่วโมงจริงของบริการ", () => {
    it("เพิ่มบริการรายการเดียว เวลาสิ้นสุดต้องขยับตามชั่วโมงของรายการนั้น", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });
      addServiceToForm(container, SERVICE_A.id); // duration 1 ชม.

      expect(getTimeEndInput(container).value).toBe("10:00");
    });

    it("เพิ่มบริการ 2 รายการสลับกัน เวลาสิ้นสุดต้องเป็นผลรวมชั่วโมงจริงของทุกรายการเสมอ (ไม่ใช่แค่รายการล่าสุด)", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });

      addServiceToForm(container, SERVICE_A.id); // +1 ชม. รวม 1 ชม.
      expect(getTimeEndInput(container).value).toBe("10:00");

      addServiceToForm(container, SERVICE_B.id); // +2 ชม. รวม 3 ชม.
      expect(getTimeEndInput(container).value).toBe("12:00");
    });

    it("ลบบริการรายการหนึ่งออกจาก 2 รายการ เวลาสิ้นสุดต้องคำนวณจากรายการที่เหลือจริงเท่านั้น", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });

      addServiceToForm(container, SERVICE_A.id); // 1 ชม.
      addServiceToForm(container, SERVICE_B.id); // 2 ชม. รวม 3 ชม. -> 12:00

      removeServiceFromTable(SERVICE_A.name);
      // เหลือแค่ SERVICE_B (2 ชม.) -> 09:00 + 2 = 11:00
      expect(getTimeEndInput(container).value).toBe("11:00");
    });
  });

  describe("Edge case เพิ่มเติมนอกแผนเดิม (ความเสี่ยงเรื่องเงินโดยตรง)", () => {
    it("Edge case 1 — ลบรายการบริการจนเหลือ 0 รายการ ต้อง reset เวลาสิ้นสุดกลับเป็นค่าเดียวกับเวลาเริ่มต้น ไม่ค้างค่าเก่า/ไม่ error", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });
      addServiceToForm(container, SERVICE_A.id); // 1 ชม. -> 10:00
      expect(getTimeEndInput(container).value).toBe("10:00");

      removeServiceFromTable(SERVICE_A.name);

      // ไม่เหลือรายการใดเลย -> ผลรวมชั่วโมง = 0 -> เวลาสิ้นสุดต้องเท่ากับเวลาเริ่มต้นพอดี (ไม่ค้างค่า 10:00 เดิม)
      expect(getTimeEndInput(container).value).toBe("09:00");
      expect(getTimeEndInput(container).value).not.toBe("");
      // ตารางรายการบริการต้องกลับไปแสดงข้อความ "ยังไม่ได้เลือกรายการบริการ"
      expect(screen.getByText(/ยังไม่ได้เลือกรายการบริการ/)).toBeInTheDocument();
    });

    it("Edge case 2 — กรอกช่องทางชำระบางช่องเป็น 0 บาทตรงๆ (ไม่ใช่ปล่อยว่าง) ต้องรวมได้ถูกต้อง ไม่กลายเป็น NaN", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      fireEvent.change(getCashInput(container), { target: { value: "0" } });
      fireEvent.change(getTransferInput(container), { target: { value: "500" } });
      fireEvent.change(getCardInput(container), { target: { value: "0" } });
      fireEvent.change(getTipInput(container), { target: { value: "0" } });

      expect(getTotalReceivedText(container)).toContain("500 ฿");
      expect(getTotalReceivedText(container)).not.toContain("NaN");
    });

    it("Edge case 3 — สลับลบ-เพิ่มรายการบริการแบบไม่เรียงลำดับ (เพิ่ม A,B,C ลบ B เพิ่ม D) ต้องคำนวณจากรายการที่เหลือจริงเท่านั้น ไม่หลงเหลือ state ของรายการที่ถูกลบไปแล้ว", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });

      addServiceToForm(container, SERVICE_A.id); // A: 1 ชม. รวม 1 -> 10:00
      addServiceToForm(container, SERVICE_B.id); // B: 2 ชม. รวม 3 -> 12:00
      addServiceToForm(container, SERVICE_C.id); // C: 1.5 ชม. รวม 4.5 -> 13:30
      expect(getTimeEndInput(container).value).toBe("13:30");

      removeServiceFromTable(SERVICE_B.name); // เหลือ A(1) + C(1.5) = 2.5 -> 11:30
      expect(getTimeEndInput(container).value).toBe("11:30");
      // ต้องไม่เหลือ SERVICE_B ในตารางอีกต่อไป
      expect(screen.queryByText(SERVICE_B.name)).not.toBeInTheDocument();

      addServiceToForm(container, SERVICE_D.id); // D: 1 ชม. รวม A(1)+C(1.5)+D(1) = 3.5 -> 12:30
      expect(getTimeEndInput(container).value).toBe("12:30");
      // ยืนยันว่ารายการที่เหลือในตารางคือ A, C, D เท่านั้น (ไม่ใช่ B ที่ถูกลบไปแล้ว)
      expect(screen.getByText(SERVICE_A.name)).toBeInTheDocument();
      expect(screen.getByText(SERVICE_C.name)).toBeInTheDocument();
      expect(screen.getByText(SERVICE_D.name)).toBeInTheDocument();
      expect(screen.queryByText(SERVICE_B.name)).not.toBeInTheDocument();
    });

    // ยืนยัน Modal ปิดสำเร็จหลังกด submit (helper ใช้ร่วมกันทั้ง 3 เคสของ soft warning ด้านล่าง —
    // เหตุผล (Why fixture นี้จำเป็น): ลดโค้ดซ้ำ 3 ครั้งของ pattern "submit แล้วรอ modal ปิด" ที่เหมือนกันทุกเคส)
    const submitFormAndWaitForModalToClose = async (
      container: HTMLElement,
    ): Promise<boolean> => {
      const roundInput = container.querySelector(
        'input[type="number"][placeholder="เช่น 1"]',
      ) as HTMLInputElement;
      fireEvent.change(roundInput, { target: { value: "1" } });

      const form = container.querySelector("form") as HTMLFormElement;
      fireEvent.submit(form);

      let modalClosedAfterSubmit = false;
      try {
        await waitFor(
          () => {
            expect(
              screen.queryByText("บันทึกงานนวดสปาประจำวันใหม่"),
            ).not.toBeInTheDocument();
          },
          { timeout: 2000 },
        );
        modalClosedAfterSubmit = true;
      } catch {
        modalClosedAfterSubmit = false;
      }
      return modalClosedAfterSubmit;
    };

    it("Edge case 4 — ยอดรับเงินรวมน้อยกว่าราคาบริการรวม (900 ฿ vs 800 ฿): ต้องเห็น soft warning ข้อความ 'ขาดไป 100 บาท' และปุ่มบันทึกยังกดสำเร็จ (ไม่ถูกบล็อก)", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });
      addServiceToForm(container, SERVICE_A.id); // ราคา 300
      addServiceToForm(container, SERVICE_B.id); // ราคา 600 -> ราคารวมบริการ = 900 ฿

      const totalPriceText = getTotalPriceText(container);
      expect(totalPriceText).toContain("900 ฿");

      // ยังไม่กรอกยอดรับเงินเลย -> ยอดยังไม่ตรงกัน (0 vs 900) แต่ยังไม่ต้องเช็ค ณ จุดนี้ ข้ามไปกรอกให้ครบก่อน
      // จงใจกรอกยอดรับเงินรวม (สด) แค่ 800 ฿ ให้น้อยกว่าราคารวมบริการ 900 ฿ (ไม่ตรงกัน)
      fireEvent.change(getCashInput(container), { target: { value: "800" } });

      // ยืนยันว่า soft warning ปรากฏจริงพร้อมข้อความส่วนต่างที่ถูกต้อง (ตามที่ frontend-dev เพิ่มเข้ามา)
      expect(
        screen.getByText("ยอดรับเงินไม่ตรงกับราคาบริการ (ขาดไป 100 บาท)"),
      ).toBeInTheDocument();

      const modalClosedAfterSubmit = await submitFormAndWaitForModalToClose(container);

      // ยืนยันว่ามี soft warning แสดง "และ" บันทึกสำเร็จพร้อมกัน (ไม่ใช่แค่อย่างใดอย่างหนึ่ง) — ตามคำสั่ง
      // Main Chat ที่อนุมัติให้ frontend-dev เพิ่ม soft warning แบบไม่บล็อกการบันทึกเด็ดขาด
      expect(modalClosedAfterSubmit).toBe(true);
    });

    it("Edge case 4b — ยอดรับเงินรวมมากกว่าราคาบริการรวม (900 ฿ vs 950 ฿): ต้องเห็น soft warning ข้อความ 'เกินราคาบริการ 50 บาท' และปุ่มบันทึกยังกดสำเร็จ (ไม่ถูกบล็อก)", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });
      addServiceToForm(container, SERVICE_A.id); // ราคา 300
      addServiceToForm(container, SERVICE_B.id); // ราคา 600 -> ราคารวมบริการ = 900 ฿

      expect(getTotalPriceText(container)).toContain("900 ฿");

      // จงใจกรอกยอดรับเงินรวม (สด 800 + ทิป 150) ให้มากกว่าราคารวมบริการ 900 ฿ อยู่ 50 ฿ (ไม่ตรงกัน)
      fireEvent.change(getCashInput(container), { target: { value: "800" } });
      fireEvent.change(getTipInput(container), { target: { value: "150" } });

      expect(
        screen.getByText("ยอดรับเงินไม่ตรงกับราคาบริการ (เกินราคาบริการ 50 บาท)"),
      ).toBeInTheDocument();

      const modalClosedAfterSubmit = await submitFormAndWaitForModalToClose(container);
      expect(modalClosedAfterSubmit).toBe(true);
    });

    it("Edge case 4c — ยอดรับเงินรวมตรงกับราคาบริการรวมพอดี (900 ฿ = 900 ฿): ต้องไม่มี soft warning ปรากฏเลย และปุ่มบันทึกยังกดสำเร็จตามปกติ", async () => {
      seedLocalStorage();
      const { container } = await renderBookingsPage();

      selectTherapist(container);
      fireEvent.change(getTimeStartInput(container), { target: { value: "09:00" } });
      addServiceToForm(container, SERVICE_A.id); // ราคา 300
      addServiceToForm(container, SERVICE_B.id); // ราคา 600 -> ราคารวมบริการ = 900 ฿

      expect(getTotalPriceText(container)).toContain("900 ฿");

      // กรอกยอดรับเงินรวมให้ตรงกับราคารวมบริการพอดีเป๊ะ (สด 900 ฿)
      fireEvent.change(getCashInput(container), { target: { value: "900" } });
      expect(getTotalReceivedText(container)).toContain("900 ฿");

      // ต้องไม่มีข้อความ soft warning ปรากฏเลย ไม่ว่ารูปแบบไหน (ตรวจทั้ง "ขาดไป" และ "เกินราคาบริการ")
      expect(screen.queryByText(/ยอดรับเงินไม่ตรงกับราคาบริการ/)).not.toBeInTheDocument();

      const modalClosedAfterSubmit = await submitFormAndWaitForModalToClose(container);
      expect(modalClosedAfterSubmit).toBe(true);
    });
  });
});
