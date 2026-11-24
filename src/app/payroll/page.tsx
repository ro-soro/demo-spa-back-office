// src/app/payroll/page.tsx
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. นำ Tailwind CSS เข้ามาออกแบบแท็บแบบเลื่อนสลับ (Tab System) และเลย์เอาต์สไตล์โปร่งแสงเบลอกระจก
//    เพื่อให้การจัดการและประมวลผลเงินสัดส่วนพนักงานดูสวยงาม มีพื้นที่ตารางกว้างเพียงพอต่อข้อมูลประวัติ
// 2. ใช้ Framer Motion AnimatePresence ในการควบคุมลิ้นชักแสดงประวัติวันทำงานรายวัน (Daily Breakdown Drawer)
//    แบบสไลด์เพื่อช่วยให้ผู้จัดการตรวจสอบที่มาที่ไปของยอดเงินท็อปอัป (Top-up) ได้ละเอียดและนุ่มนวล
// 3. ใช้การแต่งกล่อง Payslip พิมพ์ใบแจ้งรายรับเป็นส้นขีดจำลอง พร้อมกำหนด Class หักพิมพ์ no-print
//    เพื่อรองรับการสั่งพิมพ์ออกทางกระดาษ A4 หรือบันทึก PDF ทันทีจากหน้าระบบอย่างสมบูรณ์แบบ

"use client";

import React, { useEffect, useState } from "react";
import { useApp } from "@/context/AppContext";
import { Therapist, AdvanceDeductionLedgerEntry } from "@/data/initialData";
import { motion, AnimatePresence } from "framer-motion";
import { DatePicker } from "@/components/DatePicker";
import { formatDateForDisplay } from "@/utils/thaiDate";
import { getAdvanceDeductionForPeriod } from "@/utils/advanceDeduction";
import { Award, Printer, Calendar, X, UserCheck, AlertTriangle } from "lucide-react";

// รอให้ช่วงวันที่ "นิ่ง" ก่อนค่อยนำไปคำนวณ/บันทึกหักเบิกจริงลง ledger กี่มิลลิวินาที (Why — สำคัญ ต้องอ่าน):
// เมื่อผู้ใช้คลิกเปลี่ยน "วันที่เริ่มต้น" ปฏิทินหนึ่งตัว React จะ commit ค่าใหม่ทันทีในเฟรมเดียว ขณะที่
// "วันที่สิ้นสุด" (ปฏิทินอีกตัวแยกกัน) ยังเป็นค่าเดิมอยู่ชั่วขณะระหว่างที่ผู้ใช้กำลังจะคลิกเปลี่ยนต่อ ถ้า
// ปล่อยให้ผลการคำนวณของช่วงกลางคันนี้ถูกนำไปเขียนลง ledger ทันที จะกลายเป็นการบันทึกช่วงวันที่ผสมที่ไม่มี
// ผู้ใช้คนไหนตั้งใจเลือกจริง เข้าไปกิน "โควตายอดหักเบิกรวม" ของพนักงานไปถาวร (ledger เป็น append-only
// ลบย้อนหลังไม่ได้) การหน่วงเวลาแค่ช่วงสั้นๆ นี้ช่วยลดโอกาสจับค่ากลางคันไปประมวลผลได้มาก โดยไม่กระทบ UX
// ปกติ (ผู้ใช้คลิกเลือกวันที่เริ่มต้น-สิ้นสุดต่อกันภายในเวลานี้เสมอ ผลลัพธ์จะถูกคำนวณจากคู่ค่าสุดท้ายเท่านั้น)
const DATE_RANGE_SETTLE_DELAY_MS = 600;

// เพิ่มวันถัดไปให้วันที่รูปแบบ YYYY-MM-DD หนึ่งวัน (ใช้หาว่า "งวดถัดไปที่ควรจะเป็น" ต้องเริ่มวันไหน)
const getNextDayIsoDate = (isoDate: string): string => {
  const date = new Date(`${isoDate}T00:00:00`);
  date.setDate(date.getDate() + 1);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
};

// หา periodEnd ล่าสุด (ตามลำดับเวลาจริง ไม่ใช่ลำดับที่ถูกบันทึกก่อน-หลัง) ของพนักงานคนหนึ่งจากประวัติ ledger
// คืนค่า null ถ้ายังไม่เคยมีการหักเบิกงวดไหนมาก่อนเลย (กรณีนี้ไม่มีงวดก่อนหน้าให้ข้าม จึงไม่ต้องเตือน)
const findLatestRecordedPeriodEnd = (
  ledger: AdvanceDeductionLedgerEntry[],
  therapistId: string,
): string | null => {
  const entriesForTherapist = ledger.filter((entry) => entry.therapistId === therapistId);
  if (entriesForTherapist.length === 0) return null;
  return entriesForTherapist.reduce(
    (latestEnd, entry) => (entry.periodEnd > latestEnd ? entry.periodEnd : latestEnd),
    entriesForTherapist[0].periodEnd,
  );
};

