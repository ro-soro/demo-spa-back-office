// testing/e2e/payrollAdvanceDeductionLedger.spec.ts
//
// E2E จริงผ่านเบราว์เซอร์ (Playwright) สำหรับ Phase 1 — Payroll & Advance Deduction Ledger
// (ดู testing/TEST_PLAN.md ส่วน Phase 1) เขียนขึ้นมาแทนที่การทดสอบแบบ RTL substitute เดิมที่เคยใช้
// เพราะตอนนั้นยังไม่มี Firebase project ทดสอบแยกต่างหาก ตอนนี้มีแล้ว (demo-spa-test) จึงรัน
// ผ่านเบราว์เซอร์จริงทั้งหมด ครอบคลุมสถานการณ์: หักเบิกต่องวดครบ 3 งวด, reload ไม่หักซ้ำ, สลิปพิมพ์ตรงกับ
// ตาราง, ค่ากะดึกร่วมกับหักเบิกในงวดเดียว และ regression ของ 2 บั๊กที่เพิ่งแก้ (ledger ช่วงวันที่ผสม +
// เปิดงวดข้ามลำดับ)
//
// เหตุผลที่ seed/cleanup ข้อมูลทดสอบตรงผ่าน Firestore client SDK แทนการคีย์ผ่านหน้า Settings จริง (Why):
// การคำนวณเงินเดือนในหน้า payroll ขึ้นกับ Therapist.advanceDeductionTotal/PerPeriod และ Ledger
// เป็นหลัก ไม่ขึ้นกับ booking ใดๆ (ถ้าไม่มี booking ในช่วงวันที่นั้น commission/topup จะเป็น 0 พอดี ไม่กระทบ
// การยืนยันยอดหักเบิก) การ seed ตรงจึงเร็วกว่าและลดจุดที่อาจพังจาก UI ฟอร์ม Settings ที่ไม่ใช่จุดโฟกัสของ
// เทสชุดนี้ — เลือก "ลบข้อมูลทดสอบทั้งหมดหลังจบเทส" (ไม่ใช้ fixture ที่ปล่อยข้อมูลค้าง) เพราะ ID ของ
// therapist/ledger ในไฟล์นี้เป็นค่าคงที่ตายตัว ถ้าไม่ลบ การรันซ้ำรอบถัดไปจะเจอ ledger เดิมค้างอยู่แล้ว ทำให้
// ยอดคงเหลือเริ่มต้นผิดตั้งแต่ต้น (คำนวณจากประวัติสะสมทั้งหมดของ therapistId นั้น)

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

// ด่านความปลอดภัยบังคับที่สุด (Why — ห้ามลบ/ห้ามข้าม): ต้องยืนยันซ้ำเองในสคริปต์ว่า project ที่กำลังจะ
// เขียนข้อมูลทดสอบลงไปคือ project ทดสอบจริงเท่านั้น (ไม่ใช่ project จริงของร้าน "demo-spa") ก่อนที่
// จะมีการเรียก setDoc/deleteDoc ใดๆ เกิดขึ้นจริงแม้แต่ครั้งเดียว
const EXPECTED_TEST_FIREBASE_PROJECT_ID = "demo-spa-test";

// เหตุผลที่ต้อง parse .env.test เองแทนที่จะพึ่งพา Next.js loader (Why): Playwright test process นี้รัน
// เป็น Node script ตรงๆ ไม่ผ่าน Next.js runtime — ค่า NODE_ENV=test ที่ทำให้ Next.js โหลด .env.test
// อัตโนมัติ (ผ่าน "npm run dev:test") มีผลแค่ฝั่ง dev server เท่านั้น สคริปต์ seed/cleanup ฝั่งนี้จึงต้อง
// อ่านไฟล์ตรงๆ เอง ไม่คุ้มที่จะติดตั้ง dependency เพิ่ม (เช่น dotenv) เพียงเพื่องานเดียวนี้ — parser ธรรมดา
// รองรับแค่รูปแบบ "KEY=VALUE" ที่ไฟล์นี้ใช้จริงก็เพียงพอแล้ว
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

// บัญชีทดสอบสำหรับล็อกอิน — ไม่มีฟิลด์ email โดยตั้งใจ เพื่อให้ AppContext.login() เดินเส้นทาง "ตรวจรหัสผ่าน
// จากเอกสาร systemUsers โดยตรง" แทนเส้นทาง Firebase Auth signInWithEmailAndPassword (ซึ่งต้องมีบัญชี
// Auth จริงที่สร้างไว้ล่วงหน้าใน Firebase Console ซึ่งงานนี้ไม่ได้บังคับให้ต้องมี)
const TEST_USERNAME = "qa_e2e_payroll_tester";
const TEST_PASSWORD = "QaE2ePassword123";

const MAIN_THERAPIST_ID = "qa_e2e_therapist_deduction_test";
const MAIN_THERAPIST_NAME = "QAE2EDeduction";

const SKIP_THERAPIST_ID = "qa_e2e_therapist_skip_test";
const SKIP_THERAPIST_NAME = "QAE2ESkipGuard";

