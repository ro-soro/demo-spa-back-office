// src/data/initialData.ts
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. เคลียร์ข้อมูลจำลอง (Mock Data) เก่าทั้งหมดเพื่อเตรียมความพร้อมรับข้อมูลร้านสปาจริง
// 2. เก็บไว้เพียงรายการบัญชีผู้ใช้จำลองเริ่มต้น (initialSystemUsers) 3 บัญชีหลักพร้อมชื่อ-นามสกุลจริง 
//    เพื่อให้สิทธิ์แอดมินและผู้จัดการในการล็อกอินสร้างข้อมูลพนักงาน บริการ และเริ่มลงบันทึกใหม่จากศูนย์ได้

export interface Service {
  id: string;
  category: string;
  name: string;
  duration: number;
  price: number;
  commission: number;
}

export interface Payment {
  cash: number;
  transfer: number;
  card: number;
  tip: number;
}

export interface BookingService {
  serviceId: string;
  serviceName: string;
  price: number;
  commission: number;
  quantity: number;
}

export interface Booking {
  id: string;
  date: string; // YYYY-MM-DD
  round: number;
  therapistName: string;
  timeSlot: string;
  services: BookingService[];
  payment: Payment;
  customerName: string;
  remark: string;
  updateDate: string; // ISO String
  updateBy: string;
}

export interface CourseSale {
  id: string;
  date: string; // YYYY-MM-DD
  therapistName: string;
  courseCategory: string; // หมวดหมู่คอร์ส
  courseType: string; // ประเภทคอร์ส
  price: number;
  commissionPercent: number;
  commissionAmount: number;
  updateDate: string; // ISO String
  updateBy: string;
}

export interface Therapist {
  id: string;
  name: string;
  type: 'full-time' | 'part-time';
  dailyGuarantee: number;
  bankName: string;
  bankAccount: string;
  bankAccountName: string;
  phone: string;
  worksLateShift?: boolean; // สิทธิ์ทำงานกะดึก (ได้รับค่ากะดึกอัตโนมัติทุกงวด)
  advanceDeductionTotal?: number; // ยอดรวมหักเบิก — ยอดสะสมทั้งหมดที่เบิกล่วงหน้า/กู้ยืม ไม่ถูกหักทันที เป็นแค่ยอดตั้งต้นให้คำนวณหักทีละงวด (เดิมชื่อ advanceDeduction)
  advanceDeductionPerPeriod?: number; // หักเบิกต่องวด — จำนวนที่ระบบหักอัตโนมัติทุกงวดบัญชี จนกว่า advanceDeductionTotal จะหมด
}

// ประวัติการหักเบิกต่องวดของพนักงานแต่ละคน (Ledger) — บันทึกทุกครั้งที่ระบบหักเบิกอัตโนมัติสำเร็จ 1 งวด
// เหตุผลที่ต้องเก็บเป็นประวัติแยก (Why): หน้า Payroll คำนวณสดจากช่วงวันที่ที่เลือกทุกครั้ง ไม่มีการ "ปิดงวด"
// ถ้าไม่มี ledger จะไม่มีทางรู้ว่างวดไหนหักไปแล้วหรือยัง เปิดหน้าซ้ำจะหักซ้ำ
export interface AdvanceDeductionLedgerEntry {
  id: string;
  therapistId: string;
  therapistName: string;
  periodStart: string; // YYYY-MM-DD
  periodEnd: string; // YYYY-MM-DD
  amountDeducted: number;
  remainingAfter: number;
  createdAt: string; // ISO String
}

export interface SystemUser {
  username: string;
  password?: string; // รหัสผ่านเข้าระบบ (คีย์ Plain Text ในฝั่ง Local Mock)
  role: 'admin' | 'manager' | 'super-manager';
  displayName: string; // ชื่อย่อหรือชื่อเรียกในระบบ (เช่น Admin User, Manager User, Super Manager)
  fullName: string; // ชื่อ-นามสกุลจริงของผู้ใช้งาน
  email?: string; // อีเมลสำหรับผูกระบบ Firebase Auth (ถ้ามี)
}

