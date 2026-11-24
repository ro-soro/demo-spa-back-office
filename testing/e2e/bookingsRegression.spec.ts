// testing/e2e/bookingsRegression.spec.ts
//
// E2E จริงผ่านเบราว์เซอร์ (Playwright) สำหรับ Phase 3 — Regression: บั๊กที่เพิ่งแก้ (ดู testing/TEST_PLAN.md
// Phase 3) ครอบคลุมสถานการณ์ที่ Main Chat สั่งให้ทดสอบจริงผ่านเบราว์เซอร์ + Firestore test project จริง
// (ไม่ใช่แค่ RTL substitute ที่ทำไปแล้วใน testing/unit/bookingsPageRegression.test.tsx):
//   (ก) 1. ทำซ้ำสถานการณ์จริงที่เคยเจอบั๊ก — ล้างช่องบัตรเครดิตแล้วกรอกเงินสด/โอนแทน ต้องไม่มี error หายเงียบ
//       2. บังคับ Firestore write ล้มเหลวจริง (ตัด request ที่ยิงไป firestore.googleapis.com) ตอนสร้างใหม่
//          ต้องเห็น error ชัดเจนบนเบราว์เซอร์จริง และฟอร์มไม่ปิดเอง
//   (ค) 1. Double-submit จริง — คลิกปุ่มบันทึกรัวๆ ติดกันด้วย mouse click จริง (ไม่ใช่ locator.click() ที่
//          Playwright การันตีรอปุ่ม enabled ก่อนเสมอ) แล้วยืนยันด้วยการ query Firestore ตรงๆ ว่าไม่มีเอกสาร
//          booking ซ้ำเกิดขึ้นจริง
//       3. บังคับ Firestore write ล้มเหลวจริงตอนแก้ไข booking เดิม (ไม่ใช่สร้างใหม่) — query Firestore
//          ตรงๆ หลังจบเทสยืนยันว่าเอกสารเดิมไม่ถูก overwrite ด้วยค่าครึ่งๆ กลางๆ
//
// รูปแบบ/มาตรการความปลอดภัยทั้งหมด (ตรวจ project id ก่อนรัน, seed/cleanup ผ่าน Firestore client SDK ตรงๆ,
// พอร์ต 3100 แยกจาก dev server อื่น) ใช้ pattern เดียวกับ testing/e2e/bookingFinancialCalculations.spec.ts
// ทุกประการ — ดูเหตุผลละเอียดของแต่ละจุดได้ที่ comment ในไฟล์นั้น ไม่ duplicate คำอธิบายซ้ำในไฟล์นี้

