// src/data/demoData.ts
// ชุดข้อมูลตัวอย่าง (สมมติทั้งหมด) สำหรับโหมด demo — ใช้เมื่อเปิด NEXT_PUBLIC_DEMO_MODE=true เท่านั้น
//
// เหตุผลของดีไซน์ (Why):
// 1. ชื่อพนักงาน ลูกค้า เลขบัญชี และเบอร์โทรทุกค่าในไฟล์นี้เป็นข้อมูลสมมติ ไม่เกี่ยวกับร้านหรือบุคคลจริง
// 2. รายการงานนวด/ขายคอร์สถูกสร้างย้อนหลังจาก "วันนี้" ทุกครั้งที่ seed เพื่อให้ Dashboard และหน้าเงินเดือน
//    มีตัวเลขให้ดูทันทีไม่ว่าจะเปิดเว็บวันไหน (ถ้าเขียนวันที่ตายตัว ผ่านไปไม่กี่เดือนหน้าจอจะว่างเปล่า)
// 3. ใช้ตัวสุ่มแบบกำหนด seed ได้ (deterministic) เพื่อให้ข้อมูลออกมาเหมือนเดิมทุกครั้งเมื่อเริ่มจากวันเดียวกัน
//    ทำให้ภาพหน้าจอและการทดสอบคาดเดาผลได้

import {
  Booking,
  BookingService,
  CourseSale,
  CourseTemplate,
  Payment,
  Service,
  SystemUser,
  Therapist,
  initialServiceCategories
} from './initialData';

// ----------------------------------------------------
// บัญชีผู้ใช้ demo (แสดงบนหน้า login เมื่อเปิดโหมด demo)
// ----------------------------------------------------
// ไม่มีฟิลด์ email โดยตั้งใจ — เพื่อให้ login() ตรวจรหัสผ่านจากข้อมูลในเบราว์เซอร์ทันที ไม่วิ่งไป Firebase Auth
export const DEMO_PASSWORD = 'demo1234';

export const demoSystemUsers: SystemUser[] = [
  {
    username: 'demo_admin',
    password: DEMO_PASSWORD,
    role: 'admin',
    displayName: 'Demo Admin',
    fullName: 'ผู้ดูแลระบบ (ตัวอย่าง)'
  },
  {
    username: 'demo_manager',
    password: DEMO_PASSWORD,
    role: 'manager',
    displayName: 'Demo Manager',
    fullName: 'ผู้จัดการร้าน (ตัวอย่าง)'
  },
  {
    username: 'demo_super',
    password: DEMO_PASSWORD,
    role: 'super-manager',
    displayName: 'Demo Super Manager',
    fullName: 'ผู้จัดการอาวุโส (ตัวอย่าง)'
  }
];

// ----------------------------------------------------
// Master data
// ----------------------------------------------------
export const demoServiceCategories = initialServiceCategories;

export const demoServices: Service[] = [
  { id: 'svc_thai_1h',      category: 'นวดแผนไทย',   name: 'นวดแผนไทย',                    duration: 1,   price: 300, commission: 120 },
  { id: 'svc_foot_1h',      category: 'นวดแผนไทย',   name: 'นวดฝ่าเท้า',                    duration: 1,   price: 300, commission: 120 },
  { id: 'svc_neck_1h',      category: 'นวดแผนไทย',   name: 'นวดคอ บ่า ไหล่',                duration: 1,   price: 350, commission: 140 },
  { id: 'svc_herbal_1h',    category: 'นวดแผนไทย',   name: 'นวดประคบสมุนไพร',              duration: 1,   price: 450, commission: 180 },
  { id: 'svc_oil_1h',       category: 'ออยล์มาสซาจ', name: 'อโรมาออยล์มาสซาจ',            duration: 1,   price: 600, commission: 220 },
  { id: 'svc_hotstone_1h',  category: 'ออยล์มาสซาจ', name: 'นวดหินร้อน (Hot Stone)',       duration: 1,   price: 800, commission: 300 },
  { id: 'svc_facial_1h',    category: 'สปาหน้า',     name: 'ทรีตเมนต์หน้าใส',              duration: 1,   price: 900, commission: 300 },
  { id: 'svc_scrub_1h',     category: 'สปาตัว',      name: 'สครับขัดผิวมะขามน้ำผึ้ง',       duration: 1,   price: 700, commission: 250 }
];

export const demoCourseTemplates: CourseTemplate[] = [
  { id: 'tpl_thai_10',   category: 'คอร์สสปา', name: 'คอร์สนวดแผนไทย 10 ครั้ง',       defaultPrice: 2700, description: 'ใช้ได้ 6 เดือน (ประหยัด 300 บาท)' },
  { id: 'tpl_oil_5',     category: 'คอร์สสปา', name: 'คอร์สอโรมาออยล์ 5 ครั้ง',        defaultPrice: 2800, description: 'ใช้ได้ 3 เดือน' },
  { id: 'tpl_facial_5',  category: 'คอร์สสปา', name: 'คอร์สทรีตเมนต์หน้าใส 5 ครั้ง',    defaultPrice: 4000, description: 'แถมมาสก์หน้า 1 ครั้ง' },
  { id: 'tpl_body_3',    category: 'คอร์สสปา', name: 'แพ็กเกจสปาตัว + หน้า 3 ครั้ง',    defaultPrice: 4500, description: 'สครับตัว + ทรีตเมนต์หน้า' }
];

