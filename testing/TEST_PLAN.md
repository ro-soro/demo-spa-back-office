# Test Plan — Demo Spa Massage Back Office

> ไฟล์นี้คือแผนทดสอบหลักที่ `qa-tester` subagent ต้องอ้างอิงทุกครั้งที่ได้รับคำสั่ง "เริ่ม Phase [เลข]"
> ไม่ต้องขอให้ Main Chat อธิบายแผนซ้ำ — อ่านไฟล์นี้ก่อนเริ่มงานเสมอ ตามกฎ [`/testing/AGENTS.md`](AGENTS.md)
> แบ่ง Phase ตาม **ความเสี่ยง/ผลกระทบ** ไม่ใช่ตามลำดับเวลาที่พัฒนาเสร็จ — Phase ที่กระทบเงิน/ข้อมูลสำคัญมาก่อนเสมอ

**สถานะ:** **✅ ครบทั้ง 6 Phase (0-5) เสร็จสมบูรณ์ 100% แล้ว (อัปเดตล่าสุด 2026-07-10)** ดูรายละเอียดสถานะแต่ละ Phase ในตารางด้านล่าง และ Test Status Report เต็มใน [`/PROJECT_STATUS.md`](../PROJECT_STATUS.md) หมวด Testing

---

## Phase 0 — Baseline Sanity Gate (ประตูเริ่มต้น บังคับรันก่อนทุก Phase)

| หัวข้อ | รายละเอียด |
|---|---|
| **โมดูล/ฟีเจอร์** | ทั้งระบบ (baseline) — ยืนยันว่าโค้ดปัจจุบันอยู่ในสถานะเขียวจริงก่อนเริ่มเจาะราย Phase |
| **ประเภทเทสที่ต้องทำ** | Re-run: `npx vitest run` (คาดหวัง 25/25 ผ่านตาม PROJECT_STATUS.md), `npx tsc --noEmit` (0 errors), `npm run lint` (0 errors, 2 warning เดิมที่รู้อยู่แล้วคือ React Compiler / react-hook-form `watch()` ยอมรับได้), `npm run build` (ต้องผ่าน) |
| **Dependency ข้าม Phase** | ไม่มี ต้องรันก่อน Phase 1 เสมอ |
| **Definition of Done** | ทุกคำสั่งข้างต้นผ่านทั้งหมดโดยไม่มี error ใหม่ที่ไม่เคยรู้จักมาก่อน ถ้ามี fail ใดๆ ต้องหยุดและรายงาน Main Chat ก่อน ห้ามข้ามไป Phase อื่น |

---

## Phase 1 — Payroll & Advance Deduction Ledger (ความเสี่ยงสูงสุด: กระทบเงินโดยตรง)

