// src/utils/db.ts
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. ปรับเปลี่ยนตัวดึงข้อมูลทั้งหมดให้ทำงานแบบ Asynchronous (Promises / async/await) 
//    เพื่อให้พร้อมสำหรับการเชื่อมต่อกับฐานข้อมูล Cloud Firestore จริงโดยมีประสิทธิภาพสูงสุด
// 2. ใช้ระบบ Hybrid Database Wrapper: หากมีตัวคอนฟิกและ Firebase App ทำงาน (ตรวจพบ firestore !== null) 
//    ระบบจะอ่านและเขียนโดยตรงกับ Cloud Firestore ในทันที พร้อมระบบอัปโหลดบัญชีผู้ใช้เริ่มต้นหากคอลเลกชันว่างเปล่า
//    หากไม่มี (เช่น ในการรันชุดทดสอบ หรือเทสออฟไลน์) จะดรอปสเกลมาใช้ localStorage แบบ Asynchronous เพื่อความยืดหยุ่น

import {
  Booking,
  Service,
  CourseSale,
  Therapist,
  SystemUser,
  ServiceCategory,
  CourseTemplate,
  AdvanceDeductionLedgerEntry,
  initialBookings,
  initialServices,
  initialTherapists,
  initialSystemUsers,
  initialCourseSales,
  initialServiceCategories,
  initialCourseTemplates,
  initialAdvanceDeductionLedger
} from '../data/initialData';
import {
  demoCourseTemplates,
  demoServiceCategories,
  demoServices,
  demoSystemUsers,
  demoTherapists,
  generateDemoActivity
} from '../data/demoData';
import { firestore } from './firebase';
import { IS_DEMO_MODE } from './demoMode';
import { getTodayDateString } from './dateHelpers';
import { collection, doc, getDocs, getDoc, setDoc, deleteDoc } from 'firebase/firestore';

// คีย์ของระบบ localStorage สำรอง
const KEYS = {
  SERVICES: 'demo_spa_services',
  BOOKINGS: 'demo_spa_bookings',
  THERAPISTS: 'demo_spa_therapists',
  SYSTEM_USERS: 'demo_spa_system_users',
  COURSE_SALES: 'demo_spa_course_sales',
  LATE_SHIFT_RATE: 'demo_spa_late_shift_rate',
  SERVICE_CATEGORIES: 'demo_spa_service_categories',
  COURSE_TEMPLATES: 'demo_spa_course_templates',
  ADVANCE_DEDUCTION_LEDGER: 'demo_spa_advance_deduction_ledger'
};

// วันที่ที่ seed ข้อมูลตัวอย่างล่าสุด (ใช้เฉพาะโหมด demo) — แยกออกจาก KEYS เพื่อไม่ให้ถูกลบตอนล้างข้อมูล
const DEMO_SEEDED_ON_KEY = 'demo_spa_demo_seeded_on';

// ตรวจสอบความพร้อมฝั่งเบราว์เซอร์
function isClient(): boolean {
  return typeof window !== 'undefined';
}

// อ่านข้อมูลแบบปลอดภัยจาก localStorage (สำหรับโหมดสำรอง)
function safeGetItem<T>(key: string, defaultValue: T): T {
  if (!isClient()) return defaultValue;
  const data = localStorage.getItem(key);
  if (!data) return defaultValue;
  try {
    return JSON.parse(data) as T;
  } catch {
    return defaultValue;
  }
}

// เขียนข้อมูลแบบปลอดภัยลง localStorage (สำหรับโหมดสำรอง)
function safeSetItem<T>(key: string, value: T): void {
  if (!isClient()) return;
  localStorage.setItem(key, JSON.stringify(value));
}

// ----------------------------------------------------
// ระบบตั้งค่าเริ่มต้น (Database Initializer)
// ----------------------------------------------------
const DEFAULT_LATE_SHIFT_RATE = 250;

// ชุดข้อมูลตั้งต้นที่จะเขียนลง localStorage ตอนยังว่าง — โหมดปกติใช้ seed ว่างจาก initialData.ts
// ส่วนโหมด demo ใช้ข้อมูลตัวอย่างเต็มชุดจาก demoData.ts เพื่อให้คนที่ลองใช้เห็นหน้าจอที่มีตัวเลขจริงจัง
interface SeedData {
  services: Service[];
  bookings: Booking[];
  therapists: Therapist[];
  courseSales: CourseSale[];
  serviceCategories: ServiceCategory[];
  courseTemplates: CourseTemplate[];
  advanceDeductionLedger: AdvanceDeductionLedgerEntry[];
}

