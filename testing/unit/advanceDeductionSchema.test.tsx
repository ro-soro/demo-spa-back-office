// testing/unit/advanceDeductionSchema.test.tsx
// ขอบเขตของไฟล์นี้ (Phase 1 — Payroll & Advance Deduction Ledger, ดู testing/TEST_PLAN.md):
// 1. Legacy fallback: ฟิลด์ `advanceDeduction` เก่า (ก่อน rename) ต้องถูกอ่านเข้า `advanceDeductionTotal` อัตโนมัติ (src/utils/db.ts)
// 2. จำลอง UNIQUE(therapist_id, period_start, period_end) ระดับ schema `advance_deduction_ledger`
//    โดยอิงกลไกจริงที่ระบบใช้ป้องกันหักซ้ำ: การเขียน ledger ใช้ deterministic id
//    `advled_${therapistId}_${startDate}_${endDate}` (ดู src/app/payroll/page.tsx) ทำให้ setDoc/localStorage
//    upsert ทับ entry เดิมเสมอแทนที่จะสร้างแถวซ้ำ — ทดสอบว่ากลไกนี้กันหักซ้ำได้จริงที่ระดับ db.ts
// 3. Edge case เพิ่มเติมนอกแผนเดิม (สั่งเพิ่มโดย Main Chat เพราะเป็นความเสี่ยงเรื่องเงินโดยตรง):
//    - ยอดคงเหลืองวดสุดท้ายน้อยกว่าค่าหักต่องวด (ห้ามหักเกิน/ติดลบ)
//    - ยอดคงเหลือเป็น 0 อยู่แล้ว เรียกซ้ำหลายครั้งต้องได้ 0 เสมอ ไม่ error
//    - เปิดงวดข้ามลำดับ (เปิดงวด 3 ก่อนงวด 2) — ทดสอบพฤติกรรมจริงเฉยๆ ห้ามตัดสินว่าเป็นบั๊ก

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  getTherapists,
  getAdvanceDeductionLedger,
  saveAdvanceDeductionLedgerEntry,
} from "@/utils/db";
import {
  calculatePeriodDeduction,
  getAdvanceDeductionForPeriod,
  AdvanceDeductionLedgerEntryLike,
} from "@/utils/advanceDeduction";
import { Therapist, AdvanceDeductionLedgerEntry } from "@/data/initialData";

// เหตุผลที่ต้องมี fixture นี้ (Why): db.ts ตกลงมาใช้ localStorage เป็น fallback เสมอเมื่อรันตอน
// unit test (firestore เป็น null เพราะไม่มี env จริงตอนรัน vitest) จึงต้อง mock localStorage
// แบบเดียวกับ testing/unit/auth.test.tsx เพื่อให้ db.ts ทำงานได้จริงในสภาพแวดล้อม jsdom
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

const THERAPIST_ID = "ther_legacy_1";
const PERIOD_START = "2026-07-01";
const PERIOD_END = "2026-07-15";

