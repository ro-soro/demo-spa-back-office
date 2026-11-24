// src/app/courses/page.tsx
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. นำระบบ React Hook Form และ Zod เข้ามาผูกในกล่องบันทึกคอร์สสปา
//    เพื่อให้การตรวจจับค่าคอมมิชชั่นกับราคาจำหน่ายคอร์สเป็นค่าจำนวนบวกจริง
// 2. ใช้ Framer Motion AnimatePresence คุมหน้าต่างบันทึกคอร์สสปาขอบทอง
//    ช่วยจัดจังหวะเฟดเข้าและขยายออก เพิ่มมิติความเรียบร้อยและสัมผัสความประณีตให้ตัวโปรแกรม
// 3. ใช้การแต่งสไตล์ด้วย Tailwind CSS แทนนอกสไตล์เดิม ช่วยเรื่องตารางสรุปรายได้และค่าคอมรายบุคคลแยกตามเดือน
//    ไม่ให้เกิดข้อความทับซ้อนหรือขยายออกนอกหน้าต่างเมื่อดูจากจอ Tablet/Mobile

"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { CourseSale } from "@/data/initialData";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, Controller, useWatch, Control } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { DatePicker } from "@/components/DatePicker";
import { PaginationControls } from "@/components/PaginationControls";
import { getTodayDateString, getCurrentYearMonthString } from "@/utils/dateHelpers";
import { formatDateForDisplay } from "@/utils/thaiDate";
import { blockNonNumericKeyDown, requiredNumberInput } from "@/utils/numericInput";
import {
  Plus,
  Search,
  Edit2,
  Trash2,
  Lock,
  X,
  Check,
  TrendingUp,
  AlertCircle,
} from "lucide-react";

// Zod Schema สำหรับการขายคอร์สสปา
const courseSaleSchema = z.object({
  date: z.string().min(1, "กรุณาระบุวันที่ขาย"),
  therapistName: z.string().min(1, "กรุณาเลือกชื่อหมอนวดผู้ขาย"),
  courseCategory: z.string().min(1, "กรุณาระบุหมวดหมู่คอร์ส"),
  courseType: z.string().min(1, "กรุณากรอกรายละเอียด/ชื่อประเภทคอร์ส"),
  price: z.number({ message: "กรุณากรอกราคาจำหน่าย" }).min(1, "ราคาจำหน่ายต้องมากกว่า 0 บาท"),
  commissionPercent: z
    .number({ message: "กรุณากรอกเปอร์เซ็นต์ค่าคอม" })
    .min(0, "เปอร์เซ็นต์ค่าคอมต้องไม่ติดลบ")
    .max(100, "เปอร์เซ็นต์ค่าคอมมิชชั่นสูงสุดคือ 100"),
});

type CourseSaleFormValues = z.infer<typeof courseSaleSchema>;

const LiveCommissionAmount = ({
  control,
}: {
  control: Control<CourseSaleFormValues>;
}) => {
  const price = useWatch({
    control,
    name: "price",
    defaultValue: 0,
  });
  const commissionPercent = useWatch({
    control,
    name: "commissionPercent",
    defaultValue: 0,
  });

  const liveCommissionAmount =
    ((Number(price) || 0) * (Number(commissionPercent) || 0)) / 100;

  return (
    <div className="p-3.5 rounded-xl bg-slate-950 border border-white/5 flex items-center justify-between">
      <span className="text-[11px] text-slate-400 font-semibold">
        ค่าคอมมิชชั่นส่วนแบ่งพนักงานที่จะจ่าย:
      </span>
      <strong className="text-sm font-bold text-emerald-400">
        {liveCommissionAmount.toLocaleString()} ฿
      </strong>
    </div>
  );
};

