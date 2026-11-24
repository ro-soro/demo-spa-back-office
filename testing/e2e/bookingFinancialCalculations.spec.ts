// testing/e2e/bookingFinancialCalculations.spec.ts
//
// E2E จริงผ่านเบราว์เซอร์ (Playwright) สำหรับ Phase 2 — Booking Financial Calculations
// (ดู testing/TEST_PLAN.md ส่วน Phase 2) ครอบคลุมสถานการณ์ที่ Main Chat สั่งให้ทดสอบจริงผ่านเบราว์เซอร์
// (ไม่ใช่แค่ RTL substitute ที่ทำไปแล้วใน testing/unit/bookingsPageIntegration.test.tsx):
//   1. เพิ่มบริการ 2 รายการขึ้นไปในฟอร์มบันทึกงานนวด -> เวลาสิ้นสุด (timeEnd) auto sync ตามผลรวมชั่วโมงจริง
//   2. กรอกเงินสด+โอน+บัตร+ทิปครบทุกช่องทาง -> ยอดรับเงินรวมที่แสดงตรงกับผลรวมจริง
//   3. (เพิ่มเติมตามคำสั่ง) ยืนยัน soft warning ของ Edge case 4 (ยอดไม่ตรงกัน) ทำงานถูกต้องในเบราว์เซอร์จริง
//      ทั้งแสดงคำเตือนและยังบันทึกสำเร็จได้ตามปกติ ไม่ใช่แค่ผ่าน RTL
//
// รูปแบบ/มาตรการความปลอดภัยทั้งหมด (ตรวจ project id ก่อนรัน, seed/cleanup ผ่าน Firestore client SDK ตรงๆ,
// พอร์ต 3100 แยกจาก dev server อื่น) ใช้ pattern เดียวกับ testing/e2e/payrollAdvanceDeductionLedger.spec.ts
// ทุกประการ — ดูเหตุผลละเอียดของแต่ละจุดได้ที่ comment ในไฟล์นั้น ไม่ duplicate คำอธิบายซ้ำในไฟล์นี้

import { test, expect, type Locator, type Page } from "@playwright/test";
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
  where,
  getDocs,
  type Firestore,
} from "firebase/firestore";

// ด่านความปลอดภัยบังคับที่สุด (Why — ห้ามลบ/ห้ามข้าม): ต้องยืนยันซ้ำเองในสคริปต์ว่า project ที่กำลังจะ
// เขียนข้อมูลทดสอบลงไปคือ project ทดสอบจริงเท่านั้น (ไม่ใช่ project จริงของร้าน "demo-spa") ก่อนที่
// จะมีการเรียก setDoc/deleteDoc ใดๆ เกิดขึ้นจริงแม้แต่ครั้งเดียว
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

// บัญชีทดสอบสำหรับล็อกอิน — role "admin" ไม่มีฟิลด์ email โดยตั้งใจ เพื่อให้ AppContext.login() เดินเส้นทาง
// "ตรวจรหัสผ่านจากเอกสาร systemUsers โดยตรง" (เหมือน Phase 1 E2E ทุกประการ)
const TEST_USERNAME = "qa_e2e_booking_tester";
const TEST_PASSWORD = "QaE2ePassword123";

const THERAPIST_ID = "qa_e2e_therapist_booking_calc";
const THERAPIST_NAME = "QAE2EBookingCalc";

// สองบริการที่ใช้ทดสอบผลรวมชั่วโมง/ราคา — จงใจตั้งราคา/ระยะเวลาให้ผลรวมลงตัวพอดีกับยอดชำระที่จะกรอก
// (500 + 800*1.5 = 1,700 ฿ พอดี, 1 + 1.5 = 2.5 ชม. พอดี) เพื่อยืนยันทั้งสองสถานการณ์ในเทสเดียวได้ชัดเจน
const SERVICE_A_ID = "qa_e2e_service_booking_calc_a";
const SERVICE_A_NAME = "QAE2EServiceA";
const SERVICE_A_DURATION_HOURS = 1;
const SERVICE_A_PRICE = 500;
const SERVICE_A_COMMISSION = 200;

const SERVICE_B_ID = "qa_e2e_service_booking_calc_b";
const SERVICE_B_NAME = "QAE2EServiceB";
const SERVICE_B_DURATION_HOURS = 1.5;
const SERVICE_B_PRICE = 800;
const SERVICE_B_COMMISSION = 300;