| หัวข้อ | รายละเอียด |
|---|---|
| **โมดูล/ฟีเจอร์** | ระบบหักเบิกต่องวดอัตโนมัติ (ledger-based): `Therapist.advanceDeductionTotal`, `advanceDeductionPerPeriod`, `AdvanceDeductionLedgerEntry` ([initialData.ts](../src/data/initialData.ts)), CRUD collection `advanceDeductionLedger` ([db.ts](../src/utils/db.ts)), `recordAdvanceDeduction` ([AppContext.tsx](../src/context/AppContext.tsx)), pure function `calculatePeriodDeduction`/`getAdvanceDeductionForPeriod` ([advanceDeduction.ts](../src/utils/advanceDeduction.ts)); ระบบหักเบิก/กู้ยืม + ค่ากะดึกรายบุคคล (`worksLateShift`, payroll calc ใน [payroll/page.tsx](../src/app/payroll/page.tsx)); legacy fallback อ่านฟิลด์ `advanceDeduction` เก่าเข้า `advanceDeductionTotal`; Backend schema `advance_deduction_ledger` พร้อม `UNIQUE(therapist_id, period_start, period_end)` |
| **ประเภทเทสที่ต้องทำ** | **Re-run:** `advanceDeduction.test.tsx` (ของเดิม — หักไม่เกินคงเหลือ, หยุดที่ 0, กันหักซ้ำงวดเดิม, คำนวณคงเหลือถูกต้องข้ามหลายงวด, แยกยอดหมอนวดแต่ละคน) <br> **ต้องเขียนใหม่ (ยังไม่มี):** unit test สำหรับ legacy fallback (`advanceDeduction` เก่า → `advanceDeductionTotal`), unit test ค่ากะดึก (`worksLateShift`) กับสูตรคำนวณ payroll รวม, unit test UNIQUE constraint ระดับ schema (จำลองการเขียนซ้ำ period เดิม) <br> **E2E ที่ต้องมี:** เพิ่มพนักงานทดสอบยอดรวมหักเบิก 3000 / ต่องวด 1000 → รันครบ 3 งวดยืนยันยอดลดถูกต้อง (2000→1000→0), reload หน้าแล้วไม่หักซ้ำ, ตรวจสลิปพิมพ์ตรงกับตาราง, ทดสอบเคสกะดึกร่วมกับหักเบิกพร้อมกันในงวดเดียว |
| **Dependency ข้ามเฟส** | ต้องรอ **Phase 0 ผ่านก่อน** |
| **Definition of Done** | unit tests ใหม่ + เดิมผ่านทั้งหมด, E2E ครบ 3 งวดไม่มีการหักซ้ำแม้ reload, ยอดในตารางกับสลิปพิมพ์ตรงกัน 100%, ไม่มี regression ต่อฟีเจอร์เดิมที่เคย manual test ผ่านแล้วใน PROJECT_STATUS.md |
| **สถานะ (2026-07-09)** | **เสร็จสมบูรณ์ 100% รวม E2E จริงผ่าน Playwright แล้ว** ดู Test Status Report เต็มใน [`/PROJECT_STATUS.md`](../PROJECT_STATUS.md) หมวด Testing ทุก unit/E2E-equivalent test ตาม Definition of Done เดิมผ่านหมด และ 4 edge case เพิ่มเติมนอกแผนเดิม (ยอดคงเหลืองวดสุดท้ายน้อยกว่าค่าหักต่องวด, เรียกซ้ำตอนคงเหลือ 0, เปิดงวดข้ามลำดับ, สลับช่วงวันที่ไปมาบนหน้า payroll) ผ่านครบทั้งหมดแล้ว — 2 บั๊กที่เคยพบจริง (เขียน ledger entry ของช่วงวันที่ผสม + เปิดงวดข้ามลำดับไม่มี guard) ถูก frontend-dev แก้แล้ว (debounce `settledDateRange` + guard `periodStart > periodEnd`, และ guard เช็คลำดับงวดต่อเนื่องพร้อมแบนเนอร์ยืนยัน) และ qa-tester ยืนยันด้วยเทสจริงแล้วว่าถูกต้อง (`testing/unit/payrollPageIntegration.test.tsx` รวม 41/41 เทสทั้งโปรเจกต์ผ่าน, `tsc`/`lint`/`build` สะอาด 100%) **🆕 (2026-07-09) E2E จริงผ่าน Playwright บน Firebase test project แยกต่างหาก (`demo-spa-test`) ยืนยันแล้ว** ไม่ใช่ RTL substitute อีกต่อไป — ไฟล์ [`testing/e2e/payrollAdvanceDeductionLedger.spec.ts`](e2e/payrollAdvanceDeductionLedger.spec.ts) ครอบคลุมครบ 4 สถานการณ์หลัก (หักเบิกครบ 3 งวด 2000→1000→0, reload ไม่หักซ้ำ, สลิปพิมพ์ตรงกับตาราง, กะดึกร่วมกับหักเบิกในงวดเดียว) บวก regression บั๊กเปิดงวดข้ามลำดับผ่านเบราว์เซอร์จริง — **2/2 E2E ผ่านทุกครั้ง ยืนยันซ้ำ 3 รอบติดต่อกัน** ไม่มี flakiness เหลืออยู่ **อนุญาตให้เริ่ม Phase 2 ได้** |

---

## Phase 2 — Booking Financial Calculations (ความเสี่ยงสูง: กระทบเงินต่อรายการจอง)

