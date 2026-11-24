// src/utils/advanceDeduction.ts
// เหตุผลที่ต้องมีตัวกลางนี้ (Why): สูตรคำนวณ "หักเบิกต่องวด" ต้องให้ผลตรงกันทั้งตอนแสดงผลในตาราง
// เงินเดือน/สลิป และตอนเขียนบันทึกลง Ledger จริง แยกไว้ที่เดียวเป็น pure function เพื่อให้ทดสอบ
// หน่วย (unit test) ครอบคลุมได้ตรงจุด และกันพฤติกรรมเพี้ยนถ้าไปคำนวณซ้ำคนละที่คนละสูตร

export interface AdvanceDeductionLedgerEntryLike {
  therapistId: string;
  periodStart: string;
  periodEnd: string;
  amountDeducted: number;
}

export interface PeriodDeductionResult {
  amountToDeduct: number;
  remainingAfter: number;
}

// คำนวณยอดหักเบิกของงวดหนึ่ง: หักตาม "หักเบิกต่องวด" ที่ตั้งไว้ แต่ไม่เกินยอดคงเหลือจริง
// เมื่อยอดคงเหลือหมดแล้ว (<= 0) จะไม่หักเพิ่มอีก (งวดสุดท้ายอาจหักน้อยกว่าปกติถ้าคงเหลือไม่พอ)
export const calculatePeriodDeduction = (
  remainingBeforePeriod: number,
  perPeriodAmount: number,
): PeriodDeductionResult => {
  const safeRemaining = Math.max(remainingBeforePeriod, 0);
  const safePerPeriod = Math.max(perPeriodAmount, 0);
  const amountToDeduct = Math.min(safePerPeriod, safeRemaining);
  const remainingAfter = safeRemaining - amountToDeduct;
  return { amountToDeduct, remainingAfter };
};

export interface PeriodDeductionInfo {
  amountDeducted: number; // ยอดหักของงวดนี้ (ถ้าเคยบันทึกแล้วคือยอดที่บันทึกจริง ถ้ายังไม่บันทึกคือยอดที่ "ควรจะ" หัก)
  remainingAfter: number; // ยอดคงเหลือหลังหักงวดนี้
  alreadyRecorded: boolean; // งวดนี้มี ledger entry บันทึกไว้แล้วหรือยัง
}

// รวมสูตรคำนวณยอดหักเบิกของงวดหนึ่งให้หมอนวดคนหนึ่ง โดยอ้างอิงประวัติ Ledger ที่มีอยู่จริง
// ถ้างวดนี้เคยหักไปแล้ว (มี entry ตรงช่วงวันที่) จะคืนค่ายอดที่บันทึกไว้จริงเสมอ ไม่คำนวณซ้ำ
// (กันหักซ้ำเมื่อเปิดหน้า payroll ซ้ำในช่วงวันที่เดิม)
export const getAdvanceDeductionForPeriod = (
  totalDebt: number,
  perPeriodAmount: number,
  ledger: AdvanceDeductionLedgerEntryLike[],
  therapistId: string,
  periodStart: string,
  periodEnd: string,
): PeriodDeductionInfo => {
  const therapistLedger = ledger.filter((entry) => entry.therapistId === therapistId);
  const existingEntry = therapistLedger.find(
    (entry) => entry.periodStart === periodStart && entry.periodEnd === periodEnd,
  );
  const totalDeductedAllPeriods = therapistLedger.reduce(
    (sum, entry) => sum + entry.amountDeducted,
    0,
  );

  if (existingEntry) {
    return {
      amountDeducted: existingEntry.amountDeducted,
      remainingAfter: Math.max(totalDebt - totalDeductedAllPeriods, 0),
      alreadyRecorded: true,
    };
  }

  const remainingBeforeThisPeriod = totalDebt - totalDeductedAllPeriods;
  const { amountToDeduct, remainingAfter } = calculatePeriodDeduction(
    remainingBeforeThisPeriod,
    perPeriodAmount,
  );
  return { amountDeducted: amountToDeduct, remainingAfter, alreadyRecorded: false };
};