// ข้อมูลแจ้งเตือนเมื่อพบว่างวดที่กำลังจะหักไม่ต่อเนื่องจากงวดล่าสุดที่เคยหักไปแล้ว (เปิดงวดข้ามลำดับ)
interface SkippedPeriodWarning {
  therapistId: string;
  therapistName: string;
  expectedPeriodStart: string; // วันที่ที่งวดนี้ "ควรจะ" เริ่ม ถ้าไม่ข้ามงวด
}

// หาช่วงครึ่งเดือนของเดือนปัจจุบันเป็นค่าเริ่มต้นของฟิลเตอร์วันที่ (งวดบัญชีจริงของร้านจ่ายกัน 2 รอบ/เดือน)
// เช็คว่าวันนี้อยู่ครึ่งแรก (1-15) หรือครึ่งหลัง (16-สิ้นเดือน) ของเดือน แล้วเลือกช่วงนั้นให้อัตโนมัติ
export const getDefaultHalfMonthRange = (): { start: string; end: string } => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const dayOfMonth = today.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  const pad = (n: number): string => String(n).padStart(2, "0");
  const monthStr = pad(month + 1);
  const isFirstHalf = dayOfMonth <= 15;

  return {
    start: `${year}-${monthStr}-${isFirstHalf ? "01" : "16"}`,
    end: `${year}-${monthStr}-${isFirstHalf ? "15" : pad(lastDayOfMonth)}`,
  };
};

