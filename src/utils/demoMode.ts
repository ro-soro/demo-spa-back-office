// src/utils/demoMode.ts
// เหตุผลที่ต้องมีตัวกลางนี้ (Why): โหมด demo (สำหรับเปิดให้คนทั่วไปลองใช้บน Vercel) ต้องถูกเช็กจาก 3 จุด
// คือ firebase.ts (ปิดการเชื่อมต่อ Firebase), db.ts (เลือกชุดข้อมูลตัวอย่าง) และหน้า login (แสดงกล่องบัญชี demo)
// รวมการอ่าน env ไว้ที่เดียวเพื่อไม่ให้แต่ละไฟล์เทียบสตริง "true" กันเองแล้วสะกดผิดคนละแบบ

const DEMO_MODE_ENABLED_VALUE = 'true';

// Next.js แทนค่า process.env.NEXT_PUBLIC_* ตอน build จึงต้องอ้างชื่อตัวแปรตรงๆ แบบนี้ (ห้ามอ่านผ่าน key แบบไดนามิก)
export const IS_DEMO_MODE: boolean = process.env.NEXT_PUBLIC_DEMO_MODE === DEMO_MODE_ENABLED_VALUE;
