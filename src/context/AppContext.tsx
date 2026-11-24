// src/context/AppContext.tsx
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. แปลงฟังก์ชัน CRUD และการทำงานของ State ทั้งหมดให้อยู่ในรูป Asynchronous (Promise/async/await)
//    เพื่อทำงานร่วมกับฐานข้อมูล Cloud Firestore จริงได้อย่างเป็นธรรมชาติ
// 2. เพิ่มตัวแปรสถานะ isLoading เพื่อใช้ในการแสดงผล UI Loading (สปินเนอร์/ชิมเมอร์เบลอ) ระหว่างการรอการประมวลผลฐานข้อมูลจริง
// 3. ปรับปรุงการโหลดข้อมูลเมื่อเริ่มต้นติดตั้งคอมโพเนนต์ (Component Mount) ให้ดึงข้อมูลจาก db module แบบ async ทั้งเซ็ต
//    พร้อมตรวจความถูกต้องของเซสชันผู้ใช้งานโดยอัตโนมัติ

'use client';

import React, { createContext, useContext, useState, useEffect, useRef, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import {
  Booking,
  Service,
  CourseSale,
  Therapist,
  SystemUser,
  ServiceCategory,
  CourseTemplate,
  AdvanceDeductionLedgerEntry
} from '@/data/initialData';
import * as db from '@/utils/db';
import { auth } from '@/utils/firebase';
import { onIdTokenChanged, signInWithEmailAndPassword, signOut } from 'firebase/auth';

// รหัส error ที่บ่งชี้ว่าเซสชัน/token ของผู้ใช้ใช้งานไม่ได้แล้วระหว่างใช้งานจริง (ไม่ใช่ตอน login)
// (Why ต้องมีค่าคงที่ชุดนี้): Firestore ปฏิเสธคำขอด้วยโค้ด 'permission-denied' เมื่อ security rules
// ตรวจสอบ auth token แล้วไม่ผ่าน (เช่น token หมดอายุ/ถูกเพิกถอน) ส่วน Firebase Auth เองใช้โค้ดขึ้นต้นด้วย
// 'auth/' เมื่อ token ของผู้ใช้ที่ล็อกอินอยู่ใช้งานไม่ได้แล้ว — ต้องตรวจจับที่ชั้นกลางนี้จุดเดียว เพื่อไม่ให้
// ต้อง duplicate เงื่อนไขเดิมซ้ำในทุกฟังก์ชัน CRUD
const SESSION_INVALID_ERROR_CODES = [
  'permission-denied',
  'unauthenticated',
  'auth/id-token-expired',
  'auth/user-token-expired',
  'auth/invalid-user-token',
  'auth/user-disabled',
  'auth/user-not-found',
] as const;

// ตรวจสอบว่า error ที่ได้จากการเรียก Firestore/Firebase Auth ระหว่างใช้งาน บ่งชี้ว่าเซสชันหมดอายุ/ถูก
// เพิกถอนหรือไม่ — คืนค่า false เสมอถ้า error ไม่มีรูปแบบ { code: string } ตามที่ Firebase ส่งมาจริง
// (Defensive programming: กัน error รูปแบบอื่นที่ไม่เกี่ยวกับ auth ถูกเข้าใจผิดว่าเป็นเซสชันหมดอายุ)
function isSessionInvalidError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const maybeCode = (error as { code?: unknown }).code;
  if (typeof maybeCode !== 'string') return false;
  return SESSION_INVALID_ERROR_CODES.some((invalidCode) => maybeCode === invalidCode);
}

interface AppContextType {
  currentRole: 'admin' | 'manager' | 'super-manager';
  currentUser: SystemUser | null;
  therapists: Therapist[];
  services: Service[];
  bookings: Booking[];
  courseSales: CourseSale[];
  lateShiftRate: number;
  systemUsers: SystemUser[];
  serviceCategories: ServiceCategory[];
  courseTemplates: CourseTemplate[];
  advanceDeductionLedger: AdvanceDeductionLedgerEntry[];
  isInitialLoading: boolean; // กำลังโหลดข้อมูลครั้งแรกตอนเปิดแอป (เต็มจอ)
  isLoading: boolean; // กำลังประมวลผล CRUD ระหว่างใช้งาน (ตัวแจ้งเตือนเล็กมุมจอ)
  // ข้อความแจ้งเตือนเมื่อระบบบังคับออกจากระบบเองเพราะเซสชัน/token หมดอายุระหว่างใช้งาน (ไม่ใช่ผู้ใช้กด
  // ออกจากระบบเอง) — เป็น null เมื่อไม่มีเหตุการณ์นี้เกิดขึ้น หน้า login อ่านค่านี้ไปแสดงเป็นข้อความแจ้งเตือน
  sessionExpiredMessage: string | null;
  clearSessionExpiredMessage: () => void;