// สร้าง id แบบเดียวกับที่ src/app/payroll/page.tsx ใช้จริงตอนเขียน ledger entry (`advled_${id}_${start}_${end}`)
// เพื่อให้ afterAll ลบ entry ที่ถูกสร้างขึ้นจริงระหว่างเทสได้ครบทุกตัวแบบตรงเป้า ไม่ต้อง query ทั้ง collection
function buildLedgerEntryId(therapistId: string, periodStart: string, periodEnd: string): string {
  return `advled_${therapistId}_${periodStart}_${periodEnd}`;
}

// เหตุผลที่ "งวดที่ 1" ของทุกเทสในไฟล์นี้ต้องตรงกับครึ่งเดือนปัจจุบันจริงเสมอ (Why — สำคัญมาก): หน้า payroll
// (src/app/payroll/page.tsx) มี useEffect ที่ยิงคำนวณ/บันทึกหักเบิกทันทีตอน mount โดยใช้ startDate/endDate
// เริ่มต้นซึ่งมาจาก getDefaultHalfMonthRange() (ครึ่งเดือนปัจจุบันของ "วันนี้จริง" เสมอ ไม่ใช่ค่าคงที่) ก่อนที่
// เทสจะทันเปลี่ยนวันที่ผ่าน DatePicker เลยด้วยซ้ำ — ถ้าเทสเลือกช่วงวันที่ที่ไม่ตรงกับ "ครึ่งเดือนปัจจุบันจริง"
// การ mount หน้า payroll แต่ละครั้งจะแอบสร้าง ledger entry เพิ่มอีก 1 รายการสำหรับครึ่งเดือนปัจจุบันโดยที่
// เทสไม่ได้ตั้งใจ (พบเจอจริงระหว่างพัฒนาเทสนี้ — ยอดคงเหลือหลัง reload ผิดไปจากที่คาดเพราะมี entry แอบ
// เกิดขึ้นจาก mount effect) จึงต้องให้ "งวดที่ 1" ของแต่ละเทสตรงกับครึ่งเดือนปัจจุบันจริงเสมอ (อ่านค่านั้นมา
// จากเบราว์เซอร์โดยตรงผ่าน readCurrentPeriodFromPicker ด้านล่าง แทนการเดาจาก Node process — ดูเหตุผล
// เพิ่มเติมตรงนั้น) แล้วงวดถัดๆ ไปต่อเนื่องจากงวดแรกแบบไม่มีช่องว่างผ่านฟังก์ชันด้านล่างนี้
function getHalfMonthPeriodContaining(isoDate: string): { start: string; end: string } {
  const date = new Date(`${isoDate}T00:00:00`);
  const year = date.getFullYear();
  const month = date.getMonth();
  const dayOfMonth = date.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  const pad = (n: number): string => String(n).padStart(2, "0");
  const monthStr = pad(month + 1);
  const isFirstHalf = dayOfMonth <= 15;

  return {
    start: `${year}-${monthStr}-${isFirstHalf ? "01" : "16"}`,
    end: `${year}-${monthStr}-${isFirstHalf ? "15" : pad(lastDayOfMonth)}`,
  };
}