describe("Legacy fallback — advanceDeduction (เก่า) -> advanceDeductionTotal (ใหม่)", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
    mockLocalStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reads an old-schema therapist document (advanceDeduction only) into advanceDeductionTotal", async () => {
    // จำลองเอกสารเก่าที่เขียนไว้ก่อน rename ฟิลด์ — ยังไม่มี advanceDeductionTotal เลย
    const legacyRawTherapist = {
      id: THERAPIST_ID,
      name: "หมอเก่า",
      type: "full-time",
      dailyGuarantee: 400,
      bankName: "ธนาคารทดสอบ",
      bankAccount: "111-1-11111-1",
      bankAccountName: "หมอเก่า ทดสอบ",
      phone: "0811111111",
      advanceDeduction: 1500, // ฟิลด์เก่าก่อน rename
    };
    mockLocalStorage.setItem(
      "demo_spa_therapists",
      JSON.stringify([legacyRawTherapist]),
    );

    const therapists = await getTherapists();
    const found = therapists.find((t) => t.id === THERAPIST_ID);

    expect(found).toBeDefined();
    expect(found?.advanceDeductionTotal).toBe(1500);
  });

  it("prefers the new advanceDeductionTotal field when both old and new fields exist on the same document", async () => {
    // กรณีเอกสารถูก migrate บางส่วน (มีทั้งสองฟิลด์พร้อมกัน) ต้องยึดค่าฟิลด์ใหม่เป็นหลักเสมอ
    const partiallyMigratedTherapist = {
      id: THERAPIST_ID,
      name: "หมอเก่า",
      type: "full-time",
      dailyGuarantee: 400,
      bankName: "ธนาคารทดสอบ",
      bankAccount: "111-1-11111-1",
      bankAccountName: "หมอเก่า ทดสอบ",
      phone: "0811111111",
      advanceDeduction: 1500,
      advanceDeductionTotal: 900,
    };
    mockLocalStorage.setItem(
      "demo_spa_therapists",
      JSON.stringify([partiallyMigratedTherapist]),
    );

    const therapists = await getTherapists();
    const found = therapists.find((t) => t.id === THERAPIST_ID);

    expect(found?.advanceDeductionTotal).toBe(900);
  });

  it("defaults advanceDeductionTotal to 0 when neither old nor new field is present", async () => {
    const noDeductionTherapist: Therapist = {
      id: THERAPIST_ID,
      name: "หมอใหม่",
      type: "full-time",
      dailyGuarantee: 400,
      bankName: "ธนาคารทดสอบ",
      bankAccount: "222-2-22222-2",
      bankAccountName: "หมอใหม่ ทดสอบ",
      phone: "0822222222",
    };
    mockLocalStorage.setItem(
      "demo_spa_therapists",
      JSON.stringify([noDeductionTherapist]),
    );

    const therapists = await getTherapists();
    const found = therapists.find((t) => t.id === THERAPIST_ID);

    expect(found?.advanceDeductionTotal).toBe(0);
  });
});