import { test, expect, type Locator, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  doc,
  getDoc,
  setDoc,
  deleteDoc,
  collection,
  query,
  where,
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

const TEST_USERNAME = "qa_e2e_booking_regression_tester";
const TEST_PASSWORD = "QaE2ePassword123";

const THERAPIST_ID = "qa_e2e_therapist_booking_regression";
const THERAPIST_NAME = "QAE2EBookingRegression";

const SERVICE_ID = "qa_e2e_service_booking_regression";
const SERVICE_NAME = "QAE2EServiceRegression";
const SERVICE_DURATION_HOURS = 1;
const SERVICE_PRICE = 400;
const SERVICE_COMMISSION = 180;

const BOOKING_CUSTOMER_MARKER_PREFIX = "QAE2EPhase3RegressionCustomer";

// Timeout ที่ยาวกว่า default ของ Playwright (5_000ms) สำหรับจุดที่ต้องรอ "แถวจองในตาราง" ปรากฏ/อัปเดต
// หลัง Firestore เขียน/อ่านเสร็จ (Why จำเป็น — พบจริงจากการรัน E2E suite ทั้งหมดพร้อมกันแบบ parallel
// หลายรอบ: ทุกไฟล์เทส E2E ใช้ dev server + Firestore test project เดียวกันร่วมกัน เมื่อหลาย worker ยิง
// login/CRUD พร้อมกันจริง การอัปเดตตารางจาก Firestore บางครั้งใช้เวลานานกว่า 5 วินาทีเล็กน้อย ไม่ใช่บั๊ก
// ของแอป — ยืนยันแล้วว่าเทสเดิมผ่านเสมอเมื่อรันแยกเดี่ยว ค่านี้ให้ตรงกับ timeout 15_000ms ที่ใช้กับจุดรอ
// Modal ปิดในไฟล์นี้อยู่แล้ว เพื่อความสม่ำเสมอ)
const FIRESTORE_TABLE_UPDATE_TIMEOUT_MS = 15_000;

async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("กรอกชื่อผู้ใช้งาน หรือ อีเมล").fill(TEST_USERNAME);
  await page.getByPlaceholder("กรอกรหัสผ่าน").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

function getServiceSection(modal: Locator): Locator {
  return modal.getByText("รายการหัตถการบริการนวด", { exact: true }).locator("..");
}

function getPaymentSection(modal: Locator): Locator {
  return modal.getByText("สรุปการรับเงินหน้าร้าน", { exact: true }).locator("..");
}

function getBookingFormModal(page: Page): Locator {
  return page.locator(".glass-modal");
}

// สร้างสตริงวันที่ "วันนี้" แบบ local date (YYYY-MM-DD) ให้ตรงกับตรรกะจริงของแอป — จำเป็นต้องมีฟังก์ชัน
// นี้แยกจากการเรียก `new Date().toISOString().slice(0, 10)` ตรงๆ (Why จำเป็น — สาเหตุจริงอีกจุดหนึ่งที่พบ
// ระหว่างสืบสวน flaky: `toISOString()` คืนวันที่แบบ UTC แต่ `src/utils/dateHelpers.ts#getTodayDateString`
// ที่แอปใช้กรองตาราง "วันนี้" จริงคำนวณจาก `getFullYear/getMonth/getDate` ซึ่งเป็น local date ของเครื่อง —
// เมื่อรันเทสในช่วงเวลาเที่ยงคืนถึงประมาณตี 7 ของโซนเวลา UTC+7 (เช่น Bangkok) วันที่ UTC จะยังเป็น "เมื่อวาน"
// ทั้งที่ local date เป็น "วันนี้" แล้ว ทำให้ booking ที่ seed ด้วย `date` แบบ UTC ไม่ตรงกับวันที่ที่ตาราง
// กรองแสดงผลอยู่ (ค.3) แถวที่ seed ไว้จึงไม่ปรากฏเลยไม่ว่าจะรอนานแค่ไหน — ไม่ใช่ปัญหา timeout/race ข้าม
// worker แต่เป็น test bug ที่แสดงอาการเฉพาะบางช่วงเวลาของวัน จึงดูเหมือน flaky แบบสุ่ม)
function getLocalTodayDateString(): string {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function addServiceToBookingForm(modal: Locator, serviceId: string): Promise<void> {
  const serviceSection = getServiceSection(modal);
  await serviceSection.locator("select").selectOption({ value: serviceId });
  await serviceSection.getByRole("button", { name: "เพิ่มงาน", exact: true }).click();
}

// จำลอง Firestore write ล้มเหลวจริง — ตัด HTTP request ทุกเส้นทางที่ยิงไป firestore.googleapis.com จริง
//
// หมายเหตุสำคัญที่ค้นพบจริงระหว่างพัฒนาเทสนี้ (Why ต้องบันทึกไว้ กันคนอื่นเข้าใจผิดว่าเป็นบั๊กของแอป):
// ทดลองแล้วพบว่า Firestore Web SDK ถูกออกแบบมารองรับ offline-first อย่างเข้มข้น — ทั้ง page.context()
// .setOffline(true) และการ route.abort()/route.fulfill(สถานะ error) ที่ endpoint การเขียน (setDoc) ไม่ทำให้
// Promise ของ setDoc() reject เลยแม้แต่ครั้งเดียวภายใน 30 วินาที (ยืนยันด้วยการทดลองจริง — SDK log แสดง
// "WebChannelConnection RPC 'Write' stream ... transport errored" ซ้ำไปเรื่อยๆ แบบไม่มีที่สิ้นสุด เพราะ
// Firestore ออกแบบให้ write ที่ยังไม่สำเร็จถูก "คิวไว้ในเครื่อง" รอ sync ใหม่เสมอ ไม่ยอม reject ทิ้งง่ายๆ
// ต่างจาก read (getDocs) แบบ one-time ที่ reject ด้วย "client is offline" ได้เร็วกว่ามาก) ผลคือ **ไม่มีทาง
// บังคับให้เกิด error alert จริงบนเบราว์เซอร์ผ่านการตัดเครือข่ายล้วนๆ ได้แบบ deterministic** โดยไม่แตะ
// Firestore Security Rules (ซึ่งเครื่องมือนี้ไม่มี Firebase CLI/Service Account ให้แก้ rules ของ project
// ทดสอบได้ — ดู PROJECT_STATUS.md) เทสนี้จึงปรับเป้าหมายเป็นพิสูจน์สิ่งที่ตรวจสอบได้จริงแทน: ระหว่างที่
// Firestore เขียนไม่สำเร็จ (ค้างอยู่จริง) Modal ต้อง **ไม่ปิดตัวเองก่อนเวลาอันควร** และปุ่มต้องค้างที่สถานะ
// "กำลังบันทึก..." เสมอ (ไม่ใช่บั๊กเดิมที่ปิด Modal ทันทีแบบ fire-and-forget) — เมื่อคืนเครือข่ายกลับมา คิวที่
// ค้างไว้จะ sync สำเร็จเองตามดีไซน์ของ Firestore แล้ว Modal จึงปิดตามปกติในที่สุด
async function simulateFirestoreWriteFailure(page: Page): Promise<void> {
  await page.route("**://firestore.googleapis.com/**", (route) => route.abort("failed"));
}

async function stopSimulatingFirestoreWriteFailure(page: Page): Promise<void> {
  await page.unroute("**://firestore.googleapis.com/**");
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
    "qa-e2e-seed-app-booking-regression",
  );
  seedFirestore = getFirestore(seedApp);

  await setDoc(doc(seedFirestore, "systemUsers", TEST_USERNAME), {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    role: "admin",
    displayName: "QA E2E Booking Regression Tester",
    fullName: "QA E2E Booking Regression Automated Tester",
  });

  await setDoc(doc(seedFirestore, "therapists", THERAPIST_ID), {
    id: THERAPIST_ID,
    name: THERAPIST_NAME,
    type: "part-time",
    dailyGuarantee: 0,
    bankName: "SCB",
    bankAccount: "000-0-00000-3",
    bankAccountName: THERAPIST_NAME,
    phone: "0800000003",
  });

  await setDoc(doc(seedFirestore, "services", SERVICE_ID), {
    id: SERVICE_ID,
    category: "QAE2ECategory",
    name: SERVICE_NAME,
    duration: SERVICE_DURATION_HOURS,
    price: SERVICE_PRICE,
    commission: SERVICE_COMMISSION,
  });
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
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_USERNAME));
  await deleteDoc(doc(seedFirestore, "therapists", THERAPIST_ID));
  await deleteDoc(doc(seedFirestore, "services", SERVICE_ID));
  await deleteAllBookingsWithMarkerPrefix(BOOKING_CUSTOMER_MARKER_PREFIX);

  await deleteApp(seedApp);
});