// เพิ่มวันถัดไปให้วันที่รูปแบบ YYYY-MM-DD หนึ่งวัน — ใช้หาว่างวดถัดไป (ต่อเนื่อง ไม่มีช่องว่าง) ต้องเริ่มวันไหน
function getNextDayIso(isoDate: string): string {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

// อ่านช่วงวันที่ "งวดที่ 1" จริงจาก DatePicker บนหน้าที่เพิ่ง mount แทนการคำนวณเดาจาก Node `Date()` เอง
// (Why — สำคัญมาก ห้ามเปลี่ยนกลับไปคำนวณเดา): แม้ในทางทฤษฎี `getDefaultHalfMonthRange()` ฝั่งเบราว์เซอร์
// กับ `new Date()` ฝั่ง Node ของ Playwright ควรได้ค่าเดียวกันเสมอ (วันเดียวกัน) แต่การอ่านค่าจริงจาก DOM
// โดยตรงยังคงทนทานกว่าการเดาจากนอกเบราว์เซอร์เสมอ (ไม่มีทางคลาดเคลื่อนได้เลยไม่ว่าจะด้วยเหตุผลอะไร) —
// หมายเหตุ: บั๊กตัวจริงที่เคยพบระหว่างพัฒนาเทสนี้ (ยอดคงเหลือหลัง reload ผิดจากที่คาด) ท้ายที่สุดไม่ได้มาจาก
// ค่า default ไม่ตรงกันแบบนี้ แต่มาจาก Test A ที่ "พา" SKIP_THERAPIST_ID (ถ้าถูก seed ไว้ล่วงหน้าตั้งแต่ต้น)
// ไปหักเบิกงวดเดียวกันไปด้วยเงียบๆ (ดูคำอธิบายเต็มที่ comment ใน test.beforeAll ด้านล่าง) — ฟังก์ชันนี้ยัง
// คงไว้เพราะเป็นแนวทางที่ถูกต้อง/ทนทานกว่าอยู่ดี ไม่ใช่เพราะแก้บั๊กตัวนั้นโดยตรง
async function readCurrentPeriodFromPicker(page: Page): Promise<{ start: string; end: string }> {
  const periodPanel = page
    .locator(".glass-panel")
    .filter({ hasText: "ประมวลผลสรุปค่าแรงรอบบัญชีงวดการจ่าย" });
  const pickerButtons = periodPanel.locator("div.relative.w-full button");

  // ต้องรอให้ทั้งสองปุ่มแสดงข้อความวันที่จริงก่อนอ่านค่าเสมอ (Why): พบเจอจริงว่าทันทีหลัง page.reload()
  // React ยังไม่ hydrate เสร็จ ปุ่มอาจยังไม่มีข้อความ/ยังไม่ครบ 2 ปุ่ม ทำให้อ่านค่าว่างได้ ต้อง toHaveCount(2)
  // และรอ pattern วันที่จริง (DD/MM/YYYY) ก่อนค่อยดึงข้อความไปใช้จริง
  await expect(pickerButtons).toHaveCount(2);
  await expect(pickerButtons.nth(1)).toHaveText(/^\d{2}\/\d{2}\/\d{4}$/);

  const [startText, endText] = await pickerButtons.allTextContents();

  // รูปแบบที่แสดงบนปุ่มคือ "DD/MM/YYYY" โดย YYYY เป็นปี พ.ศ. (ดู DatePicker.tsx `getDisplayDate()`)
  // ต้องแปลงกลับเป็น ค.ศ. และ ISO YYYY-MM-DD ก่อนนำไปใช้คำนวณ/เปรียบเทียบต่อ
  const parseDisplayDateToIso = (displayText: string): string => {
    const [day, month, buddhistYear] = displayText.split("/");
    const gregorianYear = Number(buddhistYear) - 543;
    return `${gregorianYear}-${month}-${day}`;
  };

  return {
    start: parseDisplayDateToIso(startText),
    end: parseDisplayDateToIso(endText),
  };
}

const MONTH_NAMES_SHORT = [
  "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
  "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
];

// จัดรูปแบบจำนวนเงินให้ตรงกับ toLocaleString() ที่หน้า payroll ใช้จริง — ระบุ locale "en-US" ตรงๆ กัน
// พลาดเรื่อง locale ของ environment ที่รัน Node/เบราว์เซอร์ไม่ตรงกัน (ทั้งคู่ default เป็น en-US อยู่แล้ว
// แต่ระบุชัดเจนกันปัญหาย้อนหลัง)
function formatBaht(amount: number): string {
  return amount.toLocaleString("en-US");
}

// นำทางปฏิทิน Custom DatePicker ของโปรเจกต์ไปยังวันที่เป้าหมาย (ดู src/components/DatePicker.tsx)
// ใช้เส้นทาง "เปิดปฏิทิน -> กดป้ายเดือน/ปี (เข้าสู่กริดเดือน) -> เลือกเดือน -> เลือกวัน" เสมอ ไม่ต้องเข้า
// กริดปีเลย เพราะทุกวันที่ที่เทสชุดนี้เลือกอยู่ในปี ค.ศ. เดียวกับปีปัจจุบัน (ปีตั้งต้นของปฏิทินตอนเปิดหน้า
// payroll ครั้งแรก) — ถ้าในอนาคตต้องเลือกข้ามปี ต้องเพิ่มขั้นตอนกริดปีก่อน
async function selectDateInPicker(picker: Locator, isoDate: string): Promise<void> {
  const [, monthText, dayText] = isoDate.split("-");
  const monthIndex = Number(monthText) - 1;
  const dayNumber = Number(dayText);

  await picker.locator("button").first().click();
  await picker.getByTitle("กดเพื่อเลือกเดือน/ปีโดยตรง").click();
  await picker.getByRole("button", { name: MONTH_NAMES_SHORT[monthIndex], exact: true }).click();
  await picker.getByRole("button", { name: String(dayNumber), exact: true }).click();
}

// ตั้งช่วงวันที่งวดบัญชีบนหน้า payroll — เจตนาตั้งวันที่เริ่มต้นก่อนวันที่สิ้นสุดเสมอในลำดับโค้ดนี้ เพื่อให้
// ระหว่างการเปลี่ยนงวด (เช่น จากงวด 1 ไปงวด 2) เกิดสถานะกลางคันที่ periodStart > periodEnd ชั่วขณะจริง
// (ตรงกับสถานการณ์ที่เคยเจอบั๊กที่ 1) เป็นการยืนยัน regression ของบั๊กนั้นไปในตัวทุกครั้งที่เรียกฟังก์ชันนี้
//
// ข้ามการคลิกทั้งหมดถ้าช่วงวันที่บนหน้าตรงกับเป้าหมายอยู่แล้ว (Why — สำคัญ): "งวดที่ 1"/"งวด A" ของทุกเทส
// ในไฟล์นี้ตรงกับค่า default ที่หน้าแสดงอยู่แล้วเสมอ (อ่านมาจาก readCurrentPeriodFromPicker) การคลิกเปิด
// ปฏิทิน-เลือกเดือน-เลือกวันซ้ำแบบ "ตั้งใจตั้งค่าเป็นค่าเดิม" เป็นการกระทำที่ไม่จำเป็นและเพิ่มความเสี่ยงจาก
// จังหวะเวลาโดยไม่ได้อะไรเพิ่ม (พบเจอจริงว่าเทสมีอาการ flaky ข้ามรอบรันเมื่อคลิกซ้ำแบบนี้) การเช็คก่อนว่า
// "ตรงอยู่แล้วหรือไม่" แล้วข้ามไปเลยถ้าตรง ช่วยลดความเสี่ยงและเวลาโดยไม่กระทบพฤติกรรมที่ต้องการทดสอบ
async function setPayrollPeriod(page: Page, startIso: string, endIso: string): Promise<void> {
  const currentPeriod = await readCurrentPeriodFromPicker(page);
  if (currentPeriod.start === startIso && currentPeriod.end === endIso) {
    return;
  }

  const periodPanel = page
    .locator(".glass-panel")
    .filter({ hasText: "ประมวลผลสรุปค่าแรงรอบบัญชีงวดการจ่าย" });
  const startPicker = periodPanel.locator("div.relative.w-full").nth(0);
  const endPicker = periodPanel.locator("div.relative.w-full").nth(1);

  await selectDateInPicker(startPicker, startIso);
  await selectDateInPicker(endPicker, endIso);
}

// รอจนกว่า ledger entry ของงวดนี้จะถูกเขียนลง Firestore จริง (Why — สำคัญมาก ห้ามเปลี่ยนกลับไปใช้ fixed
// wait/sleep): พบเจอจริงระหว่างพัฒนาเทสนี้ว่าการรอด้วยเวลาคงที่ (fixed timeout) ไม่น่าเชื่อถือพอ — ถ้าเปลี่ยน
// ไปงวดถัดไปก่อนที่ debounce timer 600ms (DATE_RANGE_SETTLE_DELAY_MS ใน src/app/payroll/page.tsx) ของ
// งวดก่อนหน้าจะครบกำหนดและเขียนสำเร็จจริง React useEffect cleanup จะ clearTimeout ของงวดก่อนหน้าทิ้งไป
// เงียบๆ ทำให้งวดนั้น "ไม่ถูกเขียนลง ledger จริง" (ตารางแสดงผลยังดู "ถูกต้อง" ชั่วขณะเพราะคำนวณแบบ
// optimistic จาก state สด ไม่ใช่จาก ledger ที่บันทึกจริง) การรอตายตัวที่นานพอ "โดยเฉลี่ย" ยังคงพลาดได้เมื่อ
// เครื่อง/เครือข่ายช้ากว่าปกติ (พบเจอจริงว่า flaky ข้ามรอบรัน) วิธีที่ถูกต้องคือ "โพลถาม Firestore ตรงๆ" ว่า
// เอกสารถูกเขียนสำเร็จจริงหรือยัง ก่อนค่อยเปลี่ยนวันที่งวดถัดไป รับประกันไม่มี debounce ไหนถูกยกเลิกทิ้งอีก
async function waitForLedgerEntryToExist(
  therapistId: string,
  periodStart: string,
  periodEnd: string,
  timeoutMs = 10_000,
): Promise<void> {
  const entryId = buildLedgerEntryId(therapistId, periodStart, periodEnd);
  const pollIntervalMs = 300;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const snapshot = await getDoc(doc(seedFirestore, "advanceDeductionLedger", entryId));
    if (snapshot.exists()) return;
    await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
  }

  throw new Error(
    `ledger entry "${entryId}" ยังไม่ถูกเขียนภายใน ${timeoutMs}ms — อาจเป็นเพราะ debounce ถูกยกเลิก ` +
      `หรือ payroll page มีปัญหาจริงในการบันทึกหักเบิกงวดนี้`,
  );
}

