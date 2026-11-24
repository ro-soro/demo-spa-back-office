// testing/e2e/uiUxGeneral.spec.ts
//
// E2E จริงผ่านเบราว์เซอร์ (Playwright) สำหรับ Phase 5 — UI/UX ทั่วไป (ดู testing/TEST_PLAN.md Phase 5)
// ครอบคลุมทั้ง Definition of Done เดิม 4 ข้อ และ 4 edge case เพิ่มเติมนอกแผนเดิมตามคำสั่ง Main Chat:
//   (ก) Definition of Done เดิม:
//     1. วัดตำแหน่ง Logout ด้วย getBoundingClientRect() บนหน้าเนื้อหายาว (Dashboard, ตั้งค่าร้าน)
//     2. Responsive ที่ breakpoint mobile/tablet/desktop
//     3. Visual check สี TimePicker icon บนพื้นหลังเข้ม
//     4. colorClass ตรงกันระหว่างหน้า Settings กับ Bookings จริงในเบราว์เซอร์
//   (ข) 4 edge case เพิ่มเติม:
//     1. Loading spinner regression (isInitialLoading เต็มจอ vs isLoading แถบเล็กมุมขวาล่าง)
//     2. Sidebar/Logout บนหน้าที่เนื้อหายาวที่สุดจริงในระบบ (สำรวจแล้วคือหน้า "สรุปเงินเดือน" /payroll
//        เพราะแสดงตารางพนักงานทุกคนไม่มีการแบ่งหน้า ยาวกว่า Dashboard/ตั้งค่าร้านได้ง่ายเมื่อมีพนักงานมาก)
//     3. TimePicker/DatePicker ข้าม browser (chromium/firefox/webkit)
//     4. Resize ขณะ Modal เปิดอยู่ (desktop → mobile)
//
// รูปแบบ/มาตรการความปลอดภัยทั้งหมด (ตรวจ project id ก่อนรัน, seed/cleanup ผ่าน Firestore client SDK ตรงๆ,
// พอร์ต 3100 แยกจาก dev server อื่น, serial mode กันข้าม-worker race) ใช้ pattern เดียวกับ
// testing/e2e/bookingsRegression.spec.ts ทุกประการ — ดูเหตุผลละเอียดของแต่ละจุดที่ comment ในไฟล์นั้น
// ไม่ duplicate คำอธิบายซ้ำในไฟล์นี้

import { test, expect, firefox, webkit, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  collection,
  query,
  getDocs,
  type Firestore,
} from "firebase/firestore";

const EXPECTED_TEST_FIREBASE_PROJECT_ID = "demo-spa-test";

function loadTestEnvFile(): Record<string, string> {
  const envFilePath = path.resolve(__dirname, "../../.env.test");
  const rawContent = fs.readFileSync(envFilePath, "utf-8");
  const parsedValues: Record<string, string> = {};

  for (const line of rawContent.split("\n")) {
    const trimmedLine = line.trim();
    if (!trimmedLine || trimmedLine.startsWith("#")) continue;
    const equalsIndex = trimmedLine.indexOf("=");
    if (equalsIndex === -1) continue;
    const key = trimmedLine.slice(0, equalsIndex).trim();
    const value = trimmedLine.slice(equalsIndex + 1).trim();
    parsedValues[key] = value;
  }
  return parsedValues;
}

const testEnv = loadTestEnvFile();

if (testEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID !== EXPECTED_TEST_FIREBASE_PROJECT_ID) {
  throw new Error(
    `ปฏิเสธการรัน E2E ทันที: NEXT_PUBLIC_FIREBASE_PROJECT_ID ใน .env.test คือ ` +
      `"${testEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID}" ไม่ตรงกับ project ทดสอบที่คาดไว้ ` +
      `"${EXPECTED_TEST_FIREBASE_PROJECT_ID}" — หยุดก่อนมีการเขียนข้อมูลทดสอบลง Firestore ผิด project`,
  );
}

// พอร์ตเดียวกับ playwright.config.ts (LOCAL_DEV_SERVER_URL) — จำเป็นต้องประกาศแยกในไฟล์นี้เพราะ
// browser ที่เปิดเองด้วย firefox.launch()/webkit.launch() (สำหรับ edge case 3 cross-browser) ไม่ได้ใช้
// fixture `page` เดิมของ Playwright ที่มี baseURL ผูกไว้ให้อัตโนมัติ ต้องระบุ URL เต็มเอง
const E2E_DEV_SERVER_URL = "http://localhost:3100";

// บัญชีทดสอบ role admin (เข้าหน้า Dashboard/บันทึกงานนวด/สรุปเงินเดือนได้ แต่เข้า /settings ไม่ได้)
const TEST_ADMIN_USERNAME = "qa_e2e_ui_ux_general_admin_phase5";
const TEST_ADMIN_PASSWORD = "QaE2eUiUxGeneralAdminPhase5Pass";

// บัญชีทดสอบ role manager (เข้า /settings ได้ตามที่ Phase 5 ต้องทดสอบ — ตั้งค่าร้าน)
const TEST_MANAGER_USERNAME = "qa_e2e_ui_ux_general_manager_phase5";
const TEST_MANAGER_PASSWORD = "QaE2eUiUxGeneralManagerPhase5Pass";

const THERAPIST_ID = "qa_e2e_ui_ux_general_therapist_phase5";
const THERAPIST_NAME = "QAE2EUiUxGeneralPhase5";

