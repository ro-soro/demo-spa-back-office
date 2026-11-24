// src/app/page.tsx
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. นำ Tailwind CSS มาช่วยเขียน Grid เลย์เอาต์ ให้ยืดหยุ่นรองรับทุกความละเอียดหน้าจอได้อย่างสมบูรณ์
//    โดยใช้กล่องการ์ด glass-panel และ glass-panel-hover เพื่อดึงมิติความโปร่งแสงเบลอออกมาได้สวยงามที่สุด
// 2. ออกแบบส่วนฟิลเตอร์กรองวันที่และตัวชี้วัดสำคัญ (Key Metrics) ให้เรียงแถวเป็นระเบียบ ไม่ทับซ้อนกันแบบของเดิม
// 3. ปรับ Recharts แผนภูมิกราฟรายวันให้แสดงผลสีสันเรืองแสงสีทองและเขียวมรกตที่กลมกลืนกับตัวสปาระดับหรูหรา

'use client';

import React, { useState, useEffect } from 'react';
import { useApp } from '@/context/AppContext';
import { DatePicker } from '@/components/DatePicker';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { convertToBuddhistYear } from '@/utils/thaiDate';
import {
  DollarSign, 
  Users, 
  TrendingUp, 
  Calendar,
  Wallet,
  Smartphone,
  CreditCard,
  Heart
} from 'lucide-react';
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer 
} from 'recharts';

// มุมมองการรวมยอดของกราฟแนวโน้ม — เลือกได้ว่าจะดูสรุปแบบรายวัน/รายเดือน/รายปี
type ChartViewMode = 'daily' | 'monthly' | 'yearly';

// ชื่อเดือนไทยแบบย่อ สำหรับป้ายกำกับแกน X ของกราฟรายเดือน
const THAI_MONTHS_SHORT = [
  'ม.ค.', 'ก.พ.', 'มี.ค.', 'เม.ย.', 'พ.ค.', 'มิ.ย.',
  'ก.ค.', 'ส.ค.', 'ก.ย.', 'ต.ค.', 'พ.ย.', 'ธ.ค.'
];

// หาช่วงครึ่งเดือนของเดือนปัจจุบันเป็นค่าเริ่มต้นของฟิลเตอร์วันที่ (งวดบัญชีจริงของร้านจ่ายกัน 2 รอบ/เดือน)
// เช็คว่าวันนี้อยู่ครึ่งแรก (1-15) หรือครึ่งหลัง (16-สิ้นเดือน) ของเดือน แล้วเลือกช่วงนั้นให้อัตโนมัติ
const getDefaultHalfMonthRange = (): { start: string; end: string } => {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const dayOfMonth = today.getDate();
  const lastDayOfMonth = new Date(year, month + 1, 0).getDate();

  const pad = (n: number): string => String(n).padStart(2, '0');
  const monthStr = pad(month + 1);
  const isFirstHalf = dayOfMonth <= 15;

  return {
    start: `${year}-${monthStr}-${isFirstHalf ? '01' : '16'}`,
    end: `${year}-${monthStr}-${isFirstHalf ? '15' : pad(lastDayOfMonth)}`
  };
};