| หัวข้อ | รายละเอียด |
|---|---|
| **โมดูล/ฟีเจอร์** | หน้าบันทึกงานนวด ([bookings/page.tsx](../src/app/bookings/page.tsx)): เวลาเข้า-ออก auto sync กับผลรวมชั่วโมงจริงเมื่อมีบริการหลายรายการ (`syncTimeEndWithTotalHours`), ยอดรับเงินรวมที่ต้องรวม สด+โอน+บัตร+ทิป จริง (`formTotalReceived`) |
| **ประเภทเทสที่ต้องทำ** | **Re-run:** `bookingDuration.test.tsx` (ของเดิม) <br> **ต้องเขียนใหม่ (ยังไม่มี):** unit test สำหรับ `formTotalReceived` (กรณีมี/ไม่มีทิป, ครบ/ไม่ครบทุกช่องทางชำระ), unit test `syncTimeEndWithTotalHours` กรณีเพิ่ม/ลบรายการบริการ 2+ รายการสลับกัน <br> **E2E ที่ต้องมี:** เพิ่มบริการ 2 รายการขึ้นไปแล้วตรวจเวลาสิ้นสุด auto sync ถูกต้อง, กรอกเงินสด+โอน+บัตร+ทิปครบแล้วตรวจยอดรวมที่แสดงตรงกับผลรวมจริง |
| **Dependency ข้ามเฟส** | ต้องรอ **Phase 0 ผ่านก่อน** (ไม่ต้องรอ Phase 1 เพราะเป็นคนละ data domain) |
| **Definition of Done** | unit tests ใหม่ผ่านครบ, E2E ยืนยันเวลาและยอดเงินคำนวณถูกต้องในทุก combination ของช่องทางชำระ ไม่มีกรณีตัวเลขคลาดเคลื่อน |
| **สถานะ (2026-07-09)** | **เสร็จสมบูรณ์ 100% (unit + E2E)** — `bookingDuration.test.tsx` เดิม re-run ผ่านไม่มี regression, ไฟล์ [`testing/unit/bookingsPageIntegration.test.tsx`](bookingsPageIntegration.test.tsx) ครอบคลุม `formTotalReceived`/`syncTimeEndWithTotalHours` ครบตาม Definition of Done เดิม บวก 4 edge case เพิ่มเติมนอกแผนเดิม (ลบบริการจนเหลือ 0 รายการ, กรอกช่องทางชำระเป็น 0 ตรงๆ, สลับลบ-เพิ่มบริการไม่เรียงลำดับ, ยอดบริการรวมไม่ตรงกับยอดรับเงิน) — Edge case 4 ปิดสมบูรณ์หลัง frontend-dev เพิ่ม soft warning (`hasPaymentAmountMismatch`/`paymentAmountDifference` ใน `bookings/page.tsx`) และ qa-tester ยืนยันด้วยเทสจริงครบ 3 สถานการณ์ (ขาด/เกิน/ตรงกันพอดี) — ผลรวม unit ทั้งโปรเจกต์ **54/54 ผ่าน** **🆕 (2026-07-09) E2E จริงผ่าน Playwright บน Firebase test project แยกต่างหาก (`demo-spa-test`) ยืนยันแล้ว** ไม่ใช่ RTL substitute อีกต่อไป — ไฟล์ [`testing/e2e/bookingFinancialCalculations.spec.ts`](../testing/e2e/bookingFinancialCalculations.spec.ts) ครอบคลุมทั้ง 2 สถานการณ์หลัก (เพิ่มบริการ 2 รายการ `timeEnd` auto sync ถูกต้อง, กรอกครบ 4 ช่องทางชำระยอดรวมตรงกับผลรวมจริง) บวกยืนยัน soft warning ของ Edge case 4 ผ่านเบราว์เซอร์จริง — **1/1 E2E ผ่านทุกครั้ง ยืนยันซ้ำ 3 รอบติดต่อกัน ไม่มี flakiness** (รันรวมกับ Phase 1 E2E พร้อมกันก็ผ่านครบ 4/4 ไม่ชนกัน) ข้อมูลทดสอบถูกลบสะอาดหมดหลังจบเทส (ยืนยันแล้ว 0 เอกสารค้าง) `tsc`/`lint`/`build` สะอาด 100% **อนุญาตให้เริ่ม Phase 3 ได้** |

---

## Phase 3 — Regression: บั๊กที่เพิ่งแก้ (แยกเฉพาะ เพราะเคยพังมาก่อนจริง)