// ค่าที่คาดหวังหลังเพิ่มทั้งสองบริการ — คำนวณไว้ล่วงหน้าเป็นค่าคงที่ชัดเจนแทน magic number ในเทส
//
// เหตุผลที่ผลรวมคือ SERVICE_A_PRICE + SERVICE_B_PRICE ตรงๆ ไม่คูณด้วย duration (Why — สำคัญ พลาดมาแล้วรอบแรก
// ตอนพัฒนาเทสนี้ ต้องจดไว้กันเข้าใจผิดซ้ำ): ดู handleAddServiceToForm ใน src/app/bookings/page.tsx —
// `hourlyPrice = targetService.price / (targetService.duration || 1.0)` แล้วรายการที่ถูกเพิ่มมี
// `quantity = activeServiceQty` ซึ่งค่าเริ่มต้นถูกตั้งเท่ากับ `targetService.duration` เสมอตอนเลือกบริการ
// (handleServiceSelect) ดังนั้นเมื่อไม่ได้แก้ไขจำนวนชั่วโมงเอง contribution ของแต่ละรายการ = hourlyPrice *
// duration = (price / duration) * duration = price เดิมของบริการนั้นตรงๆ (ไม่ใช่ price * duration) — field
// "price" ของ Service คือราคาต่อ "1 รอบบริการเต็มตามระยะเวลามาตรฐาน" ของบริการนั้น ไม่ใช่ราคาต่อชั่วโมง
const TOTAL_SERVICE_PRICE = SERVICE_A_PRICE + SERVICE_B_PRICE; // 500 + 800 = 1,300
const TIME_START = "10:00";
const TIME_END_AFTER_SERVICE_A = "11:00"; // 10:00 + 1 ชม.
const TIME_END_AFTER_SERVICE_B = "12:30"; // 10:00 + (1 + 1.5) ชม.

// ป้ายกำกับลูกค้าเฉพาะของเทสชุดนี้ — ใช้ค้นหา/ลบรายการจองที่สร้างขึ้นจริงระหว่างเทส (booking id เป็น
// `bkg_${Date.now()}` ที่รู้ล่วงหน้าไม่ได้ จึงต้องมี marker เฉพาะเจาะจงไว้ค้นหาแทน)
const BOOKING_CUSTOMER_MARKER = "QAE2EPhase2BookingCustomer";

function formatBaht(amount: number): string {
  return amount.toLocaleString("en-US");
}

async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("กรอกชื่อผู้ใช้งาน หรือ อีเมล").fill(TEST_USERNAME);
  await page.getByPlaceholder("กรอกรหัสผ่าน").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

// สโคปหา section "รายการหัตถการบริการนวด" / "สรุปการรับเงินหน้าร้าน" ด้วยการหา parent ของ span หัวข้อ
// โดยตรง (Why): ทั้งสอง section ไม่มี class/id เฉพาะที่อ้างอิงได้ปลอดภัย (ใช้ Tailwind utility class ร่วมกับ
// ส่วนอื่นของหน้า) แต่หัวข้อข้อความเป็น unique text เสมอ — การหา parent ของ span นี้ตรงๆ แม่นยำกว่าการเดา
// selector ด้วย class ที่มี "/" ปนอยู่ (เช่น "bg-slate-950/40") ซึ่ง escape ยากและเปราะบางต่อการเปลี่ยน class
function getServiceSection(modal: Locator): Locator {
  return modal.getByText("รายการหัตถการบริการนวด", { exact: true }).locator("..");
}

function getPaymentSection(modal: Locator): Locator {
  return modal.getByText("สรุปการรับเงินหน้าร้าน", { exact: true }).locator("..");
}

function getBookingFormModal(page: Page): Locator {
  return page.locator(".glass-modal");
}

async function addServiceToBookingForm(
  modal: Locator,
  serviceId: string,
): Promise<void> {
  const serviceSection = getServiceSection(modal);
  await serviceSection.locator("select").selectOption({ value: serviceId });
  await serviceSection.getByRole("button", { name: "เพิ่มงาน", exact: true }).click();
}

