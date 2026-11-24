import { defineConfig, devices } from "@playwright/test";

// พอร์ตนี้ต้อง "ไม่ตรง" กับพอร์ต 3000 ที่ dev server ปกติ/preview server ของเครื่องมือพัฒนาใช้อยู่เป็น
// ประจำ (Why — สำคัญที่สุด ห้ามแก้กลับ): เคยพบจริงระหว่างพัฒนาเทสนี้ว่ามี process "next dev" เปล่าๆ
// (ไม่ผ่าน dev:test, โหลด .env.local ที่ผูกกับ Firestore จริงของร้าน) ค้างอยู่ที่พอร์ต 3000 จาก preview
// server ของเครื่องมือ ถ้า Playwright ใช้พอร์ตเดียวกันพร้อม reuseExistingServer:true จะไปเชื่อมต่อกับ
// process เดิมนั้นแทนที่จะสั่ง "npm run dev:test" ของตัวเอง ทำให้ E2E เสี่ยงทดสอบกับฐานข้อมูลจริงของร้าน
// โดยไม่ได้ตั้งใจ (แม้จะยังไม่มีเทสไหนเขียนข้อมูลสำเร็จเพราะ login ล้มเหลวเนื่องจากไม่พบ user ทดสอบใน
// ฐานข้อมูลจริง แต่ก็ถือว่าเสี่ยงเกินไปที่จะปล่อยไว้) การแยกพอร์ตให้ Playwright เป็นของตัวเองเท่านั้น
// (ไม่มีอะไรอื่นในเครื่องมือแตะพอร์ตนี้) การันตีว่า "npm run dev:test" (NODE_ENV=test → โหลด .env.test)
// ต้องเป็นตัวที่สตาร์ทเซิร์ฟเวอร์ขึ้นมาจริงเสมอ ไม่มีทางไปชนกับ server อื่นที่โหลด .env.local ได้เลย
const E2E_TEST_SERVER_PORT = 3100;
const LOCAL_DEV_SERVER_URL = `http://localhost:${E2E_TEST_SERVER_PORT}`;

// Config นี้จำเป็นเพราะ Playwright ต้องรู้ testDir, baseURL, และวิธี auto-start
// dev server ก่อนรัน E2E test — reuseExistingServer ช่วยให้ dev คนละคนไม่ต้อง kill
// server เดิมทุกครั้งที่รันเทสระหว่างพัฒนา
//
// เหตุผลที่ webServer ต้องรัน "npm run dev:test" แทน "npm run dev" ตรงๆ (Why — สำคัญ ต้องอ่าน):
// .env.local ของโปรเจกต์นี้ผูกกับ Cloud Firestore จริงของร้าน (production) (มีข้อมูลพนักงาน/ยอดขาย
// จริงอยู่แล้ว — ดู PROJECT_STATUS.md) ถ้า Playwright สั่ง "next dev" ตรงๆ (NODE_ENV=development
// โดยปริยาย) จะโหลด .env.local ทันทีและ E2E จะเขียนข้อมูลทดสอบ/ปลอมลงฐานข้อมูลจริงของร้าน ซึ่งยอมรับ
// ไม่ได้ สคริปต์ "dev:test" ตั้ง NODE_ENV=test ก่อนเรียก next dev ซึ่งตาม Next.js Environment Variable
// Load Order (ดู node_modules/next/dist/docs/01-app/02-guides/environment-variables.md หัวข้อ
// "Test Environment Variables"/"Environment Variable Load Order") จะทำให้ Next.js "ไม่โหลด" .env.local
// เลยแม้แต่น้อย และโหลด .env.test แทน — จึงต้องมีไฟล์ .env.test ที่ชี้ไป Firebase project ทดสอบแยกต่างหาก
// ก่อนรัน E2E จริง (ดูคำแนะนำเต็มใน .env.test.example ที่ root โปรเจกต์)
export default defineConfig({
  testDir: "./testing/e2e",
  fullyParallel: true,
  reporter: "list",
  use: {
    baseURL: LOCAL_DEV_SERVER_URL,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: "npm run dev:test",
    url: LOCAL_DEV_SERVER_URL,
    // ส่ง PORT ผ่าน env ของ webServer แทนการฝัง flag ไว้ใน script "dev:test" ของ package.json — Next.js
    // (ดู node_modules/next/dist/cli/next-dev.js) อ่านค่า PORT จาก process.env โดยตรงอยู่แล้วถ้าไม่มี
    // --port ระบุมา จึงไม่ต้องแก้ script เดิมเลย ลดจุดที่ต้องเปลี่ยนโค้ดซ้ำ
    env: { PORT: String(E2E_TEST_SERVER_PORT) },
    reuseExistingServer: true,
  },
});