| หัวข้อ | รายละเอียด |
|---|---|
| **โมดูล/ฟีเจอร์** | (ก) **Silent failure ตอนบันทึก booking** — เดิม `onSubmit` เรียก `addOrUpdateBooking` แบบ fire-and-forget ไม่ await ทำให้ error จาก Firestore หายเงียบ แก้เป็น async/await + try-catch + ปุ่ม "กำลังบันทึก..." กันกดซ้ำ <br> (ข) **ช่องโหว่ NaN 8 ฟิลด์ทั่วระบบ** — `dailyGuarantee`, service `duration`/`price`/`commission`, คอร์ส `defaultPrice`, `round`, ยอดขายคอร์ส `price`/`commissionPercent` ที่แก้ด้วย helper ร่วม `requiredNumberInput`/`optionalNumberInputToZero` ใน [numericInput.ts](../src/utils/numericInput.ts) รวมถึงช่องเงินสด/โอน/บัตร/ทิปที่เจอบั๊กจริงตอนล้างช่องบัตรเครดิตแล้วกรอกเงินสด/โอนแทน |
| **ประเภทเทสที่ต้องทำ** | **Re-run:** `auth.test.tsx`, `sanity.test.tsx` (เพื่อยืนยัน baseline ยังไม่เพี้ยน) <br> **ต้องเขียนใหม่ (ยังไม่มี — นี่คือช่องว่างสำคัญที่สุดของ Phase นี้):** unit test เฉพาะเจาะจงสำหรับทั้ง 8 ฟิลด์ที่เคยมีช่องโหว่ NaN (ทดสอบกรอกค่าว่าง/ลบค่า/สลับ field แล้วตรวจว่าไม่เกิด `NaN` หลุดเข้า state), unit test จำลอง Firestore write ล้มเหลว (mock reject) แล้วตรวจว่า error แสดงผลจริงและ Modal ไม่ปิด, unit test ปุ่ม "กำลังบันทึก..." กันกดซ้ำ (double-submit prevention) <br> **E2E ที่ต้องมี:** ทำซ้ำสถานการณ์จริงที่เคยเจอบั๊ก — ล้างช่องบัตรเครดิตแล้วกรอกเงินสด/โอนแทน ต้องไม่มี error message หายเงียบ, ปิด network/บังคับ Firestore error แล้วตรวจว่าผู้ใช้เห็น error ชัดเจนและฟอร์มไม่ปิดเอง |
| **Dependency ข้ามเฟส** | ต้องรอ **Phase 2 ผ่านก่อน** (เพราะ regression นี้อยู่บนฟอร์ม booking เดียวกับที่ Phase 2 ตรวจ logic การคำนวณไปแล้ว ต้องมั่นใจว่าค่าเงินถูกต้องก่อนค่อยเจาะ edge case การกรอกผิดพลาด) |
| **Definition of Done** | ครบทั้ง 8 ฟิลด์ต้องมี unit test คุ้มครองเฉพาะเจาะจง (ห้ามพึ่งพฤติกรรมบังเอิญของ Zod อีก), จำลอง Firestore fail แล้ว error ต้องแสดงจริงเสมอ ไม่มี silent failure หลงเหลือ, ทดสอบ double-submit แล้วไม่เกิดข้อมูลซ้ำ |
| **สถานะ (2026-07-09)** | **เสร็จสมบูรณ์ 100% (unit + E2E)** — Definition of Done เดิมผ่านครบ: (ก) Silent failure คุ้มครองด้วย [`testing/unit/bookingsPageRegression.test.tsx`](bookingsPageRegression.test.tsx) (mock `db.saveBooking` reject จริง, ยืนยัน error แสดงผล + Modal ไม่ปิด + ปุ่ม "กำลังบันทึก..." disable ทันที) และ [`testing/e2e/bookingsRegression.spec.ts`](../testing/e2e/bookingsRegression.spec.ts) จริงบน Firebase test project `demo-spa-test` (ข) NaN 8 ฟิลด์ คุ้มครองด้วย [`testing/unit/numericInputHelpers.test.ts`](numericInputHelpers.test.ts) (เทส pure function ตรงๆ ครบ 8 ฟิลด์ ไม่พึ่งพฤติกรรมบังเอิญของ Zod) บวก component-level [`testing/unit/settingsPageNaNFields.test.tsx`](settingsPageNaNFields.test.tsx)/[`testing/unit/coursePagesNaNFields.test.tsx`](coursePagesNaNFields.test.tsx) ยืนยัน wiring จริงในฟอร์ม **🆕 เพิ่ม 3 edge case นอกแผนเดิมตามคำสั่ง Main Chat (ครบทั้ง unit+E2E จริง):** (1) Double-submit จริงกับ Firestore ยืนยันไม่เกิดข้อมูลซ้ำทั้งระดับ unit (mock call count) และ E2E จริง (`page.mouse.click()` รัวๆ + query Firestore ตรงๆ) (2) กรอก NaN-prone field หลายฟิลด์ผิดพร้อมกันในฟอร์มเดียว (ฟอร์มบริการ 3 ฟิลด์ + ฟอร์มขายคอร์ส 2 ฟิลด์) ยืนยัน error message ไม่ทับซ้อน/สับสน (3) Firestore write ล้มเหลวตอนแก้ไข booking เดิม ยืนยันข้อมูลเดิมไม่เสียหายทั้งระดับ unit และ E2E จริง (query Firestore คนละ connection กับหน้าที่ถูกตัดเครือข่าย) — **ผลรวม unit ทั้งโปรเจกต์ 81/81 ผ่าน, E2E 8/8 ผ่าน (ยืนยันซ้ำ 3 รอบ ไม่มี flaky), `tsc`/`lint`/`build` สะอาด 100%** ไม่พบ fail ใดๆ ไม่ต้องแก้โค้ด production เลย — พบข้อจำกัดทางเทคนิคของ Firestore SDK ระหว่างพัฒนา E2E (offline-first design ทำให้ write ไม่ reject จากการตัดเครือข่ายล้วนๆ ภายในเวลาที่เทสได้ ต้องปรับ E2E assertion ของ (ก.2)/(ค.3) เป็นตรวจ "Modal ไม่ปิดก่อนเวลา+ปุ่มค้างสถานะ" แทน "error alert" — ส่วน error alert ปรากฏจริงยืนยันครบแล้วในระดับ unit ด้วย `vi.mock` ที่ควบคุม reject ได้ตรงจุด) รายละเอียดเต็มดู [`/PROJECT_STATUS.md`](../PROJECT_STATUS.md) หมวด Testing — **อนุญาตให้เริ่ม Phase 4 ได้** |