export default function CourseSalesPage() {
  const {
    courseSales,
    therapists,
    courseTemplates,
    currentRole,
    addOrUpdateCourseSale,
    removeCourseSale,
  } = useApp();

  // สถานะการฟิลเตอร์และค้นหา — ตัวกรองเดือนเริ่มต้นที่ "เดือนปัจจุบัน" เสมอ (คำนวณจากวันที่จริง ไม่ hardcode)
  const [searchTerm, setSearchTerm] = useState("");
  const [monthFilter, setMonthFilter] = useState(getCurrentYearMonthString());
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // สถานะเปิด/ปิด Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingSale, setEditingSale] = useState<CourseSale | null>(null);

  // วันที่วันนี้ของระบบ YYYY-MM-DD
  const todayStr = getTodayDateString();

  // ตรวจสอบสิทธิ์การแก้ไขข้ามวัน
  const canEditSale = (saleDate: string): boolean => {
    if (currentRole === "admin") {
      return saleDate === todayStr;
    }
    return true; // manager / super-manager
  };

  // React Hook Form Setup
  const {
    register,
    handleSubmit,
    control,
    reset,
    setValue,
    formState: { errors },
  } = useForm<CourseSaleFormValues>({
    resolver: zodResolver(courseSaleSchema),
    defaultValues: {
      date: todayStr,
      therapistName: "",
      courseCategory: "",
      courseType: "",
    },
  });

  // ดึงหมวดหมู่คอร์สที่ไม่ซ้ำจาก courseTemplates
  const uniqueCourseCategories = Array.from(
    new Set(courseTemplates.map((t) => t.category)),
  );

  // เมื่อผู้ใช้เลือก Template จาก Dropdown ให้ Auto-fill courseType และ price
  // ต้องส่ง { shouldValidate: true } ทุกครั้ง ไม่งั้น react-hook-form จะไม่รีเช็ค error ของฟิลด์นั้น
  // ทำให้ข้อความ "กรุณากรอก..." ค้างอยู่ทั้งที่ auto-fill ค่าที่ถูกต้องเข้าไปแล้ว
  const handleCourseTemplateSelect = (templateId: string) => {
    const selectedTemplate = courseTemplates.find((t) => t.id === templateId);
    if (selectedTemplate) {
      setValue("courseCategory", selectedTemplate.category, { shouldValidate: true });
      setValue("courseType", selectedTemplate.name, { shouldValidate: true });
      setValue("price", selectedTemplate.defaultPrice, { shouldValidate: true });
    }
  };

  // คัดกรองรายการขายคอร์สตามคีย์เวิร์ด
  const filteredSales = courseSales
    .filter((s) => {
      const matchSearch =
        s.therapistName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.courseType.toLowerCase().includes(searchTerm.toLowerCase()) ||
        s.courseCategory.toLowerCase().includes(searchTerm.toLowerCase());

      const matchMonth = monthFilter === "" || s.date.startsWith(monthFilter);
      return matchSearch && matchMonth;
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  const totalPages = Math.ceil(filteredSales.length / ITEMS_PER_PAGE);
  const paginatedSales = filteredSales.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // ----------------------------------------------------
  // ระบบวิเคราะห์คำนวณสะสมยอดขายแยกรายบุคคล
  // ----------------------------------------------------
  interface TherapistSummary {
    name: string;
    totalCount: number;
    totalRevenue: number;
    totalCommission: number;
  }

  const getTherapistSummaries = (): TherapistSummary[] => {
    const summaryMap: { [name: string]: TherapistSummary } = {};

    // โหลดรายชื่อหมอนวดเริ่มต้นทุกคน
    therapists.forEach((t) => {
      summaryMap[t.name] = {
        name: t.name,
        totalCount: 0,
        totalRevenue: 0,
        totalCommission: 0,
      };
    });

    // บวกสะสมตามฟิลเตอร์เดือนที่เลือก
    courseSales.forEach((s) => {
      const matchMonth = monthFilter === "" || s.date.startsWith(monthFilter);
      if (matchMonth) {
        if (!summaryMap[s.therapistName]) {
          summaryMap[s.therapistName] = {
            name: s.therapistName,
            totalCount: 0,
            totalRevenue: 0,
            totalCommission: 0,
          };
        }
        summaryMap[s.therapistName].totalCount += 1;
        summaryMap[s.therapistName].totalRevenue += s.price;
        summaryMap[s.therapistName].totalCommission += s.commissionAmount;
      }
    });

    return Object.values(summaryMap).sort(
      (a, b) => b.totalRevenue - a.totalRevenue,
    );
  };

  const monthlySummaries = getTherapistSummaries();

  // เปิดป๊อปอัปเพิ่มคอร์ส
  const handleOpenAddModal = () => {
    setEditingSale(null);
    setIsModalOpen(true);
    // ไม่เดาค่าล่วงหน้า ให้ผู้ใช้กรอก/เลือกเองทั้งหมด (ใช้ placeholder เป็นตัวช่วยแทน)
    reset({
      date: todayStr,
      therapistName: "",
      courseCategory: "",
      courseType: "",
    });
  };

  // เปิดป๊อปอัปแก้ไขคอร์ส
  const handleOpenEditModal = (sale: CourseSale) => {
    if (!canEditSale(sale.date)) return;

    setEditingSale(sale);
    setIsModalOpen(true);
    reset({
      date: sale.date,
      therapistName: sale.therapistName,
      courseCategory: sale.courseCategory,
      courseType: sale.courseType,
      price: sale.price,
      commissionPercent: sale.commissionPercent,
    });
  };

  // ลบคอร์สออก
  const handleDeleteSale = (id: string, date: string) => {
    if (!canEditSale(date)) return;
    if (confirm("คุณต้องการลบรายการจองขายคอร์สชิ้นนี้ใช่หรือไม่?")) {
      removeCourseSale(id);
    }
  };

  // กดส่งฟอร์มข้อมูลคอร์ส
  const onSubmit = (data: CourseSaleFormValues) => {
    const saleData: CourseSale = {
      id: editingSale?.id || `crs_${new Date().getTime()}`,
      date: currentRole === "admin" ? todayStr : data.date,
      therapistName: data.therapistName,
      courseCategory: data.courseCategory,
      courseType: data.courseType,
      price: Number(data.price),
      commissionPercent: Number(data.commissionPercent),
      commissionAmount:
        (Number(data.price) * Number(data.commissionPercent)) / 100,
      updateDate: new Date().toISOString(),
      updateBy: "",
    };

    addOrUpdateCourseSale(saleData);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. ส่วนกรองข้อมูลค้นหา (Filters Header) */}
      <div className="glass-panel p-5 rounded-2xl border border-white/5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3 flex-1">
          {/* ค้นหาคีย์เวิร์ด */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              size={17}
            />
            <input
              type="text"
              placeholder="ค้นหาหมอนวดผู้ขาย, รายละเอียดคอร์ส..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:border-spa-gold outline-none transition-colors"
            />
          </div>
          {/* ตัวกรองรายเดือน — ใช้ DatePicker แบบเดียวกับหน้าอื่นทั้งหมด (โหมดเลือกเฉพาะเดือน) */}
          <div className="relative flex items-center gap-1.5 w-full sm:w-52">
            <div className="flex-1">
              <DatePicker
                mode="month"
                value={monthFilter}
                onChange={(val) => {
                  setMonthFilter(val);
                  setCurrentPage(1);
                }}
                align="right"
              />
            </div>
            {monthFilter && (
              <button
                onClick={() => {
                  setMonthFilter("");
                  setCurrentPage(1);
                }}
                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-slate-500 hover:text-white"
                title="ล้างตัวกรองเดือน (แสดงทุกเดือน)"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ปุ่มบันทึกคอร์สใหม่ */}
        <button
          onClick={handleOpenAddModal}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-teal to-teal-600 text-white font-semibold text-xs flex items-center gap-2 active:scale-95 transition-transform w-full md:w-auto justify-center shadow-lg shadow-spa-teal/10"
        >
          <Plus size={16} />
          <span>บันทึกการขายคอร์สใหม่</span>
        </button>
      </div>

      {/* 2. บอร์ดวิเคราะห์สะสมยอดขายและคอมมิชชั่นของหมอนวดประจำเดือน */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="mb-4">
          <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold flex items-center gap-2">
            <TrendingUp size={16} className="text-spa-gold" />
            <span>สรุปสะสมยอดขายคอร์สและค่าคอมของงวดประจำเดือน</span>
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            ใช้ตรวจสอบยอดสะสมเพื่อนำไปจ่ายค่าคอมมิชชั่นพิเศษควบคู่กับสลิปเงินเดือนช่วงปลายงวด
          </p>
        </div>

        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  หมอนวดผู้ขาย
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  จำนวนคอร์สที่ขายได้
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ยอดจำหน่ายคอร์สรวม
                </th>
                <th className="px-5 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ค่าคอมมิชชั่นสะสมสุทธิ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {monthlySummaries.map((s, idx) => (
                <tr key={idx} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-4 text-sm font-semibold text-slate-200">
                    หมอ{s.name}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">
                    {s.totalCount} คอร์ส
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-200 font-semibold">
                    {s.totalRevenue.toLocaleString()} ฿
                  </td>
                  <td className="px-5 py-4 text-sm font-bold text-emerald-400 text-right">
                    +{s.totalCommission.toLocaleString()} ฿
                  </td>
                </tr>
              ))}
              <tr className="bg-slate-950/40 font-bold border-t border-white/10">
                <td className="px-5 py-4 text-sm text-spa-gold">
                  รวมทั้งหมดประจำงวด
                </td>
                <td className="px-5 py-4 text-sm text-slate-200">
                  {monthlySummaries.reduce((sum, s) => sum + s.totalCount, 0)}{" "}
                  คอร์ส
                </td>
                <td className="px-5 py-4 text-sm text-spa-gold font-bold">
                  {monthlySummaries
                    .reduce((sum, s) => sum + s.totalRevenue, 0)
                    .toLocaleString()}{" "}
                  ฿
                </td>
                <td className="px-5 py-4 text-sm font-bold text-emerald-400 text-right">
                  +
                  {monthlySummaries
                    .reduce((sum, s) => sum + s.totalCommission, 0)
                    .toLocaleString()}{" "}
                  ฿
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. ตารางบันทึกประวัติการจำหน่ายคอร์ส (Course History Table) */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="mb-4">
          <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-teal">
            ประวัติการขายคอร์สสปา
          </h3>
          <p className="text-[10px] text-slate-500 mt-1">
            บันทึกข้อมูลการเสนอขายคอร์สนวดสปา ขอบเขตเปอร์เซ็นต์ค่าแนะนำ
            และชื่อผู้ปรับปรุงข้อมูล
          </p>
        </div>

        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  วันที่ขาย
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  หมอนวดผู้ขาย
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  หมวดหมู่
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  รายละเอียดคอร์สสปา
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ราคาจำหน่ายจริง
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ค่าคอม (%)
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ยอดเงินค่าคอม
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                  อัปเดตล่าสุด
                </th>
                <th
                  className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider"
                  style={{ width: "100px" }}
                >
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedSales.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center text-xs text-slate-500 py-12"
                  >
                    ไม่พบรายการประวัติบันทึกการขายคอร์สในช่วงเวลานี้
                  </td>
                </tr>
              ) : (
                paginatedSales.map((s) => {
                  const editable = canEditSale(s.date);
                  return (
                    <tr
                      key={s.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-4 text-xs text-slate-300 font-semibold">
                        {formatDateForDisplay(s.date)}
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-200">
                        หมอ{s.therapistName}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-950/40 text-spa-gold border border-amber-900/60">
                          {s.courseCategory}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-300 font-medium">
                        {s.courseType}
                      </td>
                      <td className="px-4 py-4 text-xs text-center text-slate-200 font-bold">
                        {s.price.toLocaleString()} ฿
                      </td>
                      <td className="px-4 py-4 text-xs text-center text-slate-400">
                        {s.commissionPercent}%
                      </td>
                      <td className="px-4 py-4 text-xs text-center text-emerald-400 font-bold">
                        +{s.commissionAmount.toLocaleString()} ฿
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500 hidden lg:table-cell">
                        <p className="truncate max-w-[120px] font-medium">
                          {s.updateBy}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {new Date(s.updateDate).toLocaleString("th-TH")}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center gap-1.5">
                          {editable ? (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(s)}
                                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-amber-400 hover:text-white hover:border-amber-400 active:scale-90 transition-all"
                                title="แก้ไข"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() => handleDeleteSale(s.id, s.date)}
                                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-red-400 hover:text-white hover:border-red-400 active:scale-90 transition-all"
                                title="ลบ"
                              >
                                <Trash2 size={13} />
                              </button>
                            </>
                          ) : (
                            <span
                              className="p-2 rounded bg-slate-900/40 border border-white/5 text-slate-600 cursor-not-allowed"
                              title="รายการถูกล็อกแก้ไขได้เฉพาะผู้จัดการ"
                            >
                              <Lock size={13} />
                            </span>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* ส่วนควบคุมตารางแบ่งหน้า (Pagination Controls) */}
        <PaginationControls
          currentPage={currentPage}
          totalPages={totalPages}
          totalItems={filteredSales.length}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* 4. Modal บันทึก/แก้ไข รายละเอียดคอร์สสปา (Animate Form popup) */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="glass-modal w-full max-w-md p-6 rounded-2xl border border-spa-gold/30 shadow-2xl relative z-10"
            >
              <div className="flex items-center justify-between mb-5 pb-2.5 border-b border-white/5">
                <h3 className="text-md font-bold text-spa-gold flex items-center gap-2">
                  <TrendingUp size={18} />
                  <span>
                    {editingSale
                      ? "แก้ไขข้อมูลการเสนอขายคอร์ส"
                      : "บันทึกรายการขายคอร์สสปาใหม่"}
                  </span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* วันที่เสนอขาย */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    วันที่ขายคอร์ส *
                  </label>
                  {currentRole === "admin" ? (
                    <div className="opacity-60">
                      <DatePicker
                        value={todayStr}
                        onChange={() => {}}
                        disabled
                      />
                    </div>
                  ) : (
                    <Controller
                      control={control}
                      name="date"
                      render={({ field }) => (
                        <DatePicker
                          value={field.value}
                          onChange={field.onChange}
                        />
                      )}
                    />
                  )}
                  {errors.date && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {errors.date.message}
                    </p>
                  )}
                </div>

                {/* หมอนวดผู้ขาย */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    หมอนวดผู้เสนอขาย *
                  </label>
                  <select
                    {...register("therapistName")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                  >
                    <option value="">— กรุณาเลือกหมอนวดผู้ขาย —</option>
                    {therapists.map((t) => (
                      <option key={t.id} value={t.name}>
                        หมอ{t.name}
                      </option>
                    ))}
                  </select>
                  {errors.therapistName && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {errors.therapistName.message}
                    </p>
                  )}
                </div>

                {/* หมวดหมู่คอร์ส + เลือก Template */}
                <div className="space-y-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      เลือกจาก Template คอร์ส (Auto-fill)
                    </label>
                    <select
                      onChange={(e) =>
                        handleCourseTemplateSelect(e.target.value)
                      }
                      defaultValue=""
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-spa-gold/30 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                    >
                      <option value="">— เลือกคอร์สจาก Master Data —</option>
                      {uniqueCourseCategories.map((cat) => (
                        <optgroup key={cat} label={cat}>
                          {courseTemplates
                            .filter((t) => t.category === cat)
                            .map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.name} (
                                {t.defaultPrice.toLocaleString("th-TH")} ฿)
                              </option>
                            ))}
                        </optgroup>
                      ))}
                    </select>
                    <p className="text-[10px] text-slate-500 mt-1">
                      เลือก Template เพื่อกรอกข้อมูลอัตโนมัติ
                      หรือกรอกเองด้านล่างได้
                    </p>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        หมวดหมู่คอร์ส *
                      </label>
                      <select
                        {...register("courseCategory")}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                      >
                        <option value="">— เลือกหมวดหมู่ —</option>
                        {uniqueCourseCategories.length === 0 ? (
                          <>
                            <option value="คอร์สสปาตัว">คอร์สสปาตัว</option>
                            <option value="คอร์สสปาหน้า">คอร์สสปาหน้า</option>
                            <option value="คอร์สนวดไทย">คอร์สนวดไทย</option>
                            <option value="คอร์สออยล์">คอร์สออยล์</option>
                          </>
                        ) : (
                          uniqueCourseCategories.map((cat) => (
                            <option key={cat} value={cat}>
                              {cat}
                            </option>
                          ))
                        )}
                      </select>
                      {errors.courseCategory && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={10} />
                          {errors.courseCategory.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                        ชื่อคอร์ส *
                      </label>
                      <input
                        type="text"
                        placeholder="เช่น สปาตัวน้ำผึ้ง 10 ครั้ง"
                        {...register("courseType")}
                        className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                      />
                      {errors.courseType && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={10} />
                          {errors.courseType.message}
                        </p>
                      )}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {/* ราคาจำหน่ายจริง */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ราคาจำหน่ายจริง (฿) *
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      onKeyDown={blockNonNumericKeyDown}
                      {...register("price", { setValueAs: requiredNumberInput })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    {errors.price && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {errors.price.message}
                      </p>
                    )}
                  </div>

                  {/* เปอร์เซ็นต์ค่าคอม */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ค่าคอมมิชชั่น (%) *
                    </label>
                    <input
                      type="number"
                      step="0.1"
                      placeholder="เช่น 10"
                      onKeyDown={blockNonNumericKeyDown}
                      {...register("commissionPercent", {
                        setValueAs: requiredNumberInput,
                      })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    {errors.commissionPercent && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {errors.commissionPercent.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* แสดงยอดเงินค่าคอม */}
                <LiveCommissionAmount control={control} />

                {/* ปุ่มควบคุม */}
                <div className="flex justify-end gap-3.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-slate-300 text-xs font-semibold active:scale-95 transition-transform"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-transform shadow-lg shadow-spa-gold/10"
                  >
                    <Check size={14} />
                    <span>บันทึกการขายคอร์ส</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