async function fillPaymentChannels(
  modal: Locator,
  amounts: { cash: number; transfer: number; card: number; tip: number },
): Promise<void> {
  const paymentInputs = getPaymentSection(modal).locator('input[type="number"]');
  await paymentInputs.nth(0).fill(String(amounts.cash));
  await paymentInputs.nth(1).fill(String(amounts.transfer));
  await paymentInputs.nth(2).fill(String(amounts.card));
  await paymentInputs.nth(3).fill(String(amounts.tip));
}

// ---------------------------------------------------------------------------
// Seed / Cleanup ข้อมูลทดสอบผ่าน Firestore client SDK ตรงๆ (แยก Firebase app instance ชื่อเฉพาะ เพื่อไม่
// ชนกับ instance ที่ Next.js dev server ฝั่งเบราว์เซอร์ initialize เอง — pattern เดียวกับ Phase 1 E2E)
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
    "qa-e2e-seed-app-booking",
  );
  seedFirestore = getFirestore(seedApp);

  await setDoc(doc(seedFirestore, "systemUsers", TEST_USERNAME), {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    role: "admin",
    displayName: "QA E2E Booking Tester",
    fullName: "QA E2E Booking Automated Tester",
  });

  await setDoc(doc(seedFirestore, "therapists", THERAPIST_ID), {
    id: THERAPIST_ID,
    name: THERAPIST_NAME,
    type: "part-time",
    dailyGuarantee: 0,
    bankName: "SCB",
    bankAccount: "000-0-00000-2",
    bankAccountName: THERAPIST_NAME,
    phone: "0800000002",
  });

  await setDoc(doc(seedFirestore, "services", SERVICE_A_ID), {
    id: SERVICE_A_ID,
    category: "QAE2ECategory",
    name: SERVICE_A_NAME,
    duration: SERVICE_A_DURATION_HOURS,
    price: SERVICE_A_PRICE,
    commission: SERVICE_A_COMMISSION,
  });

  await setDoc(doc(seedFirestore, "services", SERVICE_B_ID), {
    id: SERVICE_B_ID,
    category: "QAE2ECategory",
    name: SERVICE_B_NAME,
    duration: SERVICE_B_DURATION_HOURS,
    price: SERVICE_B_PRICE,
    commission: SERVICE_B_COMMISSION,
  });
});

// ค้นหาและลบรายการจองที่สร้างขึ้นจริงระหว่างเทสผ่าน customerName marker (Why — เหตุผลเดียวกับการ query
// ลบ ledger entry ด้วย therapistId ใน Phase 1 E2E): booking id เป็น `bkg_${Date.now()}` รู้ล่วงหน้าไม่ได้
async function deleteAllBookingsWithMarker(marker: string): Promise<void> {
  const bookingsQuery = query(
    collection(seedFirestore, "bookings"),
    where("customerName", "==", marker),
  );
  const snapshot = await getDocs(bookingsQuery);
  for (const bookingDoc of snapshot.docs) {
    await deleteDoc(bookingDoc.ref);
  }
}

test.afterAll(async () => {
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_USERNAME));
  await deleteDoc(doc(seedFirestore, "therapists", THERAPIST_ID));
  await deleteDoc(doc(seedFirestore, "services", SERVICE_A_ID));
  await deleteDoc(doc(seedFirestore, "services", SERVICE_B_ID));
  await deleteAllBookingsWithMarker(BOOKING_CUSTOMER_MARKER);

  await deleteApp(seedApp);
});