// ตั้งช่วงวันที่งวดใหม่แล้ว "รอจนแน่ใจจริง" ว่า ledger entry ของงวดนั้นถูกเขียนสำเร็จก่อนค่อยคืนค่ากลับ —
// ใช้เฉพาะกรณีที่คาดหวังว่างวดนี้ต้องถูกหักสำเร็จจริง (ไม่ใช้กับสถานการณ์ "เปิดงวดข้ามลำดับ" ที่ตั้งใจให้
// ยังไม่ถูกเขียนจนกว่าจะกดยืนยัน — เคสนั้นใช้ setPayrollPeriod เปล่าๆ แล้วรอตรวจแบนเนอร์แทน)
async function setPayrollPeriodAndConfirmCommitted(
  page: Page,
  therapistId: string,
  startIso: string,
  endIso: string,
): Promise<void> {
  await setPayrollPeriod(page, startIso, endIso);
  await waitForLedgerEntryToExist(therapistId, startIso, endIso);
}

function getFullTimeRow(page: Page, therapistName: string): Locator {
  const fullTimeTable = page
    .locator(".glass-panel")
    .filter({ hasText: "ตารางสรุปรายรับพนักงานประจำ" });
  return fullTimeTable.locator("tr").filter({ hasText: `หมอ${therapistName}` });
}