describe("UNIQUE(therapist_id, period_start, period_end) — จำลองการเขียน ledger ซ้ำ period เดิม", () => {
  beforeEach(() => {
    vi.stubGlobal("window", { localStorage: mockLocalStorage });
    vi.stubGlobal("localStorage", mockLocalStorage);
    mockLocalStorage.clear();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  // ระบบจริงกันหักซ้ำด้วย deterministic id `advled_${therapistId}_${periodStart}_${periodEnd}`
  // (ดู commitPendingDeductions ใน src/app/payroll/page.tsx) เพื่อให้ setDoc/localStorage upsert
  // ทับ entry เดิมของ (therapistId, periodStart, periodEnd) เดียวกันเสมอ แทนที่จะสร้างแถวใหม่ซ้ำ
  const buildLedgerId = (
    therapistId: string,
    periodStart: string,
    periodEnd: string,
  ): string => `advled_${therapistId}_${periodStart}_${periodEnd}`;

  it("does not create a duplicate row when the same (therapist, period) is written twice with the deterministic id", async () => {
    const firstAttempt: AdvanceDeductionLedgerEntry = {
      id: buildLedgerId(THERAPIST_ID, PERIOD_START, PERIOD_END),
      therapistId: THERAPIST_ID,
      therapistName: "หมอทดสอบ",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      amountDeducted: 1000,
      remainingAfter: 2000,
      createdAt: "2026-07-01T00:00:00.000Z",
    };

    await saveAdvanceDeductionLedgerEntry(firstAttempt);

    // จำลองความพยายามหักซ้ำงวดเดิม (เช่น ผู้ใช้เปิดหน้า payroll ซ้ำในช่วงวันที่เดิม) —
    // ค่าที่คำนวณอาจต่างออกไปถ้าคำนวณสดใหม่ทับ แต่ id ต้องซ้ำเดิมเสมอเพราะมาจากคีย์เดียวกัน
    const duplicateAttempt: AdvanceDeductionLedgerEntry = {
      ...firstAttempt,
      amountDeducted: 1000,
      remainingAfter: 2000,
      createdAt: "2026-07-01T08:00:00.000Z",
    };
    await saveAdvanceDeductionLedgerEntry(duplicateAttempt);

    const ledger = await getAdvanceDeductionLedger();
    const entriesForThisPeriod = ledger.filter(
      (entry) =>
        entry.therapistId === THERAPIST_ID &&
        entry.periodStart === PERIOD_START &&
        entry.periodEnd === PERIOD_END,
    );

    // ต้องมี entry เดียวเท่านั้นสำหรับงวดนี้ ไม่ใช่ 2 แถว
    expect(entriesForThisPeriod).toHaveLength(1);
  });

  it("does not double-deduct when getAdvanceDeductionForPeriod is asked about a period that already has a ledger entry", async () => {
    const existingEntry: AdvanceDeductionLedgerEntry = {
      id: buildLedgerId(THERAPIST_ID, PERIOD_START, PERIOD_END),
      therapistId: THERAPIST_ID,
      therapistName: "หมอทดสอบ",
      periodStart: PERIOD_START,
      periodEnd: PERIOD_END,
      amountDeducted: 1000,
      remainingAfter: 2000,
      createdAt: "2026-07-01T00:00:00.000Z",
    };
    await saveAdvanceDeductionLedgerEntry(existingEntry);
    const ledger = await getAdvanceDeductionLedger();

    const result = getAdvanceDeductionForPeriod(
      3000,
      1000,
      ledger,
      THERAPIST_ID,
      PERIOD_START,
      PERIOD_END,
    );

    expect(result).toEqual({
      amountDeducted: 1000,
      remainingAfter: 2000,
      alreadyRecorded: true,
    });
  });

  it("KNOWN RISK if the app-level dedup by id were ever bypassed: duplicate ledger rows for the same period would be double-counted by getAdvanceDeductionForPeriod's sum reduce", () => {
    // เคสนี้ไม่ใช่การทดสอบ flow ปกติของระบบ (ระบบจริงกันซ้ำผ่าน deterministic id เสมอ) แต่จำลอง
    // สถานการณ์ที่ schema-level UNIQUE constraint ไม่ทำงาน (เช่น เขียนตรงเข้า Firestore ข้าม id เดิม
    // ด้วยการสุ่ม id ใหม่) เพื่อยืนยันว่า pure function getAdvanceDeductionForPeriod เองไม่มีการ
    // ป้องกันข้อมูลซ้ำในระดับ array — มันเชื่อ ledger ที่ได้รับมาเสมอ ดังนั้นการป้องกันจริงทั้งหมด
    // อยู่ที่ "การเขียน id ซ้ำ" เท่านั้น ไม่ใช่ที่ตัวสูตรคำนวณ (รายงานเป็นความเสี่ยงสถาปัตยกรรม ไม่ใช่บั๊ก)
    const duplicatedLedgerForSamePeriod: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: THERAPIST_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        amountDeducted: 1000,
      },
      {
        // แถวซ้ำที่ "ไม่ควรมีอยู่จริง" ถ้า UNIQUE constraint ทำงานถูกต้อง (id ต่างกันสมมุติว่าหลุดผ่านมาได้)
        therapistId: THERAPIST_ID,
        periodStart: PERIOD_START,
        periodEnd: PERIOD_END,
        amountDeducted: 1000,
      },
    ];

    const nextPeriodResult = getAdvanceDeductionForPeriod(
      3000,
      1000,
      duplicatedLedgerForSamePeriod,
      THERAPIST_ID,
      "2026-07-16",
      "2026-07-31",
    );

    // ผลจริง: totalDeductedAllPeriods รวมทั้ง 2 แถว = 2000 (แทนที่จะเป็น 1000 ที่ถูกต้อง)
    // ทำให้ remainingBeforeThisPeriod เหลือ 1000 แทนที่จะเป็น 2000 จริง — พิสูจน์ว่าฟังก์ชันนี้
    // "ไว้ใจ" ข้อมูล ledger ที่ถูกส่งเข้ามาเสมอ ไม่มี guard กันซ้ำในตัวมันเอง
    expect(nextPeriodResult.amountDeducted).toBe(1000);
    expect(nextPeriodResult.remainingAfter).toBe(0); // ที่ถูกต้องควรเป็น 1000 ถ้าไม่มีแถวซ้ำ
  });
});