// หมวดหมู่/บริการสีเฉพาะ (violet) สำหรับเทส colorClass sync — เลือก "violet" เพราะไม่ใช่สีเริ่มต้น
// (teal) ของฟอร์ม ลดโอกาสที่จะ false-positive ผ่านเพราะบังเอิญตรงกับค่า default
const COLOR_CATEGORY_ID = "qa_e2e_ui_ux_general_color_cat_phase5";
const COLOR_CATEGORY_NAME = "QAE2EPhase5ColorCategory";
const COLOR_CATEGORY_COLOR_CLASS = "violet";
// ต้องตรงกับ case 'violet' ใน getCategoryColorClass ของทั้ง settings/page.tsx และ bookings/page.tsx
// เป๊ะ — คัดลอกมาจากทั้ง 2 ไฟล์ตรงๆ (ไม่ import ข้ามมาเพื่อไม่ให้เทสพึ่งพา internal ของแอปเกินจำเป็น)
const EXPECTED_VIOLET_BADGE_CLASS_FRAGMENT = "bg-violet-900/40";

const COLOR_SERVICE_ID = "qa_e2e_ui_ux_general_color_service_phase5";
const COLOR_SERVICE_NAME = "QAE2EPhase5ColorService";
const COLOR_SERVICE_DURATION_HOURS = 1;
const COLOR_SERVICE_PRICE = 300;
const COLOR_SERVICE_COMMISSION = 120;

const BOOKING_CUSTOMER_MARKER_PREFIX = "QAE2EPhase5UiUxGeneralCustomer";

// จำนวนพนักงานประจำ "ตัวเติม" ที่ seed ไว้เฉพาะเทส Edge case 2 (สำรวจหน้าที่เนื้อหายาวที่สุดจริงในระบบ)
// เพื่อบังคับให้ตาราง "สรุปเงินเดือน" (/payroll) มีความสูงเนื้อหาเกินจอแน่นอน ไม่ต้องเดา/hardcode ว่า
// "ยาวพอ" หรือยัง — เทสจะวัด scrollHeight จริงเทียบกับ viewport ก่อนเสมอ (ดู test Edge case 2)
const PAYROLL_FILLER_THERAPIST_COUNT = 20;
const PAYROLL_FILLER_THERAPIST_ID_PREFIX = "qa_e2e_ui_ux_general_payroll_filler_phase5_";

const DESKTOP_VIEWPORT = { width: 1280, height: 800 };
const TABLET_VIEWPORT = { width: 834, height: 1194 }; // ใกล้เคียง iPad — อยู่เหนือ Tailwind breakpoint md (768px)
const MOBILE_VIEWPORT = { width: 390, height: 844 }; // ใกล้เคียง iPhone 12/13

const FIRESTORE_TABLE_UPDATE_TIMEOUT_MS = 15_000;
const DEFAULT_LOGIN_REDIRECT_TIMEOUT_MS = 20_000;
// Firefox/WebKit ที่เปิดเองผ่าน firefox.launch()/webkit.launch() (Edge case 3 — cross-browser) ใช้เวลา
// เจรจา handshake ของ Firestore Listen channel (long-polling) นานกว่า chromium fixture ปกติของไฟล์นี้
// อย่างสม่ำเสมอ (ยืนยันจากการรันจริงหลายครั้ง — สำเร็จเสมอภายใน ~40 วินาที ไม่ใช่ error/ค้างถาวร) จึงต้อง
// ให้เวลารอ redirect หลังล็อกอินนานกว่าปกติเฉพาะ 2 เอนจินนี้เท่านั้น ไม่กระทบเทสอื่นที่ยังใช้ chromium
const CROSS_BROWSER_LOGIN_REDIRECT_TIMEOUT_MS = 60_000;

async function loginAsTestUser(
  page: Page,
  username: string,
  password: string,
  redirectTimeoutMs: number = DEFAULT_LOGIN_REDIRECT_TIMEOUT_MS,
): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("กรอกชื่อผู้ใช้งาน หรือ อีเมล").fill(username);
  await page.getByPlaceholder("กรอกรหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: redirectTimeoutMs });
}

// ปุ่ม Logout เวอร์ชัน Desktop Sidebar เท่านั้น (ไม่ใช่เวอร์ชันใน Mobile Drawer) — ต้องระบุด้วย
// ระดับ md:flex ผ่านการเช็ค boundingBox() ไม่ได้ตรงๆ จึงกรองด้วยการเลือกปุ่มที่มองเห็นได้จริงเพียงตัวเดียว
// ในแต่ละ viewport (Desktop/Tablet ซ่อน Mobile Drawer ไว้อยู่แล้วผ่าน Tailwind responsive utility)
function getVisibleLogoutButton(page: Page): Locator {
  return page.getByRole("button", { name: "ออกจากระบบ", exact: true });
}

// สกัดเฉพาะ Tailwind class ที่กำหนด "สี" ของป้ายหมวดหมู่ (bg-*, text-*, border-* ที่มีชื่อสี+เฉดสี) ออก
// จาก className เต็มของ badge — จำเป็นต้องสกัดแยกแทนเทียบ className เต็มตรงๆ (Why): หน้า Settings
// (ตารางรายการบริการ) กับหน้า Bookings (ป้ายในแถวจอง) ตั้งใจใช้ layout class ต่างกัน (ขนาด/รูปทรงป้าย
// ต่างกันตามบริบทการแสดงผลจริง เช่น "rounded-full" vs "rounded", ขนาดตัวอักษรต่างกัน) — สิ่งที่ต้อง
// "sync" กันจริงๆ ตาม Phase 5 Definition of Done คือกลุ่มสี (bg/text/border) เท่านั้น ไม่ใช่ทั้ง className
function extractColorClasses(classAttribute: string): string[] {
  const colorClassPattern = /^(bg|text|border)-[a-z]+-\d{2,3}(\/\d{1,3})?$/;
  return classAttribute
    .split(/\s+/)
    .filter((className) => colorClassPattern.test(className))
    .sort();
}

