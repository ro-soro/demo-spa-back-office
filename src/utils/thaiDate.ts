// src/utils/thaiDate.ts
// เหตุผลที่ต้องมีตัวกลางนี้ (Why): ทั้ง DatePicker และกราฟ Dashboard ต้องแปลงปี ค.ศ. เป็น พ.ศ.
// เพื่อแสดงผลให้พนักงานไทยอ่านคุ้นเคย แยกฟังก์ชันไว้ที่เดียวกันการพิมพ์เลข 543 กระจายซ้ำหลายไฟล์ (Magic Number)

const BUDDHIST_ERA_OFFSET = 543;

// ข้อมูลจริงในระบบ (localStorage, ฟอร์ม, การคำนวณ) ยังคงเก็บเป็นปี ค.ศ. (YYYY-MM-DD) เหมือนเดิมทุกที่
// ฟังก์ชันนี้ใช้แปลงเฉพาะตอน "แสดงผล" ให้ผู้ใช้เห็นเป็น พ.ศ. เท่านั้น
export const convertToBuddhistYear = (christianYear: number): number =>
  christianYear + BUDDHIST_ERA_OFFSET;

// แปลงวันที่ที่เก็บแบบ YYYY-MM-DD (ค.ศ.) ให้แสดงผลเป็น วันที่/เดือน/ปี พ.ศ. — ใช้กับทุกคอลัมน์วันที่ในตารางทั้งระบบ
// เพื่อให้ Format ตรงกับ DatePicker ที่แสดง พ.ศ. อยู่แล้ว คืนค่าเดิมกลับไปหากรูปแบบวันที่ผิดปกติ (Defensive)
export const formatDateForDisplay = (isoDateString: string): string => {
  const parts = isoDateString.split('-');
  if (parts.length !== 3) return isoDateString;

  const [yearStr, monthStr, dayStr] = parts;
  const year = parseInt(yearStr, 10);
  if (isNaN(year)) return isoDateString;

  return `${dayStr}/${monthStr}/${convertToBuddhistYear(year)}`;
};