  // ฟังก์ชันควบคุมสิทธิ์และการเข้าใช้งานระบบ
  login: (username: string, password: string) => Promise<boolean>;
  logout: () => Promise<void>;
  switchUser: (username: string) => Promise<void>;
  
  // ฟังก์ชัน CRUD บันทึกงานนวด
  addOrUpdateBooking: (booking: Booking) => Promise<void>;
  removeBooking: (id: string) => Promise<void>;
  
  // ฟังก์ชัน CRUD จัดการคอร์ส
  addOrUpdateCourseSale: (sale: CourseSale) => Promise<void>;
  removeCourseSale: (id: string) => Promise<void>;
  
  // ฟังก์ชันจัดการตั้งค่า
  addOrUpdateTherapist: (therapist: Therapist) => Promise<void>;
  removeTherapist: (id: string) => Promise<void>;
  addOrUpdateService: (service: Service) => Promise<void>;
  removeService: (id: string) => Promise<void>;
  updateLateShiftRate: (rate: number) => Promise<void>;
  
  // ฟังก์ชันจัดการบัญชีผู้ใช้ระบบ
  addOrUpdateSystemUser: (user: SystemUser) => Promise<void>;
  removeSystemUser: (username: string) => Promise<void>;

  // ฟังก์ชันจัดการ Master Data — หมวดหมู่บริการ
  addOrUpdateServiceCategory: (category: ServiceCategory) => Promise<void>;
  removeServiceCategory: (id: string) => Promise<void>;

  // ฟังก์ชันจัดการ Master Data — คอร์สสปา
  addOrUpdateCourseTemplate: (template: CourseTemplate) => Promise<void>;
  removeCourseTemplate: (id: string) => Promise<void>;

  // บันทึกประวัติการหักเบิกต่องวด (Ledger — append-only)
  recordAdvanceDeduction: (entry: AdvanceDeductionLedgerEntry) => Promise<void>;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  // บัญชีผู้ใช้งานระบบเริ่มต้น
  const [systemUsers, setSystemUsers] = useState<SystemUser[]>([]);
  const [currentUser, setCurrentUser] = useState<SystemUser | null>(null);
  const [currentRole, setCurrentRole] = useState<'admin' | 'manager' | 'super-manager'>('admin');
  