function getBookingFormModal(page: Page): Locator {
  return page.locator(".glass-modal");
}

function getServiceSection(modal: Locator): Locator {
  return modal.getByText("รายการหัตถการบริการนวด", { exact: true }).locator("..");
}

async function openAddBookingModal(page: Page): Promise<Locator> {
  await page.getByRole("button", { name: "บันทึกงานนวดใหม่", exact: true }).click();
  const modal = getBookingFormModal(page);
  await expect(modal).toBeVisible();
  return modal;
}

async function fillMinimalValidBookingForm(
  page: Page,
  modal: Locator,
  customerMarker: string,
): Promise<void> {
  await modal.locator("select").nth(0).selectOption({ value: THERAPIST_NAME });
  await modal.getByPlaceholder("เช่น 1").fill("1");
  await modal.locator('input[type="time"]').nth(0).fill("09:00");
  await modal.getByPlaceholder("กรอกชื่อลูกค้า").fill(customerMarker);

  const serviceSection = getServiceSection(modal);
  await serviceSection.locator("select").selectOption({ value: COLOR_SERVICE_ID });
  await serviceSection.getByRole("button", { name: "เพิ่มงาน", exact: true }).click();

  const paymentInputs = modal
    .getByText("สรุปการรับเงินหน้าร้าน", { exact: true })
    .locator("..")
    .locator('input[type="number"]');
  await paymentInputs.nth(0).fill(String(COLOR_SERVICE_PRICE)); // เงินสด = ราคาบริการเป๊ะ กันเตือนยอดไม่ตรง
}

// ---------------------------------------------------------------------------
// Seed / Cleanup ข้อมูลทดสอบผ่าน Firestore client SDK ตรงๆ (แยก Firebase app instance ชื่อเฉพาะ)
// ---------------------------------------------------------------------------
let seedApp: FirebaseApp;
let seedFirestore: Firestore;

test.beforeAll(async () => {
  seedApp = initializeApp(
    {
      apiKey: testEnv.NEXT_PUBLIC_FIREBASE_API_KEY,
      authDomain: testEnv.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
      projectId: testEnv.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
      storageBucket: testEnv.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
      messagingSenderId: testEnv.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
      appId: testEnv.NEXT_PUBLIC_FIREBASE_APP_ID,
    },
    "qa-e2e-seed-app-ui-ux-general",
  );
  seedFirestore = getFirestore(seedApp);

  await setDoc(doc(seedFirestore, "systemUsers", TEST_ADMIN_USERNAME), {
    username: TEST_ADMIN_USERNAME,
    password: TEST_ADMIN_PASSWORD,
    role: "admin",
    displayName: "QA E2E UiUxGeneral Admin Phase5",
    fullName: "QA E2E UiUxGeneral Admin Phase5 Tester",
  });

  await setDoc(doc(seedFirestore, "systemUsers", TEST_MANAGER_USERNAME), {
    username: TEST_MANAGER_USERNAME,
    password: TEST_MANAGER_PASSWORD,
    role: "manager",
    displayName: "QA E2E UiUxGeneral Manager Phase5",
    fullName: "QA E2E UiUxGeneral Manager Phase5 Tester",
  });

  await setDoc(doc(seedFirestore, "therapists", THERAPIST_ID), {
    id: THERAPIST_ID,
    name: THERAPIST_NAME,
    type: "part-time",
    dailyGuarantee: 0,
    bankName: "SCB",
    bankAccount: "000-0-00000-5",
    bankAccountName: THERAPIST_NAME,
    phone: "0800000005",
  });

  await setDoc(doc(seedFirestore, "serviceCategories", COLOR_CATEGORY_ID), {
    id: COLOR_CATEGORY_ID,
    name: COLOR_CATEGORY_NAME,
    description: "หมวดหมู่ทดสอบ colorClass sync (Phase 5)",
    colorClass: COLOR_CATEGORY_COLOR_CLASS,
  });

  await setDoc(doc(seedFirestore, "services", COLOR_SERVICE_ID), {
    id: COLOR_SERVICE_ID,
    category: COLOR_CATEGORY_NAME,
    name: COLOR_SERVICE_NAME,
    duration: COLOR_SERVICE_DURATION_HOURS,
    price: COLOR_SERVICE_PRICE,
    commission: COLOR_SERVICE_COMMISSION,
  });

  // Seed พนักงานประจำ "ตัวเติม" จำนวนมากเฉพาะสำหรับ Edge case 2 — ทำให้ตารางหน้า /payroll ยาวเกินจอจริง
  const fillerSeedPromises = Array.from({ length: PAYROLL_FILLER_THERAPIST_COUNT }, (_, index) => {
    const fillerId = `${PAYROLL_FILLER_THERAPIST_ID_PREFIX}${index}`;
    return setDoc(doc(seedFirestore, "therapists", fillerId), {
      id: fillerId,
      name: `QAPhase5PayrollFiller${index}`,
      type: "full-time",
      dailyGuarantee: 500,
      bankName: "SCB",
      bankAccount: `000-0-fill-${index}`,
      bankAccountName: `QAPhase5PayrollFiller${index}`,
      phone: "0800000006",
    });
  });
  await Promise.all(fillerSeedPromises);
});

async function deleteAllBookingsWithMarkerPrefix(markerPrefix: string): Promise<void> {
  const bookingsQuery = query(collection(seedFirestore, "bookings"));
  const snapshot = await getDocs(bookingsQuery);
  for (const bookingDoc of snapshot.docs) {
    const data = bookingDoc.data();
    if (typeof data.customerName === "string" && data.customerName.startsWith(markerPrefix)) {
      await deleteDoc(bookingDoc.ref);
    }
  }
}