function getSeedData(): SeedData {
  if (IS_DEMO_MODE) {
    const demoActivity = generateDemoActivity(new Date());
    return {
      services: demoServices,
      bookings: demoActivity.bookings,
      therapists: demoTherapists,
      courseSales: demoActivity.courseSales,
      serviceCategories: demoServiceCategories,
      courseTemplates: demoCourseTemplates,
      advanceDeductionLedger: []
    };
  }
  return {
    services: initialServices,
    bookings: initialBookings,
    therapists: initialTherapists,
    courseSales: initialCourseSales,
    serviceCategories: initialServiceCategories,
    courseTemplates: initialCourseTemplates,
    advanceDeductionLedger: initialAdvanceDeductionLedger
  };
}

// ล้างข้อมูลตัวอย่างทั้งหมดในเบราว์เซอร์ แล้วให้ระบบ seed ใหม่ในการอ่านครั้งถัดไป (ใช้กับปุ่มรีเซ็ตบนหน้า login)
export function resetDemoData(): void {
  if (!isClient() || !IS_DEMO_MODE) return;
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  localStorage.removeItem(DEMO_SEEDED_ON_KEY);
}

// โหมด demo: ถ้าข้อมูลถูก seed ไว้ตั้งแต่วันก่อน ให้ seed ใหม่ (Why): รายการงานนวดถูกสร้างย้อนหลังจาก
// "วันนี้" ถ้าปล่อยข้อมูลเก่าไว้ข้ามวัน Dashboard ช่วงวันที่ปัจจุบันจะค่อยๆ ว่างลง
function refreshDemoDataIfOutdated(): void {
  if (!IS_DEMO_MODE) return;
  const today = getTodayDateString();
  if (localStorage.getItem(DEMO_SEEDED_ON_KEY) === today) return;
  Object.values(KEYS).forEach((key) => localStorage.removeItem(key));
  localStorage.setItem(DEMO_SEEDED_ON_KEY, today);
}

export function initializeDatabase(): void {
  if (!isClient()) return;

  // ในกรณีที่เป็นโหมด Local Storage เท่านั้น (หากไม่มี Firestore เชื่อมโยง)
  if (firestore) return;

  refreshDemoDataIfOutdated();

  // สร้าง seed เฉพาะตอนมีคีย์ที่ยังว่างจริงๆ (Why): ฟังก์ชันนี้ถูกเรียกทุกครั้งที่อ่านข้อมูล
  // ส่วนข้อมูล demo ต้องวนสร้างงานนวดย้อนหลังหลายเดือน ไม่ควรเสียเวลาสร้างซ้ำทุกครั้งโดยไม่จำเป็น
  let cachedSeed: SeedData | null = null;
  const getSeed = (): SeedData => {
    if (!cachedSeed) cachedSeed = getSeedData();
    return cachedSeed;
  };

  if (!localStorage.getItem(KEYS.SERVICES)) safeSetItem(KEYS.SERVICES, getSeed().services);
  if (!localStorage.getItem(KEYS.BOOKINGS)) safeSetItem(KEYS.BOOKINGS, getSeed().bookings);
  if (!localStorage.getItem(KEYS.THERAPISTS)) safeSetItem(KEYS.THERAPISTS, getSeed().therapists);
  if (!localStorage.getItem(KEYS.SYSTEM_USERS)) {
    safeSetItem(KEYS.SYSTEM_USERS, getSeedSystemUsers());
  } else {
    reseedSystemUsersIfLegacy();
  }
  if (!localStorage.getItem(KEYS.COURSE_SALES)) safeSetItem(KEYS.COURSE_SALES, getSeed().courseSales);
  if (!localStorage.getItem(KEYS.LATE_SHIFT_RATE)) safeSetItem(KEYS.LATE_SHIFT_RATE, DEFAULT_LATE_SHIFT_RATE);
  if (!localStorage.getItem(KEYS.SERVICE_CATEGORIES)) {
    safeSetItem(KEYS.SERVICE_CATEGORIES, getSeed().serviceCategories);
  }
  if (!localStorage.getItem(KEYS.COURSE_TEMPLATES)) safeSetItem(KEYS.COURSE_TEMPLATES, getSeed().courseTemplates);
  if (!localStorage.getItem(KEYS.ADVANCE_DEDUCTION_LEDGER)) {
    safeSetItem(KEYS.ADVANCE_DEDUCTION_LEDGER, getSeed().advanceDeductionLedger);
  }
}

