// testing/e2e/authRoleAccess.spec.ts
//
// E2E จริงผ่านเบราว์เซอร์ (Playwright) สำหรับ Phase 4 — Authentication & System Accounts
// (ดู testing/TEST_PLAN.md Phase 4) ครอบคลุมตาม Definition of Done เดิม + Edge case 1
// (privilege escalation ผ่าน URL โดยตรง — ความเสี่ยงสูงสุด ตามคำสั่ง Main Chat):
//   (ก) ล็อกอินครบทั้ง 3 role จริง (super_manager_user-equivalent, admin_user-equivalent,
//       manager_user-equivalent) ตรวจสิทธิ์การเข้าถึงหน้าตรงตาม role
//   (ข) กรอกรหัสผ่านผิดต้องไม่ผ่าน
//   (ค) Edge case 1: ล็อกอินด้วย role หนึ่งแล้วพิมพ์ URL ตรงไปหน้าที่เป็นสิทธิ์ของอีก role
//
// รูปแบบ/มาตรการความปลอดภัยทั้งหมด (ตรวจ project id ก่อนรัน, seed/cleanup ผ่าน Firestore client SDK
// ตรงๆ, พอร์ต 3100 แยกจาก dev server อื่น) ใช้ pattern เดียวกับ testing/e2e/bookingsRegression.spec.ts
// ทุกประการ — ดูเหตุผลละเอียดของแต่ละจุดที่ comment ในไฟล์นั้น ไม่ duplicate คำอธิบายซ้ำในไฟล์นี้

import { test, expect, type Page } from "@playwright/test";
import * as fs from "fs";
import * as path from "path";
import { initializeApp, deleteApp, type FirebaseApp } from "firebase/app";
import {
  getFirestore,
  doc,
  setDoc,
  deleteDoc,
  type Firestore,
} from "firebase/firestore";
import {
  getAuth,
  createUserWithEmailAndPassword,
  deleteUser,
  type Auth,
  type User,
} from "firebase/auth";

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
      `"${EXPECTED_TEST_FIREBASE_PROJECT_ID}" — หยุดก่อนมีการเขียนข้อมูลทดสอบลง Firestore/Auth ผิด project`,
  );
}

// บัญชีทดสอบ role admin — จงใจ "ไม่มี" ฟิลด์ email เพื่อบังคับให้ AppContext.login() เดินเส้นทาง
// "ตรวจ password จากเอกสาร Firestore โดยตรง" (path B) แบบชัดเจนแน่นอน 100% ไม่ผ่านการเรียก
// Firebase Auth ก่อนเลย (ต่างจาก admin_user/manager_user ของจริงที่มี email แต่ไม่มีบัญชี Firebase Auth
// ผูกไว้จริง ซึ่งจะไปเรียก signInWithEmailAndPassword ก่อนแล้วค่อย fallback มา path เดียวกันนี้เมื่อพัง
// — พฤติกรรมปลายทางเหมือนกัน แต่การไม่มี email เลยทำให้เทสนี้เร็วและ deterministic กว่า ไม่ต้องรอ
// เครือข่ายพยายามยิง Firebase Auth ที่รู้อยู่แล้วว่าจะพังก่อนเสมอ)
const TEST_ADMIN_USERNAME = "qa_e2e_admin_phase4";
const TEST_ADMIN_PASSWORD = "QaE2eAdminPhase4Pass";

const TEST_MANAGER_USERNAME = "qa_e2e_manager_phase4";
const TEST_MANAGER_PASSWORD = "QaE2eManagerPhase4Pass";

// บัญชีทดสอบ role super-manager — "มี" ฟิลด์ email ผูกกับบัญชี Firebase Auth จริงที่สร้างขึ้นเฉพาะ
// สำหรับเทสนี้ใน beforeAll (path A: signInWithEmailAndPassword จริง) แล้วลบทิ้งใน afterAll เสมอ —
// ใช้อีเมลสมมติสำหรับทดสอบเท่านั้น ไม่ใช่บัญชีอีเมลจริงของเจ้าของระบบ
const TEST_SUPER_MANAGER_USERNAME = "qa_e2e_super_manager_phase4";
const TEST_SUPER_MANAGER_EMAIL = "qa.e2e.super.manager.phase4@example.com";
const TEST_SUPER_MANAGER_PASSWORD = "QaE2eSuperManagerPhase4Pass";

async function loginWithUsernameAndPassword(
  page: Page,
  username: string,
  password: string,
): Promise<void> {
  await page.goto("/login");
  await page.getByPlaceholder("กรอกชื่อผู้ใช้งาน หรือ อีเมล").fill(username);
  await page.getByPlaceholder("กรอกรหัสผ่าน").fill(password);
  await page.getByRole("button", { name: "เข้าสู่ระบบ", exact: true }).click();
}

