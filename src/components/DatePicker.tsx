// src/components/DatePicker.tsx
// คำอธิบายเหตุผลของดีไซน์ (Why):
// 1. สร้างคอมโพเนนต์ Custom DatePicker เองเพื่อไม่ให้เกิดปัญหา peer dependency ของ React 19
//    และหลีกเลี่ยงการเรนเดอร์สไตล์ขัดแย้งของไลบรารีภายนอก
// 2. ใช้ดีไซน์สไตล์ Glassmorphism ตกแต่งปฏิทินด้วยขอบทองและเฉดเงาพิเศษลอยตัว
//    กลมกลืนกับหน้าเพจอื่นๆ
// 3. กำหนดข้อมูลชื่อปฏิทินเป็นภาษาไทย (มกราคม - ธันวาคม) เพื่อให้หมอนวดและผู้จัดการใช้งานได้เข้าใจง่ายที่สุด
// 4. รองรับการเลือกปี/เดือนแบบ Drill-down (ปี → เดือน → วัน) เพราะการกดลูกศรทีละเดือนช้าเกินไป
//    เมื่อต้องข้ามหลายเดือนหรือหลายปี — กดที่ป้ายชื่อเดือน/ปีบนหัวปฏิทินเพื่อกระโดดข้ามได้ทันที
// 5. แสดงปีเป็น พ.ศ. เสมอ (ผู้ใช้งานเป็นคนไทย) แต่ค่าที่เก็บ/ส่งออกผ่าน onChange ยังเป็น ค.ศ. (YYYY-MM-DD)
//    เหมือนเดิมทุกที่ เพื่อไม่กระทบการคำนวณและการเก็บข้อมูลที่มีอยู่แล้วทั้งระบบ
// 6. รองรับโหมด "month" สำหรับหน้าที่ต้องการแค่ตัวกรองรายเดือน (เช่น บันทึกขายคอร์ส) โดยใช้กลไก
//    Drill-down เดิม (กริดเดือน/ปี) แค่ข้ามชั้นปฏิทินวันไป ไม่ต้องสร้างคอมโพเนนต์แยกซ้ำซ้อน

import React, { useState, useRef, useEffect } from 'react';
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { convertToBuddhistYear } from '@/utils/thaiDate';

interface DatePickerProps {
  value: string; // โหมด 'day': YYYY-MM-DD, โหมด 'month': YYYY-MM (ทั้งคู่เป็น ค.ศ. เสมอ)
  onChange: (value: string) => void;
  disabled?: boolean;
  // ค่าเริ่มต้น 'day' คือปฏิทินเลือกวันตามปกติ ส่วน 'month' ใช้ตอนต้องการแค่ตัวกรองรายเดือน/ปี
  mode?: 'day' | 'month';
  // การชิดตำแหน่งขอบของปฏิทิน ('left' ชิดซ้าย หรือ 'right' ชิดขวา) ป้องกันไม่ให้ปฏิทินถูกขอบจอตัด
  align?: 'left' | 'right';
}

// ระดับการแสดงผลของปฏิทิน — ใช้ Drill-down ตามลำดับชั้น ปี > เดือน > วัน
type CalendarView = 'days' | 'months' | 'years';

// จำนวนปีที่แสดงต่อหน้าในกริดเลือกปี
const YEARS_PER_PAGE = 12;

const monthNames = [
  'มกราคม', 'กุมภาพันธ์', 'มีนาคม', 'เมษายน', 'พฤษภาคม', 'มิถุนายน',
  'กรกฎาคม', 'สิงหาคม', 'กันยายน', 'ตุลาคม', 'พฤศจิกายน', 'ธันวาคม'
];

const monthNamesShort = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

const weekdayNames = ['อา', 'จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส'];

// แยกปี/เดือนจากค่าที่ส่งเข้ามา ตามรูปแบบของแต่ละโหมด — คืนค่า null หากแปลงไม่ได้ (ค่าว่าง/ผิดรูปแบบ)
const parseYearMonthFromValue = (
  value: string,
  mode: 'day' | 'month'
): { year: number; month: number } | null => {
  if (!value) return null;

  if (mode === 'month') {
    const [yearStr, monthStr] = value.split('-');
    const year = parseInt(yearStr, 10);
    const month = parseInt(monthStr, 10) - 1;
    if (isNaN(year) || isNaN(month)) return null;
    return { year, month };
  }

  const parsedDate = new Date(value);
  if (isNaN(parsedDate.getTime())) return null;
  return { year: parsedDate.getFullYear(), month: parsedDate.getMonth() };
};

