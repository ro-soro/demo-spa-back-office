// testing/unit/payrollPageIntegration.test.tsx
// ขอบเขตของไฟล์นี้ (Phase 1 — Payroll & Advance Deduction Ledger, ดู testing/TEST_PLAN.md):
// รันผ่านหน้า payroll/page.tsx จริงทั้งหน้า (ห่อด้วย AppProvider จริง ไม่ mock context) โดยใช้
// localStorage fallback แทน Firestore จริง (ปลอดภัยกับข้อมูลจริงของร้าน — firestore เป็น null
// เสมอตอนรัน vitest เพราะไม่มี env จริงถูกโหลด จึงไม่มีทางเขียนทับข้อมูลจริงบน Cloud Firestore
// ได้เลยแม้แต่น้อย) เป็นเทสระดับ "component integration" ที่ทำหน้าที่แทน Playwright E2E จริงในเคสนี้
// เหตุผลที่เลือกวิธีนี้แทนการรัน Playwright จริงผ่าน `npm run dev` (Why — สำคัญ ต้องอ่าน):
// โปรเจกต์นี้เชื่อมต่อ Cloud Firestore ของจริง (.env.local มีคีย์ Firebase จริงของร้าน (production)
// ซึ่งมีข้อมูลพนักงาน/ยอดขายจริงอยู่แล้วตาม PROJECT_STATUS.md) การรัน Playwright ผ่าน dev server จริง
// จะเขียนพนักงานทดสอบ/ประวัติหักเบิกปลอมลงฐานข้อมูลจริงของร้านทันที ซึ่งเป็นความเสี่ยงที่ยอมรับไม่ได้
// จึงเลือกทดสอบผ่าน React Testing Library ที่ render หน้า payroll จริงทั้งหน้า ผ่าน logic เดียวกันทุก
// เส้นทาง (AppContext -> db.ts -> localStorage) แทน — ครอบคลุมพฤติกรรมเดียวกับที่ E2E ต้องการยืนยัน
// ทุกข้อโดยไม่แตะฐานข้อมูลจริงเลย

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, waitFor, within, fireEvent, cleanup } from "@testing-library/react";
import { AppProvider } from "@/context/AppContext";
import PayrollPage from "@/app/payroll/page";
import { Therapist, Booking, AdvanceDeductionLedgerEntry } from "@/data/initialData";

// เหตุผลที่ต้องมี mock นี้ (Why): db.ts fallback ไปใช้ localStorage เสมอตอนรัน vitest (firestore
// เป็น null เพราะไม่มี env จริงถูกโหลดเข้ามาตอนรันเทส) จึงต้อง mock localStorage ให้ AppProvider/db.ts
// ทำงานได้จริงในสภาพแวดล้อม jsdom เหมือนกับ testing/unit/auth.test.tsx ที่มีอยู่แล้ว
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

const THERAPIST_ID = "ther_int_1";
const DAILY_GUARANTEE = 200;
const SERVICE_COMMISSION = 1000; // สูงกว่าประกันมือ/วันเสมอ เพื่อให้ topup = 0 คำนวณง่ายต่อการ assert
const LATE_SHIFT_RATE = 250;
const ADVANCE_TOTAL = 3000;
const ADVANCE_PER_PERIOD = 1000;

// งวดบัญชี 3 งวดติดกัน (ทั้งคู่เป็นครึ่งเดือนพอดี ตรงกับสูตร getDefaultHalfMonthRange ของหน้า payroll)
const PERIOD_A = { start: "2026-05-01", end: "2026-05-15", bookingDate: "2026-05-05" };
const PERIOD_B = { start: "2026-05-16", end: "2026-05-31", bookingDate: "2026-05-20" };
const PERIOD_C = { start: "2026-06-01", end: "2026-06-15", bookingDate: "2026-06-05" };

const buildTherapist = (): Therapist => ({
  id: THERAPIST_ID,
  name: "Integration",
  type: "full-time",
  dailyGuarantee: DAILY_GUARANTEE,
  bankName: "ธนาคารทดสอบ",
  bankAccount: "999-9-99999-9",
  bankAccountName: "Integration Tester",
  phone: "0899999999",
  worksLateShift: true,
  advanceDeductionTotal: ADVANCE_TOTAL,
  advanceDeductionPerPeriod: ADVANCE_PER_PERIOD,
});