// ---------------------------------------------------------------------------
// Seed / Cleanup ข้อมูลทดสอบผ่าน Firestore + Firebase Auth client SDK ตรงๆ (แยก Firebase app instance
// ชื่อเฉพาะ กันชนกับ E2E spec ไฟล์อื่นที่รันขนานกัน)
// ---------------------------------------------------------------------------
let seedApp: FirebaseApp;
let seedFirestore: Firestore;
let seedAuth: Auth;
let createdSuperManagerAuthUser: User | null = null;
let superManagerFirebaseAuthAccountAvailable = false;

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
    "qa-e2e-seed-app-auth-role-access",
  );
  seedFirestore = getFirestore(seedApp);
  seedAuth = getAuth(seedApp);

  await setDoc(doc(seedFirestore, "systemUsers", TEST_ADMIN_USERNAME), {
    username: TEST_ADMIN_USERNAME,
    password: TEST_ADMIN_PASSWORD,
    role: "admin",
    displayName: "QA E2E Admin Phase4",
    fullName: "QA E2E Admin Phase4 Tester",
  });

  await setDoc(doc(seedFirestore, "systemUsers", TEST_MANAGER_USERNAME), {
    username: TEST_MANAGER_USERNAME,
    password: TEST_MANAGER_PASSWORD,
    role: "manager",
    displayName: "QA E2E Manager Phase4",
    fullName: "QA E2E Manager Phase4 Tester",
  });

  await setDoc(doc(seedFirestore, "systemUsers", TEST_SUPER_MANAGER_USERNAME), {
    username: TEST_SUPER_MANAGER_USERNAME,
    email: TEST_SUPER_MANAGER_EMAIL,
    role: "super-manager",
    displayName: "QA E2E Super Manager Phase4",
    fullName: "QA E2E Super Manager Phase4 Tester",
  });

  // พยายามสร้างบัญชี Firebase Auth จริงสำหรับทดสอบ path A (signInWithEmailAndPassword) — ถ้าสร้างไม่ได้
  // ด้วยเหตุผลใดก็ตาม (เช่น Email/Password provider ยังไม่เปิดใน project ทดสอบ) จะ "ไม่ throw" ให้ทั้งไฟล์
  // พัง แต่ตั้ง flag ไว้ข้าม (skip) เฉพาะกลุ่มเทสที่พึ่งพา path A เท่านั้น พร้อม log เหตุผลชัดเจน
  try {
    const credential = await createUserWithEmailAndPassword(
      seedAuth,
      TEST_SUPER_MANAGER_EMAIL,
      TEST_SUPER_MANAGER_PASSWORD,
    );
    createdSuperManagerAuthUser = credential.user;
    superManagerFirebaseAuthAccountAvailable = true;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.warn(
      `[Phase 4 E2E] ข้ามกลุ่มเทส super-manager (Firebase Auth path จริง) เพราะสร้างบัญชีทดสอบไม่สำเร็จ: ${message}`,
    );
    superManagerFirebaseAuthAccountAvailable = false;
  }
});

test.afterAll(async () => {
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_ADMIN_USERNAME));
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_MANAGER_USERNAME));
  await deleteDoc(doc(seedFirestore, "systemUsers", TEST_SUPER_MANAGER_USERNAME));

  if (createdSuperManagerAuthUser) {
    await deleteUser(createdSuperManagerAuthUser);
  }

  await deleteApp(seedApp);
});