test.describe("Booking financial calculations — E2E จริงผ่าน Playwright (Phase 2)", () => {
  test.setTimeout(90_000);

  test("เพิ่มบริการ 2 รายการ auto sync เวลาสิ้นสุดถูกต้อง, ยอดรับเงินรวมตรงกับผลรวมจริง, และ soft warning ทำงานถูกต้องตอนแก้ไขให้ไม่ตรงกัน", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await page.goto("/bookings");

    await page.getByRole("button", { name: "บันทึกงานนวดใหม่", exact: true }).click();
    const modal = getBookingFormModal(page);
    await expect(modal).toBeVisible();

    // เลือกหมอนวด + รอบบริการ + เวลาเริ่มต้น — ฟิลด์บังคับพื้นฐานของฟอร์มก่อนเพิ่มบริการ
    await modal.locator("select").nth(0).selectOption({ value: THERAPIST_NAME });
    await modal.getByPlaceholder("เช่น 1").fill("1");
    const timeInputs = modal.locator('input[type="time"]');
    await timeInputs.nth(0).fill(TIME_START);
    await modal.getByPlaceholder("กรอกชื่อลูกค้า").fill(BOOKING_CUSTOMER_MARKER);

    await test.step("เพิ่มบริการรายการที่ 1 (1 ชม.) — เวลาสิ้นสุด auto sync เป็น 11:00", async () => {
      await addServiceToBookingForm(modal, SERVICE_A_ID);
      await expect(timeInputs.nth(1)).toHaveValue(TIME_END_AFTER_SERVICE_A);
    });

    await test.step("เพิ่มบริการรายการที่ 2 (1.5 ชม.) — เวลาสิ้นสุด auto sync ตามผลรวม 2.5 ชม. เป็น 12:30 (ไม่ใช่แค่คำนวณจากรายการล่าสุด)", async () => {
      await addServiceToBookingForm(modal, SERVICE_B_ID);
      await expect(timeInputs.nth(1)).toHaveValue(TIME_END_AFTER_SERVICE_B);
    });

    await test.step("ราคารวมบริการต้องเท่ากับผลรวมจริงของทั้งสองรายการ (500 + 800 = 1,300 ฿)", async () => {
      const totalPriceSpan = modal.locator("span", { hasText: "ราคารวมบริการ:" });
      await expect(totalPriceSpan).toContainText(`${formatBaht(TOTAL_SERVICE_PRICE)} ฿`);
    });

    await test.step("กรอกเงินสด+โอน+บัตร+ทิปครบทุกช่องทางให้รวมตรงกับราคาบริการพอดี — ยอดรับเงินรวมต้องตรงและไม่มี soft warning", async () => {
      // 500 + 500 + 200 + 100 = 1,300 ฿ ตรงกับ TOTAL_SERVICE_PRICE พอดี
      await fillPaymentChannels(modal, { cash: 500, transfer: 500, card: 200, tip: 100 });

      const totalReceivedSpan = modal.locator("span", { hasText: "ยอดรับเงินรวม:" });
      await expect(totalReceivedSpan).toContainText(`${formatBaht(TOTAL_SERVICE_PRICE)} ฿`);
      await expect(modal.getByText(/ยอดรับเงินไม่ตรงกับราคาบริการ/)).toHaveCount(0);
    });

    await test.step("บันทึกงานนวด — Modal ต้องปิดสำเร็จ (ไม่มี soft warning จึงไม่มีอะไรมาบล็อกอยู่แล้ว)", async () => {
      await modal.getByRole("button", { name: "บันทึกงานนวด", exact: true }).click();
      await expect(modal).not.toBeVisible({ timeout: 15_000 });
    });

    const bookingRow = page.locator("tr").filter({ hasText: BOOKING_CUSTOMER_MARKER });
    await expect(bookingRow).toBeVisible();
    await expect(bookingRow).toContainText(`ค่าบริการ: ${formatBaht(TOTAL_SERVICE_PRICE)} ฿`);

    await test.step("แก้ไขรายการเดิม เปลี่ยนยอดเงินสดให้ยอดรับเงินรวมเกินราคาบริการ 50 ฿ — ต้องเห็น soft warning แต่ยังบันทึกสำเร็จได้ปกติ (Edge case 4, ยืนยันซ้ำผ่านเบราว์เซอร์จริง)", async () => {
      await bookingRow.getByTitle("แก้ไขรายการ").click();
      const editModal = getBookingFormModal(page);
      await expect(editModal).toBeVisible();

      const paymentInputs = getPaymentSection(editModal).locator('input[type="number"]');
      const cashInput = paymentInputs.nth(0);
      await cashInput.fill("550"); // 550 + 500 + 200 + 100 = 1,350 ฿ (เกินราคาบริการ 1,300 ฿ อยู่ 50 ฿)

      await expect(
        editModal.getByText("ยอดรับเงินไม่ตรงกับราคาบริการ (เกินราคาบริการ 50 บาท)"),
      ).toBeVisible();

      await editModal.getByRole("button", { name: "บันทึกงานนวด", exact: true }).click();
      await expect(editModal).not.toBeVisible({ timeout: 15_000 });
    });

    const updatedBookingRow = page.locator("tr").filter({ hasText: BOOKING_CUSTOMER_MARKER });
    await expect(updatedBookingRow).toContainText(`ค่าบริการ: ${formatBaht(TOTAL_SERVICE_PRICE)} ฿`);
  });
});