describe("Edge case เพิ่มเติม 1 — ยอดคงเหลืองวดสุดท้ายน้อยกว่าค่าหักต่องวด", () => {
  it("deducts only the exact remaining amount on the final period instead of overshooting (2500 total / 1000 per period across 3 periods)", () => {
    const ledgerAfterPeriod1: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-01",
        periodEnd: "2026-06-15",
        amountDeducted: 1000,
      },
    ];
    const period2 = getAdvanceDeductionForPeriod(
      2500,
      1000,
      ledgerAfterPeriod1,
      THERAPIST_ID,
      "2026-06-16",
      "2026-06-30",
    );
    expect(period2).toEqual({
      amountDeducted: 1000,
      remainingAfter: 500,
      alreadyRecorded: false,
    });

    const ledgerAfterPeriod2: AdvanceDeductionLedgerEntryLike[] = [
      ...ledgerAfterPeriod1,
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-16",
        periodEnd: "2026-06-30",
        amountDeducted: period2.amountDeducted,
      },
    ];
    const period3 = getAdvanceDeductionForPeriod(
      2500,
      1000,
      ledgerAfterPeriod2,
      THERAPIST_ID,
      "2026-07-01",
      "2026-07-15",
    );

    // งวดสุดท้ายเหลือแค่ 500 ต้องหักแค่ 500 ห้ามหักเต็ม 1000 (จะติดลบ) และห้ามหักเกินยอดจริง
    expect(period3).toEqual({
      amountDeducted: 500,
      remainingAfter: 0,
      alreadyRecorded: false,
    });
  });
});

describe("Edge case เพิ่มเติม 2 — ยอดคงเหลือเป็น 0 อยู่แล้ว เรียกซ้ำหลายครั้ง", () => {
  it("always returns 0 with no error when calculatePeriodDeduction is called repeatedly at zero remaining balance", () => {
    for (let callCount = 0; callCount < 5; callCount += 1) {
      expect(calculatePeriodDeduction(0, 1000)).toEqual({
        amountToDeduct: 0,
        remainingAfter: 0,
      });
    }
  });

  it("always returns amountDeducted 0 with no error when getAdvanceDeductionForPeriod is asked about a fresh period after the debt is already fully paid off", () => {
    const fullyPaidLedger: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-01",
        periodEnd: "2026-06-15",
        amountDeducted: 3000,
      },
    ];

    // เรียกซ้ำ 3 ครั้งด้วยงวดใหม่ที่ไม่ซ้ำกันเลย เพื่อยืนยันว่าไม่ error และไม่หักเพิ่มไม่ว่าจะเรียกกี่ครั้ง
    const periods = [
      { start: "2026-06-16", end: "2026-06-30" },
      { start: "2026-07-01", end: "2026-07-15" },
      { start: "2026-07-16", end: "2026-07-31" },
    ];

    periods.forEach(({ start, end }) => {
      const result = getAdvanceDeductionForPeriod(
        3000,
        1000,
        fullyPaidLedger,
        THERAPIST_ID,
        start,
        end,
      );
      expect(result).toEqual({
        amountDeducted: 0,
        remainingAfter: 0,
        alreadyRecorded: false,
      });
    });
  });
});