  // ข้อมูลสปา
  const [therapists, setTherapists] = useState<Therapist[]>([]);
  const [services, setServices] = useState<Service[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [courseSales, setCourseSales] = useState<CourseSale[]>([]);
  const [lateShiftRate, setLateShiftRate] = useState<number>(250);

  // Master Data
  const [serviceCategories, setServiceCategories] = useState<ServiceCategory[]>([]);
  const [courseTemplates, setCourseTemplates] = useState<CourseTemplate[]>([]);

  // ประวัติการหักเบิกต่องวด (Ledger)
  const [advanceDeductionLedger, setAdvanceDeductionLedger] = useState<AdvanceDeductionLedgerEntry[]>([]);

  // สถานะโหลดข้อมูลครั้งแรกตอนเปิดแอป (เต็มจอครั้งเดียว) แยกจาก isLoading ด้านล่าง
  // ซึ่งเป็นสถานะ "กำลังบันทึก/ประมวลผล" ระหว่างการใช้งานปกติ — เดิมใช้ตัวแปรร่วมกันตัวเดียว
  // ทำให้ทุกครั้งที่กด "บันทึก" ในหน้าไหนก็ตาม หน้าทั้งหมดจะถูกถอดออกและแสดงจอโหลดเต็มจอซ้ำๆ (กระพริบทั้งหน้า)
  const [isInitialLoading, setIsInitialLoading] = useState<boolean>(true);

  // สถานะกำลังประมวลผล CRUD ระหว่างใช้งาน (ใช้แสดงตัวแจ้งเตือนเล็กๆ มุมจอ ไม่บังทั้งหน้า)
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // ข้อความแจ้งเตือนเมื่อระบบบังคับออกจากระบบเองเพราะเซสชันหมดอายุ (ดู forceLogoutDueToExpiredSession ด้านล่าง)
  const [sessionExpiredMessage, setSessionExpiredMessage] = useState<string | null>(null);

  // บันทึกว่าเซสชันปัจจุบันล็อกอินผ่าน Firebase Auth จริง (path A — signInWithEmailAndPassword) หรือไม่
  // (Why ใช้ ref แทน state): ต้องให้ onIdTokenChanged (subscribe เพียงครั้งเดียวตอน mount ด้านล่าง) อ่านค่า
  // ล่าสุดได้เสมอโดยไม่ต้อง re-subscribe ทุกครั้งที่ currentUser เปลี่ยน — ป้องกันการบังคับ logout ผิดพลาด
  // กับผู้ใช้ role อื่น (admin_user/manager_user) ที่ไม่เคยล็อกอินผ่าน Firebase Auth เลยสักครั้ง (ตรวจ password
  // จากเอกสาร Firestore โดยตรง — path B) ซึ่ง onIdTokenChanged จะไม่มีทางเกี่ยวข้องด้วยเลย
  const authProviderRef = useRef<'firebase' | null>(null);

  // เก็บ localStorage key ของสถานะข้างต้นไว้เป็นค่าคงที่ กันสะกดผิดระหว่างจุดที่ set/get/remove
  const SESSION_AUTH_PROVIDER_STORAGE_KEY = 'session_auth_provider';

  // บังคับออกจากระบบเมื่อพบว่าเซสชัน/token หมดอายุหรือถูกเพิกถอนระหว่างใช้งานจริง (Edge case 2 ที่ QA
  // รายงาน) — ล้างสถานะผู้ใช้ทั้งหมดพร้อมตั้งข้อความแจ้งเตือนให้หน้า login แสดงผล ไม่ปล่อยให้หน้าจอค้าง
  // สถานะเดิมเงียบๆ เหมือนพฤติกรรมเดิมที่ QA พิสูจน์ไว้
  const forceLogoutDueToExpiredSession = async (): Promise<void> => {
    authProviderRef.current = null;
    if (auth) {
      try {
        await signOut(auth);
      } catch (signOutError) {
        // เพิกเฉย error ตอน sign out ซ้ำ — เป้าหมายหลักคือล้างสถานะฝั่ง client ให้สำเร็จเสมอ
        console.warn("Failed to sign out during forced session expiry:", signOutError);
      }
    }
    // ใช้ flushSync บังคับให้ React commit สถานะ "ออกจากระบบ" ทันทีแบบ synchronous (Why จำเป็น): ฟังก์ชันนี้
    // มักถูกเรียกจาก catch block ของ CRUD operation ที่ตามด้วยการ throw error ต่อทันที (ดู runCrudOperation)
    // ถ้าปล่อยให้ setState แบบ batched ตามปกติ มีความเสี่ยงที่ค่า currentUser=null จะยังไม่ถูกคอมมิตทันเวลา
    // ก่อนที่ผู้เรียก (เช่น testing library act()) จะอ่านค่าสถานะต่อจาก promise ที่ reject ไปแล้ว
    flushSync(() => {
      setCurrentUser(null);
      setCurrentRole('admin');
      setSessionExpiredMessage('เซสชันของคุณหมดอายุหรือถูกเพิกถอน กรุณาเข้าสู่ระบบใหม่อีกครั้ง');
    });
    if (typeof window !== 'undefined') {
      localStorage.removeItem('session_user');
      localStorage.removeItem(SESSION_AUTH_PROVIDER_STORAGE_KEY);
    }
  };

  const clearSessionExpiredMessage = (): void => {
    setSessionExpiredMessage(null);
  };

  // Subscribe การเปลี่ยนแปลงสถานะ Firebase Auth แบบ real-time (Edge case 2 ที่ QA รายงาน — เดิมไม่มีจุดนี้
  // เลยสักบรรทัด ทำให้ token หมดอายุระหว่างใช้งานไม่ถูกตรวจจับ) — subscribe ครั้งเดียวตอน mount เท่านั้น
  useEffect(() => {
    if (!auth) return;

    const unsubscribe = onIdTokenChanged(auth, (firebaseUser) => {
      // ตอบสนองเฉพาะกรณี "เคยล็อกอินผ่าน Firebase Auth จริงอยู่ก่อน (path A) แล้วตอนนี้ไม่มี user แล้ว"
      // เท่านั้น — ผู้ใช้ role อื่นที่ล็อกอินผ่าน path B (ตรวจ password จากเอกสาร Firestore) จะไม่ถูก
      // กระทบเลย เพราะ authProviderRef.current ของบัญชีเหล่านั้นเป็น null เสมอ
      if (authProviderRef.current === 'firebase' && !firebaseUser) {
        forceLogoutDueToExpiredSession();
      }
    });

    return unsubscribe;
  }, []);

  // ทำการดึงข้อมูลจาก Database Helper แบบ Asynchronous เมื่อเริ่มต้นแอปพลิเคชัน
  useEffect(() => {
    const loadDatabaseAsync = async () => {
      setIsInitialLoading(true);
      try {
        db.initializeDatabase();

        const [
          usersData,
          therapistsData,
          servicesData,
          bookingsData,
          courseSalesData,
          lateRateData,
          categoriesData,
          templatesData,
          advanceDeductionLedgerData
        ] = await Promise.all([
          db.getSystemUsers(),
          db.getTherapists(),
          db.getServices(),
          db.getBookings(),
          db.getCourseSales(),
          db.getLateShiftRate(),
          db.getServiceCategories(),
          db.getCourseTemplates(),
          db.getAdvanceDeductionLedger()
        ]);

        setSystemUsers(usersData);
        setTherapists(therapistsData);
        setServices(servicesData);
        setBookings(bookingsData);
        setCourseSales(courseSalesData);
        setLateShiftRate(lateRateData);
        setServiceCategories(categoriesData);
        setCourseTemplates(templatesData);
        setAdvanceDeductionLedger(advanceDeductionLedgerData);

        // ตรวจเช็คเซสชันล็อกอินเก่า
        if (typeof window !== 'undefined') {
          const saved = localStorage.getItem('session_user');
          if (saved) {
            try {
              const parsedUser = JSON.parse(saved) as SystemUser;
              // ค้นหาเทียบเพื่อความถูกต้องล่าสุด
              const match = usersData.find(u => u.username === parsedUser.username);
              if (match) {
                setCurrentUser(match);
                setCurrentRole(match.role);
                // กู้คืนสถานะว่าเซสชันนี้เคยล็อกอินผ่าน Firebase Auth จริงหรือไม่ (บันทึกไว้ตอน login())
                // เพื่อให้ onIdTokenChanged ด้านบนตรวจจับ token หมดอายุได้ถูกต้องแม้หลัง reload หน้าเว็บ
                authProviderRef.current =
                  localStorage.getItem(SESSION_AUTH_PROVIDER_STORAGE_KEY) === 'firebase'
                    ? 'firebase'
                    : null;
              } else {
                localStorage.removeItem('session_user');
                localStorage.removeItem(SESSION_AUTH_PROVIDER_STORAGE_KEY);
              }
            } catch {
              localStorage.removeItem('session_user');
            }
          }
        }
      } catch (err) {
        console.error("Failed to load cloud databases asynchronously:", err);
      } finally {
        setIsInitialLoading(false);
      }
    };

    loadDatabaseAsync();
  }, []);

  // ยืนยันตัวตนเข้าระบบจริง
  const login = async (usernameOrEmail: string, password: string): Promise<boolean> => {
    setIsLoading(true);
    try {
      const users = await db.getSystemUsers();
      
      const isEmail = usernameOrEmail.includes('@');
      let targetEmail = usernameOrEmail.trim().toLowerCase();
      const targetUsername = usernameOrEmail.trim().toLowerCase();

      if (!isEmail) {
        const matched = users.find(u => u.username.toLowerCase() === targetUsername);
        if (matched && matched.email) {
          targetEmail = matched.email;
        } else {
          if (matched && matched.password === password) {
            authProviderRef.current = null;
            setCurrentUser(matched);
            setCurrentRole(matched.role);
            localStorage.setItem('session_user', JSON.stringify(matched));
            localStorage.removeItem(SESSION_AUTH_PROVIDER_STORAGE_KEY);
            return true;
          }
          return false;
        }
      }

      if (auth) {
        try {
          const userCredential = await signInWithEmailAndPassword(auth, targetEmail, password);
          if (userCredential.user) {
            // ล็อกอินสำเร็จผ่าน Firebase Auth จริง (path A) — บันทึกไว้ให้ onIdTokenChanged ตรวจจับ
            // token หมดอายุระหว่างใช้งานของบัญชีนี้ได้ถูกต้อง (Edge case 2 ที่ QA รายงาน)
            authProviderRef.current = 'firebase';
            localStorage.setItem(SESSION_AUTH_PROVIDER_STORAGE_KEY, 'firebase');

            const matchedUser = users.find(
              (u) => u.email?.toLowerCase() === targetEmail
            );
            if (matchedUser) {
              setCurrentUser(matchedUser);
              setCurrentRole(matchedUser.role);
              localStorage.setItem('session_user', JSON.stringify(matchedUser));
              return true;
            } else {
              const newUser: SystemUser = {
                username: userCredential.user.email?.split('@')[0] || 'user',
                email: userCredential.user.email || targetEmail,
                role: 'admin',
                displayName: userCredential.user.displayName || 'Firebase User',
                fullName: userCredential.user.displayName || 'ผู้ใช้งานจาก Firebase'
              };
              await db.saveSystemUser(newUser);
              setCurrentUser(newUser);
              setCurrentRole('admin');
              localStorage.setItem('session_user', JSON.stringify(newUser));
              return true;
            }
          }
        } catch (authError) {
          const message = authError instanceof Error ? authError.message : String(authError);
          console.warn("Firebase Auth sign-in failed, checking fallback:", message);
        }
      }

      const fallbackUser = users.find(
        (u) => u.email?.toLowerCase() === targetEmail || u.username.toLowerCase() === targetUsername
      );
      if (fallbackUser && fallbackUser.password === password) {
        authProviderRef.current = null;
        setCurrentUser(fallbackUser);
        setCurrentRole(fallbackUser.role);
        localStorage.setItem('session_user', JSON.stringify(fallbackUser));
        localStorage.removeItem(SESSION_AUTH_PROVIDER_STORAGE_KEY);
        return true;
      }

      return false;
    } catch (e) {
      console.error("Login failure:", e);
      return false;
    } finally {
      setIsLoading(false);
    }
  };

  // ออกจากระบบ
  const logout = async (): Promise<void> => {
    setIsLoading(true);
    try {
      // เคลียร์ ref ก่อนเรียก signOut(auth) เสมอ (Why ต้องเรียงลำดับแบบนี้): signOut() จะทำให้
      // onIdTokenChanged ด้านบน fire ด้วย user เป็น null — ถ้ายังไม่เคลียร์ ref ก่อน จะถูกเข้าใจผิดว่า
      // เป็นเซสชันหมดอายุ (forceLogoutDueToExpiredSession) ทั้งที่จริงเป็นผู้ใช้กดออกจากระบบเองตามปกติ
      authProviderRef.current = null;
      if (auth) {
        await signOut(auth);
      }
      setCurrentUser(null);
      setCurrentRole('admin');
      localStorage.removeItem('session_user');
      localStorage.removeItem(SESSION_AUTH_PROVIDER_STORAGE_KEY);
    } catch (e) {
      console.error("Failed to sign out from Firebase:", e);
    } finally {
      setIsLoading(false);
    }
  };

  // สลับบัญชีผู้ใช้ในการรันเดโม
  const switchUser = async (username: string): Promise<void> => {
    setIsLoading(true);
    try {
      const users = await db.getSystemUsers();
      const user = users.find((u) => u.username === username);
      if (user) {
        // การสลับผู้ใช้จำลองไม่ได้ผ่าน Firebase Auth จริง — ต้องล้างสถานะ path A เดิมทิ้งเสมอ กันไม่ให้
        // onIdTokenChanged ยังจำสิทธิ์เดิมค้างอยู่แล้วบังคับ logout บัญชีที่สลับมาใหม่แบบผิดพลาด
        authProviderRef.current = null;
        localStorage.removeItem(SESSION_AUTH_PROVIDER_STORAGE_KEY);
        setCurrentUser(user);
        setCurrentRole(user.role);
        localStorage.setItem('session_user', JSON.stringify(user));
      }
    } finally {
      setIsLoading(false);
    }
  };

  // ----------------------------------------------------
  // การดำเนินการ CRUD (ส่งผลทั้ง State และ Storage)
  // ----------------------------------------------------

  // Wrapper กลางสำหรับฟังก์ชัน CRUD ทุกตัวด้านล่าง (Cost-Effective Abstraction — Why จำเป็น): รวม
  // พฤติกรรมที่ทุกฟังก์ชัน CRUD เดิมต้องทำเหมือนกันทุกครั้งไว้จุดเดียว แทนการ copy-paste ซ้ำ 14 ที่:
  // (1) เปิด/ปิด isLoading ระหว่างทำงาน (พฤติกรรมเดิมทุกประการ)
  // (2) ตรวจจับ error สไตล์เซสชัน/token หมดอายุจาก Firestore/Firebase Auth (เช่น 'permission-denied')
  //     แล้วบังคับล้างเซสชันทันที (แก้ Edge case 2 ที่ QA รายงาน — เดิมไม่มีการตรวจจับนี้เลย)
  // (3) โยน error เดิมต่อให้ผู้เรียกจัดการเอง เพื่อไม่กลืน error ทิ้งเงียบๆ (คงพฤติกรรมเดิมของทุกฟังก์ชัน
  //     ที่หน้าเรียกใช้ยังต้อง try-catch เองได้เหมือนเดิม เช่น bookings/page.tsx)
  const runCrudOperation = async <OperationResult,>(
    operation: () => Promise<OperationResult>,
  ): Promise<OperationResult> => {
    setIsLoading(true);
    try {
      return await operation();
    } catch (error) {
      if (isSessionInvalidError(error)) {
        await forceLogoutDueToExpiredSession();
      }
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  // บันทึกงานนวด
  const addOrUpdateBooking = async (booking: Booking): Promise<void> => {
    await runCrudOperation(async () => {
      const username = currentUser?.username || 'system';
      await db.saveBooking(booking, username);
      const list = await db.getBookings();
      setBookings(list);
    });
  };

  const removeBooking = async (id: string): Promise<void> => {
    await runCrudOperation(async () => {
      await db.deleteBooking(id);
      const list = await db.getBookings();
      setBookings(list);
    });
  };

  // บันทึกการขายคอร์ส
  const addOrUpdateCourseSale = async (sale: CourseSale): Promise<void> => {
    await runCrudOperation(async () => {
      const username = currentUser?.username || 'system';
      await db.saveCourseSale(sale, username);
      const list = await db.getCourseSales();
      setCourseSales(list);
    });
  };

  const removeCourseSale = async (id: string): Promise<void> => {
    await runCrudOperation(async () => {
      await db.deleteCourseSale(id);
      const list = await db.getCourseSales();
      setCourseSales(list);
    });
  };

  // ตั้งค่าหมอนวด
  const addOrUpdateTherapist = async (therapist: Therapist): Promise<void> => {
    await runCrudOperation(async () => {
      await db.saveTherapist(therapist);
      const list = await db.getTherapists();
      setTherapists(list);
    });
  };

  const removeTherapist = async (id: string): Promise<void> => {
    await runCrudOperation(async () => {
      await db.deleteTherapist(id);
      const list = await db.getTherapists();
      setTherapists(list);
    });
  };

  // ตั้งค่าเมนูบริการ
  const addOrUpdateService = async (service: Service): Promise<void> => {
    await runCrudOperation(async () => {
      await db.saveService(service);
      const list = await db.getServices();
      setServices(list);
    });
  };

  const removeService = async (id: string): Promise<void> => {
    await runCrudOperation(async () => {
      await db.deleteService(id);
      const list = await db.getServices();
      setServices(list);
    });
  };

  // ตั้งค่าเรทค่ากะดึก
  const updateLateShiftRate = async (rate: number): Promise<void> => {
    await runCrudOperation(async () => {
      await db.saveLateShiftRate(rate);
      setLateShiftRate(rate);
    });
  };

  // จัดการบัญชีผู้ใช้ (Super Manager)
  const addOrUpdateSystemUser = async (user: SystemUser): Promise<void> => {
    await runCrudOperation(async () => {
      await db.saveSystemUser(user);
      const updatedUsers = await db.getSystemUsers();
      setSystemUsers(updatedUsers);

      // หาบัญชีปัจจุบันเพื่อดึงข้อมูลอัปเดตสิทธิ์ตนเอง
      if (currentUser && user.username === currentUser.username) {
        setCurrentUser(user);
        setCurrentRole(user.role);
      }
    });
  };

  const removeSystemUser = async (username: string): Promise<void> => {
    await runCrudOperation(async () => {
      await db.deleteSystemUser(username);
      const list = await db.getSystemUsers();
      setSystemUsers(list);
    });
  };

  // จัดการ Master Data — หมวดหมู่บริการ
  const addOrUpdateServiceCategory = async (category: ServiceCategory): Promise<void> => {
    await runCrudOperation(async () => {
      await db.saveServiceCategory(category);
      const list = await db.getServiceCategories();
      setServiceCategories(list);
    });
  };

  const removeServiceCategory = async (id: string): Promise<void> => {
    await runCrudOperation(async () => {
      await db.deleteServiceCategory(id);
      const list = await db.getServiceCategories();
      setServiceCategories(list);
    });
  };

  // จัดการ Master Data — คอร์สสปา
  const addOrUpdateCourseTemplate = async (template: CourseTemplate): Promise<void> => {
    await runCrudOperation(async () => {
      await db.saveCourseTemplate(template);
      const list = await db.getCourseTemplates();
      setCourseTemplates(list);
    });
  };

  const removeCourseTemplate = async (id: string): Promise<void> => {
    await runCrudOperation(async () => {
      await db.deleteCourseTemplate(id);
      const list = await db.getCourseTemplates();
      setCourseTemplates(list);
    });
  };

  // บันทึกประวัติการหักเบิกต่องวด (ไม่ toggle isLoading เต็มจอ เพราะเกิดขึ้นอัตโนมัติเบื้องหลังตอนเปิดหน้า
  // Payroll — จึงไม่ใช้ runCrudOperation ตรงๆ แต่ยังคงตรวจจับเซสชันหมดอายุเช่นเดียวกับฟังก์ชันอื่น)
  const recordAdvanceDeduction = async (entry: AdvanceDeductionLedgerEntry): Promise<void> => {
    try {
      await db.saveAdvanceDeductionLedgerEntry(entry);
      const list = await db.getAdvanceDeductionLedger();
      setAdvanceDeductionLedger(list);
    } catch (error) {
      if (isSessionInvalidError(error)) {
        await forceLogoutDueToExpiredSession();
      }
      throw error;
    }
  };

  return (
    <AppContext.Provider
      value={{
        currentRole,
        currentUser,
        therapists,
        services,
        bookings,
        courseSales,
        lateShiftRate,
        systemUsers,
        serviceCategories,
        courseTemplates,
        advanceDeductionLedger,
        isInitialLoading,
        isLoading,
        sessionExpiredMessage,
        clearSessionExpiredMessage,
        login,
        logout,
        switchUser,
        addOrUpdateBooking,
        removeBooking,
        addOrUpdateCourseSale,
        removeCourseSale,
        addOrUpdateTherapist,
        removeTherapist,
        addOrUpdateService,
        removeService,
        updateLateShiftRate,
        addOrUpdateSystemUser,
        removeSystemUser,
        addOrUpdateServiceCategory,
        removeServiceCategory,
        addOrUpdateCourseTemplate,
        removeCourseTemplate,
        recordAdvanceDeduction
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