async function loginAsTestUser(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("กรอกชื่อผู้ใช้งาน หรือ อีเมล").fill(TEST_USERNAME);
  await page.getByPlaceholder("กรอกรหัสผ่าน").fill(TEST_PASSWORD);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
  await expect(page).toHaveURL("/", { timeout: 20_000 });
}

// ---------------------------------------------------------------------------
// Seed / Cleanup ข้อมูลทดสอบผ่าน Firestore client SDK ตรงๆ (แยก Firebase app instance ชื่อเฉพาะ
// เพื่อไม่ชนกับ instance ที่ Next.js dev server ฝั่งเบราว์เซอร์ initialize เอง)
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
    "qa-e2e-seed-app",
  );
  seedFirestore = getFirestore(seedApp);

  await setDoc(doc(seedFirestore, "systemUsers", TEST_USERNAME), {
    username: TEST_USERNAME,
    password: TEST_PASSWORD,
    role: "admin",
    displayName: "QA E2E Tester",
    fullName: "QA E2E Automated Tester",
  });

  await setDoc(doc(seedFirestore, "therapists", MAIN_THERAPIST_ID), {
    id: MAIN_THERAPIST_ID,
    name: MAIN_THERAPIST_NAME,
    type: "full-time",
    dailyGuarantee: 600,
    bankName: "SCB",
    bankAccount: "000-0-00000-0",
    bankAccountName: MAIN_THERAPIST_NAME,
    phone: "0800000000",
    worksLateShift: true,
    advanceDeductionTotal: 3000,
    advanceDeductionPerPeriod: 1000,
  });

  // หมายเหตุสำคัญ: จงใจ "ไม่" seed SKIP_THERAPIST_ID ไว้ที่นี่ (Why — ห้ามย้ายกลับมาที่นี่): หน้า payroll
  // ประมวลผลหักเบิกให้ "ทุกพนักงานประจำที่มีอยู่ในระบบ ณ ขณะนั้น" พร้อมกันเสมอ (ไม่ใช่แค่คนที่เทสกำลังสนใจ)
  // ถ้า seed SKIP_THERAPIST_ID ไว้ล่วงหน้าตั้งแต่ตอนนี้ Test A (ที่รันก่อนและเปลี่ยนวันที่ผ่าน 3 งวดของ
  // MAIN_THERAPIST_ID) จะ "พา" SKIP_THERAPIST_ID ไปหักเบิกตามงวดเดียวกันไปด้วยเงียบๆ (เพราะมันก็เข้าเงื่อนไข
  // full-time + มียอดหักเบิกค้างเหมือนกัน) ทำให้ยอดคงเหลือของ SKIP_THERAPIST_ID ผิดเพี้ยนไปตั้งแต่ก่อน
  // Test B จะเริ่มทำงานจริงเสียอีก (พบเจอบั๊กเทสนี้จริงระหว่างพัฒนา ใช้เวลาสืบสวนนานมาก) จึง seed
  // SKIP_THERAPIST_ID แยกไว้ในตัว Test B เองแทน ให้มันเพิ่งเริ่ม "มีตัวตน" ในระบบตอนที่ Test B ต้องการจริงๆ
  // เท่านั้น ไม่ปะปนกับ Test A เลย
});

// เหตุผลที่ต้อง query ลบตาม therapistId แทนการไล่ลบตาม period ที่รู้ล่วงหน้า (Why): เนื่องจาก "งวดที่ 1"
// ของแต่ละเทสตอนนี้อ่านมาจากค่าจริงบนเบราว์เซอร์ (readCurrentPeriodFromPicker) ไม่ใช่ค่าคงที่ที่รู้ตอน
// module load อีกต่อไป จึงไม่มีทางรู้ล่วงหน้าแน่ชัดว่า ledger entry id ที่แท้จริงจะเป็นอะไรบ้าง การ query
// ลบทุก entry ของ therapistId นี้ตรงๆ ครอบคลุมกว่าและถูกต้องเสมอไม่ว่าจะรันวันไหนก็ตาม
async function deleteAllLedgerEntriesForTherapist(therapistId: string): Promise<void> {
  const ledgerQuery = query(
    collection(seedFirestore, "advanceDeductionLedger"),
    where("therapistId", "==", therapistId),
  );
  const snapshot = await getDocs(ledgerQuery);
  for (const entryDoc of snapshot.docs) {
    await deleteDoc(entryDoc.ref);
  }
}

test.afterAll(async () => {
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_USERNAME));
  await deleteDoc(doc(seedFirestore, "therapists", MAIN_THERAPIST_ID));
  await deleteDoc(doc(seedFirestore, "therapists", SKIP_THERAPIST_ID));

  await deleteAllLedgerEntriesForTherapist(MAIN_THERAPIST_ID);
  await deleteAllLedgerEntriesForTherapist(SKIP_THERAPIST_ID);

  await deleteApp(seedApp);
});