export default function PayrollPage() {
  const {
    bookings,
    courseSales,
    therapists,
    lateShiftRate,
    advanceDeductionLedger,
    recordAdvanceDeduction,
  } = useApp();

  const defaultRange = getDefaultHalfMonthRange();

  // ช่วงวันที่ของงวด (ค่าที่แสดงผลบนจอ/ใช้คำนวณตารางสด — อัปเดตทันทีที่ผู้ใช้คลิกปฏิทิน)
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);

  // ช่วงวันที่ที่ "นิ่งแล้ว" — ใช้เฉพาะตอนตัดสินใจเขียน ledger จริงเท่านั้น (ดูคำอธิบาย
  // DATE_RANGE_SETTLE_DELAY_MS ด้านบน) แยกออกจาก startDate/endDate ที่ใช้แสดงผลตาราง เพื่อไม่ให้การ
  // หน่วงเวลานี้กระทบความไวในการอัปเดตตัวเลขบนจอ (ตารางยังคำนวณสดทันทีเหมือนเดิมทุกประการ)
  const [settledDateRange, setSettledDateRange] = useState({
    start: startDate,
    end: endDate,
  });

  // งวดที่ผู้จัดการยืนยันแล้วว่าจะให้ดำเนินการหักต่อ แม้ระบบตรวจพบว่าข้ามงวดก่อนหน้ามา (ดู Bug #2)
  // เก็บเป็น key `${therapistId}|${periodStart}|${periodEnd}` เพื่อให้ยืนยันได้เฉพาะงวดที่ระบุเจาะจงเท่านั้น
  const [acknowledgedSkipKeys, setAcknowledgedSkipKeys] = useState<Set<string>>(
    new Set(),
  );
  const [skippedPeriodWarnings, setSkippedPeriodWarnings] = useState<
    SkippedPeriodWarning[]
  >([]);

  const [activeTab, setActiveTab] = useState<"full-time" | "part-time">(
    "full-time",
  );

  // สำหรับเรียกดูรายละเอียดรายวันพนักงาน
  const [selectedTherapist, setSelectedTherapist] = useState<Therapist | null>(
    null,
  );

  // สำหรับการพิมพ์สลิปเงินเดือน
  const [printingTherapist, setPrintingTherapist] = useState<Therapist | null>(
    null,
  );

  // ค้นหาช่วงวันที่ผู้ใช้นั้นมาทำงาน
  const getWorkedDates = (therapistName: string): string[] => {
    const tBookings = bookings.filter(
      (b) =>
        b.therapistName === therapistName &&
        b.date >= startDate &&
        b.date <= endDate,
    );
    const dates = tBookings.map((b) => b.date);
    return Array.from(new Set(dates)).sort();
  };

  // คำนวณค่าคอมมิชชั่นรายวัน
  const getDailyCommission = (therapistName: string, date: string): number => {
    const dayBookings = bookings.filter(
      (b) => b.therapistName === therapistName && b.date === date,
    );
    return dayBookings.reduce((sum, b) => {
      const sSum = b.services.reduce(
        (srvSum, s) => srvSum + s.commission * s.quantity,
        0,
      );
      return sum + sSum;
    }, 0);
  };

  // คำนวณประกันมือรายวันและเงินท็อปอัป
  const calculateDailyPayDetails = (therapist: Therapist, date: string) => {
    const commission = getDailyCommission(therapist.name, date);
    const guarantee = therapist.dailyGuarantee;
    const topup = commission < guarantee ? guarantee - commission : 0;
    const dailyTotal = commission + topup;

    return {
      commission,
      guarantee,
      topup,
      dailyTotal,
    };
  };

  // คำนวณภาพรวมเงินเดือนของพนักงานประจำ (Full-Time)
  const calculateFullTimeSalary = (therapist: Therapist) => {
    const workedDates = getWorkedDates(therapist.name);

    let totalCommission = 0;
    let totalTopup = 0;

    workedDates.forEach((date) => {
      const { commission, topup } = calculateDailyPayDetails(therapist, date);
      totalCommission += commission;
      totalTopup += topup;
    });

    // ยอดขายคอร์สสะสม
    const tCourses = courseSales.filter(
      (c) =>
        c.therapistName === therapist.name &&
        c.date >= startDate &&
        c.date <= endDate,
    );
    const courseCommission = tCourses.reduce(
      (sum, c) => sum + c.commissionAmount,
      0,
    );

    const hasLateShift = therapist.worksLateShift ?? false;
    const lateShiftPay = hasLateShift ? lateShiftRate : 0;

    const deductionInfo = getAdvanceDeductionForPeriod(
      therapist.advanceDeductionTotal ?? 0,
      therapist.advanceDeductionPerPeriod ?? 0,
      advanceDeductionLedger,
      therapist.id,
      startDate,
      endDate,
    );
    const loanDeduction = deductionInfo.amountDeducted;
    const remainingAdvanceDeduction = deductionInfo.remainingAfter;

    const grossSalary =
      totalCommission + totalTopup + courseCommission + lateShiftPay;
    const netSalary = grossSalary - loanDeduction;

    return {
      daysWorked: workedDates.length,
      commission: totalCommission,
      topup: totalTopup,
      courseCommission,
      lateShiftPay,
      loanDeduction,
      remainingAdvanceDeduction,
      netSalary,
    };
  };

  // คำนวณภาพรวมเงินเดือนของพนักงานพาร์ทไทม์ (Part-Time)
  const calculatePartTimeSalary = (therapist: Therapist) => {
    const workedDates = getWorkedDates(therapist.name);

    let totalCommission = 0;
    let totalTopup = 0;

    workedDates.forEach((date) => {
      const commission = getDailyCommission(therapist.name, date);
      const guarantee = 500;
      const topup = commission < guarantee ? guarantee - commission : 0;
      totalCommission += commission;
      totalTopup += topup;
    });

    // ยอดขายคอร์สสะสม
    const tCourses = courseSales.filter(
      (c) =>
        c.therapistName === therapist.name &&
        c.date >= startDate &&
        c.date <= endDate,
    );
    const courseCommission = tCourses.reduce(
      (sum, c) => sum + c.commissionAmount,
      0,
    );

    const hasLateShift = therapist.worksLateShift ?? false;
    const lateShiftPay = hasLateShift ? lateShiftRate : 0;

    const receivedDaily = totalCommission + totalTopup;
    const netToPay = courseCommission + lateShiftPay;

    return {
      daysWorked: workedDates.length,
      commission: totalCommission,
      topup: totalTopup,
      courseCommission,
      receivedDaily,
      lateShiftPay,
      netToPay,
    };
  };

  // ด่านป้องกันบั๊กที่ 1 (ขั้นที่ 1/2 — debounce): รอให้ startDate/endDate "นิ่ง" ก่อนค่อยยอมรับเป็น
  // ช่วงวันที่ที่จะใช้ตัดสินใจเขียน ledger จริง (ดูคำอธิบาย DATE_RANGE_SETTLE_DELAY_MS ด้านบนไฟล์)
  useEffect(() => {
    const settleTimerId = setTimeout(() => {
      setSettledDateRange({ start: startDate, end: endDate });
    }, DATE_RANGE_SETTLE_DELAY_MS);

    return () => clearTimeout(settleTimerId);
  }, [startDate, endDate]);

  // หักเบิกต่องวดอัตโนมัติ: ทุกครั้งที่ช่วงวันที่ (ที่นิ่งแล้ว)/รายชื่อพนักงาน/ประวัติหักเบิกเปลี่ยน
  // เช็คแต่ละหมอนวดประจำว่างวดนี้เคยหักไปแล้วหรือยัง (กันหักซ้ำ) ถ้ายังและมียอดคงเหลือ ให้บันทึกลง Ledger
  useEffect(() => {
    const commitPendingDeductions = async (): Promise<void> => {
      const { start: periodStart, end: periodEnd } = settledDateRange;

      // ด่านป้องกันบั๊กที่ 1 (ขั้นที่ 2/2 — ปฏิเสธช่วงวันที่ที่ไม่สมบูรณ์): ถ้าวันที่เริ่มต้นมากกว่า
      // วันที่สิ้นสุด แปลว่านี่คือค่ากลางคันที่เกิดจากการคลิกเปลี่ยนแค่ฟิลด์เดียว (เช่น เปลี่ยนวันที่เริ่มต้น
      // ไปเป็นงวดถัดไปแล้ว แต่วันที่สิ้นสุดยังเป็นของงวดเดิมอยู่) ต้องไม่นำไปคำนวณ/เขียน ledger เด็ดขาด
      if (periodStart > periodEnd) {
        setSkippedPeriodWarnings([]);
        return;
      }

      const fullTimeTherapists = therapists.filter((t) => t.type === "full-time");
      const nextSkipWarnings: SkippedPeriodWarning[] = [];

      for (const therapist of fullTimeTherapists) {
        const perPeriod = therapist.advanceDeductionPerPeriod ?? 0;
        const totalDebt = therapist.advanceDeductionTotal ?? 0;
        if (perPeriod <= 0 || totalDebt <= 0) continue;

        const info = getAdvanceDeductionForPeriod(
          totalDebt,
          perPeriod,
          advanceDeductionLedger,
          therapist.id,
          periodStart,
          periodEnd,
        );
        if (info.alreadyRecorded || info.amountDeducted <= 0) continue;

        // ด่านป้องกันบั๊กที่ 2: เช็คว่างวดนี้ต่อเนื่องจากงวดล่าสุดที่เคยบันทึกไว้จริงหรือไม่ (วันที่เริ่มต้น
        // ของงวดนี้ต้องเท่ากับวันถัดไปของ periodEnd ล่าสุด) ถ้าข้ามงวด ต้องหยุดแล้วแจ้งเตือนก่อนเสมอ ห้าม
        // หักเงียบๆ เพราะ ledger append-only จะทำให้งวดที่ถูกข้ามไม่มีทางถูกหักย้อนหลังได้อีกเลย
        const latestRecordedPeriodEnd = findLatestRecordedPeriodEnd(
          advanceDeductionLedger,
          therapist.id,
        );
        const isSkippingPreviousPeriod =
          latestRecordedPeriodEnd !== null &&
          getNextDayIsoDate(latestRecordedPeriodEnd) !== periodStart;

        const acknowledgeKey = `${therapist.id}|${periodStart}|${periodEnd}`;
        if (isSkippingPreviousPeriod && !acknowledgedSkipKeys.has(acknowledgeKey)) {
          nextSkipWarnings.push({
            therapistId: therapist.id,
            therapistName: therapist.name,
            expectedPeriodStart: latestRecordedPeriodEnd
              ? getNextDayIsoDate(latestRecordedPeriodEnd)
              : periodStart,
          });
          continue;
        }

        await recordAdvanceDeduction({
          id: `advled_${therapist.id}_${periodStart}_${periodEnd}`,
          therapistId: therapist.id,
          therapistName: therapist.name,
          periodStart,
          periodEnd,
          amountDeducted: info.amountDeducted,
          remainingAfter: info.remainingAfter,
          createdAt: new Date().toISOString(),
        });
      }

      setSkippedPeriodWarnings(nextSkipWarnings);
    };

    commitPendingDeductions();
  }, [
    settledDateRange,
    therapists,
    advanceDeductionLedger,
    recordAdvanceDeduction,
    acknowledgedSkipKeys,
  ]);

  // ผู้จัดการกดยืนยันว่ารับทราบความเสี่ยงแล้วและต้องการหักงวดนี้ต่อ ทั้งที่งวดก่อนหน้าถูกข้ามไป
  const acknowledgeSkippedPeriod = (therapistId: string): void => {
    const acknowledgeKey = `${therapistId}|${settledDateRange.start}|${settledDateRange.end}`;
    setAcknowledgedSkipKeys((previousKeys) => {
      const nextKeys = new Set(previousKeys);
      nextKeys.add(acknowledgeKey);
      return nextKeys;
    });
  };

  return (
    <div className="flex flex-col gap-6">
      {/* ส่วนควบคุมวันที่ */}
      <div className="glass-panel flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-6 rounded-2xl border border-white/5 shadow-lg no-print">
        <div className="flex items-center gap-2.5">
          <Calendar className="text-spa-teal" size={20} />
          <span className="text-sm font-semibold text-slate-300">
            ประมวลผลสรุปค่าแรงรอบบัญชีงวดการจ่าย:
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-3 w-full md:w-auto">
          <div className="w-full sm:w-40">
            <DatePicker
              value={startDate}
              onChange={(val) => setStartDate(val)}
            />
          </div>
          <span className="text-slate-500 text-xs hidden sm:inline">ถึง</span>
          <div className="w-full sm:w-40">
            <DatePicker
              value={endDate}
              onChange={(val) => setEndDate(val)}
              align="right"
            />
          </div>
        </div>
      </div>

      {/* แจ้งเตือนเปิดงวดข้ามลำดับ (Bug #2): แสดงเมื่อพบว่าพนักงานคนนั้นมีงวดก่อนหน้าที่ยังไม่เคยถูกหักเลย
          ต้องให้ผู้จัดการยืนยันอย่างชัดเจนก่อนเท่านั้น ห้ามหักเงียบๆ เพราะ ledger เป็น append-only */}
      {skippedPeriodWarnings.length > 0 && (
        <div className="glass-panel flex flex-col gap-3 py-4 px-6 rounded-2xl border border-amber-500/40 bg-amber-950/20 shadow-lg no-print">
          {skippedPeriodWarnings.map((warning) => (
            <div
              key={warning.therapistId}
              className="flex flex-col md:flex-row md:items-center justify-between gap-3"
            >
              <div className="flex items-start gap-2.5">
                <AlertTriangle className="text-amber-400 flex-shrink-0 mt-0.5" size={18} />
                <span className="text-xs text-amber-200 leading-relaxed">
                  พบว่างวดของ หมอ{warning.therapistName} ข้ามลำดับ — ระบบยังไม่เคยหักเบิกงวดก่อนหน้านี้เลย
                  (งวดถัดไปที่ควรเปิดคือวันที่เริ่มต้น {formatDateForDisplay(warning.expectedPeriodStart)})
                  หากดำเนินการต่อ งวดที่ถูกข้ามจะไม่ถูกหักอัตโนมัติอีกต่อไป
                </span>
              </div>
              <button
                onClick={() => acknowledgeSkippedPeriod(warning.therapistId)}
                className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold active:scale-95 transition-transform shadow-md flex-shrink-0 self-start md:self-center"
              >
                ยืนยันว่ารับทราบและหักเบิกงวดนี้ต่อ
              </button>
            </div>
          ))}
        </div>
      )}

      {/* เลือกแท็บพนักงานประจำ vs พาร์ทไทม์ */}
      <div className="flex p-1 rounded-xl bg-slate-950 border border-white/5 no-print self-start">
        <button
          onClick={() => setActiveTab("full-time")}
          className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "full-time"
              ? "bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          พนักงานประจำ (Full-Time)
        </button>
        <button
          onClick={() => setActiveTab("part-time")}
          className={`px-5 py-2.5 rounded-lg text-xs font-bold transition-all ${
            activeTab === "part-time"
              ? "bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 shadow-md"
              : "text-slate-400 hover:text-slate-200"
          }`}
        >
          พนักงานพาร์ทไทม์ (Part-Time)
        </button>
      </div>

      {/* ตารางสรุปค่าแรงพนักงานประจำ (Full-Time Table) */}
      {activeTab === "full-time" && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl no-print"
        >
          <div className="mb-4 flex items-center gap-2">
            <Award className="text-spa-gold" size={20} />
            <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold">
              ตารางสรุปรายรับพนักงานประจำ
            </h3>
          </div>

          <div className="table-container border border-white/5 rounded-xl overflow-hidden">
            <table className="custom-table w-full">
              <thead>
                <tr className="bg-slate-950/60 border-b border-white/5">
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ชื่อพนักงาน
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ประกันมือ/วัน
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    จำนวนวันทำงาน
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ค่ามือนวดสะสม
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ประกันมือ (Top-up)
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ค่าคอมคอร์ส
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ค่ากะดึก
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    หักเบิกงวดนี้
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    คงเหลือหักเบิก
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    รับสุทธิปลายงวด
                  </th>
                  <th
                    className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider"
                    style={{ width: "130px" }}
                  >
                    รายละเอียด
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {therapists
                  .filter((t) => t.type === "full-time")
                  .map((t) => {
                    const salary = calculateFullTimeSalary(t);
                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-4 text-sm font-semibold text-slate-200">
                          หมอ{t.name}
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {t.dailyGuarantee} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.daysWorked} วัน
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.commission.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-spa-teal font-semibold">
                          +{salary.topup.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.courseCommission.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.lateShiftPay.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-red-400 font-medium">
                          -{salary.loanDeduction.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-400">
                          {salary.remainingAdvanceDeduction.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-spa-gold text-right">
                          {salary.netSalary.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedTherapist(t)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/20 text-slate-300 text-[10px] font-semibold active:scale-95 transition-transform"
                            >
                              รายวัน
                            </button>
                            <button
                              onClick={() => setPrintingTherapist(t)}
                              className="p-1.5 rounded-lg bg-slate-900 border border-white/5 text-spa-teal hover:text-white hover:border-spa-teal active:scale-95 transition-transform"
                              title="พิมพ์สลิปเงินเดือน"
                            >
                              <Printer size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* ตารางสรุปค่าแรงพนักงานพาร์ทไทม์ (Part-Time Table) */}
      {activeTab === "part-time" && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl no-print"
        >
          <div className="mb-4 flex items-center gap-2">
            <Award className="text-spa-gold" size={20} />
            <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold">
              ตารางสรุปรายรับพนักงานพาร์ทไทม์ (เคลียร์เงินสดรายวัน)
            </h3>
          </div>

          <div className="table-container border border-white/5 rounded-xl overflow-hidden">
            <table className="custom-table w-full">
              <thead>
                <tr className="bg-slate-950/60 border-b border-white/5">
                  <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ชื่อพนักงาน
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    จำนวนวันทำงาน
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ค่ามือสะสม
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ประกันมือ (Top-up สะสม)
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ยอดเงินสดที่จ่ายรายวันรวม
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ค่าคอมคอร์ส
                  </th>
                  <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    ค่ากะดึกสะสม
                  </th>
                  <th className="px-4 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                    รับสุทธิปลายงวด
                  </th>
                  <th
                    className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider"
                    style={{ width: "130px" }}
                  >
                    รายละเอียด
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {therapists
                  .filter((t) => t.type === "part-time")
                  .map((t) => {
                    const salary = calculatePartTimeSalary(t);
                    return (
                      <tr
                        key={t.id}
                        className="hover:bg-white/5 transition-colors"
                      >
                        <td className="px-4 py-4 text-sm font-semibold text-slate-200">
                          หมอ{t.name}
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.daysWorked} วัน
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.commission.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          +{salary.topup.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-400">
                          {salary.receivedDaily.toLocaleString()} ฿ (รับแล้ว)
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.courseCommission.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-center text-xs text-slate-300">
                          {salary.lateShiftPay.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4 text-sm font-bold text-emerald-400 text-right">
                          {salary.netToPay.toLocaleString()} ฿
                        </td>
                        <td className="px-4 py-4">
                          <div className="flex justify-center gap-1.5">
                            <button
                              onClick={() => setSelectedTherapist(t)}
                              className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-white/5 hover:border-white/20 text-slate-300 text-[10px] font-semibold active:scale-95 transition-transform"
                            >
                              รายวัน
                            </button>
                            <button
                              onClick={() => setPrintingTherapist(t)}
                              className="p-1.5 rounded-lg bg-slate-900 border border-white/5 text-spa-teal hover:text-white hover:border-spa-teal active:scale-95 transition-transform"
                              title="พิมพ์สลิปเงินเดือน"
                            >
                              <Printer size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </motion.div>
      )}

      {/* 5. ลิ้นชัก/หน้าต่าง แสดงข้อมูลประวัติรายวันพนักงาน (Daily Audit Modal) */}
      <AnimatePresence>
        {selectedTherapist && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setSelectedTherapist(null)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="glass-modal w-full max-w-3xl p-6 rounded-2xl border border-spa-gold/30 shadow-2xl relative z-10 overflow-hidden flex flex-col max-h-[85vh]"
            >
              <div className="flex items-center justify-between mb-4 pb-2.5 border-b border-white/5 flex-shrink-0">
                <h3 className="text-md font-bold text-spa-gold flex items-center gap-2">
                  <UserCheck size={18} />
                  <span>ประวัติรายวันของ หมอ{selectedTherapist.name}</span>
                </h3>
                <button
                  onClick={() => setSelectedTherapist(null)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-4 flex-shrink-0">
                ประวัติงานรายวันและฐานเงินประกันส่วนต่าง ระหว่างวันที่{" "}
                {startDate} ถึง {endDate}
              </p>

              <div className="flex-1 overflow-y-auto border border-white/5 rounded-xl">
                <table className="custom-table w-full text-xs">
                  <thead>
                    <tr className="bg-slate-950/60 border-b border-white/5 text-slate-400">
                      <th className="px-4 py-3 text-left">วันที่</th>
                      <th className="px-4 py-3 text-center">สถานะ</th>
                      <th className="px-4 py-3 text-center">ประกันมือรายวัน</th>
                      <th className="px-4 py-3 text-center">ค่ามือนวดสะสม</th>
                      <th className="px-4 py-3 text-center">
                        ท็อปอัปประกันส่วนต่าง
                      </th>
                      <th className="px-4 py-3 text-right">รายได้วันนั้น</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5">
                    {getWorkedDates(selectedTherapist.name).map((date, idx) => {
                      const commission = getDailyCommission(
                        selectedTherapist.name,
                        date,
                      );
                      const guarantee =
                        selectedTherapist.type === "full-time"
                          ? selectedTherapist.dailyGuarantee
                          : 500;
                      const topup =
                        commission < guarantee ? guarantee - commission : 0;
                      const dayTotal = commission + topup;

                      return (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="px-4 py-3 font-semibold text-slate-300">
                            {formatDateForDisplay(date)}
                          </td>
                          <td className="px-4 py-3 text-center">
                            <span className="px-1.5 py-0.5 rounded text-[8px] bg-emerald-950/40 text-emerald-400 border border-emerald-900/40 font-semibold uppercase">
                              มาทำงาน
                            </span>
                          </td>
                          <td className="px-4 py-3 text-center text-slate-300">
                            {guarantee} ฿
                          </td>
                          <td className="px-4 py-3 text-center text-slate-300">
                            {commission.toLocaleString()} ฿
                          </td>
                          <td
                            className={`px-4 py-3 text-center font-medium ${topup > 0 ? "text-spa-teal" : "text-slate-500"}`}
                          >
                            {topup > 0 ? `+${topup.toLocaleString()}` : "0"} ฿
                          </td>
                          <td className="px-4 py-3 text-right font-bold text-slate-200">
                            {dayTotal.toLocaleString()} ฿
                          </td>
                        </tr>
                      );
                    })}
                    {getWorkedDates(selectedTherapist.name).length === 0 && (
                      <tr>
                        <td
                          colSpan={6}
                          className="text-center text-slate-500 py-12"
                        >
                          ไม่พบประวัติการจองวันมาทำงานในช่วงดังกล่าว
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              <div className="mt-5 flex justify-end flex-shrink-0">
                <button
                  onClick={() => setSelectedTherapist(null)}
                  className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-slate-300 text-xs font-semibold active:scale-95 transition-transform"
                >
                  ปิดตารางรายวัน
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 6. หน้าสลิปเงินเดือนพิมพ์ได้จริง (Payslip printable Dialog) */}
      <AnimatePresence>
        {printingTherapist && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 overflow-y-auto">
            <div
              className="w-full max-w-2xl bg-white text-slate-950 p-8 rounded-2xl shadow-2xl relative border border-slate-300"
              id="printable-payslip"
            >
              {/* แผงควบคุมสั่งพิมพ์สำหรับ UI */}
              <div className="absolute top-4 right-4 flex gap-2 no-print">
                <button
                  onClick={() => window.print()}
                  className="px-3.5 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold flex items-center gap-1.5 active:scale-95 transition-transform shadow-md"
                >
                  <Printer size={14} />
                  <span>พิมพ์สลิป</span>
                </button>
                <button
                  onClick={() => setPrintingTherapist(null)}
                  className="px-3.5 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold flex items-center gap-1 active:scale-95 transition-transform border border-slate-300"
                >
                  <X size={14} />
                  <span>ปิด</span>
                </button>
              </div>

              {/* ส่วนหัวใบเสร็จ */}
              <div className="text-center mb-8 border-b-2 border-slate-950 pb-4">
                <h2 className="text-xl font-bold tracking-wider text-slate-900 font-display">
                  Demo Spa & Thai Massage
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  ใบแสดงรายละเอียดผลตอบแทนพนักงานนวดและสปา
                </p>
                <p className="text-[10px] text-slate-400 mt-1">
                  รอบงวดบัญชี: {startDate} ถึง {endDate}
                </p>
              </div>

              {/* รายละเอียดพนักงาน */}
              <div className="grid grid-cols-2 gap-4 mb-6 text-xs text-slate-700">
                <div>
                  <p className="mb-1">
                    <strong>ชื่อพนักงาน:</strong> หมอ{printingTherapist.name}
                  </p>
                  <p className="mb-1">
                    <strong>เบอร์โทรศัพท์:</strong> {printingTherapist.phone}
                  </p>
                  <p>
                    <strong>สัญญาจ้าง:</strong>{" "}
                    {printingTherapist.type === "full-time"
                      ? "พนักงานประจำ"
                      : "พาร์ทไทม์"}
                  </p>
                </div>
                <div className="text-right">
                  <p className="mb-1">
                    <strong>ธนาคาร:</strong> {printingTherapist.bankName}
                  </p>
                  <p className="mb-1">
                    <strong>เลขที่บัญชี:</strong>{" "}
                    {printingTherapist.bankAccount}
                  </p>
                  <p>
                    <strong>ชื่อบัญชี:</strong>{" "}
                    {printingTherapist.bankAccountName}
                  </p>
                </div>
              </div>

              {/* รายละเอียดการเงิน */}
              <div className="border border-slate-950 rounded-xl overflow-hidden mb-6 text-xs">
                <div className="bg-slate-100 font-bold grid grid-cols-3 p-3 border-b border-slate-950 text-slate-800">
                  <span>รายการรายรับ</span>
                  <span className="text-center">เกณฑ์คำนวณ</span>
                  <span className="text-right">จำนวนเงิน</span>
                </div>

                {(() => {
                  const isFT = printingTherapist.type === "full-time";
                  if (isFT) {
                    const salary = calculateFullTimeSalary(printingTherapist);
                    return (
                      <>
                        <div className="grid grid-cols-3 p-3 border-b border-slate-200 text-slate-700">
                          <span>ค่ามือนวดสะสม</span>
                          <span className="text-center">
                            {salary.daysWorked} วันทำงาน
                          </span>
                          <span className="text-right">
                            {salary.commission.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-200 text-slate-700">
                          <span>ท็อปอัปประกันรายวันเพิ่มเติม</span>
                          <span className="text-center">
                            รายวันขั้นต่ำ {printingTherapist.dailyGuarantee} ฿
                          </span>
                          <span className="text-right">
                            +{salary.topup.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-200 text-slate-700">
                          <span>ส่วนแบ่งค่าคอมขายคอร์สสปา</span>
                          <span className="text-center">ประวัติการขาย</span>
                          <span className="text-right">
                            +{salary.courseCommission.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-950 text-slate-700">
                          <span>ค่ากะดึกสะสมงวดนี้</span>
                          <span className="text-center">เบี้ยเลี้ยงสะสม</span>
                          <span className="text-right">
                            +{salary.lateShiftPay.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="bg-slate-100 font-bold grid grid-cols-3 p-3 border-b border-slate-950 text-slate-800">
                          <span>รายการหักเงิน</span>
                          <span className="text-center"></span>
                          <span className="text-right">หักเงิน</span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-200 text-slate-700">
                          <span>หักเบิกต่องวด (ยอดรวมหักเบิก)</span>
                          <span className="text-center"></span>
                          <span className="text-right">
                            -{salary.loanDeduction.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-950 text-slate-700">
                          <span>คงเหลือยอดหักเบิก (งวดถัดไป)</span>
                          <span className="text-center"></span>
                          <span className="text-right">
                            {salary.remainingAdvanceDeduction.toLocaleString()}{" "}
                            บาท
                          </span>
                        </div>

                        <div className="bg-slate-950 text-white font-bold grid grid-cols-3 p-4">
                          <span className="text-sm">
                            คงเหลือจ่ายสุทธิงวดนี้
                          </span>
                          <span></span>
                          <span className="text-right text-sm">
                            {salary.netSalary.toLocaleString()} บาท
                          </span>
                        </div>
                      </>
                    );
                  } else {
                    const salary = calculatePartTimeSalary(printingTherapist);
                    return (
                      <>
                        <div className="grid grid-cols-3 p-3 border-b border-slate-200 text-slate-700">
                          <span>ค่ามือนวดสะสม</span>
                          <span className="text-center">
                            {salary.daysWorked} วันทำงาน
                          </span>
                          <span className="text-right">
                            {salary.commission.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-200 text-slate-700">
                          <span>ท็อปอัปประกันรายวันเพิ่มเติม</span>
                          <span className="text-center">
                            รายวันขั้นต่ำ 500 ฿
                          </span>
                          <span className="text-right">
                            +{salary.topup.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-200 text-slate-700">
                          <span>ส่วนแบ่งค่าคอมขายคอร์สสปา</span>
                          <span className="text-center">ประวัติการขาย</span>
                          <span className="text-right">
                            +{salary.courseCommission.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-950 text-slate-700">
                          <span>ค่ากะดึกสะสมงวดนี้</span>
                          <span className="text-center">เบี้ยเลี้ยงสะสม</span>
                          <span className="text-right">
                            +{salary.lateShiftPay.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="bg-slate-100 font-bold grid grid-cols-3 p-3 border-b border-slate-950 text-slate-800">
                          <span>รายการหักเงิน</span>
                          <span className="text-center"></span>
                          <span className="text-right">หักเงิน</span>
                        </div>

                        <div className="grid grid-cols-3 p-3 border-b border-slate-950 text-slate-700">
                          <span>หักเงินสดที่รับรายวันแล้ว</span>
                          <span className="text-center">จ่ายสิ้นวันแล้ว</span>
                          <span className="text-right">
                            -{salary.receivedDaily.toLocaleString()} บาท
                          </span>
                        </div>

                        <div className="bg-slate-950 text-white font-bold grid grid-cols-3 p-4">
                          <span className="text-sm">
                            คงเหลือจ่ายสุทธิงวดนี้
                          </span>
                          <span></span>
                          <span className="text-right text-sm">
                            {salary.netToPay.toLocaleString()} บาท
                          </span>
                        </div>
                      </>
                    );
                  }
                })()}
              </div>

              {/* ส่วนลงชื่อ */}
              <div className="grid grid-cols-2 gap-10 mt-12 text-center text-[10px] text-slate-500">
                <div className="flex flex-col gap-8">
                  <p>
                    ....................................................................
                  </p>
                  <p>ลงชื่อ ผู้จ่ายเงิน (ผู้จัดการ / เจ้าของร้าน)</p>
                </div>
                <div className="flex flex-col gap-8">
                  <p>
                    ....................................................................
                  </p>
                  <p>ลงชื่อ พนักงานผู้รับเงิน (หมอ{printingTherapist.name})</p>
                </div>
              </div>
            </div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