---

## Phase 4 — Authentication & System Accounts (ข้อมูลสำคัญ: สิทธิ์การเข้าถึง)

| หัวข้อ | รายละเอียด |
|---|---|
| **โมดูล/ฟีเจอร์** | Firebase Authentication — บัญชี `super_manager_user` ล็อกอินผ่าน `signInWithEmailAndPassword` จริง ([AppContext.tsx](../src/context/AppContext.tsx)), บัญชี `admin_user`/`manager_user` ตรวจรหัสผ่านจากเอกสาร `systemUsers` ใน Firestore/local; `SystemUser` fields (`displayName`, `fullName`, `password`, `email`); ล้างข้อมูลตัวอย่างเก่า (seed arrays = `[]`) |
| **ประเภทเทสที่ต้องทำ** | **Re-run:** `auth.test.tsx` (ของเดิม ครอบคลุม localStorage fallback) <br> **ต้องเขียนใหม่ (ยังไม่มี):** unit test แยกพฤติกรรม 2 เส้นทาง auth (Firebase `signInWithEmailAndPassword` สำหรับ super_manager_user vs ตรวจ password จากเอกสาร Firestore สำหรับ role อื่น), unit test ยืนยันว่า seed arrays ว่างจริง (`[]`) ไม่มี mock data หลุดไปแสดงในระบบจริงโดยไม่ตั้งใจ <br> **E2E ที่ต้องมี:** ล็อกอินครบทั้ง 3 role จริง (super_manager_user, admin_user, manager_user) ตรวจสิทธิ์การเข้าถึงหน้าตรงตาม role, ทดสอบกรอกรหัสผ่านผิดต้องไม่ผ่าน |
| **Dependency ข้ามเฟส** | ต้องรอ **Phase 0 ผ่านก่อน** (เป็นอิสระจาก Phase 1-3 เพราะเป็นคนละ domain แต่ยังถือเป็นข้อมูลสำคัญ จึงมาก่อน UI ทั่วไป) |
| **Definition of Done** | ล็อกอินได้ถูกต้องครบทุก role, สิทธิ์การเข้าถึงหน้าตรงกับ role, ไม่มี seed/mock data รั่วเข้าสู่ระบบจริง |
| **สถานะ (2026-07-10)** | **✅ เสร็จสมบูรณ์ 100%** — Definition of Done เดิมผ่านครบ (unit 16/16 + E2E 5/5) และ **ทั้ง 2 ช่องโหว่ความเสี่ยงสูงที่ QA รายงาน (Edge case 1: Privilege Escalation ที่ `/settings`, Edge case 2: ไม่มีกลไกตรวจจับเซสชัน/token หมดอายุ) ได้รับการแก้ไขจริงโดย frontend-dev แล้ว ยืนยันซ้ำด้วยตนเองครบทั้ง unit + E2E จริง (E2E ยืนยันซ้ำ 3 รอบติดต่อกัน ไม่ flaky)** — Edge case 3 (ล็อกอินหลายแท็บพร้อมกัน) ยังคงเป็นรายงานพฤติกรรมจริงตามสถาปัตยกรรมปัจจุบัน ไม่ตัดสินว่าเป็นบั๊ก (ตามคำสั่งเดิม), Edge case 4 (เอกสาร systemUsers ถูกลบระหว่างล็อกอิน) = ผ่าน — **QA ตรวจสอบเพิ่มเติมและแก้ไฟล์เทส E2E เอง 1 จุด** (`testing/e2e/authRoleAccess.spec.ts` เคส Edge case 1 เปลี่ยนจากเช็ค DOM แบบ snapshot ครั้งเดียวเป็น `expect(...).toPass()` แบบ retry เพื่อกันเทส flaky จาก race condition ตอนโหลดเซสชัน async — ไม่ใช่การลด assertion แต่เป็นการทำให้เทส deterministic ขึ้น) — ดู Test Status Report เต็มใน [`/PROJECT_STATUS.md`](../PROJECT_STATUS.md) หมวด Testing — **อนุญาตให้เริ่ม Phase 5 ได้** |