// เหตุผลที่ต้องรวม Test A และ Test B ไว้ใน describe.serial เดียวกัน (Why — สำคัญ ห้ามแยก):
// ทั้งสองเทสใช้เอกสาร systemUsers/{TEST_USERNAME} ร่วมกัน (สำหรับ login) ที่ seed/cleanup ผ่าน
// test.beforeAll/afterAll ระดับไฟล์เดียวกัน ถ้าปล่อยให้ fullyParallel (ค่าตั้งต้นของ playwright.config.ts)
// สั่งให้ทั้งสองเทสรันคนละ worker พร้อมกัน จะเกิด race condition จริง — worker ที่จบก่อนจะรัน afterAll
// ลบเอกสาร systemUsers ทิ้งขณะที่อีก worker ยังต้องใช้เอกสารเดิม login อยู่ (พบเจอจริงระหว่างพัฒนาเทสนี้
// — login ล้มเหลวเพราะเอกสารถูกลบไปแล้วโดย worker อีกตัว) การบังคับ serial ให้รันในเวิร์กเกอร์เดียวกัน
// ตามลำดับแก้ปัญหานี้ได้ตรงจุดที่สุด
test.describe.serial("Payroll advance deduction ledger — E2E จริงผ่าน Playwright (Phase 1)", () => {
  // ---------------------------------------------------------------------------
  // Test A — สถานการณ์หลักตามคำสั่ง: หักเบิกต่องวดครบ 3 งวด, reload ไม่หักซ้ำ, สลิปตรงกับตาราง,
  // ค่ากะดึกร่วมกับหักเบิกในงวดเดียว
  // ---------------------------------------------------------------------------
  test.setTimeout(120_000);

  test("หักเบิกต่องวดครบ 3 งวด (2000→1000→0) พร้อม reload ไม่หักซ้ำ กะดึกร่วมงวดเดียวกัน และสลิปตรงกับตาราง", async ({
    page,
  }) => {
    await loginAsTestUser(page);
    await page.goto("/payroll");

    const row = getFullTimeRow(page, MAIN_THERAPIST_NAME);
    await expect(row).toBeVisible();

    const lateShiftPayCell = row.locator("td").nth(6);
    const loanDeductionCell = row.locator("td").nth(7);
    const remainingCell = row.locator("td").nth(8);

    // งวดที่ 1 = ช่วงวันที่ default ที่หน้าแสดงจริงตอน mount (ดู readCurrentPeriodFromPicker ด้านบนว่าทำไม
    // ต้องอ่านจากเบราว์เซอร์จริงแทนการเดา) งวดที่ 2/3 ต่อเนื่องจากงวดที่ 1 แบบไม่มีช่องว่าง
    const mainPeriod1 = await readCurrentPeriodFromPicker(page);
    const mainPeriod2 = getHalfMonthPeriodContaining(getNextDayIso(mainPeriod1.end));
    const mainPeriod3 = getHalfMonthPeriodContaining(getNextDayIso(mainPeriod2.end));
    const mainPeriods = [mainPeriod1, mainPeriod2, mainPeriod3];

    await test.step("งวดที่ 1 (ครึ่งเดือนปัจจุบันจริง): หัก 1,000 เหลือ 2,000 พร้อมค่ากะดึกร่วมงวดเดียวกัน", async () => {
      await setPayrollPeriodAndConfirmCommitted(
        page,
        MAIN_THERAPIST_ID,
        mainPeriods[0].start,
        mainPeriods[0].end,
      );

      await expect(loanDeductionCell).toHaveText(`-${formatBaht(1000)} ฿`, { timeout: 15_000 });
      await expect(remainingCell).toHaveText(`${formatBaht(2000)} ฿`);
      // ยืนยันค่ากะดึกคำนวณร่วมในงวดเดียวกับที่มีการหักเบิกจริง (สถานการณ์ที่ 4 ตามคำสั่ง)
      await expect(lateShiftPayCell).toHaveText(`${formatBaht(250)} ฿`);
    });

    await test.step("Reload หน้าแล้วเลือกงวดเดิมซ้ำ ต้องไม่หักซ้ำ (ยังคงหัก 1,000 เหลือ 2,000 เท่าเดิม)", async () => {
      // session_user ถูกเก็บใน localStorage ซึ่งรอด page.reload() เสมอ (คนละกลไกกับ sessionStorage)
      // ไม่ต้อง login ซ้ำ — AppContext จะกู้คืน currentUser จาก localStorage ตอน initial load อัตโนมัติ
      await page.reload();
      await setPayrollPeriod(page, mainPeriods[0].start, mainPeriods[0].end);

      const rowAfterReload = getFullTimeRow(page, MAIN_THERAPIST_NAME);
      await expect(rowAfterReload.locator("td").nth(7)).toHaveText(`-${formatBaht(1000)} ฿`, {
        timeout: 15_000,
      });
      await expect(rowAfterReload.locator("td").nth(8)).toHaveText(`${formatBaht(2000)} ฿`);
    });

    await test.step("งวดที่ 2 (ครึ่งเดือนถัดไป ต่อเนื่องไม่มีช่องว่าง): หักต่ออีก 1,000 เหลือ 1,000", async () => {
      await setPayrollPeriodAndConfirmCommitted(
        page,
        MAIN_THERAPIST_ID,
        mainPeriods[1].start,
        mainPeriods[1].end,
      );

      await expect(loanDeductionCell).toHaveText(`-${formatBaht(1000)} ฿`, { timeout: 15_000 });
      await expect(remainingCell).toHaveText(`${formatBaht(1000)} ฿`);
    });

    await test.step("งวดที่ 3: หักงวดสุดท้าย 1,000 เหลือ 0", async () => {
      await setPayrollPeriodAndConfirmCommitted(
        page,
        MAIN_THERAPIST_ID,
        mainPeriods[2].start,
        mainPeriods[2].end,
      );

      await expect(loanDeductionCell).toHaveText(`-${formatBaht(1000)} ฿`, { timeout: 15_000 });
      await expect(remainingCell).toHaveText(`${formatBaht(0)} ฿`);
    });

    await test.step("ตรวจสลิปพิมพ์ (print slip) ของงวดที่ 3 ตรงกับตัวเลขในตารางเป๊ะ", async () => {
      await row.getByTitle("พิมพ์สลิปเงินเดือน").click();

      const payslip = page.locator("#printable-payslip");
      await expect(payslip).toBeVisible();
      // สโคปการตรวจแต่ละบรรทัดด้วยป้ายกำกับรายการ (label) เฉพาะเจาะจง เพราะสลิปมีตัวเลข "0 บาท"/
      // "+0 บาท" ซ้ำกันหลายบรรทัด (เช่น ค่ามือนวดสะสม/ท็อปอัป/ค่าคอมคอร์สที่เป็น 0 เพราะไม่มี booking
      // ทดสอบในงวดนี้) การค้นหาด้วยข้อความจำนวนเงินเปล่าๆ จึงกำกวม (strict mode violation)
      await expect(
        payslip.locator("div.grid.grid-cols-3", { hasText: "หักเบิกต่องวด (ยอดรวมหักเบิก)" }).getByText(`-${formatBaht(1000)} บาท`),
      ).toBeVisible();
      await expect(
        payslip.locator("div.grid.grid-cols-3", { hasText: "คงเหลือยอดหักเบิก (งวดถัดไป)" }).getByText(`${formatBaht(0)} บาท`),
      ).toBeVisible();
      await expect(
        payslip.locator("div.grid.grid-cols-3", { hasText: "ค่ากะดึกสะสมงวดนี้" }).getByText(`+${formatBaht(250)} บาท`),
      ).toBeVisible();
      // netSalary งวดนี้ = commission(0) + topup(0) + courseCommission(0) + lateShiftPay(250) - loanDeduction(1000) = -750
      await expect(
        payslip.locator("div.grid.grid-cols-3", { hasText: "คงเหลือจ่ายสุทธิงวดนี้" }).getByText(`${formatBaht(-750)} บาท`),
      ).toBeVisible();

      await page.getByRole("button", { name: "ปิด", exact: true }).click();
      await expect(payslip).not.toBeVisible();
    });
  });

  // ---------------------------------------------------------------------------
  // Test B — Regression บั๊กที่ 2 (เปิดงวดข้ามลำดับไม่มี guard) ยืนยันซ้ำผ่านเบราว์เซอร์จริงว่า guard
  // ที่ frontend-dev แก้ไว้ (แบนเนอร์เตือน + ต้องกดยืนยันก่อนถึงจะเขียน ledger) ทำงานถูกต้องจริง
  // ---------------------------------------------------------------------------
  test("เปิดงวดข้ามลำดับต้องเห็นแบนเนอร์เตือนและไม่เขียน ledger จนกว่าจะกดยืนยันรับทราบ", async ({ page }) => {
    // seed SKIP_THERAPIST_ID ตรงนี้เอง (ไม่ใช่ใน beforeAll ร่วมกับ MAIN_THERAPIST_ID) — ดูคำอธิบาย Why
    // เต็มๆ ที่ comment ใน beforeAll ด้านบน (กันไม่ให้ Test A พา SKIP_THERAPIST_ID ไปหักเบิกด้วยเงียบๆ)
    await setDoc(doc(seedFirestore, "therapists", SKIP_THERAPIST_ID), {
      id: SKIP_THERAPIST_ID,
      name: SKIP_THERAPIST_NAME,
      type: "full-time",
      dailyGuarantee: 600,
      bankName: "SCB",
      bankAccount: "000-0-00000-1",
      bankAccountName: SKIP_THERAPIST_NAME,
      phone: "0800000001",
      worksLateShift: false,
      advanceDeductionTotal: 2000,
      advanceDeductionPerPeriod: 500,
    });

    await loginAsTestUser(page);
    await page.goto("/payroll");

    const row = getFullTimeRow(page, SKIP_THERAPIST_NAME);
    await expect(row).toBeVisible();

    // งวด A = ช่วงวันที่ default ที่หน้าแสดงจริงตอน mount (เหตุผลเดียวกับ Test A — ดู
    // readCurrentPeriodFromPicker) งวด C = ข้ามงวด B (ครึ่งเดือนถัดไป) ไปเลยโดยตั้งใจ
    const skipPeriodA = await readCurrentPeriodFromPicker(page);
    const skipPeriodBSkipped = getHalfMonthPeriodContaining(getNextDayIso(skipPeriodA.end));
    const skipPeriodC = getHalfMonthPeriodContaining(getNextDayIso(skipPeriodBSkipped.end));
    const skipPeriods = [skipPeriodA, skipPeriodC];

    await test.step("งวดแรก (ครึ่งเดือนปัจจุบันจริง) หักปกติ 500 เหลือ 1,500 ไม่มีแบนเนอร์", async () => {
      await setPayrollPeriodAndConfirmCommitted(
        page,
        SKIP_THERAPIST_ID,
        skipPeriods[0].start,
        skipPeriods[0].end,
      );
      await expect(row.locator("td").nth(7)).toHaveText(`-${formatBaht(500)} ฿`, { timeout: 15_000 });
      await expect(row.locator("td").nth(8)).toHaveText(`${formatBaht(1500)} ฿`);
      await expect(page.getByText("ข้ามลำดับ")).not.toBeVisible();
    });

    // เหตุผลที่ต้องใช้ .first() กับ locator ของแบนเนอร์เตือนทั่วทั้งเทสนี้ (Why): พบว่าบางจังหวะเบราว์เซอร์
    // เรนเดอร์แบนเนอร์เดียวกันซ้อนกันชั่วขณะระหว่างเปลี่ยนหน้า/รีโหลด (transient double-render ไม่ใช่ข้อมูล
    // ผิดพลาด — ทั้งสอง instance ผูกกับ therapistId/งวดเดียวกันเป๊ะ) ถ้าใช้ locator เปล่าๆ จะชน strict mode
    const skipBanner = page.getByText(new RegExp(`หมอ${SKIP_THERAPIST_NAME}.*ข้ามลำดับ`));

    await test.step("ข้ามไปงวดถัดไปอีก 1 งวด (ข้ามงวดกลางไปเลย) ต้องเห็นแบนเนอร์เตือน", async () => {
      await setPayrollPeriod(page, skipPeriods[1].start, skipPeriods[1].end);
      await expect(skipBanner.first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("Reload แล้วเลือกงวดเดิมซ้ำโดยยังไม่กดยืนยัน — แบนเนอร์ต้องปรากฏซ้ำอีกครั้ง (พิสูจน์ว่ายังไม่ถูกเขียนลง ledger จริง)", async () => {
      await page.reload();
      await setPayrollPeriod(page, skipPeriods[1].start, skipPeriods[1].end);

      await expect(skipBanner.first()).toBeVisible({ timeout: 15_000 });
    });

    await test.step("กดยืนยันรับทราบ — แบนเนอร์หายไปและ ledger ถูกเขียนจริง", async () => {
      // คลิกปุ่มยืนยันทุก instance ที่เจอ (ไม่ใช่แค่ .first()) เพราะถ้าเกิด transient double-render จริง
      // (ดูคำอธิบาย Why ด้านบน) การคลิกแค่ปุ่มเดียวอาจเหลือ instance ที่สองที่ยังไม่ถูกกดค้างอยู่ ทำให้
      // แบนเนอร์ไม่หายสนิท
      const acknowledgeButtons = page.getByRole("button", {
        name: "ยืนยันว่ารับทราบและหักเบิกงวดนี้ต่อ",
      });
      const acknowledgeButtonCount = await acknowledgeButtons.count();
      for (let buttonIndex = 0; buttonIndex < acknowledgeButtonCount; buttonIndex += 1) {
        await acknowledgeButtons.nth(buttonIndex).click({ force: true });
      }

      await expect(skipBanner).toHaveCount(0, { timeout: 15_000 });
      // ยืนยันด้วยว่า ledger entry ถูกเขียนจริงลง Firestore แล้ว (ไม่ใช่แค่ banner หายไปจาก UI เฉยๆ)
      // ก่อนไปทดสอบ reload ต่อ — กันปัญหา debounce/race แบบเดียวกับที่เจอใน Test A
      await waitForLedgerEntryToExist(SKIP_THERAPIST_ID, skipPeriods[1].start, skipPeriods[1].end);
    });

    await test.step("Reload แล้วเลือกงวดเดิมซ้ำอีกครั้งหลังยืนยันแล้ว — ต้องไม่มีแบนเนอร์อีกต่อไป (ยืนยันว่า persisted จริงข้าม reload)", async () => {
      await page.reload();
      await setPayrollPeriod(page, skipPeriods[1].start, skipPeriods[1].end);

      const rowAfterAck = getFullTimeRow(page, SKIP_THERAPIST_NAME);
      await expect(rowAfterAck.locator("td").nth(7)).toHaveText(`-${formatBaht(500)} ฿`, {
        timeout: 15_000,
      });
      await expect(skipBanner).toHaveCount(0);
    });
  });
});