// รายชื่อผู้ใช้รุ่นเก่า (ก่อนมีฟิลด์ fullName) ให้แทนที่ด้วย seed ล่าสุด — พฤติกรรมเดิมของระบบ
function reseedSystemUsersIfLegacy(): void {
  const seedUsers = getSeedSystemUsers();
  const firstSeedUsername = seedUsers[0]?.username;
  if (!firstSeedUsername) return;
  const existing = safeGetItem<(SystemUser & { linkedTherapistName?: string })[]>(KEYS.SYSTEM_USERS, []);
  if (!existing.some(u => u.username === firstSeedUsername && u.fullName)) {
    safeSetItem(KEYS.SYSTEM_USERS, seedUsers);
  }
}

function getSeedSystemUsers(): SystemUser[] {
  return IS_DEMO_MODE ? demoSystemUsers : initialSystemUsers;
}

// ----------------------------------------------------
// โมดูลประเภทบริการ (Services CRUD)
// ----------------------------------------------------
export async function getServices(): Promise<Service[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "services"));
    return q.docs.map(d => d.data() as Service);
  }
  initializeDatabase();
  return safeGetItem<Service[]>(KEYS.SERVICES, []);
}

export async function saveService(service: Service): Promise<void> {
  if (firestore) {
    await setDoc(doc(firestore, "services", service.id), service);
    return;
  }
  const list = await getServices();
  const index = list.findIndex((s) => s.id === service.id);
  if (index >= 0) {
    list[index] = service;
  } else {
    list.push(service);
  }
  safeSetItem(KEYS.SERVICES, list);
}

export async function deleteService(id: string): Promise<void> {
  if (firestore) {
    await deleteDoc(doc(firestore, "services", id));
    return;
  }
  const list = await getServices();
  const filtered = list.filter((s) => s.id !== id);
  safeSetItem(KEYS.SERVICES, filtered);
}

// ----------------------------------------------------
// โมดูลพนักงานนวด (Therapists CRUD)
// ----------------------------------------------------
// รองรับเอกสารเก่าที่ยังมีแค่ฟิลด์ advanceDeduction (ก่อนเปลี่ยนชื่อเป็น advanceDeductionTotal)
// เพื่อไม่ให้ยอดหักเบิกที่กรอกไว้เดิมหายไปตอน migrate โดยไม่ต้องรัน migration script แยก
function mapLegacyTherapistFields(raw: Therapist & { advanceDeduction?: number }): Therapist {
  return {
    ...raw,
    advanceDeductionTotal: raw.advanceDeductionTotal ?? raw.advanceDeduction ?? 0
  };
}

export async function getTherapists(): Promise<Therapist[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "therapists"));
    return q.docs.map(d => mapLegacyTherapistFields(d.data() as Therapist));
  }
  initializeDatabase();
  return safeGetItem<Therapist[]>(KEYS.THERAPISTS, []).map(mapLegacyTherapistFields);
}

export async function saveTherapist(therapist: Therapist): Promise<void> {
  if (firestore) {
    await setDoc(doc(firestore, "therapists", therapist.id), therapist);
    return;
  }
  const list = await getTherapists();
  const index = list.findIndex((t) => t.id === therapist.id);
  if (index >= 0) {
    list[index] = therapist;
  } else {
    list.push(therapist);
  }
  safeSetItem(KEYS.THERAPISTS, list);
}

export async function deleteTherapist(id: string): Promise<void> {
  if (firestore) {
    await deleteDoc(doc(firestore, "therapists", id));
    return;
  }
  const list = await getTherapists();
  const filtered = list.filter((t) => t.id !== id);
  safeSetItem(KEYS.THERAPISTS, filtered);
}

// ----------------------------------------------------
// โมดูลบันทึกงานนวดประจำวัน (Bookings CRUD)
// ----------------------------------------------------
export async function getBookings(): Promise<Booking[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "bookings"));
    return q.docs.map(d => d.data() as Booking);
  }
  initializeDatabase();
  return safeGetItem<Booking[]>(KEYS.BOOKINGS, []);
}