describe("Edge case เพิ่มเติม 3 — เปิดงวดข้ามลำดับ (เปิดงวด 3 ก่อนงวด 2)", () => {
  // คำเตือนสำคัญ: เทสนี้มีไว้เพื่อ "บันทึกพฤติกรรมจริง" ของระบบตอนนี้เท่านั้น ห้ามตัดสินเองว่าเป็นบั๊ก
  // หรือไม่ใช่บั๊ก และห้ามแก้โค้ด production — ผลลัพธ์ที่ได้ต้องถูกรายงานกลับไปที่ Main Chat เพื่อตัดสินใจ
  it("records the actual behavior when period 3 is opened before period 2 has any ledger entry", () => {
    // สถานการณ์: หมอนวดมียอดหักเบิกรวม 3000 / งวดละ 1000 มีแค่ ledger ของ "งวด 1" (2026-06-01 ถึง 2026-06-15)
    // ผู้จัดการข้ามไปเปิดหน้า payroll ของ "งวด 3" (2026-07-16 ถึง 2026-07-31) ก่อน โดยไม่เคยเปิด "งวด 2"
    // (2026-06-16 ถึง 2026-06-30) เลยสักครั้ง — ยังไม่มี ledger entry ของงวด 2 อยู่จริง
    const ledgerWithSkippedPeriod: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-01",
        periodEnd: "2026-06-15",
        amountDeducted: 1000,
      },
      // หมายเหตุ: ไม่มี entry ของงวด 2026-06-16..2026-06-30 อยู่เลยโดยตั้งใจ
    ];

    const period3Result = getAdvanceDeductionForPeriod(
      3000,
      1000,
      ledgerWithSkippedPeriod,
      THERAPIST_ID,
      "2026-07-16",
      "2026-07-31",
    );

    // พฤติกรรมจริงที่พบ (รายงานไปที่ Main Chat โดยไม่ตัดสินว่าเป็นบั๊ก):
    // totalDeductedAllPeriods คำนวณจาก "ผลรวมของทุก entry ที่มีอยู่จริงในอาร์เรย์เท่านั้น" (ใช้ reduce
    // แบบไม่สนใจว่างวดไหน "ควรจะ" มาก่อน) เนื่องจากงวด 2 ไม่มี entry เลย ผลรวมที่คำนวณได้คือ 1000
    // (มาจากงวด 1 เท่านั้น) ทำให้ remainingBeforeThisPeriod = 3000 - 1000 = 2000 และระบบเสนอให้หัก
    // เต็ม 1000 ของ "งวด 3" ทันที โดยไม่มี validation ใดๆ กันไว้ว่าต้องหักงวด 2 ให้ครบก่อน
    // ผลคือ: ถ้าผู้จัดการกดยืนยันหน้า payroll ของงวด 3 นี้จริง ระบบจะ "เขียน ledger ของงวด 3" ทันที
    // (ผ่าน useEffect commitPendingDeductions ในหน้า payroll) ทั้งที่งวด 2 ยังไม่เคยถูกหักเลย — เท่ากับ
    // "ข้ามงวด 2 ไปเงียบๆ" ยอดหักเบิกของงวด 2 จะไม่ถูกหักอัตโนมัติอีกต่อไป (เพราะระบบจะไม่คำนวณงวด 2
    // ซ้ำอีกครั้ง ยกเว้นผู้จัดการย้อนกลับไปเปิดช่วงวันที่ของงวด 2 เองภายหลัง) — ไม่มี guard ป้องกันการ
    // เปิดงวดข้ามลำดับในโค้ดปัจจุบันเลย ณ เวลาที่ทดสอบ (2026-07-08)
    // (ยอดคงเหลือหลังงวด 3 นี้คือ 3000 - 1000(งวด1) - 1000(งวด3 ที่เพิ่งหักไป) = 1000 — งวด 2
    // ที่ถูกข้ามไปยังคง "ค้างอยู่" โดยไม่มีใครบันทึกว่าเคยหักหรือยัง)
    expect(period3Result).toEqual({
      amountDeducted: 1000,
      remainingAfter: 1000,
      alreadyRecorded: false,
    });
  });
});