export const demoTherapists: Therapist[] = [
  {
    id: 'th_demo_01', name: 'มะลิ', type: 'full-time', dailyGuarantee: 400,
    bankName: 'ธนาคารตัวอย่าง', bankAccount: '000-0-00001-1', bankAccountName: 'มะลิ (ตัวอย่าง)', phone: '080-000-0001',
    worksLateShift: true, advanceDeductionTotal: 3000, advanceDeductionPerPeriod: 500
  },
  {
    id: 'th_demo_02', name: 'ฝน', type: 'full-time', dailyGuarantee: 400,
    bankName: 'ธนาคารตัวอย่าง', bankAccount: '000-0-00002-2', bankAccountName: 'ฝน (ตัวอย่าง)', phone: '080-000-0002',
    worksLateShift: false, advanceDeductionTotal: 0, advanceDeductionPerPeriod: 0
  },
  {
    id: 'th_demo_03', name: 'แก้ว', type: 'full-time', dailyGuarantee: 350,
    bankName: 'ธนาคารตัวอย่าง', bankAccount: '000-0-00003-3', bankAccountName: 'แก้ว (ตัวอย่าง)', phone: '080-000-0003',
    worksLateShift: true, advanceDeductionTotal: 1500, advanceDeductionPerPeriod: 300
  },
  {
    id: 'th_demo_04', name: 'น้ำหวาน', type: 'full-time', dailyGuarantee: 350,
    bankName: 'ธนาคารตัวอย่าง', bankAccount: '000-0-00004-4', bankAccountName: 'น้ำหวาน (ตัวอย่าง)', phone: '080-000-0004',
    worksLateShift: false, advanceDeductionTotal: 0, advanceDeductionPerPeriod: 0
  },
  {
    id: 'th_demo_05', name: 'ใบเตย', type: 'part-time', dailyGuarantee: 0,
    bankName: 'ธนาคารตัวอย่าง', bankAccount: '000-0-00005-5', bankAccountName: 'ใบเตย (ตัวอย่าง)', phone: '080-000-0005',
    worksLateShift: false, advanceDeductionTotal: 0, advanceDeductionPerPeriod: 0
  },
  {
    id: 'th_demo_06', name: 'ส้มโอ', type: 'part-time', dailyGuarantee: 0,
    bankName: 'ธนาคารตัวอย่าง', bankAccount: '000-0-00006-6', bankAccountName: 'ส้มโอ (ตัวอย่าง)', phone: '080-000-0006',
    worksLateShift: false, advanceDeductionTotal: 0, advanceDeductionPerPeriod: 0
  }
];

// ----------------------------------------------------
// ตัวสร้างรายการงานนวดและการขายคอร์สย้อนหลัง
// ----------------------------------------------------
const DEMO_HISTORY_DAYS = 120;
const DEMO_RANDOM_SEED = 20260101;
const DEMO_UPDATED_BY = 'demo_manager';
const SHOP_OPEN_HOUR = 10;
const SHOP_LAST_START_HOUR = 21;
const MIN_BOOKINGS_PER_DAY = 7;
const EXTRA_BOOKINGS_ON_WEEKEND = 6;
const EXTRA_BOOKINGS_RANDOM_RANGE = 6;
const COURSE_SALE_CHANCE_PER_DAY = 0.3;
const TIP_CHANCE = 0.35;
const TIP_AMOUNTS: number[] = [20, 50, 100];
const COURSE_COMMISSION_PERCENT = 10;
const PART_TIME_WORK_CHANCE = 0.5;
const SATURDAY_INDEX = 6;
const SUNDAY_INDEX = 0;

const DEMO_CUSTOMER_NAMES: string[] = [
  'คุณเอ (ตัวอย่าง)', 'คุณบี (ตัวอย่าง)', 'คุณซี (ตัวอย่าง)', 'คุณดี (ตัวอย่าง)',
  'Ms. Anna (sample)', 'Mr. Ben (sample)', 'ลูกค้า walk-in', 'ลูกค้า walk-in', 'ลูกค้า walk-in'
];

const DEMO_REMARKS: string[] = ['', '', '', '', 'ลูกค้าประจำ', 'ขอลงน้ำหนักเบา', 'จองผ่านโทรศัพท์'];

type PaymentChannel = 'cash' | 'transfer' | 'card';
const PAYMENT_CHANNELS: PaymentChannel[] = ['cash', 'cash', 'transfer', 'transfer', 'transfer', 'card'];

// ตัวสุ่ม Mulberry32 — เลือกใช้เพราะสั้น อ่านง่าย และให้ผลเหมือนเดิมทุกครั้งเมื่อใช้ seed เดิม
type RandomNumberGenerator = () => number;

function createSeededRandom(seed: number): RandomNumberGenerator {
  let state = seed;
  return (): number => {
    state = (state + 0x6d2b79f5) | 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed = (mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed)) ^ mixed;
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296;
  };
}