export const DatePicker: React.FC<DatePickerProps> = ({ value, onChange, disabled, mode = 'day', align = 'left' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<CalendarView>(mode === 'month' ? 'months' : 'days');
  const containerRef = useRef<HTMLDivElement>(null);

  // แยกแยะค่าของวันที่/เดือนเริ่มต้น ใช้วันที่ปัจจุบันเป็นค่าตั้งต้นหากยังไม่มีค่า
  const initialYearMonth = parseYearMonthFromValue(value, mode);
  const now = new Date();
  const [currentMonth, setCurrentMonth] = useState(initialYearMonth?.month ?? now.getMonth());
  const [currentYear, setCurrentYear] = useState(initialYearMonth?.year ?? now.getFullYear());
  const [yearsPageStart, setYearsPageStart] = useState(
    (initialYearMonth?.year ?? now.getFullYear()) - Math.floor(YEARS_PER_PAGE / 2)
  );

  useEffect(() => {
    const parsed = parseYearMonthFromValue(value, mode);
    if (parsed) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setCurrentMonth(parsed.month);
      setCurrentYear(parsed.year);
    }
  }, [value, mode]);

  // ซ่อนปฏิทินหากกดบริเวณนอกกล่อง
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // รีเซ็ตกลับไปหน้าเริ่มต้นของโหมดนี้เสมอเมื่อปิดกล่อง เพื่อให้เปิดใหม่ครั้งหน้าเริ่มจากมุมมองเดิม
  useEffect(() => {
    if (!isOpen) {
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setView(mode === 'month' ? 'months' : 'days');
    }
  }, [isOpen, mode]);

  const daysInMonth = (month: number, year: number): number => {
    return new Date(year, month + 1, 0).getDate();
  };

  const startDayOfWeek = (month: number, year: number): number => {
    return new Date(year, month, 1).getDay();
  };

  const handlePrevMonth = (): void => {
    if (currentMonth === 0) {
      setCurrentMonth(11);
      setCurrentYear((prev) => prev - 1);
    } else {
      setCurrentMonth((prev) => prev - 1);
    }
  };

  const handleNextMonth = (): void => {
    if (currentMonth === 11) {
      setCurrentMonth(0);
      setCurrentYear((prev) => prev + 1);
    } else {
      setCurrentMonth((prev) => prev + 1);
    }
  };

  const handlePrevYear = (): void => setCurrentYear((prev) => prev - 1);
  const handleNextYear = (): void => setCurrentYear((prev) => prev + 1);

  const handlePrevYearsPage = (): void => setYearsPageStart((prev) => prev - YEARS_PER_PAGE);
  const handleNextYearsPage = (): void => setYearsPageStart((prev) => prev + YEARS_PER_PAGE);

  const handleSelectDay = (day: number): void => {
    const formattedMonth = String(currentMonth + 1).padStart(2, '0');
    const formattedDay = String(day).padStart(2, '0');
    onChange(`${currentYear}-${formattedMonth}-${formattedDay}`);
    setIsOpen(false);
  };

  // เลือกเดือนจากกริดเดือน — โหมด 'month' ถือว่าเลือกเสร็จสิ้นทันที ส่วนโหมด 'day' ลงไปดูปฏิทินวันต่อ
  const handleSelectMonth = (monthIndex: number): void => {
    if (mode === 'month') {
      const formattedMonth = String(monthIndex + 1).padStart(2, '0');
      onChange(`${currentYear}-${formattedMonth}`);
      setIsOpen(false);
      return;
    }
    setCurrentMonth(monthIndex);
    setView('days');
  };

  // เลือกปีจากกริดปี แล้วลงไปดูกริดเดือนของปีนั้นต่อทันที (Drill-down ปี → เดือน)
  const handleSelectYear = (year: number): void => {
    setCurrentYear(year);
    setView('months');
  };

  // กดป้ายปีตอนอยู่หน้ากริดเดือน เพื่อขึ้นไปดูกริดปีอีกชั้น
  const handleOpenYearsView = (): void => {
    setYearsPageStart(currentYear - Math.floor(YEARS_PER_PAGE / 2));
    setView('years');
  };

  const numDays = daysInMonth(currentMonth, currentYear);
  const startDay = startDayOfWeek(currentMonth, currentYear);

  const daysArray: (number | null)[] = [];
  for (let i = 0; i < startDay; i++) {
    daysArray.push(null);
  }
  for (let i = 1; i <= numDays; i++) {
    daysArray.push(i);
  }

  const yearsInPage: number[] = Array.from(
    { length: YEARS_PER_PAGE },
    (_, i) => yearsPageStart + i
  );

  const getDisplayDate = (): string => {
    if (mode === 'month') {
      const parsed = parseYearMonthFromValue(value, mode);
      if (!parsed) return 'เลือกเดือน';
      return `${monthNames[parsed.month]} ${convertToBuddhistYear(parsed.year)}`;
    }
    if (!value) return 'เลือกวันที่';
    const parts = value.split('-');
    return `${parts[2]}/${parts[1]}/${convertToBuddhistYear(parseInt(parts[0], 10))}`;
  };

  // คลาสปุ่มมาตรฐานสำหรับกริดเดือน/ปี — ใช้ร่วมกันเพื่อลดโค้ดซ้ำ (DRY)
  const gridButtonClass = (isSelected: boolean): string =>
    `py-2 text-center text-xs font-semibold rounded-lg transition-all ${
      isSelected
        ? 'bg-spa-gold text-slate-950 font-bold shadow-md shadow-spa-gold/20'
        : 'text-slate-300 hover:bg-white/5 hover:text-white'
    }`;

  return (
    <div className="relative w-full" ref={containerRef}>
      <button
        type="button"
        disabled={disabled}
        onClick={() => setIsOpen(!isOpen)}
        className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-xs transition-all text-left ${
          disabled ? 'opacity-50 cursor-not-allowed text-slate-500' : 'text-slate-200 focus:border-spa-gold focus:ring-1 focus:ring-spa-gold'
        }`}
      >
        <span>{getDisplayDate()}</span>
        <CalendarIcon size={14} className="text-spa-gold" />
      </button>

      {isOpen && !disabled && (
        <div className={`absolute top-12 ${align === 'right' ? 'right-0' : 'left-0'} z-50 glass-modal p-4 rounded-xl border border-white/10 shadow-2xl w-64`}>

          {/* ระดับ 1: ปฏิทินวัน (เฉพาะโหมด 'day' เท่านั้น) */}
          {mode === 'day' && view === 'days' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={handlePrevMonth}
                  className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                  aria-label="เดือนก่อนหน้า"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={() => setView('months')}
                  className="flex items-center gap-1.5 text-xs font-bold text-spa-gold hover:text-white transition-colors"
                  title="กดเพื่อเลือกเดือน/ปีโดยตรง"
                >
                  <span>{monthNames[currentMonth]}</span>
                  <span>{convertToBuddhistYear(currentYear)}</span>
                </button>
                <button
                  type="button"
                  onClick={handleNextMonth}
                  className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                  aria-label="เดือนถัดไป"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-[10px] font-semibold text-slate-500 mb-2 border-b border-white/5 pb-1">
                {weekdayNames.map((w) => (
                  <span key={w}>{w}</span>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {daysArray.map((day, idx) => {
                  if (day === null) {
                    return <span key={idx}></span>;
                  }
                  const formattedMonth = String(currentMonth + 1).padStart(2, '0');
                  const formattedDay = String(day).padStart(2, '0');
                  const dateString = `${currentYear}-${formattedMonth}-${formattedDay}`;
                  const isSelected = value === dateString;

                  return (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => handleSelectDay(day)}
                      className={`py-1 text-center text-[10px] font-semibold rounded transition-all ${
                        isSelected
                          ? 'bg-spa-gold text-slate-950 font-bold shadow-md shadow-spa-gold/20'
                          : 'text-slate-300 hover:bg-white/5 hover:text-white'
                      }`}
                    >
                      {day}
                    </button>
                  );
                })}
              </div>
            </>
          )}

          {/* ระดับ 2: กริดเลือกเดือน (โหมด 'day' กดป้ายเดือน/ปีมาที่นี่ / โหมด 'month' คือหน้าเริ่มต้น) */}
          {view === 'months' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={handlePrevYear}
                  className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                  aria-label="ปีก่อนหน้า"
                >
                  <ChevronLeft size={16} />
                </button>
                <button
                  type="button"
                  onClick={handleOpenYearsView}
                  className="text-xs font-bold text-spa-gold hover:text-white transition-colors"
                  title="กดเพื่อเลือกปีโดยตรง"
                >
                  {convertToBuddhistYear(currentYear)}
                </button>
                <button
                  type="button"
                  onClick={handleNextYear}
                  className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                  aria-label="ปีถัดไป"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {monthNamesShort.map((label, idx) => (
                  <button
                    key={label}
                    type="button"
                    onClick={() => handleSelectMonth(idx)}
                    className={gridButtonClass(idx === currentMonth)}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </>
          )}

          {/* ระดับ 3: กริดเลือกปี (กดป้ายปี บนกริดเดือนเพื่อมาที่นี่) */}
          {view === 'years' && (
            <>
              <div className="flex items-center justify-between mb-3">
                <button
                  type="button"
                  onClick={handlePrevYearsPage}
                  className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                  aria-label="ช่วงปีก่อนหน้า"
                >
                  <ChevronLeft size={16} />
                </button>
                <span className="text-xs font-bold text-spa-gold">
                  {convertToBuddhistYear(yearsPageStart)} - {convertToBuddhistYear(yearsPageStart + YEARS_PER_PAGE - 1)}
                </span>
                <button
                  type="button"
                  onClick={handleNextYearsPage}
                  className="p-1 rounded hover:bg-white/5 text-slate-400 hover:text-white transition-colors"
                  aria-label="ช่วงปีถัดไป"
                >
                  <ChevronRight size={16} />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                {yearsInPage.map((year) => (
                  <button
                    key={year}
                    type="button"
                    onClick={() => handleSelectYear(year)}
                    className={gridButtonClass(year === currentYear)}
                  >
                    {convertToBuddhistYear(year)}
                  </button>
                ))}
              </div>
            </>
          )}

        </div>
      )}
    </div>
  );
};