test.describe("Auth & Role Access — E2E จริงผ่าน Playwright (Phase 4)", () => {
  // บังคับรันทีละเทสในตัวเดียวกัน (Why จำเป็น — พบจริงระหว่างพัฒนาเทสนี้): ไฟล์นี้ใช้ username/email
  // คงที่ร่วมกันทุกเทส (TEST_ADMIN_USERNAME ฯลฯ) ผ่าน beforeAll/afterAll ระดับไฟล์ — ถ้าปล่อยให้รันขนาน
  // หลาย worker ตาม fullyParallel เดิมของ playwright.config.ts (worker ละ subset ของเทสในไฟล์เดียวกัน)
  // จะเกิด race จริง: worker ที่ทำเทสของตัวเองเสร็จก่อนจะรัน afterAll ลบเอกสาร systemUsers/บัญชี
  // Firebase Auth ทดสอบทิ้งทันที ทั้งที่ worker อื่นยังใช้ username/email เดียวกันทำเทสค้างอยู่ ทำให้
  // login ล้มเหลวเงียบๆ แบบสุ่ม (ยืนยันแล้วจากผลรันจริงครั้งแรกที่ 2/8 เทส fail แบบไม่คงที่) — โหมด serial
  // บังคับให้ทุกเทสในไฟล์นี้ใช้ worker เดียวกันและรันเรียงตามลำดับ ตัด race นี้ทิ้งไปเลย
  test.describe.configure({ mode: "serial" });

  test.setTimeout(60_000);

  // -------------------------------------------------------------------------
  // (ก) ล็อกอินครบ role + ตรวจสิทธิ์การเข้าถึงหน้าตรงตาม role
  // -------------------------------------------------------------------------
  test("(ก) admin ล็อกอินสำเร็จผ่าน Firestore document password path (ไม่มี email) และเห็นเมนูตามสิทธิ์ admin เท่านั้น", async ({
    page,
  }) => {
    await loginWithUsernameAndPassword(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    // admin เห็นเมนูหลัก แต่ต้อง "ไม่เห็น" เมนู "บัญชีระบบ" (super-manager เท่านั้น) และ "ตั้งค่าร้าน"
    // (manager ขึ้นไปเท่านั้น) ในแถบด้านข้าง
    await expect(page.getByRole("button", { name: "บันทึกงานนวด", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "บัญชีระบบ", exact: true })).toHaveCount(0);
    await expect(page.getByRole("button", { name: "ตั้งค่าร้าน", exact: true })).toHaveCount(0);
  });

  test("(ก) manager ล็อกอินสำเร็จและเห็นเมนู 'ตั้งค่าร้าน' แต่ไม่เห็นเมนู 'บัญชีระบบ' (เฉพาะ super-manager)", async ({
    page,
  }) => {
    await loginWithUsernameAndPassword(page, TEST_MANAGER_USERNAME, TEST_MANAGER_PASSWORD);
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    await expect(page.getByRole("button", { name: "ตั้งค่าร้าน", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "บัญชีระบบ", exact: true })).toHaveCount(0);
  });

  test("(ก) super-manager ล็อกอินสำเร็จผ่าน Firebase Auth จริง (signInWithEmailAndPassword) และเห็นเมนู 'บัญชีระบบ' ครบ", async ({
    page,
  }) => {
    test.skip(
      !superManagerFirebaseAuthAccountAvailable,
      "ข้ามเพราะสร้างบัญชี Firebase Auth ทดสอบไม่สำเร็จใน beforeAll (ดู log คำเตือนด้านบน)",
    );

    await loginWithUsernameAndPassword(
      page,
      TEST_SUPER_MANAGER_USERNAME,
      TEST_SUPER_MANAGER_PASSWORD,
    );
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    await expect(page.getByRole("button", { name: "บัญชีระบบ", exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "ตั้งค่าร้าน", exact: true })).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // (ข) กรอกรหัสผ่านผิดต้องไม่ผ่าน
  // -------------------------------------------------------------------------
  test("(ข) กรอกรหัสผ่านผิดสำหรับบัญชี admin ต้องไม่ผ่าน และเห็นข้อความแจ้งเตือนชัดเจน", async ({ page }) => {
    await loginWithUsernameAndPassword(page, TEST_ADMIN_USERNAME, "รหัสผ่านผิดแน่นอน");

    await expect(
      page.getByText("ชื่อผู้ใช้งานหรือรหัสผ่านระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  test("(ข) กรอกรหัสผ่านผิดสำหรับบัญชี super-manager (email path) ต้องไม่ผ่าน", async ({ page }) => {
    test.skip(
      !superManagerFirebaseAuthAccountAvailable,
      "ข้ามเพราะสร้างบัญชี Firebase Auth ทดสอบไม่สำเร็จใน beforeAll (ดู log คำเตือนด้านบน)",
    );

    await loginWithUsernameAndPassword(page, TEST_SUPER_MANAGER_USERNAME, "รหัสผ่านผิดแน่นอน");

    await expect(
      page.getByText("ชื่อผู้ใช้งานหรือรหัสผ่านระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง"),
    ).toBeVisible();
    await expect(page).toHaveURL(/\/login$/);
  });

  // -------------------------------------------------------------------------
  // เคสเปรียบเทียบ (Contrast) ทั้ง 2 เคสนี้ตั้งใจให้รันก่อนเคสวิกฤต (ค) ด้านล่างสุด (Why): โหมด serial
  // ของ Playwright จะข้าม (skip) เทสที่เหลือทั้งหมดทันทีที่เจอเทสแรก fail ในกลุ่มเดียวกัน — ถ้าวางเคส
  // วิกฤตที่รู้อยู่แล้วว่าจะ fail ไว้ก่อน จะทำให้เคสเปรียบเทียบเหล่านี้ไม่ถูกรันเลย จึงต้องจัดลำดับให้เคส
  // ที่คาดว่าจะผ่านทั้งหมดรันก่อนเสมอ แล้วเก็บเคสวิกฤตไว้ท้ายสุดของไฟล์
  // -------------------------------------------------------------------------
  test("(เปรียบเทียบ — ผ่าน) (ค) admin พิมพ์ URL '/settings/categories' ตรงๆ ถูก block จริงด้วย guard ในหน้านั้นเอง", async ({
    page,
  }) => {
    await loginWithUsernameAndPassword(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    await page.goto("/settings/categories");

    await expect(
      page.getByText("สิทธิ์ไม่เพียงพอ — เฉพาะ Manager ขึ้นไปเท่านั้น"),
    ).toBeVisible();
  });

  test("(เปรียบเทียบ — ผ่าน) (ค) admin พิมพ์ URL '/users' ตรงๆ ถูก MainLayout บล็อกถูกต้อง (อยู่ใน navItems, super-manager เท่านั้น)", async ({
    page,
  }) => {
    await loginWithUsernameAndPassword(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    await page.goto("/users");

    await expect(page.getByText("สิทธิ์ไม่เพียงพอในการเข้าถึง")).toBeVisible();
  });

  // -------------------------------------------------------------------------
  // (ค) Edge case 1 [ความเสี่ยงสูงสุด] — Privilege escalation ผ่าน URL โดยตรง (ตั้งใจวางไว้ท้ายสุดของไฟล์
  // ตามเหตุผลที่อธิบายไว้ด้านบน — ไม่กระทบลำดับความสำคัญของการรายงานผล เพียงแค่กันไม่ให้ serial mode
  // ข้ามเคสเปรียบเทียบที่ควรผ่านไปด้วย)
  //
  // Input: ล็อกอินด้วยบัญชี admin แล้วพิมพ์ URL "/settings" ตรงๆ ในแอดเดรสบาร์ (page.goto ไม่ใช่คลิกเมนู)
  // Expected (พฤติกรรมที่ปลอดภัยที่ควรมี): ต้องถูก block จริง (เห็นข้อความปฏิเสธสิทธิ์ หรือถูก redirect
  //           ออกจากหน้า ไม่ใช่แค่เมนูถูกซ่อนแต่หน้ายังเข้าถึงได้ถ้ารู้ URL)
  // Actual (พฤติกรรมจริงที่ยืนยันแล้วด้วย testing/unit/authRoleGuard.test.tsx): หน้า /settings ไม่มี
  //        guard ใดๆ เลยทั้งใน MainLayout.tsx (ไม่ได้ลงทะเบียนใน navItems) และในตัว
  //        src/app/settings/page.tsx เอง (ไม่มีการเช็ค currentRole เลยสักบรรทัด) — admin เข้าถึงฟอร์ม
  //        แก้ไขพนักงาน/บริการ/เรทค่ากะดึกได้เต็มรูปแบบทันที
  // -------------------------------------------------------------------------
  test("[ความเสี่ยงสูงสุด] (ค) Edge case 1 — admin พิมพ์ URL '/settings' ตรงๆ ต้องถูก block จริง (ไม่ใช่แค่ซ่อนเมนู)", async ({
    page,
  }) => {
    await loginWithUsernameAndPassword(page, TEST_ADMIN_USERNAME, TEST_ADMIN_PASSWORD);
    await expect(page).toHaveURL("/", { timeout: 20_000 });

    // จำลอง "พิมพ์ URL ตรงในแอดเดรสบาร์" จริงๆ ผ่านเบราว์เซอร์ — ไม่ใช่คลิกลิงก์ในแอป
    await page.goto("/settings");

    // ใช้ expect(...).toPass() แทนการเช็คแบบ snapshot ครั้งเดียว (Why จำเป็น — พบ flaky จริงระหว่าง
    // verify): ทันทีหลัง page.goto() resolve (แค่รอ load event) หน้ายังอยู่ในสถานะ "กำลังโหลดระบบ..."
    // ของ MainLayout เสมอ เพราะ AppProvider ต้องกู้คืนเซสชันจาก localStorage แบบ async (isInitialLoading)
    // ก่อนที่ guard ของ settings/page.tsx จะมีโอกาสตรวจ currentRole ได้เลย ถ้าเช็คทันทีแบบ isVisible()
    // ครั้งเดียวจะเจอสถานะ "ระหว่างโหลด" ที่ยังไม่มีทั้ง redirect และข้อความปฏิเสธสิทธิ์ ทำให้เทส fail
    // เป็นพักๆ ทั้งที่บั๊กถูกแก้แล้วจริง — toPass() รอ/ลองซ้ำจนกว่าเงื่อนไขจะเป็นจริงหรือหมดเวลาที่กำหนด
    await expect(async () => {
      const isBlockedByRedirect = !page.url().endsWith("/settings");
      const hasAccessDeniedMessage = await page
        .getByText(/สิทธิ์ไม่เพียงพอ/)
        .isVisible()
        .catch(() => false);

      expect(isBlockedByRedirect || hasAccessDeniedMessage).toBe(true);
    }).toPass({ timeout: 15_000 });
  });
});