export async function saveBooking(booking: Booking, username: string): Promise<void> {
  const updatedBooking = {
    ...booking,
    updateDate: new Date().toISOString(),
    updateBy: username
  };

  if (firestore) {
    await setDoc(doc(firestore, "bookings", booking.id), updatedBooking);
    return;
  }

  const list = await getBookings();
  const index = list.findIndex((b) => b.id === booking.id);
  if (index >= 0) {
    list[index] = updatedBooking;
  } else {
    list.push(updatedBooking);
  }
  safeSetItem(KEYS.BOOKINGS, list);
}

export async function deleteBooking(id: string): Promise<void> {
  if (firestore) {
    await deleteDoc(doc(firestore, "bookings", id));
    return;
  }
  const list = await getBookings();
  const filtered = list.filter((b) => b.id !== id);
  safeSetItem(KEYS.BOOKINGS, filtered);
}

// ----------------------------------------------------
// โมดูลการขายคอร์สสปา (Course Sales CRUD)
// ----------------------------------------------------
export async function getCourseSales(): Promise<CourseSale[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "courseSales"));
    return q.docs.map(d => d.data() as CourseSale);
  }
  initializeDatabase();
  return safeGetItem<CourseSale[]>(KEYS.COURSE_SALES, []);
}

export async function saveCourseSale(sale: CourseSale, username: string): Promise<void> {
  const updatedSale = {
    ...sale,
    updateDate: new Date().toISOString(),
    updateBy: username
  };

  if (firestore) {
    await setDoc(doc(firestore, "courseSales", sale.id), updatedSale);
    return;
  }

  const list = await getCourseSales();
  const index = list.findIndex((s) => s.id === sale.id);
  if (index >= 0) {
    list[index] = updatedSale;
  } else {
    list.push(updatedSale);
  }
  safeSetItem(KEYS.COURSE_SALES, list);
}

export async function deleteCourseSale(id: string): Promise<void> {
  if (firestore) {
    await deleteDoc(doc(firestore, "courseSales", id));
    return;
  }
  const list = await getCourseSales();
  const filtered = list.filter((s) => s.id !== id);
  safeSetItem(KEYS.COURSE_SALES, filtered);
}

// ----------------------------------------------------
// โมดูลสิทธิ์ผู้ใช้งานระบบ (System Users CRUD)
// ----------------------------------------------------
export async function getSystemUsers(): Promise<SystemUser[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "systemUsers"));
    if (q.empty) {
      // ทำการ Seed ผู้ใช้ตั้งต้นขึ้นคลาวด์อัตโนมัติหากหน้าฐานข้อมูลคลาวด์ยังว่างอยู่
      for (const u of initialSystemUsers) {
        await setDoc(doc(firestore, "systemUsers", u.username), u);
      }
      return initialSystemUsers;
    }
    return q.docs.map(d => d.data() as SystemUser);
  }

  initializeDatabase();
  const raw = safeGetItem<(SystemUser & { linkedTherapistName?: string })[]>(KEYS.SYSTEM_USERS, []);
  return raw.map(u => ({
    username: u.username,
    password: u.password || '123456',
    role: u.role,
    displayName: u.displayName || u.linkedTherapistName || 'ผู้ใช้งานระบบ',
    fullName: u.fullName || u.displayName || u.linkedTherapistName || 'ผู้ใช้งานระบบ',
    email: u.email
  }));
}

export async function saveSystemUser(user: SystemUser): Promise<void> {
  if (firestore) {
    await setDoc(doc(firestore, "systemUsers", user.username), user);
    return;
  }
  const list = await getSystemUsers();
  const index = list.findIndex((u) => u.username === user.username);
  if (index >= 0) {
    list[index] = user;
  } else {
    list.push(user);
  }
  safeSetItem(KEYS.SYSTEM_USERS, list);
}

export async function deleteSystemUser(username: string): Promise<void> {
  if (firestore) {
    await deleteDoc(doc(firestore, "systemUsers", username));
    return;
  }
  const list = await getSystemUsers();
  const filtered = list.filter((u) => u.username !== username);
  safeSetItem(KEYS.SYSTEM_USERS, filtered);
}