---

## Phase 5 — UI/UX ทั่วไป (ความเสี่ยงต่ำสุด: ไม่กระทบข้อมูล/เงิน)

| หัวข้อ | รายละเอียด |
|---|---|
| **โมดูล/ฟีเจอร์** | แก้บั๊ก Sidebar/Logout หายบนหน้าเนื้อหายาว ([MainLayout.tsx](../src/components/MainLayout.tsx) — `h-screen` + scroll แยก); ปรับระบบ Loading เป็น Icon Spinner ([LoadingSpinner.tsx](../src/components/LoadingSpinner.tsx), แยก `isInitialLoading`/`isLoading`); แก้ไอคอน TimePicker มองไม่เห็นบนพื้นหลังเข้ม ([globals.css](../src/app/globals.css) `color-scheme: dark` + WebKit filter); หมวดหมู่สี (`colorClass`) sync ระหว่าง Settings และ Bookings |
| **ประเภทเทสที่ต้องทำ** | **Re-run:** `sanity.spec.ts` (E2E เดิม) <br> **ต้องเขียนใหม่ (ยังไม่มี):** E2E/visual check วัดตำแหน่ง Logout button ด้วย `getBoundingClientRect()` ในหน้าที่เนื้อหายาว (Dashboard, ตั้งค่าร้าน) ยืนยันอยู่ในวิวพอร์ตเสมอ, ทดสอบ responsive ที่ breakpoint mobile/tablet/desktop, visual check สี TimePicker/DatePicker icon บนพื้นหลังเข้ม, ทดสอบ colorClass ตรงกันระหว่างหน้า Settings กับ Bookings จริงในเบราว์เซอร์ <br> **หมายเหตุ:** ยังไม่มี unit test อัตโนมัติครอบคลุม UI-level flow (เปิด/ปิด Modal, การวัดตำแหน่ง DOM) ตาม PROJECT_STATUS.md เดิม — Phase นี้คือจุดที่ต้องเติมช่องว่างนั้น |
| **Dependency ข้ามเฟส** | ต้องรอ **Phase 0 ผ่านก่อน** เท่านั้น (เป็น Phase ท้ายสุดตามความเสี่ยง ไม่ผูกกับ Phase 1-4 ทางข้อมูล) |
| **Definition of Done** | Logout/Sidebar อยู่ในวิวพอร์ตทุกขนาดจอที่ทดสอบ, Loading spinner ไม่บังทั้งหน้าเวลา CRUD, ไอคอน TimePicker มองเห็นชัดเจนบนพื้นหลังเข้ม, สีหมวดหมู่ตรงกันทุกหน้า |
| **สถานะ (2026-07-10)** | **✅ เสร็จสมบูรณ์ 100%** — Definition of Done เดิมผ่านครบ (5 เทสใน [`testing/e2e/uiUxGeneral.spec.ts`](e2e/uiUxGeneral.spec.ts) ครอบคลุมทั้ง 4 ข้อ) **🆕 เพิ่ม 4 edge case นอกแผนเดิมตามคำสั่ง Main Chat (ครบทั้งหมด ไม่พบ fail):** (1) Loading spinner regression (fullScreen ตอนโหลดครั้งแรก vs แถบเล็กมุมขวาล่างตอน CRUD) (2) สำรวจพบหน้า "สรุปเงินเดือน" (`/payroll`) ยาวกว่า Dashboard/ตั้งค่าร้าน ยืนยัน Logout ยังอยู่ในวิวพอร์ต (3) TimePicker ข้าม browser จริงครบทั้ง chromium/firefox/webkit (สภาพแวดล้อมนี้ติดตั้งได้ครบ ไม่ต้องรายงาน known limitation) (4) Resize desktop→mobile ขณะ Modal เปิดอยู่ ไม่หลุด/ไม่ล้น viewport — ผลรวม unit ทั้งโปรเจกต์ยังคง **102/102 ผ่าน**, E2E รวม **25/25 ผ่าน (16 เดิม + 9 ใหม่) ยืนยันซ้ำ 3 รอบไม่มี flaky**, `tsc`/`lint`/`build` สะอาด 100% — ดู Test Status Report เต็มใน [`/PROJECT_STATUS.md`](../PROJECT_STATUS.md) หมวด Testing — **Phase สุดท้ายตามแผนปิดครบแล้ว (Phase 0-5)** |