test.describe("Bookings page regression — E2E จริงผ่าน Playwright (Phase 3)", () => {
  // บังคับรันทีละเทสในตัวเดียวกัน (Why จำเป็น — สาเหตุจริงของ flaky ที่พบตอนสืบสวนด้วย
  // `--repeat-each` ร่วมกับ default parallel workers ของ playwright.config.ts): ไฟล์นี้ใช้
  // TEST_USERNAME/THERAPIST_ID/SERVICE_ID คงที่ร่วมกันทุกเทสผ่าน beforeAll/afterAll ระดับไฟล์
  // เดียวกันทุกประการกับที่เคยพบและแก้แล้วใน testing/e2e/authRoleAccess.spec.ts — เมื่อ fullyParallel
  // กระจายเทสในไฟล์เดียวกันไปคนละ worker, worker ที่ทำ subset ของตัวเองเสร็จก่อนจะรัน afterAll
  // ลบเอกสาร systemUsers/therapists/services ทดสอบทิ้งทันที ทั้งที่ worker อื่นยังใช้เอกสารชุดเดียวกัน
  // ทำเทสค้างอยู่ — ยืนยันจากผลรันจริงด้วย `--repeat-each=3`: พังแบบไม่คงที่ 2 รูปแบบตรงกับสมมติฐานนี้เป๊ะ
  // คือ (1) ล็อกอินไม่สำเร็จค้างที่ /login เพราะ systemUsers/TEST_USERNAME ถูกลบไปแล้วโดย worker อื่น และ
  // (2) เทส double-submit ได้ booking count เป็น 0 แทนที่จะเป็น 1 เพราะ therapists/THERAPIST_ID หรือ
  // services/SERVICE_ID ถูกลบระหว่างที่กำลังจะเลือกในฟอร์ม ทำให้บันทึกไม่สำเร็จ — ไม่ใช่ race condition
  // ทำนอง "เช็ค DOM ก่อน async settle" แบบ authRoleAccess.spec.ts เดิม แต่เป็นกลไกเดียวกันเป๊ะ (early
  // afterAll ข้าม worker) จึงแก้ด้วยวิธีเดียวกัน — โหมด serial บังคับให้ทุกเทสในไฟล์นี้ใช้ worker เดียวกัน
  // และรันเรียงตามลำดับ ตัด race นี้ทิ้งไปเลย โดยไม่กระทบไฟล์เทสอื่นที่ยังรันขนานกันได้ตามปกติ
  test.describe.configure({ mode: "serial" });

  test.setTimeout(90_000);

  test("(ก.1) ล้างช่องบัตรเครดิตแล้วกรอกเงินสด/โอนแทน ต้องไม่มี error message หายเงียบ — บันทึกสำเร็จปกติ", async ({
    page,
  }) => {
    const customerMarker = `${BOOKING_CUSTOMER_MARKER_PREFIX}CardClear`;
    await loginAsTestUser(page);
    await page.goto("/bookings");

    await page.getByRole("button", { name: "บันทึกงานนวดใหม่", exact: true }).click();
    const modal = getBookingFormModal(page);
    await expect(modal).toBeVisible();

    await modal.locator("select").nth(0).selectOption({ value: THERAPIST_NAME });
    await modal.getByPlaceholder("เช่น 1").fill("1");
    await modal.locator('input[type="time"]').nth(0).fill("09:00");
    await modal.getByPlaceholder("กรอกชื่อลูกค้า").fill(customerMarker);
    await addServiceToBookingForm(modal, SERVICE_ID);

    const paymentInputs = getPaymentSection(modal).locator('input[type="number"]');
    const cashInput = paymentInputs.nth(0);
    const transferInput = paymentInputs.nth(1);
    const cardInput = paymentInputs.nth(2);

    // จำลองพฤติกรรมจริงที่เคยเจอบั๊ก: กรอกบัตรเครดิตก่อน แล้วเปลี่ยนใจล้างช่องบัตรเครดิตทิ้ง
    // แล้วกรอกเงินสด+โอนแทน (เดิม valueAsNumber ทำให้ช่องว่างกลายเป็น NaN ชนกฎ required แบบไม่มี error โชว์)
    await cardInput.fill("400");
    await cardInput.fill("");
    await cashInput.fill("200");
    await transferInput.fill("200");

    // ยืนยันไม่มี error message ใดๆ ค้างอยู่จากช่องบัตรเครดิตที่เพิ่งล้างทิ้ง
    await expect(modal.getByText("บัตรเครดิตต้องไม่เป็นค่าติดลบ")).toHaveCount(0);

    await modal.getByRole("button", { name: "บันทึกงานนวด", exact: true }).click();
    await expect(modal).not.toBeVisible({ timeout: 15_000 });

    const bookingRow = page.locator("tr").filter({ hasText: customerMarker });
    await expect(bookingRow).toBeVisible({ timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS });
    await expect(bookingRow).toContainText("สด: 200");
    await expect(bookingRow).toContainText("โอน: 200");
  });

  test("(ก.2) บังคับ Firestore write ล้มเหลวจริงตอนสร้าง booking ใหม่ — Modal ต้องไม่ปิดตัวเองก่อนเวลาอันควรและปุ่มต้องค้างสถานะ 'กำลังบันทึก...' ไม่ใช่บั๊กเดิมที่ปิดเงียบๆ ทันที", async ({
    page,
  }) => {
    const customerMarker = `${BOOKING_CUSTOMER_MARKER_PREFIX}CreateFail`;
    await loginAsTestUser(page);
    await page.goto("/bookings");

    await page.getByRole("button", { name: "บันทึกงานนวดใหม่", exact: true }).click();
    const modal = getBookingFormModal(page);
    await expect(modal).toBeVisible();

    await modal.locator("select").nth(0).selectOption({ value: THERAPIST_NAME });
    await modal.getByPlaceholder("เช่น 1").fill("1");
    await modal.locator('input[type="time"]').nth(0).fill("09:00");
    await modal.getByPlaceholder("กรอกชื่อลูกค้า").fill(customerMarker);
    await addServiceToBookingForm(modal, SERVICE_ID);
    await getPaymentSection(modal).locator('input[type="number"]').nth(0).fill("400");

    await simulateFirestoreWriteFailure(page);
    try {
      const submitButton = modal.getByRole("button", { name: /บันทึกงานนวด|กำลังบันทึก/ });
      await submitButton.click();

      // Firestore เขียนไม่สำเร็จ (ถูกตัดเครือข่ายจริง) — ปุ่มต้องค้างที่สถานะ "กำลังบันทึก..." เสมอ และ
      // Modal ต้องยังเปิดอยู่แม้รอไปแล้วหลายวินาที (ตรงข้ามกับบั๊กเดิมที่ fire-and-forget แล้วปิด Modal
      // ทันทีโดยไม่สนใจผลลัพธ์จริงจาก Firestore เลย — ดู comment เหตุผลเต็มที่ simulateFirestoreWriteFailure)
      await expect(submitButton).toHaveText("กำลังบันทึก...", { timeout: 10_000 });
      await page.waitForTimeout(8_000);
      await expect(modal).toBeVisible();
      await expect(submitButton).toHaveText("กำลังบันทึก...");
      await expect(submitButton).toBeDisabled();

      // ยืนยันว่าตอนนี้ยังไม่มีเอกสาร booking ของเทสนี้หลุดเข้า Firestore เลย (ยังไม่สำเร็จจริงๆ ไม่ใช่แค่ UI ค้าง)
      const pendingSnapshot = await getDocs(
        query(collection(seedFirestore, "bookings"), where("customerName", "==", customerMarker)),
      );
      expect(pendingSnapshot.empty).toBe(true);
    } finally {
      // คืนเครือข่ายกลับมา — คิวการเขียนที่ Firestore เก็บค้างไว้จะ sync สำเร็จเองตามดีไซน์ปกติของ SDK
      // แล้ว Modal จะปิดในที่สุด (พิสูจน์ว่าโค้ดจริงไม่ได้ค้างตายถาวร แค่รอผลจริงจาก Firestore เท่านั้น)
      await stopSimulatingFirestoreWriteFailure(page);
    }

    await expect(modal).not.toBeVisible({ timeout: 30_000 });
    const finalSnapshot = await getDocs(
      query(collection(seedFirestore, "bookings"), where("customerName", "==", customerMarker)),
    );
    expect(finalSnapshot.docs.length).toBe(1);
  });

  test("(ค.1) Double-submit จริง — คลิกปุ่มบันทึกรัวๆ ติดกันด้วย mouse click จริง ต้องไม่เกิดข้อมูลซ้ำใน Firestore", async ({
    page,
  }) => {
    const customerMarker = `${BOOKING_CUSTOMER_MARKER_PREFIX}DoubleSubmit`;
    await loginAsTestUser(page);
    await page.goto("/bookings");

    await page.getByRole("button", { name: "บันทึกงานนวดใหม่", exact: true }).click();
    const modal = getBookingFormModal(page);
    await expect(modal).toBeVisible();

    await modal.locator("select").nth(0).selectOption({ value: THERAPIST_NAME });
    await modal.getByPlaceholder("เช่น 1").fill("1");
    await modal.locator('input[type="time"]').nth(0).fill("09:00");
    await modal.getByPlaceholder("กรอกชื่อลูกค้า").fill(customerMarker);
    await addServiceToBookingForm(modal, SERVICE_ID);
    await getPaymentSection(modal).locator('input[type="number"]').nth(0).fill("400");

    const submitButton = modal.getByRole("button", { name: /บันทึกงานนวด|กำลังบันทึก/ });

    // เลื่อนปุ่มให้อยู่ในมุมมองที่มองเห็นได้จริงก่อนอ่านพิกัดเสมอ (Why จำเป็น — สาเหตุจริงอีกจุดที่พบระหว่าง
    // สืบสวน flaky: Modal (`.glass-modal`) เป็น container ที่ scroll ได้เอง (`overflow-y-auto`) ปุ่มบันทึก
    // อยู่ล่างสุด ถ้าไม่ scroll ให้เห็นก่อน `boundingBox()` จะคืนพิกัดตามตำแหน่งจริงบนหน้าเว็บซึ่งอาจอยู่นอก
    // พื้นที่ที่มองเห็นได้ของ modal (ถูก clip โดย overflow) ทำให้ page.mouse.click ที่พิกัดนั้นไปคลิกโดนสิ่งอื่น
    // หรือคลิกไม่โดนอะไรเลยแทน — เกิดขึ้นเป็นครั้งคราวขึ้นกับว่าฟอร์มถูกกรอกจนเนื้อหายาวพอจะดัน scroll หรือไม่)
    await submitButton.scrollIntoViewIfNeeded();
    const box = await submitButton.boundingBox();
    if (!box) throw new Error("ไม่พบตำแหน่งปุ่มบันทึกงานนวดบนหน้าจอ");
    const clickX = box.x + box.width / 2;
    const clickY = box.y + box.height / 2;

    // ใช้ page.mouse.click ที่พิกัดจริงแทน locator.click() — เหตุผล (Why): locator.click() ของ Playwright
    // จะรอให้ element "enabled" ก่อนคลิกเสมอ (actionability check) ทำให้ทดสอบ "double-submit" ไม่ได้ตรงจุด
    // เพราะพอปุ่มแรก disabled ปุ่มที่สอง/สามจะรอจนกว่าจะ enabled อีกครั้งแทนที่จะโดนเบราว์เซอร์เมินเฉยจริงๆ
    // page.mouse.click ที่พิกัดคือการจำลอง "นิ้วกดจอ/เมาส์คลิกจริง" ที่เบราว์เซอร์จะเมินคลิกบนปุ่ม disabled เอง
    await page.mouse.click(clickX, clickY);
    await page.mouse.click(clickX, clickY);
    await page.mouse.click(clickX, clickY);

    await expect(modal).not.toBeVisible({ timeout: 20_000 });

    const bookingsQuery = query(
      collection(seedFirestore, "bookings"),
      where("customerName", "==", customerMarker),
    );
    const snapshot = await getDocs(bookingsQuery);
    expect(snapshot.docs.length).toBe(1);
  });

  test("(ค.3) บังคับ Firestore write ล้มเหลวจริงตอนแก้ไข booking เดิม — ข้อมูลเดิมใน Firestore ต้องไม่เสียหาย/ไม่ถูก overwrite ด้วยค่าครึ่งๆ กลางๆ", async ({
    page,
  }) => {
    const originalCustomerName = `${BOOKING_CUSTOMER_MARKER_PREFIX}EditFailOriginal`;
    const attemptedNewCustomerName = `${BOOKING_CUSTOMER_MARKER_PREFIX}EditFailAttemptedNew`;
    const existingBookingId = "qa_e2e_bkg_phase3_edit_fail";

    // seed booking ที่มีอยู่แล้วล่วงหน้าตรงๆ ผ่าน Firestore client SDK (จำลองข้อมูลจริงที่มีอยู่ก่อนแก้ไข)
    await setDoc(doc(seedFirestore, "bookings", existingBookingId), {
      id: existingBookingId,
      date: getLocalTodayDateString(),
      round: 1,
      therapistName: THERAPIST_NAME,
      timeSlot: "09.00-10.00",
      services: [
        {
          serviceId: SERVICE_ID,
          serviceName: SERVICE_NAME,
          price: SERVICE_PRICE,
          commission: SERVICE_COMMISSION,
          quantity: 1,
        },
      ],
      payment: { cash: 400, transfer: 0, card: 0, tip: 0 },
      customerName: originalCustomerName,
      remark: "",
      updateDate: new Date().toISOString(),
      updateBy: "qa-e2e-seed",
    });

    await loginAsTestUser(page);
    await page.goto("/bookings");

    const bookingRow = page.locator("tr").filter({ hasText: originalCustomerName });
    await expect(bookingRow).toBeVisible({ timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS });
    await bookingRow.getByTitle("แก้ไขรายการ").click();

    const editModal = getBookingFormModal(page);
    await expect(editModal).toBeVisible();
    await editModal.getByPlaceholder("กรอกชื่อลูกค้า").fill(attemptedNewCustomerName);

    await simulateFirestoreWriteFailure(page);
    const submitButton = editModal.getByRole("button", { name: /บันทึกงานนวด|กำลังบันทึก/ });
    await submitButton.click();
    await expect(submitButton).toHaveText("กำลังบันทึก...", { timeout: 10_000 });
    await page.waitForTimeout(8_000);
    // Modal ยังต้องเปิดอยู่ระหว่าง Firestore ยังเขียนไม่สำเร็จ (ไม่ปิดตัวเองก่อนเวลาอันควรแบบบั๊กเดิม)
    await expect(editModal).toBeVisible();

    // จุดสำคัญที่สุดของเคสนี้: ระหว่างที่ write ยังค้างอยู่จริง (ตรวจผ่าน seedFirestore ซึ่งเป็นการเชื่อมต่อ
    // Firestore คนละ connection กับหน้าเบราว์เซอร์ที่ถูกตัดเครือข่าย จึงไม่ถูก route interception กระทบ)
    // เอกสารจริงในฐานข้อมูลต้องยังเป็นชื่อลูกค้าเดิมเป๊ะ ไม่ถูก overwrite ด้วยค่าครึ่งๆ กลางๆ ที่พิมพ์ค้างไว้
    const refetchedWhilePending = await getDoc(doc(seedFirestore, "bookings", existingBookingId));
    expect(refetchedWhilePending.data()?.customerName).toBe(originalCustomerName);

    // โหลดหน้าใหม่ (page.reload) เพื่อ "ยกเลิก" การเขียนที่ยังค้างอยู่ในคิวของฝั่งเบราว์เซอร์อย่างเด็ดขาด —
    // เหตุผล (Why): firebase.ts ของโปรเจกต์นี้ไม่ได้เปิด offline persistence (เป็น in-memory cache เท่านั้น)
    // คิวการเขียนที่ยังไม่สำเร็จจึงอยู่ใน memory ของหน้านั้นเท่านั้น การ reload หน้าเท่ากับล้างคิวทิ้งไปเลย
    // (จำลองสถานการณ์ผู้ใช้จริงที่ปิดแท็บ/รีเฟรชหน้าทิ้งเพราะเห็นว่าบันทึกไม่สำเร็จนานเกินไป)
    await stopSimulatingFirestoreWriteFailure(page);
    await page.reload();

    // ยืนยันเอกสารจริงใน Firestore ยังเป็นชื่อลูกค้าเดิมเป๊ะหลัง reload ด้วย ไม่ถูก overwrite ด้วยค่าครึ่งๆ กลางๆ
    const refetched = await getDoc(doc(seedFirestore, "bookings", existingBookingId));
    expect(refetched.exists()).toBe(true);
    expect(refetched.data()?.customerName).toBe(originalCustomerName);

    // ตารางบนหน้าจอหลัง reload ก็ต้องยังแสดงชื่อเดิม ไม่ใช่ชื่อใหม่ที่พิมพ์ค้างไว้แต่บันทึกไม่สำเร็จ
    await expect(page.locator("tr").filter({ hasText: originalCustomerName })).toBeVisible({
      timeout: FIRESTORE_TABLE_UPDATE_TIMEOUT_MS,
    });
    await expect(page.locator("tr").filter({ hasText: attemptedNewCustomerName })).toHaveCount(0);
  });
});