const buildBooking = (id: string, date: string): Booking => ({
  id,
  date,
  round: 1,
  therapistName: "Integration",
  timeSlot: "09:00",
  services: [
    {
      serviceId: "svc_test",
      serviceName: "นวดทดสอบ",
      price: 500,
      commission: SERVICE_COMMISSION,
      quantity: 1,
    },
  ],
  payment: { cash: 500, transfer: 0, card: 0, tip: 0 },
  customerName: "ลูกค้าทดสอบ",
  remark: "",
  updateDate: new Date().toISOString(),
  updateBy: "qa-tester",
});

// เติมข้อมูลตั้งต้นลง localStorage ก่อน render — จำลองข้อมูลที่มีอยู่แล้วในระบบก่อนเปิดหน้า payroll
const seedLocalStorage = (): void => {
  mockLocalStorage.setItem("demo_spa_therapists", JSON.stringify([buildTherapist()]));
  mockLocalStorage.setItem(
    "demo_spa_bookings",
    JSON.stringify([
      buildBooking("bk_a", PERIOD_A.bookingDate),
      buildBooking("bk_b", PERIOD_B.bookingDate),
      buildBooking("bk_c", PERIOD_C.bookingDate),
    ]),
  );
  mockLocalStorage.setItem("demo_spa_course_sales", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_late_shift_rate", JSON.stringify(LATE_SHIFT_RATE));
  mockLocalStorage.setItem("demo_spa_service_categories", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_course_templates", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_system_users", JSON.stringify([]));
  mockLocalStorage.setItem("demo_spa_advance_deduction_ledger", JSON.stringify([]));
};

// เรนเดอร์หน้า payroll โดยล็อก "วันนี้" ของเครื่องให้ตรงกับ bookingDate ของงวดที่ต้องการทดสอบพอดี
// ก่อนแล้วคืนเป็นเวลาจริงทันทีหลัง mount เสร็จ (Why — สำคัญ ต้องอ่าน): getDefaultHalfMonthRange()
// ที่หน้า payroll ใช้เป็นช่วงวันที่เริ่มต้นคำนวณจาก Date.now() ของเครื่องเสมอ ถ้าปล่อยให้ใช้วันที่จริง
// ของเครื่องที่รันเทส ผลจะไม่คงที่ (ขึ้นกับวันที่รันเทสจริง) และ useEffect หักเบิกอัตโนมัติจะยิงทำงาน
// กับงวด "วันนี้จริง" ที่ไม่เกี่ยวข้องกับงวดที่ตั้งใจทดสอบเสียก่อน จึงต้องปลอมวันที่ตอน mount ให้ตรงกับ
// งวดเป้าหมายพอดี วิธีนี้ทำให้ทดสอบการสลับงวด (remount ใหม่ = จำลอง reload) ได้แบบไม่ต้องคลิก UI
// ปฏิทินเลย (แม่นยำ/เสถียรกว่าการจำลองคลิกปฏิทินซึ่งมีปัญหา timing จริงที่ค้นพบ — ดูเทส Edge case 4)
const renderPayrollPageForPeriod = async (
  period: { bookingDate: string },
): Promise<ReturnType<typeof render>> => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(`${period.bookingDate}T10:00:00`));
  const rendered = render(
    <AppProvider>
      <PayrollPage />
    </AppProvider>,
  );
  vi.useRealTimers();
  await screen.findByText("หมอIntegration");
  return rendered;
};

// เวลาที่ต้องรอด้วยเวลาจริง (real timers) เพื่อให้แน่ใจว่า debounce ของ production code
// (DATE_RANGE_SETTLE_DELAY_MS = 600ms ใน src/app/payroll/page.tsx) ผ่านไปแล้วแน่นอนก่อนตรวจผล — ตั้งค่า
// สูงกว่าเวลา debounce จริงพอสมควร (Why): กันความไม่แน่นอนของ event loop/CI runner ที่อาจช้ากว่าปกติ
// เล็กน้อย ไม่ได้ import ค่าคงที่จาก production ตรงๆ เพราะไฟล์นั้นไม่ได้ export ค่านี้ออกมา (internal only)
const DEBOUNCE_WAIT_BUFFER_MS = 900;

// ลำดับคอลัมน์ของตาราง Full-Time บนหน้า payroll (ดู thead ใน src/app/payroll/page.tsx) — อ้างอิงตำแหน่ง
// คอลัมน์แทนการค้นข้อความตรงๆ เพราะบางคอลัมน์อาจมีค่าตัวเลขซ้ำกันโดยบังเอิญ (เช่น ค่ากะดึกกับยอดสุทธิ
// เผอิญเป็นเลขเดียวกัน) การ query ด้วยข้อความล้วนๆ จะกำกวมและเทสจะ false-fail ได้
const FULL_TIME_TABLE_COLUMN_INDEX = {
  lateShiftPay: 6,
  loanDeductionThisPeriod: 7,
  remainingAdvanceDeduction: 8,
  netSalary: 9,
} as const;

