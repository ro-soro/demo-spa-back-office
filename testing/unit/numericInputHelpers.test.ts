// testing/unit/numericInputHelpers.test.ts
// ขอบเขต: Phase 3 (ข) — Regression: ช่องโหว่ NaN 8 ฟิลด์ทั่วระบบ (ดู testing/TEST_PLAN.md)
//
// เหตุผลที่เทสระดับ pure function โดยตรง (Why, ไม่ mount ทุกฟอร์มทั้ง 3 หน้า):
// requiredNumberInput/optionalNumberInputToZero (src/utils/numericInput.ts) เป็น pure function เดี่ยวๆ
// ที่ทุกฟิลด์ทั้ง 8 ฟิลด์เรียกใช้ตัวเดียวกันจริง (ยืนยันด้วยการอ่านซอร์สโค้ดจริงของทุกฟอร์ม — ดูตำแหน่ง
// อ้างอิงในตาราง REQUIRED_NUMBER_FIELDS ด้านล่าง) การเทส pure function ตรงๆ ครอบคลุมความเสี่ยงเดียวกัน
// กับการ mount ฟอร์มทุกหน้า แต่เร็วกว่ามากและไม่เสี่ยง flaky จาก DOM/async ของแต่ละหน้า — สอดคล้องกับกฎ
// "Cost-Effective Abstraction" ใน testing/AGENTS.md ส่วนพฤติกรรม "การ wiring" ของแต่ละฟิลด์เข้ากับฟอร์มจริง
// (เช่น เคลียร์ช่องแล้ว error message ขึ้นจริงบนหน้าจอ) ถูกคุ้มครองแยกต่างหากด้วยเทสระดับ component ใน
// testing/unit/settingsPageNaNFields.test.tsx และ testing/unit/coursePagesNaNFields.test.tsx
import { describe, expect, it } from "vitest";
import { requiredNumberInput, optionalNumberInputToZero } from "@/utils/numericInput";

// รายชื่อฟิลด์ NaN-prone "บังคับกรอก" ทั้ง 8 ฟิลด์ที่ Phase 3 ต้องคุ้มครอง (อ้างอิง PROJECT_STATUS.md
// หมวด Frontend บรรทัด "ตรวจสอบทั้งระบบหาช่องโหว่ NaN เดียวกัน" และ testing/TEST_PLAN.md Phase 3)
// พร้อมตำแหน่งไฟล์จริงที่เรียกใช้ requiredNumberInput — ทุกฟิลด์เหล่านี้ "บังคับกรอก" (มี * ในป้ายกำกับ)
const REQUIRED_NUMBER_FIELDS = [
  { field: "dailyGuarantee", formFile: "src/app/settings/page.tsx (ฟอร์มพนักงาน)" },
  { field: "duration (service)", formFile: "src/app/settings/page.tsx (ฟอร์มบริการ)" },
  { field: "price (service)", formFile: "src/app/settings/page.tsx (ฟอร์มบริการ)" },
  { field: "commission (service)", formFile: "src/app/settings/page.tsx (ฟอร์มบริการ)" },
  { field: "defaultPrice", formFile: "src/app/settings/courses/page.tsx (ฟอร์มเทมเพลตคอร์ส)" },
  { field: "round", formFile: "src/app/bookings/page.tsx (ฟอร์มบันทึกงานนวด)" },
  { field: "price (course sale)", formFile: "src/app/courses/page.tsx (ฟอร์มยอดขายคอร์ส)" },
  { field: "commissionPercent", formFile: "src/app/courses/page.tsx (ฟอร์มยอดขายคอร์ส)" },
] as const;

describe("requiredNumberInput — ฟิลด์ตัวเลขบังคับกรอกทั้ง 8 ฟิลด์ (Phase 3 regression, ห้ามพึ่งพฤติกรรมบังเอิญของ Zod)", () => {
  it.each(REQUIRED_NUMBER_FIELDS)(
    "ฟิลด์ $field ($formFile): ค่าว่าง/null/undefined ต้องคืน NaN เสมอ (ไม่ใช่ 0 หรือหลุดผ่าน validation แบบเงียบ)",
    ({ field }) => {
      expect(requiredNumberInput(""), `${field}: ค่าว่างต้องเป็น NaN`).toBeNaN();
      expect(requiredNumberInput(null), `${field}: null ต้องเป็น NaN`).toBeNaN();
      expect(requiredNumberInput(undefined), `${field}: undefined ต้องเป็น NaN`).toBeNaN();
    },
  );

  it("ค่าตัวเลขจริงต้องแปลงถูกต้อง ไม่กลายเป็น NaN", () => {
    expect(requiredNumberInput("100")).toBe(100);
    expect(requiredNumberInput("0")).toBe(0);
    expect(requiredNumberInput("12.5")).toBe(12.5);
  });

  it("เลขนำหน้าด้วย 0 (เช่นพิมพ์ '007') ต้องแปลงเป็นตัวเลขถูกต้อง ไม่ error", () => {
    expect(requiredNumberInput("007")).toBe(7);
  });

  it("NaN ที่ได้ต้องยังคง type เป็น 'number' (สำคัญ: z.number({ message }) ของ Zod ต้องดักด้วยกฎ required ที่ตั้งใจไว้ ไม่ใช่ throw type error อื่นที่ไม่มี message ให้ผู้ใช้เห็น)", () => {
    const result = requiredNumberInput("");
    expect(typeof result).toBe("number");
    expect(Number.isNaN(result)).toBe(true);
  });
});

describe("optionalNumberInputToZero — 4 ช่องทางชำระเงินของฟอร์มบันทึกงานนวด (สด/โอน/บัตร/ทิป, บั๊กเดิมที่เคยเจอจริง)", () => {
  const OPTIONAL_PAYMENT_FIELDS = ["cash", "transfer", "card", "tip"] as const;

  it.each(OPTIONAL_PAYMENT_FIELDS)(
    "ช่องทาง %s: ค่าว่าง/null/undefined ต้องคืน 0 (ไม่ใช่ NaN) เพราะแปลว่า 'ไม่ได้กรอก = 0' — บั๊กเดิมเกิดตอนล้างช่องบัตรเครดิตแล้วกรอกเงินสด/โอนแทน",
    (field) => {
      expect(optionalNumberInputToZero(""), `${field}: ค่าว่างต้องเป็น 0`).toBe(0);
      expect(optionalNumberInputToZero(null), `${field}: null ต้องเป็น 0`).toBe(0);
      expect(optionalNumberInputToZero(undefined), `${field}: undefined ต้องเป็น 0`).toBe(0);
    },
  );

  it("กรอกค่า 0 ตรงๆ ต้องยังคงเป็น 0 (ไม่ใช่ตีความว่าว่างเปล่าแล้วพังเป็นค่าอื่น)", () => {
    expect(optionalNumberInputToZero("0")).toBe(0);
  });

  it("ค่าตัวเลขจริงต้องแปลงถูกต้อง", () => {
    expect(optionalNumberInputToZero("250")).toBe(250);
    expect(optionalNumberInputToZero("99.99")).toBe(99.99);
  });
});