// ----------------------------------------------------
// อัตราค่ากะดึก (Late Shift Rate Settings)
// ----------------------------------------------------
export async function getLateShiftRate(): Promise<number> {
  if (firestore) {
    const docSnap = await getDoc(doc(firestore, "appSettings", "settings"));
    if (docSnap.exists()) {
      return docSnap.data().lateShiftRate ?? 250;
    }
    return 250;
  }
  initializeDatabase();
  return safeGetItem<number>(KEYS.LATE_SHIFT_RATE, 250);
}

export async function saveLateShiftRate(rate: number): Promise<void> {
  if (firestore) {
    await setDoc(doc(firestore, "appSettings", "settings"), { lateShiftRate: rate }, { merge: true });
    return;
  }
  safeSetItem(KEYS.LATE_SHIFT_RATE, rate);
}

// ----------------------------------------------------
// หมวดหมู่บริการ (Service Categories CRUD)
// ----------------------------------------------------
export async function getServiceCategories(): Promise<ServiceCategory[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "serviceCategories"));
    return q.docs.map(d => d.data() as ServiceCategory);
  }
  initializeDatabase();
  return safeGetItem<ServiceCategory[]>(KEYS.SERVICE_CATEGORIES, []);
}

export async function saveServiceCategory(category: ServiceCategory): Promise<void> {
  if (firestore) {
    await setDoc(doc(firestore, "serviceCategories", category.id), category);
    return;
  }
  const list = await getServiceCategories();
  const index = list.findIndex((c) => c.id === category.id);
  if (index >= 0) {
    list[index] = category;
  } else {
    list.push(category);
  }
  safeSetItem(KEYS.SERVICE_CATEGORIES, list);
}

export async function deleteServiceCategory(id: string): Promise<void> {
  if (firestore) {
    await deleteDoc(doc(firestore, "serviceCategories", id));
    return;
  }
  const list = await getServiceCategories();
  const filtered = list.filter((c) => c.id !== id);
  safeSetItem(KEYS.SERVICE_CATEGORIES, filtered);
}

// ----------------------------------------------------
// คอร์สสปาแม่แบบ (Course Templates CRUD)
// ----------------------------------------------------
export async function getCourseTemplates(): Promise<CourseTemplate[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "courseTemplates"));
    return q.docs.map(d => d.data() as CourseTemplate);
  }
  initializeDatabase();
  return safeGetItem<CourseTemplate[]>(KEYS.COURSE_TEMPLATES, []);
}

export async function saveCourseTemplate(template: CourseTemplate): Promise<void> {
  if (firestore) {
    await setDoc(doc(firestore, "courseTemplates", template.id), template);
    return;
  }
  const list = await getCourseTemplates();
  const index = list.findIndex((t) => t.id === template.id);
  if (index >= 0) {
    list[index] = template;
  } else {
    list.push(template);
  }
  safeSetItem(KEYS.COURSE_TEMPLATES, list);
}

export async function deleteCourseTemplate(id: string): Promise<void> {
  if (firestore) {
    await deleteDoc(doc(firestore, "courseTemplates", id));
    return;
  }
  const list = await getCourseTemplates();
  const filtered = list.filter((t) => t.id !== id);
  safeSetItem(KEYS.COURSE_TEMPLATES, filtered);
}

// ----------------------------------------------------
// ประวัติการหักเบิกต่องวด (Advance Deduction Ledger — append-only, ไม่มีการลบ/แก้ไขย้อนหลัง)
// ----------------------------------------------------
export async function getAdvanceDeductionLedger(): Promise<AdvanceDeductionLedgerEntry[]> {
  if (firestore) {
    const q = await getDocs(collection(firestore, "advanceDeductionLedger"));
    return q.docs.map(d => d.data() as AdvanceDeductionLedgerEntry);
  }
  initializeDatabase();
  return safeGetItem<AdvanceDeductionLedgerEntry[]>(KEYS.ADVANCE_DEDUCTION_LEDGER, []);
}

export async function saveAdvanceDeductionLedgerEntry(entry: AdvanceDeductionLedgerEntry): Promise<void> {
  if (firestore) {
    await setDoc(doc(firestore, "advanceDeductionLedger", entry.id), entry);
    return;
  }
  const list = await getAdvanceDeductionLedger();
  const index = list.findIndex((e) => e.id === entry.id);
  if (index >= 0) {
    list[index] = entry;
  } else {
    list.push(entry);
  }
  safeSetItem(KEYS.ADVANCE_DEDUCTION_LEDGER, list);
}