export default function Dashboard() {
  const { bookings, courseSales, therapists } = useApp();
  const [mounted, setMounted] = useState(false);

  // ตั้งค่าช่วงวันที่สถิติเริ่มต้นเป็นครึ่งเดือนปัจจุบัน (เช็คจากวันที่จริงว่าอยู่ครึ่งแรกหรือครึ่งหลัง)
  const defaultRange = getDefaultHalfMonthRange();
  const [startDate, setStartDate] = useState(defaultRange.start);
  const [endDate, setEndDate] = useState(defaultRange.end);
  const [chartViewMode, setChartViewMode] = useState<ChartViewMode>('daily');

  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMounted(true);
  }, []);

  // กรองรายการจองและคอร์สในช่วงวันที่เลือก
  const filteredBookings = bookings.filter(b => b.date >= startDate && b.date <= endDate);
  const filteredCourseSales = courseSales.filter(c => c.date >= startDate && c.date <= endDate);

  // 1. คำนวณรายได้ทั้งหมด (งานนวด + คอร์ส)
  const bookingRevenue = filteredBookings.reduce((sum, b) => {
    const servicesSum = b.services.reduce((sSum, s) => sSum + (s.price * s.quantity), 0);
    return sum + servicesSum;
  }, 0);
  
  const courseRevenue = filteredCourseSales.reduce((sum, c) => sum + c.price, 0);
  const totalRevenue = bookingRevenue + courseRevenue;

  // 2. คำนวณค่ามือหมอทั้งหมด (งานนวด + คอมมิชชั่นคอร์ส)
  const bookingCommissions = filteredBookings.reduce((sum, b) => {
    const commsSum = b.services.reduce((sSum, s) => sSum + (s.commission * s.quantity), 0);
    return sum + commsSum;
  }, 0);

  const courseCommissions = filteredCourseSales.reduce((sum, c) => sum + c.commissionAmount, 0);
  const totalCommissions = bookingCommissions + courseCommissions;

  // 3. กำไรสุทธิของร้าน
  const netProfit = totalRevenue - totalCommissions;

  // 4. สรุปช่องทางชำระเงิน (เฉพาะงานนวด)
  const paymentBreakdown = filteredBookings.reduce(
    (acc, b) => {
      acc.cash += b.payment.cash;
      acc.transfer += b.payment.transfer;
      acc.card += b.payment.card;
      acc.tip += b.payment.tip;
      return acc;
    },
    { cash: 0, transfer: 0, card: 0, tip: 0 }
  );

  // 5. สถิติการรับงานของหมอนวดแต่ละคน (Leaderboard)
  const therapistLeaderboard = therapists.map(t => {
    const tBookings = filteredBookings.filter(b => b.therapistName === t.name);
    const bookingCount = tBookings.length;
    
    const commEarned = tBookings.reduce((sum, b) => {
      return sum + b.services.reduce((sSum, s) => sSum + (s.commission * s.quantity), 0);
    }, 0);

    const tCourses = filteredCourseSales.filter(c => c.therapistName === t.name);
    const courseCount = tCourses.length;
    const courseCommEarned = tCourses.reduce((sum, c) => sum + c.commissionAmount, 0);

    return {
      name: t.name,
      type: t.type,
      bookings: bookingCount,
      courses: courseCount,
      totalCommission: commEarned + courseCommEarned
    };
  }).sort((a, b) => b.totalCommission - a.totalCommission);

  // จุดข้อมูล 1 จุดบนกราฟแนวโน้ม ไม่ว่าจะรวมยอดแบบรายวัน/รายเดือน/รายปี ก็มีรูปร่างเดียวกันนี้เสมอ
  interface ChartPoint {
    displayDate: string;
    revenue: number;
    commission: number;
  }

  // รวมยอดขายและค่าคอมของงานนวด 1 รายการ (ใช้ซ้ำในทั้ง 3 มุมมอง เพื่อไม่ให้สูตรคำนวณเพี้ยนไปคนละที่)
  const sumBookingRevenueAndCommission = (booking: (typeof filteredBookings)[number]) => {
    const revenue = booking.services.reduce((sum, s) => sum + (s.price * s.quantity), 0);
    const commission = booking.services.reduce((sum, s) => sum + (s.commission * s.quantity), 0);
    return { revenue, commission };
  };

  // 6ก. กราฟรายวัน — 1 จุดต่อวัน ภายในช่วงวันที่ที่เลือก (พฤติกรรมเดิมของระบบ)
  const getDailyChartData = (): ChartPoint[] => {
    const dailyMap: { [date: string]: { revenue: number; commission: number } } = {};

    const current = new Date(startDate);
    const end = new Date(endDate);
    while (current <= end) {
      const dateStr = current.toISOString().split('T')[0];
      dailyMap[dateStr] = { revenue: 0, commission: 0 };
      current.setDate(current.getDate() + 1);
    }

    filteredBookings.forEach(b => {
      if (dailyMap[b.date]) {
        const { revenue, commission } = sumBookingRevenueAndCommission(b);
        dailyMap[b.date].revenue += revenue;
        dailyMap[b.date].commission += commission;
      }
    });

    filteredCourseSales.forEach(c => {
      if (dailyMap[c.date]) {
        dailyMap[c.date].revenue += c.price;
        dailyMap[c.date].commission += c.commissionAmount;
      }
    });

    return Object.entries(dailyMap).map(([dateStr, values]) => {
      const parts = dateStr.split('-');
      const day = parseInt(parts[2], 10);
      const monthIndex = parseInt(parts[1], 10) - 1;
      return {
        displayDate: `${day} ${THAI_MONTHS_SHORT[monthIndex]}`,
        revenue: values.revenue,
        commission: values.commission
      };
    });
  };

  // 6ข. กราฟรายเดือน — รวมยอดทุกวันในเดือนเดียวกันเป็น 1 จุด (ภายในช่วงวันที่ที่เลือก)
  const getMonthlyChartData = (): ChartPoint[] => {
    const monthlyMap: { [monthKey: string]: { revenue: number; commission: number } } = {};

    const current = new Date(startDate);
    current.setDate(1); // ปัดเป็นวันที่ 1 ของเดือน เพื่อวนลูปทีละเดือนได้ตรงเป๊ะ
    const end = new Date(endDate);
    while (current <= end) {
      const monthKey = `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}`;
      monthlyMap[monthKey] = { revenue: 0, commission: 0 };
      current.setMonth(current.getMonth() + 1);
    }

    filteredBookings.forEach(b => {
      const monthKey = b.date.substring(0, 7); // "YYYY-MM"
      if (monthlyMap[monthKey]) {
        const { revenue, commission } = sumBookingRevenueAndCommission(b);
        monthlyMap[monthKey].revenue += revenue;
        monthlyMap[monthKey].commission += commission;
      }
    });

    filteredCourseSales.forEach(c => {
      const monthKey = c.date.substring(0, 7);
      if (monthlyMap[monthKey]) {
        monthlyMap[monthKey].revenue += c.price;
        monthlyMap[monthKey].commission += c.commissionAmount;
      }
    });

    return Object.entries(monthlyMap).map(([monthKey, values]) => {
      const [yearStr, monthStr] = monthKey.split('-');
      const monthIndex = parseInt(monthStr, 10) - 1;
      const buddhistYearShort = String(convertToBuddhistYear(parseInt(yearStr, 10))).slice(-2);
      return {
        displayDate: `${THAI_MONTHS_SHORT[monthIndex]} ${buddhistYearShort}`,
        revenue: values.revenue,
        commission: values.commission
      };
    });
  };

  // 6ค. กราฟรายปี — รวมยอดทุกเดือนในปีเดียวกันเป็น 1 จุด (ภายในช่วงวันที่ที่เลือก)
  const getYearlyChartData = (): ChartPoint[] => {
    const yearlyMap: { [year: string]: { revenue: number; commission: number } } = {};

    const startYear = new Date(startDate).getFullYear();
    const endYear = new Date(endDate).getFullYear();
    for (let year = startYear; year <= endYear; year++) {
      yearlyMap[String(year)] = { revenue: 0, commission: 0 };
    }

    filteredBookings.forEach(b => {
      const yearKey = b.date.substring(0, 4);
      if (yearlyMap[yearKey]) {
        const { revenue, commission } = sumBookingRevenueAndCommission(b);
        yearlyMap[yearKey].revenue += revenue;
        yearlyMap[yearKey].commission += commission;
      }
    });

    filteredCourseSales.forEach(c => {
      const yearKey = c.date.substring(0, 4);
      if (yearlyMap[yearKey]) {
        yearlyMap[yearKey].revenue += c.price;
        yearlyMap[yearKey].commission += c.commissionAmount;
      }
    });

    return Object.entries(yearlyMap).map(([yearStr, values]) => ({
      displayDate: String(convertToBuddhistYear(parseInt(yearStr, 10))),
      revenue: values.revenue,
      commission: values.commission
    }));
  };

  const getChartData = (viewMode: ChartViewMode): ChartPoint[] => {
    if (viewMode === 'monthly') return getMonthlyChartData();
    if (viewMode === 'yearly') return getYearlyChartData();
    return getDailyChartData();
  };

  const chartData = getChartData(chartViewMode);

  const CHART_VIEW_MODE_LABELS: { [key in ChartViewMode]: string } = {
    daily: 'รายวัน',
    monthly: 'รายเดือน',
    yearly: 'รายปี'
  };

  return (
    <div className="flex flex-col gap-6">
      
      {/* ส่วนกรองข้อมูลวันที่ */}
      <div className="glass-panel flex flex-col md:flex-row items-center justify-between gap-4 py-4 px-6 rounded-2xl border border-white/5 shadow-lg">
        <div className="flex items-center gap-2.5">
          <Calendar className="text-spa-teal" size={20} />
          <span className="text-sm font-semibold text-slate-300">ฟิลเตอร์เลือกช่วงเวลางวดบัญชี:</span>
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

      {/* Grid บัตรสรุปตัวเลขสถิติ (Key Metrics Cards) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* รายได้รวม */}
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-md">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">รายได้รวม (นวด + คอร์ส)</p>
            <h2 className="text-2xl font-bold font-display text-slate-100 truncate">
              {totalRevenue.toLocaleString()} <span className="text-xs text-slate-400 font-normal">฿</span>
            </h2>
            <p className="text-[10px] text-slate-400 mt-2 truncate">
              นวด: {bookingRevenue.toLocaleString()} ฿ | คอร์ส: {courseRevenue.toLocaleString()} ฿
            </p>
          </div>
          <div className="p-3 rounded-xl bg-spa-gold/10 text-spa-gold flex-shrink-0">
            <DollarSign size={24} />
          </div>
        </div>

        {/* ค่ามือหมอรวม */}
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-md">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">รวมค่ามือที่จ่ายออก</p>
            <h2 className="text-2xl font-bold font-display text-slate-100 truncate">
              {totalCommissions.toLocaleString()} <span className="text-xs text-slate-400 font-normal">฿</span>
            </h2>
            <p className="text-[10px] text-slate-400 mt-2 truncate">
              นวด: {bookingCommissions.toLocaleString()} ฿ | คอร์ส: {courseCommissions.toLocaleString()} ฿
            </p>
          </div>
          <div className="p-3 rounded-xl bg-spa-teal/10 text-spa-teal flex-shrink-0">
            <Heart size={24} />
          </div>
        </div>

        {/* กำไรสุทธิของร้าน */}
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-md">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">กำไรสุทธิของร้าน</p>
            <h2 className="text-2xl font-bold font-display text-spa-gold truncate">
              {netProfit.toLocaleString()} <span className="text-xs text-spa-gold font-normal">฿</span>
            </h2>
            <p className="text-[10px] text-emerald-400 mt-2 font-medium">
              อัตรากำไร {(totalRevenue > 0 ? (netProfit / totalRevenue * 100).toFixed(1) : 0)}%
            </p>
          </div>
          <div className="p-3 rounded-xl bg-emerald-500/10 text-emerald-400 flex-shrink-0">
            <TrendingUp size={24} />
          </div>
        </div>

        {/* จำนวนงานนวดสะสม */}
        <div className="glass-panel glass-panel-hover p-6 rounded-2xl border border-white/5 flex items-center justify-between shadow-md">
          <div className="min-w-0">
            <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2">งานนวด & สัญญาจองคอร์ส</p>
            <h2 className="text-2xl font-bold font-display text-slate-100 truncate">
              {filteredBookings.length + filteredCourseSales.length} <span className="text-xs text-slate-400 font-normal">ครั้ง</span>
            </h2>
            <p className="text-[10px] text-slate-400 mt-2 truncate">
              งานนวด: {filteredBookings.length} | คอร์ส: {filteredCourseSales.length}
            </p>
          </div>
          <div className="p-3 rounded-xl bg-white/5 text-slate-300 flex-shrink-0">
            <Users size={24} />
          </div>
        </div>
      </div>

      {/* Grid กราฟสถิติรายวันและการเงิน */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* แผนภูมิกราฟรายวัน (2 columns on desktop) */}
        <div className="glass-panel lg:col-span-2 p-6 rounded-2xl border border-white/5 flex flex-col justify-between shadow-lg" style={{ minHeight: '380px' }}>
          <div className="mb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold">แนวโน้มรายได้เปรียบเทียบค่ามือ</h3>
              <p className="text-[10px] text-slate-500 mt-1">เปรียบเทียบความสัมพันธ์ของรายรับร้านกับสัดส่วนค่ามือของพนักงาน ภายในช่วงวันที่ที่เลือกด้านบน</p>
            </div>
            <div className="flex p-1 rounded-lg bg-slate-950 border border-white/5 self-start sm:self-auto">
              {(Object.keys(CHART_VIEW_MODE_LABELS) as ChartViewMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setChartViewMode(mode)}
                  className={`px-3.5 py-1.5 rounded-md text-[11px] font-bold whitespace-nowrap transition-all ${
                    chartViewMode === mode
                      ? 'bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 shadow-md'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {CHART_VIEW_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>
          <div className="flex-1 w-full" style={{ minHeight: '260px' }}>
            {mounted ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorRev" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-gold)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--color-gold)" stopOpacity={0}/>
                    </linearGradient>
                    <linearGradient id="colorComm" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="var(--color-teal)" stopOpacity={0.25}/>
                      <stop offset="95%" stopColor="var(--color-teal)" stopOpacity={0}/>
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.03)" />
                  <XAxis dataKey="displayDate" stroke="var(--text-secondary)" fontSize={11} />
                  <YAxis stroke="var(--text-secondary)" fontSize={11} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(8, 11, 22, 0.97)',
                      borderColor: 'var(--color-gold)',
                      borderWidth: '1px',
                      borderRadius: '10px',
                      backdropFilter: 'blur(8px)',
                      color: '#f3f4f6',
                      fontSize: '12px',
                      boxShadow: '0 8px 24px rgba(0, 0, 0, 0.5)'
                    }}
                    labelStyle={{ color: 'var(--color-gold)', fontWeight: 700, marginBottom: '4px' }}
                    itemStyle={{ color: '#f3f4f6' }}
                  />
                  <Area type="monotone" dataKey="revenue" name="รายได้รวม" stroke="var(--color-gold)" fillOpacity={1} fill="url(#colorRev)" strokeWidth={2} />
                  <Area type="monotone" dataKey="commission" name="ค่ามือหมอ" stroke="var(--color-teal)" fillOpacity={1} fill="url(#colorComm)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full flex items-center justify-center">
                <LoadingSpinner label="กำลังโหลดแผนภูมิ..." size="sm" />
              </div>
            )}
          </div>
        </div>

        {/* ยอดชำระและทิป (1 column on desktop) */}
        <div className="glass-panel p-6 rounded-2xl border border-white/5 flex flex-col justify-between shadow-lg">
          <div className="mb-4">
            <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-teal">สรุปประเภทการจ่ายเงิน</h3>
            <p className="text-[10px] text-slate-500 mt-1">สถิติการรับเงินหน้างานของกลุ่มบริการนวดและสปา</p>
          </div>
          
          <div className="flex flex-col gap-3 justify-center flex-1 my-4">
            {/* เงินสด */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-500">
                  <Wallet size={16} />
                </div>
                <span className="text-xs font-semibold text-slate-300">เงินสด</span>
              </div>
              <strong className="text-sm font-bold text-slate-200">{paymentBreakdown.cash.toLocaleString()} ฿</strong>
            </div>

            {/* เงินโอน */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-teal-500/10 text-teal-400">
                  <Smartphone size={16} />
                </div>
                <span className="text-xs font-semibold text-slate-300">เงินโอน</span>
              </div>
              <strong className="text-sm font-bold text-slate-200">{paymentBreakdown.transfer.toLocaleString()} ฿</strong>
            </div>

            {/* บัตรเครดิต */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-slate-950/40 border border-white/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-indigo-500/10 text-indigo-400">
                  <CreditCard size={16} />
                </div>
                <span className="text-xs font-semibold text-slate-300">บัตรเครดิต</span>
              </div>
              <strong className="text-sm font-bold text-slate-200">{paymentBreakdown.card.toLocaleString()} ฿</strong>
            </div>

            {/* ยอดรวมทิปสะสม */}
            <div className="flex items-center justify-between p-3.5 rounded-xl bg-emerald-500/5 border border-dashed border-emerald-500/20">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Heart size={16} />
                </div>
                <span className="text-xs font-semibold text-emerald-400">ทิปสะสมพิเศษ</span>
              </div>
              <strong className="text-sm font-bold text-emerald-400">{paymentBreakdown.tip.toLocaleString()} ฿</strong>
            </div>
          </div>
        </div>

      </div>

      {/* บอร์ดผู้นำหมอนวดและสถิติสะสม (Therapist Leaderboard) */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-lg">
        <div className="mb-4">
          <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold">อันดับการรับงานและผลตอบแทนพนักงาน</h3>
          <p className="text-[10px] text-slate-500 mt-1">ข้อมูลสรุปจำนวนงานนวด รายการขายคอร์สสะสม และผลรวมค่าเหนื่อยพนักงานทั้งหมด</p>
        </div>
        
        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">พนักงาน</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">ประเภทพนักงาน</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">งานนวดรวม (ครั้ง)</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">ขายคอร์ส (คอร์ส)</th>
                <th className="px-5 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">ผลตอบแทนสะสมงวดนี้</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {therapistLeaderboard.map((t, idx) => (
                <tr key={idx} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-4 text-sm font-semibold text-slate-200">หมอ{t.name}</td>
                  <td className="px-5 py-4 text-xs">
                    {t.type === 'full-time' ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-teal-950/40 text-teal-400 border border-teal-900/60">พนักงานประจำ</span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-950/40 text-amber-400 border border-amber-900/60">พาร์ทไทม์</span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">{t.bookings} ครั้ง</td>
                  <td className="px-5 py-4 text-sm text-slate-300">{t.courses} คอร์ส</td>
                  <td className="px-5 py-4 text-sm font-bold text-spa-gold text-right">
                    {t.totalCommission.toLocaleString()} ฿
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

    </div>
  );
}