function pickRandomItem<T>(items: T[], random: RandomNumberGenerator): T {
  const index = Math.floor(random() * items.length);
  return items[index];
}

function toIsoDateString(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatHourAsTimeSlotPart(hour: number): string {
  return `${String(hour).padStart(2, '0')}.00`;
}

// จำนวนชั่วโมงที่ลูกค้าเลือก — ส่วนใหญ่ 1-2 ชม. ตามพฤติกรรมลูกค้านวดทั่วไป
function pickServiceHours(random: RandomNumberGenerator): number {
  const roll = random();
  if (roll < 0.55) return 1;
  if (roll < 0.9) return 2;
  return 3;
}

function buildPayment(totalPrice: number, random: RandomNumberGenerator): Payment {
  const payment: Payment = { cash: 0, transfer: 0, card: 0, tip: 0 };
  const channel = pickRandomItem(PAYMENT_CHANNELS, random);
  payment[channel] = totalPrice;
  if (random() < TIP_CHANCE) {
    payment.tip = pickRandomItem(TIP_AMOUNTS, random);
  }
  return payment;
}

function getTherapistsWorkingOnDay(random: RandomNumberGenerator): Therapist[] {
  return demoTherapists.filter((therapist) => {
    if (therapist.type === 'full-time') return true;
    return random() < PART_TIME_WORK_CHANCE;
  });
}

interface DemoActivity {
  bookings: Booking[];
  courseSales: CourseSale[];
}

export function generateDemoActivity(today: Date): DemoActivity {
  const random = createSeededRandom(DEMO_RANDOM_SEED);
  const bookings: Booking[] = [];
  const courseSales: CourseSale[] = [];

  for (let daysAgo = DEMO_HISTORY_DAYS - 1; daysAgo >= 0; daysAgo--) {
    const currentDay = new Date(today.getFullYear(), today.getMonth(), today.getDate() - daysAgo);
    const dateString = toIsoDateString(currentDay);
    const weekdayIndex = currentDay.getDay();
    const isWeekend = weekdayIndex === SATURDAY_INDEX || weekdayIndex === SUNDAY_INDEX;
    const updateDate = new Date(currentDay.getFullYear(), currentDay.getMonth(), currentDay.getDate(), 22).toISOString();

    const workingTherapists = getTherapistsWorkingOnDay(random);
    if (workingTherapists.length === 0) continue;

    // เก็บเวลาว่างถัดไปของหมอแต่ละคน เพื่อไม่ให้รอบงานของคนเดียวกันทับเวลากัน
    const nextFreeHourByTherapist = new Map<string, number>();
    const roundCountByTherapist = new Map<string, number>();

    const bookingCount =
      MIN_BOOKINGS_PER_DAY +
      (isWeekend ? EXTRA_BOOKINGS_ON_WEEKEND : 0) +
      Math.floor(random() * EXTRA_BOOKINGS_RANDOM_RANGE);

    for (let bookingIndex = 0; bookingIndex < bookingCount; bookingIndex++) {
      const therapist = pickRandomItem(workingTherapists, random);
      const startHour = nextFreeHourByTherapist.get(therapist.name) ?? SHOP_OPEN_HOUR;
      if (startHour > SHOP_LAST_START_HOUR) continue;

      const service = pickRandomItem(demoServices, random);
      const hours = pickServiceHours(random);
      const endHour = startHour + hours;
      const round = (roundCountByTherapist.get(therapist.name) ?? 0) + 1;

      nextFreeHourByTherapist.set(therapist.name, endHour);
      roundCountByTherapist.set(therapist.name, round);

      const bookingService: BookingService = {
        serviceId: service.id,
        serviceName: service.name,
        price: service.price,
        commission: service.commission,
        quantity: hours
      };

      bookings.push({
        id: `bk_demo_${dateString}_${bookingIndex}`,
        date: dateString,
        round,
        therapistName: therapist.name,
        timeSlot: `${formatHourAsTimeSlotPart(startHour)}-${formatHourAsTimeSlotPart(endHour)}`,
        services: [bookingService],
        payment: buildPayment(service.price * hours, random),
        customerName: pickRandomItem(DEMO_CUSTOMER_NAMES, random),
        remark: pickRandomItem(DEMO_REMARKS, random),
        updateDate,
        updateBy: DEMO_UPDATED_BY
      });
    }

    if (random() < COURSE_SALE_CHANCE_PER_DAY) {
      const template = pickRandomItem(demoCourseTemplates, random);
      const seller = pickRandomItem(workingTherapists, random);
      courseSales.push({
        id: `cs_demo_${dateString}`,
        date: dateString,
        therapistName: seller.name,
        courseCategory: template.category,
        courseType: template.name,
        price: template.defaultPrice,
        commissionPercent: COURSE_COMMISSION_PERCENT,
        commissionAmount: (template.defaultPrice * COURSE_COMMISSION_PERCENT) / 100,
        updateDate,
        updateBy: DEMO_UPDATED_BY
      });
    }
  }

  return { bookings, courseSales };
}