const getFullTimeTableCell = (row: HTMLElement, columnIndex: number): string => {
  const cells = row.querySelectorAll("td");
  return cells[columnIndex]?.textContent?.trim() ?? "";
};

// ป้ายชื่อเดือนภาษาไทยของ DatePicker (src/components/DatePicker.tsx) — คัดลอกมาเฉพาะสำหรับอ่าน label
// ระหว่างเทส (ไม่ใช่ logic ทางธุรกิจ) เพื่อรู้ว่าเดือน/ปีที่ปฏิทินแสดงอยู่ตรงกับเป้าหมายหรือยัง
const THAI_MONTH_NAMES = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน", "พฤษภาคม", "มิถุนายน",
  "กรกฎาคม", "สิงหาคม", "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

// นำทางปฏิทิน DatePicker แบบ custom (src/components/DatePicker.tsx) ด้วยปุ่มเลื่อนเดือนก่อนหน้า/ถัดไป
// จนถึงเดือน-ปีเป้าหมาย แล้วกดวันที่ต้องการ — ใช้เฉพาะเทส Edge case 4 ที่ต้องจำลองผู้ใช้คลิกปฏิทินจริง
// (ไม่ใช้ renderPayrollPageForPeriod เพราะเทสนี้ต้องการทดสอบพฤติกรรม "สลับวันที่ในหน้าเดิมโดยไม่ reload")
const selectDateInPicker = (triggerButton: HTMLElement, isoDate: string): void => {
  fireEvent.click(triggerButton);

  const popup = document.querySelector(".glass-modal");
  if (!popup) {
    throw new Error("DatePicker popup ไม่เปิดขึ้นมาตามที่คาดไว้");
  }
  const popupScope = within(popup as HTMLElement);

  const [yearStr, monthStr, dayStr] = isoDate.split("-");
  const targetYear = parseInt(yearStr, 10);
  const targetMonthIndex = parseInt(monthStr, 10) - 1;
  const targetDay = parseInt(dayStr, 10);
  const targetTimeline = targetYear * 12 + targetMonthIndex;

  const MAX_MONTH_JUMPS = 36; // กันลูปไม่จบถ้าโครงสร้าง label เปลี่ยนไปโดยไม่คาดคิด
  for (let guard = 0; guard < MAX_MONTH_JUMPS; guard += 1) {
    const label = popupScope.getByTitle("กดเพื่อเลือกเดือน/ปีโดยตรง");
    const labelText = label.textContent ?? "";
    const currentMonthIndex = THAI_MONTH_NAMES.findIndex((name) => labelText.includes(name));
    const buddhistYearMatch = labelText.match(/\d+/);
    const currentChristianYear = buddhistYearMatch
      ? parseInt(buddhistYearMatch[0], 10) - 543
      : targetYear;
    const currentTimeline = currentChristianYear * 12 + currentMonthIndex;

    if (currentTimeline === targetTimeline) {
      break;
    }

    const navigationLabel = targetTimeline > currentTimeline ? "เดือนถัดไป" : "เดือนก่อนหน้า";
    fireEvent.click(popupScope.getByLabelText(navigationLabel));
  }

  const dayButton = within(document.querySelector(".glass-modal") as HTMLElement).getByText(
    String(targetDay),
    { selector: "button" },
  );
  fireEvent.click(dayButton);
};