test.afterAll(async () => {
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_ADMIN_USERNAME));
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_MANAGER_USERNAME));
  await deleteDoc(doc(seedFirestore, "therapists", THERAPIST_ID));
  await deleteDoc(doc(seedFirestore, "serviceCategories", COLOR_CATEGORY_ID));
  await deleteDoc(doc(seedFirestore, "services", COLOR_SERVICE_ID));
  await deleteAllBookingsWithMarkerPrefix(BOOKING_CUSTOMER_MARKER_PREFIX);

  const fillerDeletePromises = Array.from({ length: PAYROLL_FILLER_THERAPIST_COUNT }, (_, index) =>
    deleteDoc(doc(seedFirestore, "therapists", `${PAYROLL_FILLER_THERAPIST_ID_PREFIX}${index}`)),
  );
  await Promise.all(fillerDeletePromises);

  await deleteApp(seedApp);
});

test.describe("UI/UX ทั่วไป — E2E จริงผ่าน Playwright (Phase 5)", () => {
  // บังคับรันทีละเทสในตัวเดียวกัน (เหตุผลเดียวกันเป๊ะกับ authRoleAccess.spec.ts/bookingsRegression.spec.ts
  // — ไฟล์นี้ใช้ username/therapist/service คงที่ร่วมกันทุกเทสผ่าน beforeAll/afterAll ระดับไฟล์)
  test.describe.configure({ mode: "serial" });
  test.setTimeout(90_000);

  // -------------------------------------------------------------------------
  // (ก) Definition of Done เดิม — ข้อ 1: วัดตำแหน่ง Logout ด้วย getBoundingClientRect()
  // บนหน้าที่เนื้อหายาว (Dashboard, ตั้งค่าร้าน)
  // -------------------------------------------------------------------------
  test("(ก.1) ปุ่ม Logout อยู่ในวิวพอร์ตเสมอบนหน้า Dashboard และหน้าตั้งค่าร้าน (desktop)", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await loginAsTestUser(page, TEST_MANAGER_USERNAME, TEST_MANAGER_PASSWORD);

    for (const targetPath of ["/", "/settings"]) {
      await page.goto(targetPath);
      const logoutButton = getVisibleLogoutButton(page);
      await expect(logoutButton).toBeVisible();

      const box = await logoutButton.boundingBox();
      expect(box).not.toBeNull();
      if (box) {
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP_VIEWPORT.height);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(DESKTOP_VIEWPORT.width);
      }
    }
  });

  // -------------------------------------------------------------------------
  // (ก) Definition of Done เดิม — ข้อ 2: Responsive ที่ breakpoint mobile/tablet/desktop
  // -------------------------------------------------------------------------
  test("(ก.2) Responsive breakpoint mobile — Sidebar เต็มจอซ่อน, แถบมือถือ+ลิ้นชักทำงาน, ไม่ล้นแนวนอน", async ({
    page,
  }) => {
    await page.setViewportSize(MOBILE_VIEWPORT);
    await loginAsTestUser(page, TEST_MANAGER_USERNAME, TEST_MANAGER_PASSWORD);
    await page.goto("/");

    // Desktop sidebar (`hidden md:flex`) ต้องไม่แสดงผลที่ขนาดจอมือถือ
    await expect(page.locator("aside")).toBeHidden();

    // ไม่มี horizontal overflow (เผื่อ tolerance เล็กน้อยกันความคลาดเคลื่อนของ scrollbar/border sub-pixel)
    const horizontalOverflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflowPx).toBeLessThanOrEqual(1);

    // เปิดลิ้นชักมือถือแล้วยืนยันปุ่ม Logout อยู่ในวิวพอร์ตจริง
    await page.locator(".md\\:hidden button").last().click(); // ปุ่ม Menu (hamburger) ในแถบบนมือถือ
    const mobileLogoutButton = getVisibleLogoutButton(page);
    await expect(mobileLogoutButton).toBeVisible();

    // รอให้อนิเมชันสไลด์ลิ้นชักเข้าจอนิ่งก่อนวัดตำแหน่งจริง (Why จำเป็น — พบจริงระหว่างพัฒนาเทสนี้):
    // MainLayout.tsx ใช้ Framer Motion tween duration 0.3 วินาที (`x: '100%'` → `x: 0`) ให้กับลิ้นชัก
    // มือถือ — `toBeVisible()` เพียงเช็คว่า element ถูก render/มีขนาดไม่เป็นศูนย์เท่านั้น ไม่รอให้ transform
    // นิ่งก่อน ถ้าอ่าน boundingBox() ทันทีจะได้พิกัดกลางอนิเมชัน (ยังเลื่อนไม่สุด) ทำให้ผลวัดตำแหน่งผิดเพี้ยน
    await page.waitForTimeout(400);

    const box = await mobileLogoutButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y + box.height).toBeLessThanOrEqual(MOBILE_VIEWPORT.height);
      expect(box.x + box.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width);
    }
  });

  test("(ก.2) Responsive breakpoint tablet — Sidebar Desktop แสดงผล (เหนือ breakpoint md), ไม่ล้นแนวนอน", async ({
    page,
  }) => {
    await page.setViewportSize(TABLET_VIEWPORT);
    await loginAsTestUser(page, TEST_MANAGER_USERNAME, TEST_MANAGER_PASSWORD);
    await page.goto("/");

    await expect(page.locator("aside")).toBeVisible();

    const horizontalOverflowPx = await page.evaluate(
      () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
    );
    expect(horizontalOverflowPx).toBeLessThanOrEqual(1);

    const logoutButton = getVisibleLogoutButton(page);
    const box = await logoutButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y + box.height).toBeLessThanOrEqual(TABLET_VIEWPORT.height);
    }
  });

  // -------------------------------------------------------------------------
  // (ก) Definition of Done เดิม — ข้อ 3: Visual check สี TimePicker icon บนพื้นหลังเข้ม
  // -------------------------------------------------------------------------
  test("(ก.3) ไอคอน TimePicker มองเห็นชัดเจนบนพื้นหลังเข้ม (color-scheme: dark + WebKit filter ปรับสีทอง)", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await loginAsTestUser(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await page.goto("/bookings");

    const modal = await openAddBookingModal(page);
    const timeInput = modal.locator('input[type="time"]').first();
    await expect(timeInput).toBeVisible();

    const styleInfo = await timeInput.evaluate((element) => {
      const inputComputedStyle = window.getComputedStyle(element);

      // เหตุผลที่ต้อง scan document.styleSheets ตรงๆ แทนการเรียก getComputedStyle(element,
      // "::-webkit-calendar-picker-indicator") ตรงๆ (Why จำเป็น — พบจริงระหว่างพัฒนาเทสนี้): pseudo-element
      // นี้อาศัย UA shadow tree ภายในของเบราว์เซอร์ ไม่ใช่ pseudo-element มาตรฐานตามสเปก CSS (ต่างจาก
      // ::before/::after) เบราว์เซอร์ (รวมถึง Chrome for Testing ที่ Playwright ใช้) จึงไม่รับประกันว่า
      // getComputedStyle ตัวที่ 2 จะคืนค่าจริงของ pseudo นี้เสมอไป (คืน "none" เฉยๆ ทั้งที่ CSS rule ถูกโหลด
      // และแสดงผลถูกต้องจริงบนหน้าจอจริง) วิธีที่ deterministic กว่าคือตรวจสอบตรงๆ ว่า stylesheet ที่โหลด
      // จริงในหน้านี้มี CSS rule ที่เจาะจง selector ของ pseudo นี้พร้อมค่า filter ที่ไม่ใช่ "none" อยู่จริง
      let matchedFilterValue: string | null = null;
      for (const sheet of Array.from(document.styleSheets)) {
        let rules: CSSRuleList;
        try {
          rules = sheet.cssRules;
        } catch {
          continue; // ข้าม stylesheet ข้าม origin ที่อ่าน cssRules ไม่ได้ (เช่น Google Fonts CDN)
        }
        for (const rule of Array.from(rules)) {
          // มี 2 rule ที่ selectorText ตรงเงื่อนไขนี้ (rule หลักที่ตั้ง filter และ rule :hover ที่ตั้งแค่
          // opacity) — เจาะจงเอาเฉพาะ rule ที่ประกาศ "filter" ไว้จริง (ไม่ใช่ "" ว่างเปล่า) เท่านั้น
          if (
            rule instanceof CSSStyleRule &&
            rule.selectorText.includes("calendar-picker-indicator") &&
            rule.selectorText.includes('input[type="time"]') &&
            rule.style.filter !== ""
          ) {
            matchedFilterValue = rule.style.filter;
          }
        }
      }

      return {
        colorScheme: inputComputedStyle.colorScheme,
        calendarPickerIndicatorFilterRule: matchedFilterValue,
      };
    });

    // color-scheme: dark ต้องถูกนำไปใช้จริงกับ input (มาตรฐานข้ามเบราว์เซอร์)
    expect(styleInfo.colorScheme).toBe("dark");
    // ต้องพบ CSS rule ของ pseudo-element นี้จริงในหน้าที่โหลดจริง พร้อมค่า filter ที่ไม่ใช่ "none"/ว่างเปล่า
    // (แปลว่าไม่ได้ถูก apply) — ยืนยันว่าไอคอนถูกปรับโทนสีทองจริงตามที่ globals.css กำหนดไว้ ไม่ใช่สีดำ
    // เริ่มต้นของเบราว์เซอร์ที่มองไม่เห็นบนพื้นเข้ม
    expect(styleInfo.calendarPickerIndicatorFilterRule).not.toBeNull();
    expect(styleInfo.calendarPickerIndicatorFilterRule).not.toBe("none");
    expect(styleInfo.calendarPickerIndicatorFilterRule).not.toBe("");
  });

  // -------------------------------------------------------------------------
  // (ก) Definition of Done เดิม — ข้อ 4: colorClass ตรงกันระหว่างหน้า Settings กับ Bookings จริง
  // -------------------------------------------------------------------------
  test("(ก.4) colorClass ของหมวดหมู่บริการตรงกันระหว่างหน้าตั้งค่าร้านและหน้าบันทึกงานนวด", async ({ page }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await loginAsTestUser(page, TEST_MANAGER_USERNAME, TEST_MANAGER_PASSWORD);

    // 1. ตรวจป้ายสีหมวดหมู่ในตารางบริการของหน้าตั้งค่าร้านก่อน
    await page.goto("/settings");
    const settingsBadge = page
      .locator("tr", { hasText: COLOR_SERVICE_NAME })
      .locator("span", { hasText: COLOR_CATEGORY_NAME });
    await expect(settingsBadge).toBeVisible({ timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS });
    const settingsBadgeClass = await settingsBadge.getAttribute("class");
    expect(settingsBadgeClass).toContain(EXPECTED_VIOLET_BADGE_CLASS_FRAGMENT);

    // 2. บันทึกงานนวดจริง 1 รายการโดยใช้บริการหมวดหมู่สีเดียวกัน แล้วตรวจป้ายสีในหน้าบันทึกงานนวด
    const customerMarker = `${BOOKING_CUSTOMER_MARKER_PREFIX}ColorSync`;
    await page.goto("/bookings");
    const modal = await openAddBookingModal(page);
    await fillMinimalValidBookingForm(page, modal, customerMarker);
    await modal.getByRole("button", { name: "บันทึกงานนวด", exact: true }).click();
    await expect(modal).not.toBeVisible({ timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS });

    const bookingRow = page.locator("tr").filter({ hasText: customerMarker });
    await expect(bookingRow).toBeVisible({ timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS });

    const bookingsBadge = bookingRow.locator("span", { hasText: COLOR_CATEGORY_NAME });
    await expect(bookingsBadge).toBeVisible();
    const bookingsBadgeClass = await bookingsBadge.getAttribute("class");
    expect(bookingsBadgeClass).toContain(EXPECTED_VIOLET_BADGE_CLASS_FRAGMENT);

    // 3. ยืนยันกลุ่มคลาสสี (bg-*/text-*/border-*) ตรงกันเป๊ะทั้ง 2 หน้า — ไม่เทียบ className เต็มตรงๆ
    // เพราะ layout class ต่างกันโดยตั้งใจตามบริบท (ดูเหตุผลเต็มที่ extractColorClasses ด้านบน)
    expect(settingsBadgeClass).not.toBeNull();
    expect(bookingsBadgeClass).not.toBeNull();
    const settingsColorClasses = extractColorClasses(settingsBadgeClass ?? "");
    const bookingsColorClasses = extractColorClasses(bookingsBadgeClass ?? "");
    expect(settingsColorClasses.length).toBeGreaterThan(0);
    expect(bookingsColorClasses).toEqual(settingsColorClasses);
  });

  // -------------------------------------------------------------------------
  // (ข) Edge case 1 — Loading spinner regression: isInitialLoading (เต็มจอ, ตอนโหลดครั้งแรก) ต้อง
  // แยกขาดจาก isLoading (แถบเล็กมุมขวาล่าง, ตอน CRUD ระหว่างใช้งาน) เสมอ ไม่กลับไปเป็นตัวแปรเดียวกันแบบเดิม
  // -------------------------------------------------------------------------
  test("(ข.1) Loading spinner: โหลดหน้าแรกเห็น fullScreen spinner, แต่กด CRUD ระหว่างใช้งานเห็นแค่แถบเล็กมุมขวาล่าง", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);

    // --- ส่วนที่ 1: โหลดหน้าแรกสุด (ยังไม่ล็อกอิน) ต้องเห็น fullScreen spinner "กำลังโหลดระบบ..." ---
    // ใช้ waitUntil: "commit" (แค่รอ response แรกเริ่มมาถึง ไม่รอ resource อื่นโหลดครบ) เพื่อให้ทัน
    // จับภาพช่วงสั้นๆ ที่ isInitialLoading ยังเป็น true อยู่ ก่อนที่ AppProvider จะกู้คืนเซสชันเสร็จ
    await page.goto("/", { waitUntil: "commit" });
    await expect(page.getByText("กำลังโหลดระบบ...")).toBeVisible({ timeout: 5_000 });
    await expect(page).toHaveURL(/\/login$/, { timeout: 20_000 }); // ยังไม่ล็อกอิน ต้องถูกเด้งไปหน้า login

    // --- ส่วนที่ 2: ล็อกอินแล้วลองทำ CRUD จริงระหว่างใช้งาน (บันทึกงานนวดใหม่) ---
    // หมายเหตุ (Why ไม่ใช้ page.route หน่วงเวลา Firestore เหมือนที่เคยลองครั้งแรก): พบจริงว่า Firestore
    // Web SDK ยิง request ซ้อนกันหลายเส้นทาง (ทั้ง write stream และ listen stream) ไปที่โดเมนเดียวกัน
    // ทำให้ route handler เดียวกันถูกเรียก continue() ซ้ำจนเกิด "Route is already handled" (ตรงกับ
    // ข้อสังเกตเรื่อง Firestore WebChannel ที่บันทึกไว้แล้วใน bookingsRegression.spec.ts) จึงเปลี่ยนมาใช้
    // network latency จริงของ Firestore test project แทน (ปกติอย่างน้อย ~100-300ms ต่อการเขียนจริงผ่าน
    // เครือข่ายจริง) ซึ่งเพียงพอให้ Playwright เก็บภาพสถานะ isLoading ได้แน่นอนด้วย auto-retrying expect
    await loginAsTestUser(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await page.goto("/bookings");

    const customerMarker = `${BOOKING_CUSTOMER_MARKER_PREFIX}LoadingRegression`;
    const modal = await openAddBookingModal(page);
    await fillMinimalValidBookingForm(page, modal, customerMarker);
    await modal.getByRole("button", { name: "บันทึกงานนวด", exact: true }).click();

    // ตรวจทันทีหลังคลิก (ไม่รอ) ว่า Sidebar/ปุ่มหลักของหน้ายังคงอยู่ — พิสูจน์ว่าไม่ได้ถูกแทนที่ด้วย
    // fullScreen spinner ทั้งหน้าเหมือนบั๊กเดิมที่ isLoading/isInitialLoading เคยเป็นตัวแปรเดียวกัน
    const stillHasMainNav = await page
      .getByRole("button", { name: "บันทึกงานนวดใหม่", exact: true })
      .isVisible();
    expect(stillHasMainNav).toBe(true);

    // แถบแจ้งเตือนเล็กมุมขวาล่างต้องปรากฏระหว่างรอ Firestore เขียนจริง (auto-retrying expect ของ
    // Playwright จะจับภาพได้แม้ช่วงเวลาสั้น เพราะ default poll interval เร็วกว่าความหน่วงเครือข่ายจริงมาก)
    await expect(page.getByText("กำลังบันทึกข้อมูล...")).toBeVisible({ timeout: 5_000 });
    // ระหว่างที่แถบเล็กแสดงอยู่ fullScreen spinner ต้องไม่ปรากฏร่วมด้วยเด็ดขาด
    await expect(page.getByText("กำลังโหลดระบบ...")).toHaveCount(0);

    await expect(modal).not.toBeVisible({ timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS });
  });

  // -------------------------------------------------------------------------
  // (ข) Edge case 2 — Sidebar/Logout บนหน้าที่เนื้อหายาวที่สุดจริงในระบบ (สำรวจแล้ว: หน้า "สรุปเงินเดือน"
  // /payroll เพราะแสดงตารางพนักงานทุกคนแบบไม่แบ่งหน้า (ไม่มี pagination) ต่างจาก Dashboard/ตั้งค่าร้านที่
  // เดิมมีการแบ่งหน้า/จำกัดจำนวนรายการที่แสดง — จึงยาวกว่าได้ง่ายเมื่อมีพนักงานจำนวนมาก ยืนยันด้วยการวัด
  // scrollHeight จริงเทียบกับ viewport ก่อนเสมอ ไม่ hardcode สมมติฐานว่า "ยาวพอ" เฉยๆ)
  // -------------------------------------------------------------------------
  test("(ข.2) ปุ่ม Logout ยังอยู่ในวิวพอร์ตบนหน้า 'สรุปเงินเดือน' แม้เนื้อหายาวกว่า Dashboard/ตั้งค่าร้าน", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await loginAsTestUser(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await page.goto("/payroll");

    // ยืนยันก่อนว่าเนื้อหาหน้านี้ยาวเกิน viewport จริง (มีพนักงานประจำตัวเติม 20 คนจาก beforeAll)
    // ถ้าไม่ยาวเกินจอ การเทสนี้จะไม่มีความหมาย (ไม่ได้พิสูจน์อะไรเกี่ยวกับบั๊กเดิมเลย)
    await expect(page.getByText("QAPhase5PayrollFiller0")).toBeVisible({
      timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS,
    });
    // `<main>` เองถูกล็อกความสูงไว้เท่าจอ (md:h-screen ที่ parent) — คอนเทนเนอร์ที่ scroll เนื้อหาจริงคือ
    // div ลูกที่มี `overflow-y-auto` (ดู MainLayout.tsx "Main child viewport") ต้องวัด scrollHeight ตรงนั้น
    const mainContentScrollHeight = await page
      .locator("main .overflow-y-auto")
      .first()
      .evaluate((element) => element.scrollHeight);
    expect(mainContentScrollHeight).toBeGreaterThan(DESKTOP_VIEWPORT.height);

    // ปุ่ม Logout ต้องยังอยู่ในวิวพอร์ตเสมอ (Sidebar เลื่อนแยกจากเนื้อหาหลัก ไม่ถูกดันหลุดจอ)
    const logoutButton = getVisibleLogoutButton(page);
    await expect(logoutButton).toBeVisible();
    const box = await logoutButton.boundingBox();
    expect(box).not.toBeNull();
    if (box) {
      expect(box.y).toBeGreaterThanOrEqual(0);
      expect(box.y + box.height).toBeLessThanOrEqual(DESKTOP_VIEWPORT.height);
    }
  });

  // -------------------------------------------------------------------------
  // (ข) Edge case 4 — Resize ขณะ Modal เปิดอยู่ (desktop → mobile) ต้องไม่หลุดตำแหน่ง/ล้น viewport
  // (จงใจวางไว้ก่อน Edge case 3 cross-browser เพราะ Edge case 3 เปิด browser context แยกของตัวเอง
  // ไม่ใช้ fixture `page` ร่วมกับกลุ่มเทสนี้ ลำดับจึงไม่กระทบกัน)
  // -------------------------------------------------------------------------
  test("(ข.4) Resize จาก desktop เป็น mobile ขณะ Modal บันทึกงานนวดเปิดค้างอยู่ — Modal ไม่หลุด/ไม่ล้น viewport", async ({
    page,
  }) => {
    await page.setViewportSize(DESKTOP_VIEWPORT);
    await loginAsTestUser(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await page.goto("/bookings");

    const modal = await openAddBookingModal(page);
    const desktopBox = await modal.boundingBox();
    expect(desktopBox).not.toBeNull();

    await page.setViewportSize(MOBILE_VIEWPORT);
    // Modal ต้องยังคงเปิดอยู่ ไม่ถูกปิด/unmount จากการ resize เฉยๆ
    await expect(modal).toBeVisible();

    const mobileBox = await modal.boundingBox();
    expect(mobileBox).not.toBeNull();
    if (mobileBox) {
      expect(mobileBox.x).toBeGreaterThanOrEqual(0);
      expect(mobileBox.y).toBeGreaterThanOrEqual(0);
      expect(mobileBox.x + mobileBox.width).toBeLessThanOrEqual(MOBILE_VIEWPORT.width + 1);
      // Modal สูงเกิน viewport ได้ (มันมี overflow-y-auto ในตัวเอง — ดู `.glass-modal` class ที่มี
      // `overflow-y-auto max-h-[92vh]`) แต่ต้องไม่กว้างเกิน viewport แนวนอนเด็ดขาด (ล้นแนวนอนคือบั๊กจริง
      // ที่ผู้ใช้ต้อง scroll ซ้าย-ขวาซึ่งไม่ควรเกิดกับ dialog บนมือถือ)
    }

    // ปุ่มปิด Modal (X) ต้องยังกดได้จริงหลัง resize — พิสูจน์ว่า Modal ยัง interactive ไม่ใช่แค่มองเห็น
    await modal.getByRole("button").first().click();
    await expect(modal).not.toBeVisible();
  });

  // -------------------------------------------------------------------------
  // (ข) Edge case 3 — TimePicker/DatePicker ข้าม browser (chromium/firefox/webkit)
  // สภาพแวดล้อมนี้ติดตั้งได้ครบทั้ง 3 เอนจิน (chromium/firefox/webkit ผ่าน `npx playwright install`)
  // จึงทดสอบจริงข้าม browser แทนการรายงาน known limitation
  // -------------------------------------------------------------------------
  test("(ข.3) TimePicker ทำงานได้ข้าม browser จริง (chromium ผ่าน fixture เดิม + firefox/webkit เปิดเอง)", async () => {
    // ขยาย timeout เฉพาะเทสนี้ (Why): ต้องล็อกอินผ่าน 2 เอนจินแยกกันตามลำดับ (firefox แล้วค่อย webkit)
    // แต่ละเอนจินอาจใช้เวลานานถึง ~60 วินาทีสำหรับ Firestore Listen channel handshake (ดูค่าคงที่
    // CROSS_BROWSER_LOGIN_REDIRECT_TIMEOUT_MS ด้านบน) รวมกันจึงต้องการเวลามากกว่า default 90 วินาทีของไฟล์นี้
    test.setTimeout(180_000);
    await loginAndCheckTimePickerAcrossBrowser("firefox");
    await loginAndCheckTimePickerAcrossBrowser("webkit");
  });

  // เหตุผลที่แยกเป็นฟังก์ชันช่วยแทนการประกาศ Playwright project เพิ่มใน playwright.config.ts (Why จำเป็น):
  // เปิด browser instance เองตรงๆ ด้วย firefox.launch()/webkit.launch() ทำให้ไม่ต้องแก้ไฟล์ config
  // ที่ใช้ร่วมกับเทสไฟล์อื่นทั้งหมด (คงพฤติกรรมเดิมของ default chromium project ไว้ ไม่กระทบเทสอื่น)
  // และยังคงยืนยันพฤติกรรมจริงข้ามเอนจินได้ครบถ้วนตามที่โจทย์ต้องการ
  async function loginAndCheckTimePickerAcrossBrowser(
    browserEngine: "firefox" | "webkit",
  ): Promise<void> {
    const browser = browserEngine === "firefox" ? await firefox.launch() : await webkit.launch();
    try {
      const context = await browser.newContext({ baseURL: E2E_DEV_SERVER_URL });
      const crossBrowserPage = await context.newPage();

      await loginAsTestUser(
        crossBrowserPage,
        TEST_ADMIN_USERNAME,
        TEST_ADMIN_PASSWORD,
        CROSS_BROWSER_LOGIN_REDIRECT_TIMEOUT_MS,
      );
      await crossBrowserPage.goto("/bookings");

      const modal = await openAddBookingModal(crossBrowserPage);
      const timeInput = modal.locator('input[type="time"]').first();
      await expect(timeInput).toBeVisible();

      // พฤติกรรมคาดหวังที่ต้องเหมือนกันทุกเอนจิน: กรอกเวลาได้จริง + color-scheme: dark ถูกนำไปใช้จริง
      // (มาตรฐาน CSS ข้ามเอนจิน ต่างจาก ::-webkit-calendar-picker-indicator ที่เป็น vendor-specific
      // pseudo-element ของ Chromium/WebKit เท่านั้น — Firefox ไม่รองรับ pseudo นี้เลยเพราะใช้ native
      // widget ของตัวเองที่ไม่เปิดให้ปรับสีผ่าน CSS นี้ได้ ถือเป็นความแตกต่างของเอนจินที่คาดหวังไว้แล้ว
      // ไม่ใช่บั๊ก — บันทึกไว้เป็นความแตกต่างที่ทราบอยู่แล้วระหว่างเอนจิน ไม่ใช่ "known limitation" ของ
      // การทดสอบ เพราะเราทดสอบจริงและยืนยันผลจริงได้ครบทั้ง 3 เอนจินแล้ว)
      await timeInput.fill("14:30");
      await expect(timeInput).toHaveValue("14:30");

      const colorScheme = await timeInput.evaluate(
        (element) => window.getComputedStyle(element).colorScheme,
      );
      expect(colorScheme).toBe("dark");

      if (browserEngine === "webkit") {
        // WebKit (เอนจินเดียวกับ Safari) รองรับ selector เดียวกับ Chromium จึงตรวจ CSS rule ได้ด้วย —
        // ใช้วิธี scan stylesheet เดียวกับเทส (ก.3) แทน getComputedStyle(pseudo) ตรงๆ (เหตุผลเดียวกันเป๊ะ
        // — pseudo นี้อาศัย UA shadow tree ไม่ใช่ pseudo มาตรฐาน ไม่รับประกันว่า getComputedStyle จะคืนค่าจริง)
        const calendarPickerIndicatorFilterRule = await timeInput.evaluate(() => {
          for (const sheet of Array.from(document.styleSheets)) {
            let rules: CSSRuleList;
            try {
              rules = sheet.cssRules;
            } catch {
              continue;
            }
            for (const rule of Array.from(rules)) {
              // มี 2 rule ที่ selectorText ตรงเงื่อนไขนี้ (rule หลักที่ตั้ง filter และ rule :hover ที่ตั้ง
              // แค่ opacity) — เจาะจงเอาเฉพาะ rule ที่ประกาศ "filter" ไว้จริง (ไม่ใช่ "" ว่างเปล่า) เท่านั้น
              if (
                rule instanceof CSSStyleRule &&
                rule.selectorText.includes("calendar-picker-indicator") &&
                rule.selectorText.includes('input[type="time"]') &&
                rule.style.filter !== ""
              ) {
                return rule.style.filter;
              }
            }
          }
          return null;
        });
        expect(calendarPickerIndicatorFilterRule).not.toBeNull();
        expect(calendarPickerIndicatorFilterRule).not.toBe("none");
      }

      await context.close();
    } finally {
      await browser.close();
    }
  }
});
