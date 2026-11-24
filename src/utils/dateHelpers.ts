// src/utils/dateHelpers.ts
// เหตุผลที่ต้องมีตัวกลางนี้ (Why): ฟังก์ชันแปลง "วันนี้" เป็นสตริง YYYY-MM-DD / YYYY-MM
// ถูกคัดลอกวางซ้ำอยู่หลายหน้า (บันทึกงานนวด, บันทึกขายคอร์ส) รวมไว้ที่เดียวกันความเสี่ยงที่แก้ไข
// padStart หรือลำดับปี-เดือน-วันผิดในจุดใดจุดหนึ่งแล้วหน้าอื่นไม่ถูกแก้ตาม

export const getTodayDateString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const getCurrentYearMonthString = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  return `${year}-${month}`;
};