describe("Payroll page — advance deduction ledger flow (E2E-equivalent, ไม่แตะ Firestore จริง)", () => {
  beforeEach(() => {
    vi.stubGlobal("localStorage", mockLocalStorage);
    mockLocalStorage.clear();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("(B2 + C4) computes net salary correctly when late shift pay and advance deduction both apply in the same period", async () => {
    seedLocalStorage();
    await renderPayrollPageForPeriod(PERIOD_A);

    const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
    await waitFor(() => {
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("2,000 ฿");
    });

    // ค่ากะดึก 250 บาท ต้องปรากฏ และหักเบิกงวดนี้ต้องเป็น 1,000 (min(1000, 3000))
    expect(getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.lateShiftPay)).toBe("250 ฿");
    expect(
      getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.loanDeductionThisPeriod),
    ).toBe("-1,000 ฿");
    // netSalary = commission(1000) + topup(0) + courseCommission(0) + lateShiftPay(250) - loanDeduction(1000) = 250
    expect(getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.netSalary)).toBe("250 ฿");
  });

  it("(C1 + C2) deducts 3000/1000-per-period correctly across 3 periods (2000 -> 1000 -> 0) and does not double-deduct after a full page reload between periods", async () => {
    seedLocalStorage();

    // งวดที่ 1: mount หน้า payroll ครั้งแรก (เทียบเท่าเปิดหน้าครั้งแรก)
    const firstMount = await renderPayrollPageForPeriod(PERIOD_A);
    await waitFor(() => {
      const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("2,000 ฿");
    });

    // จำลอง "reload หน้า" ของงวดที่ 1 ซ้ำ — unmount แล้ว mount ใหม่ทั้งหมด (state ในเมมโมรีหายหมด
    // เหมือนโหลดหน้าเว็บใหม่จริง) แต่ localStorage ยังอยู่เหมือนเดิม (เทียบเท่าฐานข้อมูลจริงที่ไม่หาย)
    firstMount.unmount();
    const reloadOfPeriodA = await renderPayrollPageForPeriod(PERIOD_A);
    const rowAfterReload = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
    // ต้องยังหักแค่ 1,000 เท่าเดิม (ไม่ใช่ 2,000 ที่จะเกิดขึ้นถ้าหักซ้ำตอน reload)
    await waitFor(() => {
      expect(
        getFullTimeTableCell(rowAfterReload, FULL_TIME_TABLE_COLUMN_INDEX.loanDeductionThisPeriod),
      ).toBe("-1,000 ฿");
    });
    expect(
      getFullTimeTableCell(rowAfterReload, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
    ).toBe("2,000 ฿");
    reloadOfPeriodA.unmount();

    // งวดที่ 2
    const mountForPeriodB = await renderPayrollPageForPeriod(PERIOD_B);
    await waitFor(() => {
      const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("1,000 ฿");
    });
    mountForPeriodB.unmount();

    // งวดที่ 3 — คงเหลือต้องหมดพอดีเป็น 0 ห้ามติดลบ
    const mountForPeriodC = await renderPayrollPageForPeriod(PERIOD_C);
    await waitFor(() => {
      const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("0 ฿");
    });
    mountForPeriodC.unmount();
  });

  it("(C3) the printed payslip figures match the summary table figures exactly for the same period", async () => {
    seedLocalStorage();
    await renderPayrollPageForPeriod(PERIOD_A);

    const tableRow = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
    await waitFor(() => {
      expect(getFullTimeTableCell(tableRow, FULL_TIME_TABLE_COLUMN_INDEX.netSalary)).toBe(
        "250 ฿",
      );
    });

    const printButton = within(tableRow).getByTitle("พิมพ์สลิปเงินเดือน");
    fireEvent.click(printButton);

    const payslip = document.getElementById("printable-payslip") as HTMLElement;
    expect(payslip).not.toBeNull();
    const slipScope = within(payslip);

    // ยอดหักเบิกงวดนี้ในสลิปต้องตรงกับตาราง (1,000 บาท) และยอดสุทธิต้องตรงกัน (250 บาท)
    expect(slipScope.getByText("-1,000 บาท")).toBeInTheDocument();
    expect(slipScope.getByText("250 บาท")).toBeInTheDocument();
    expect(slipScope.getByText("2,000 บาท")).toBeInTheDocument(); // คงเหลือยอดหักเบิกงวดถัดไป
  });

  it("(Edge case 4 — สลับวันที่ไปมาในหน้าเดิมโดยไม่ reload, แก้บั๊กแล้ว) selecting only the start-date field (before the end-date field catches up) must never write a spurious mixed-range ledger entry, while completing the date range afterwards must still write the ledger normally", async () => {
    // เหตุผลที่คง comment อธิบายบั๊กเดิมไว้ (Why): เทสนี้เคยถูกเขียนขึ้นมาเพื่อ "พิสูจน์ว่าบั๊กมีอยู่จริง"
    // (`expect(spuriousEntry).toBeDefined()`) ตามที่บันทึกไว้ใน PROJECT_STATUS.md — สาเหตุเดิมคือหน้า
    // payroll มีปฏิทินเริ่มต้น/สิ้นสุด 2 ตัวแยกกัน เมื่อคลิกเปลี่ยนแค่ "วันที่เริ่มต้น" ตัวเดียว React จะ
    // commit ค่าใหม่ทันทีขณะ endDate ยังเป็นค่าเดิม ทำให้เกิดการเขียน ledger entry ของช่วงวันที่ผสมที่ไม่มี
    // ใครตั้งใจเลือกจริง — ตอนนี้ frontend-dev แก้แล้วด้วย state `settledDateRange` ที่ debounce
    // (DATE_RANGE_SETTLE_DELAY_MS = 600ms) รวมกับ defensive guard `periodStart > periodEnd` ใน
    // src/app/payroll/page.tsx เทสนี้จึงถูกปรับให้ยืนยันพฤติกรรมที่ถูกต้องแทน (spuriousEntry ต้องเป็น
    // undefined เสมอ) พร้อมยืนยันว่าการเลือกวันที่ครบสมบูรณ์ยังคงเขียน ledger ได้ตามปกติ (กันไม่ให้
    // over-fix จนหักเบิกไม่ได้เลย)
    seedLocalStorage();
    const { container } = await renderPayrollPageForPeriod(PERIOD_A);

    await waitFor(() => {
      const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("2,000 ฿");
    });

    const getStartDateTrigger = (): HTMLElement =>
      container.querySelectorAll(
        "button.w-full.flex.items-center.justify-between",
      )[0] as HTMLElement;
    const getEndDateTrigger = (): HTMLElement =>
      container.querySelectorAll(
        "button.w-full.flex.items-center.justify-between",
      )[1] as HTMLElement;

    // ผู้ใช้คลิกเปลี่ยนแค่ "วันที่เริ่มต้น" ไปเป็นงวด B ก่อน (ยังไม่ทันคลิกวันที่สิ้นสุดเลย) — ช่วงวันที่
    // ที่แสดงบนจอตอนนี้กลายเป็นค่าผสม (start ใหม่ของงวด B + end เดิมของงวด A ซึ่งมาก่อน start ใหม่)
    selectDateInPicker(getStartDateTrigger(), PERIOD_B.start);

    // รอเลยเวลา debounce ของ production ไปพอสมควรด้วยเวลาจริง (ไม่ใช้ fake timers ช่วงนี้ เพื่อให้ effect
    // ของ React ทำงานตามธรรมชาติเหมือนผู้ใช้จริงคลิกเมาส์แล้วหยุดรอ)
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WAIT_BUFFER_MS));

    const rawLedgerAfterPartialSelection =
      mockLocalStorage.getItem("demo_spa_advance_deduction_ledger") ?? "[]";
    const ledgerEntriesAfterPartialSelection = JSON.parse(
      rawLedgerAfterPartialSelection,
    ) as AdvanceDeductionLedgerEntry[];
    const spuriousEntry = ledgerEntriesAfterPartialSelection.find(
      (entry) => entry.periodStart === PERIOD_B.start && entry.periodEnd === PERIOD_A.end,
    );
    // ต้องไม่มี ledger entry ของช่วงวันที่ผสมนี้ถูกเขียนเลย — นี่คือการยืนยันว่าบั๊กถูกแก้แล้วจริง
    expect(spuriousEntry).toBeUndefined();

    // ผู้ใช้คลิกเลือก "วันที่สิ้นสุด" ต่อจนครบสมบูรณ์เป็นงวด B จริงๆ (ทั้ง start และ end เป็นของงวด B แล้ว)
    selectDateInPicker(getEndDateTrigger(), PERIOD_B.end);

    await waitFor(
      () => {
        const rawLedger =
          mockLocalStorage.getItem("demo_spa_advance_deduction_ledger") ?? "[]";
        const ledgerEntries = JSON.parse(rawLedger) as AdvanceDeductionLedgerEntry[];
        const completedRangeEntry = ledgerEntries.find(
          (entry) => entry.periodStart === PERIOD_B.start && entry.periodEnd === PERIOD_B.end,
        );
        // เมื่อเลือกวันที่ครบสมบูรณ์แล้ว (งวด B เต็มงวดจริง) ต้องยังคงเขียน ledger ได้ตามปกติ
        expect(completedRangeEntry).toBeDefined();
        expect(completedRangeEntry?.amountDeducted).toBeGreaterThan(0);
      },
      { timeout: DEBOUNCE_WAIT_BUFFER_MS + 1000 },
    );
  });

  it("(Bug #2 guard — เปิดงวดข้ามลำดับ) opening a period that skips a previous unrecorded period must not write to the ledger until the manager explicitly acknowledges the warning banner", async () => {
    seedLocalStorage();

    // เปิดงวดที่ 1 (PERIOD_A) ก่อน เพื่อสร้างประวัติ ledger จริงงวดแรกไว้เป็น baseline
    const firstMount = await renderPayrollPageForPeriod(PERIOD_A);
    await waitFor(() => {
      const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("2,000 ฿");
    });
    firstMount.unmount();

    // ข้ามงวดที่ 2 (PERIOD_B) ไปเปิดงวดที่ 3 (PERIOD_C) ตรงๆ เลย (จำลอง "เปิดงวดข้ามลำดับ")
    await renderPayrollPageForPeriod(PERIOD_C);

    // ต้องเห็นแบนเนอร์เตือนว่างวดข้ามลำดับ
    await waitFor(() => {
      expect(screen.getByText(/ข้ามลำดับ/)).toBeInTheDocument();
    });

    // ต้อง "ไม่" เขียน ledger entry ของงวด C ทันที แม้รอเวลาผ่านไปพอสมควรแล้วก็ตาม (ไม่มีทางหักเงียบๆ ได้)
    await new Promise((resolve) => setTimeout(resolve, DEBOUNCE_WAIT_BUFFER_MS));
    const rawLedgerBeforeAck =
      mockLocalStorage.getItem("demo_spa_advance_deduction_ledger") ?? "[]";
    const ledgerBeforeAck = JSON.parse(rawLedgerBeforeAck) as AdvanceDeductionLedgerEntry[];
    const periodCEntryBeforeAck = ledgerBeforeAck.find(
      (entry) => entry.periodStart === PERIOD_C.start && entry.periodEnd === PERIOD_C.end,
    );
    expect(periodCEntryBeforeAck).toBeUndefined();

    // ผู้จัดการกดยืนยันว่ารับทราบความเสี่ยงแล้วและต้องการหักเบิกงวดนี้ต่อ
    const acknowledgeButton = screen.getByRole("button", {
      name: "ยืนยันว่ารับทราบและหักเบิกงวดนี้ต่อ",
    });
    fireEvent.click(acknowledgeButton);

    // ตอนนี้ ledger entry ของงวด C ต้องถูกเขียนจริง และแบนเนอร์เตือนต้องหายไป
    await waitFor(() => {
      const rawLedgerAfterAck =
        mockLocalStorage.getItem("demo_spa_advance_deduction_ledger") ?? "[]";
      const ledgerAfterAck = JSON.parse(rawLedgerAfterAck) as AdvanceDeductionLedgerEntry[];
      const periodCEntryAfterAck = ledgerAfterAck.find(
        (entry) => entry.periodStart === PERIOD_C.start && entry.periodEnd === PERIOD_C.end,
      );
      expect(periodCEntryAfterAck).toBeDefined();
      expect(periodCEntryAfterAck?.amountDeducted).toBeGreaterThan(0);
    });
    expect(screen.queryByText(/ข้ามลำดับ/)).not.toBeInTheDocument();
  });

  it("(Bug #2 guard — เปิดงวดต่อเนื่องปกติ) opening consecutive periods in the correct order still deducts immediately without showing the skip-warning banner", async () => {
    seedLocalStorage();

    // งวดแรกไม่เคยมีประวัติมาก่อนเลย (latestRecordedPeriodEnd เป็น null) จึงไม่ถือว่าข้ามงวดตั้งแต่แรก
    const firstMount = await renderPayrollPageForPeriod(PERIOD_A);
    await waitFor(() => {
      const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("2,000 ฿");
    });
    expect(screen.queryByText(/ข้ามลำดับ/)).not.toBeInTheDocument();
    firstMount.unmount();

    // เปิดงวดที่ 2 ต่อทันที (ต่อเนื่องจากงวดที่ 1 พอดี ไม่ข้ามงวดใดเลย) ต้องหักได้ทันทีโดยไม่มีแบนเนอร์กวนใจ
    const secondMount = await renderPayrollPageForPeriod(PERIOD_B);
    await waitFor(() => {
      const row = screen.getByText("หมอIntegration").closest("tr") as HTMLElement;
      expect(
        getFullTimeTableCell(row, FULL_TIME_TABLE_COLUMN_INDEX.remainingAdvanceDeduction),
      ).toBe("1,000 ฿");
    });
    expect(screen.queryByText(/ข้ามลำดับ/)).not.toBeInTheDocument();
    secondMount.unmount();
  });
});