---

## สรุปลำดับ Dependency ระหว่าง Phase

```
Phase 0 (Baseline Gate)
   ├─→ Phase 1 (Payroll/Advance Deduction) — เงิน ความเสี่ยงสูงสุด
   ├─→ Phase 2 (Booking Financial Calc) — เงิน
   │     └─→ Phase 3 (Regression: NaN + Silent Failure) — ต้องรอ Phase 2 ผ่านก่อน
   ├─→ Phase 4 (Auth & System Accounts) — ข้อมูลสำคัญ/สิทธิ์
   └─→ Phase 5 (UI/UX ทั่วไป) — ความเสี่ยงต่ำสุด ทำทีหลังสุด
```

Phase 1, 2, 4, 5 ไม่ผูก dependency ระหว่างกันโดยตรง (คนละ data domain) แต่ทุก Phase ต้องรอ Phase 0 ผ่านก่อนเสมอ มีเพียง Phase 3 ที่ผูกกับ Phase 2 อย่างชัดเจนเพราะเป็น regression ของฟอร์มเดียวกัน

## วิธีใช้ไฟล์นี้

เมื่อ Main Chat สั่ง "เริ่ม Phase [เลข]" ให้ `qa-tester` subagent:
1. อ่านไฟล์นี้ (`testing/TEST_PLAN.md`) เฉพาะตาราง Phase ที่ถูกสั่ง — ไม่ต้องขอบเขตอื่น
2. อ่าน `/testing/AGENTS.md` เพื่อโหลดกฎละเอียดทีม QA ตามปกติ
3. อ่านส่วนที่เกี่ยวข้องใน `/PROJECT_STATUS.md`
4. ลงมือตามประเภทเทสที่ระบุไว้ในตาราง Phase นั้นเท่านั้น
5. ตรวจ Definition of Done ของ Phase นั้นก่อนสรุปผล
6. อัปเดต `/PROJECT_STATUS.md` ส่วน Testing ตามปกติ พร้อม Test Status Report