// หมวดหมู่บริการนวดและสปา (Master Data สำหรับจัดกลุ่ม Service)
export interface ServiceCategory {
  id: string;
  name: string;        // เช่น "นวดแผนไทย", "สปาหน้า", "สปาตัว"
  description: string; // คำอธิบายสั้น
  colorClass: string;  // Tailwind class สำหรับป้าย badge เช่น "teal", "gold", "purple"
}

// Master Data คอร์สสปา (สำหรับ Manager เลือกและ Auto-fill ราคาตอนบันทึกขายคอร์ส)
export interface CourseTemplate {
  id: string;
  category: string;     // หมวดหมู่ เช่น "คอร์สสปาตัว", "คอร์สหน้า"
  name: string;         // ชื่อคอร์ส เช่น "สปาตัวน้ำผึ้ง 10 ครั้ง"
  defaultPrice: number; // ราคาเริ่มต้นที่ Auto-fill เมื่อเลือก
  description: string;  // รายละเอียดเพิ่มเติม
}

// Seed: หมวดหมู่บริการเริ่มต้น (ล้างเป็นอาร์เรย์ว่างเพื่อความพร้อมบันทึกใหม่ หรือมีหมวดหมู่พื้นฐานให้เลย)
// ให้หมวดหมู่พื้นฐานไว้เล็กน้อยเพื่อให้สะดวกต่อการใช้งานครั้งแรก
export const initialServiceCategories: ServiceCategory[] = [
  { id: 'cat_1', name: 'นวดแผนไทย',  description: 'นวดแบบไทยโบราณ กดจุด ยืดเส้น',     colorClass: 'teal'   },
  { id: 'cat_2', name: 'สปาหน้า',    description: 'ดูแลผิวหน้า มาร์ก บำรุงผิว',        colorClass: 'rose'   },
  { id: 'cat_3', name: 'สปาตัว',     description: 'สครับตัว มาร์กตัว บำรุงผิวกาย',     colorClass: 'violet' },
  { id: 'cat_4', name: 'ออยล์มาสซาจ', description: 'นวดด้วยน้ำมันหอมระเหย อโรมาธีรา', colorClass: 'amber'  },
  { id: 'cat_5', name: 'คอร์สสปา',   description: 'คอร์สสปาชุดหลายครั้ง ราคาพิเศษ',   colorClass: 'gold'   },
];

// Seed: Master Data คอร์สสปาเริ่มต้น (ล้างว่างเปล่า)
export const initialCourseTemplates: CourseTemplate[] = [];

// Seed: รายชื่อหมอนวดเริ่มต้น (ล้างว่างเปล่า)
export const initialTherapists: Therapist[] = [];

// Seed: ผู้ใช้งานระบบเริ่มต้น (ยังคงเหลือไว้เพื่อให้ล็อกอินเข้าใช้งานครั้งแรกได้)
export const initialSystemUsers: SystemUser[] = [
  {
    username: "admin_user",
    password: "123456",
    role: "admin",
    displayName: "Admin User",
    fullName: "สมชาย ใจดี",
    email: "admin_user@example.com"
  },
  {
    username: "manager_user",
    password: "123456",
    role: "manager",
    displayName: "Manager User",
    fullName: "สมหญิง มีสุข",
    email: "manager_user@example.com"
  },
  {
    username: "super_manager_user",
    password: "123456",
    role: "super-manager",
    displayName: "Super Manager",
    fullName: "วิชัย เก่งงาน",
    email: "super_manager@example.com"
  }
];

// Seed: ประวัติการขายคอร์สจำลอง (ล้างว่างเปล่า)
export const initialCourseSales: CourseSale[] = [];

// Seed: บริการจำลอง (ล้างว่างเปล่า)
export const initialServices: Service[] = [];

// Seed: ประวัติการจองจำลอง (ล้างว่างเปล่า)
export const initialBookings: Booking[] = [];

// Seed: ประวัติการหักเบิกต่องวด (เริ่มต้นว่างเปล่าเสมอ)
export const initialAdvanceDeductionLedger: AdvanceDeductionLedgerEntry[] = [];
