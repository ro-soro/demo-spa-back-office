// src/app/bookings/page.tsx
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. นำ React Hook Form และ Zod เข้ามาช่วยตรวจสอบข้อมูลในฟอร์ม (Form Validation)
//    เพื่อให้มั่นใจว่าข้อมูลทางการเงินและรอบบริการจะไม่มีค่าติดลบหรือฟิลด์ว่างที่เป็นช่องโหว่ก่อนส่งบันทึก
// 2. ใช้ TanStack Table หรือกลไกควบคุมตารางของ React ในการจัดการกรองข้อมูลแบบเรียลไทม์
//    ทำให้การค้นหาชื่อลูกค้าหรือประเภทงานนวดตอบสนองเร็วกว่าเดิมโดยไม่รีเฟรชหน้าเว็บ
// 3. ปรับฟอร์มจองแบบสไลด์ลอย (Glassmorphic Modal) โดยใช้ Framer Motion AnimatePresence
//    ช่วยควบคุมการเฟดเข้าและขยายออกขณะเปิด/ปิด ช่วยเพิ่มสัมผัสหรูหราเข้ากับธีมหลักสปา

"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Booking, BookingService } from "@/data/initialData";
import { motion, AnimatePresence } from "framer-motion";
import { useForm, useWatch, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { DatePicker } from "@/components/DatePicker";
import { PaginationControls } from "@/components/PaginationControls";
import { getTodayDateString } from "@/utils/dateHelpers";
import { formatDateForDisplay } from "@/utils/thaiDate";
import { blockNonNumericKeyDown, requiredNumberInput, optionalNumberInputToZero } from "@/utils/numericInput";
import {
  Search,
  Plus,
  Edit2,
  Trash2,
  Lock,
  X,
  Check,
  Clock,
  Tags,
  AlertCircle,
} from "lucide-react";

// ฟังก์ชันผู้ช่วยสำหรับการจัดการและคำนวณเวลา (Time Slot Helpers)
export const parseTimeSlot = (timeSlot: string): { start: string; end: string } => {
  if (!timeSlot) return { start: "", end: "" };
  const parts = timeSlot.split(/[-–—]/).map((p) => p.trim());
  if (parts.length < 2) return { start: "", end: "" };

  const formatTime = (t: string) => {
    let cleaned = t.replace(".", ":");
    if (!cleaned.includes(":") && cleaned.length === 4) {
      cleaned = cleaned.slice(0, 2) + ":" + cleaned.slice(2);
    }
    const [h, m] = cleaned.split(":");
    if (!h || !m) return "";
    const hh = h.padStart(2, "0");
    const mm = m.padStart(2, "0");
    return `${hh}:${mm}`;
  };

  return {
    start: formatTime(parts[0]),
    end: formatTime(parts[1]),
  };
};

export const formatTimeSlot = (start: string, end: string): string => {
  if (!start || !end) return "";
  const toDot = (t: string) => t.replace(":", ".");
  return `${toDot(start)}-${toDot(end)}`;
};

export const calculateDuration = (start: string, end: string): number => {
  if (!start || !end) return 0;
  const [startH, startM] = start.split(":").map(Number);
  const [endH, endM] = end.split(":").map(Number);
  if (isNaN(startH) || isNaN(startM) || isNaN(endH) || isNaN(endM)) return 0;

  const startTotalMinutes = startH * 60 + startM;
  let endTotalMinutes = endH * 60 + endM;

  // รองรับช่วงเวลารอยต่อข้ามวัน (Midnight overlap) เช่น 23.00 - 01.00
  if (endTotalMinutes < startTotalMinutes) {
    endTotalMinutes += 24 * 60;
  }

  const diffMinutes = endTotalMinutes - startTotalMinutes;
  const rawHours = diffMinutes / 60;
  return Math.round(rawHours * 100) / 100;
};

export const addHoursToTime = (start: string, hours: number): string => {
  if (!start || isNaN(hours)) return "";
  const [startH, startM] = start.split(":").map(Number);
  if (isNaN(startH) || isNaN(startM)) return "";

  const totalMinutes = startH * 60 + startM + Math.round(hours * 60);
  const endH = Math.floor(totalMinutes / 60) % 24;
  const endM = totalMinutes % 60;

  const hh = String(endH).padStart(2, "0");
  const mm = String(endM).padStart(2, "0");
  return `${hh}:${mm}`;
};


// Zod Schema สำหรับตรวจสอบความถูกต้องฟอร์มจองงานนวด
const bookingSchema = z.object({
  date: z.string().min(1, "กรุณาระบุวันที่"),
  round: z
    .number({ message: "กรุณากรอกรอบบริการ" })
    .min(1, "รอบบริการต้องไม่ต่ำกว่า 1")
    .max(20, "รอบบริการสูงสุดคือ 20"),
  therapistName: z.string().min(1, "กรุณาเลือกหมอนวด"),
  timeStart: z.string().min(1, "กรุณาระบุเวลาเข้า"),
  timeEnd: z.string().min(1, "กรุณาระบุเวลาออก"),
  customerName: z.string().optional(),
  remark: z.string().optional(),
  // ฟิลด์ช่องทางจ่ายเงินทั้ง 4 เป็น "ไม่บังคับ" ตาม label ในฟอร์มจริง (.optional() ให้ตรงกัน)
  // เดิม schema บังคับเป็น required number แต่ input ใช้ valueAsNumber ทำให้ถ้าผู้ใช้ลบช่องให้ว่าง
  // (ไม่ได้พิมพ์ 0 ทับ) ค่าจะกลายเป็น NaN แล้วชนกฎ required แบบเงียบๆ — ฟอร์มไม่ยอมบันทึกโดยไม่มี error
  // ให้เห็นเลย (ช่องพวกนี้ไม่เคยมี UI แสดง error message มาก่อน) ผู้ใช้จึงเห็นแค่ "กดบันทึกแล้วไม่มีอะไรเกิดขึ้น"
  cash: z.number().nonnegative("เงินสดต้องไม่เป็นค่าติดลบ").optional(),
  transfer: z.number().nonnegative("เงินโอนต้องไม่เป็นค่าติดลบ").optional(),
  card: z.number().nonnegative("บัตรเครดิตต้องไม่เป็นค่าติดลบ").optional(),
  tip: z.number().nonnegative("เงินทิปต้องไม่เป็นค่าติดลบ").optional(),
});

type BookingFormValues = z.infer<typeof bookingSchema>;

// ป้ายหมวดหมู่สำรองสำหรับบริการที่ยังไม่ได้ระบุหมวดหมู่ (ข้อมูลเก่าบางรายการมี category ว่าง)
const FALLBACK_SERVICE_CATEGORY_LABEL = "บริการทั่วไป";

export default function BookingsPage() {
  const {
    bookings,
    therapists,
    services,
    serviceCategories,
    currentRole,
    addOrUpdateBooking,
    removeBooking,
  } = useApp();

  // ดึงคลาสสีสำหรับแสดงป้ายหมวดหมู่
  const getCategoryColorClass = (catName: string): string => {
    const found = serviceCategories.find(c => c.name === catName);
    if (!found) return 'bg-slate-800/60 text-slate-300 border-slate-700/60';
    switch (found.colorClass) {
      case 'teal':   return 'bg-teal-900/40 text-teal-300 border-teal-800/60';
      case 'rose':   return 'bg-rose-900/40 text-rose-300 border-rose-800/60';
      case 'violet': return 'bg-violet-900/40 text-violet-300 border-violet-800/60';
      case 'amber':  return 'bg-amber-950/50 text-amber-400 border-amber-900/60';
      case 'sky':    return 'bg-sky-900/40 text-sky-300 border-sky-800/60';
      case 'gold':   return 'bg-amber-900/40 text-amber-300 border-amber-800/60';
      default:       return 'bg-slate-800/60 text-slate-300 border-slate-700/60';
    }
  };

  // รายชื่อหมวดหมู่บริการที่ไม่ซ้ำ ใช้จัดกลุ่ม Dropdown เลือกรายการนวดสปา (แทนการแปะ [หมวดหมู่] หน้าชื่อ
  // ที่ดูขัดตาเมื่อหมวดหมู่ว่าง — จัดกลุ่มด้วย optgroup แบบเดียวกับ Dropdown เลือก Template คอร์สแทน)
  const uniqueServiceCategoryLabels = Array.from(
    new Set(services.map((s) => s.category || FALLBACK_SERVICE_CATEGORY_LABEL)),
  );

  // สถานะการฟิลเตอร์และค้นหา — ค่าเริ่มต้นของวันที่คือ "วันนี้" ตามที่ Admin ใช้งานบ่อยที่สุด
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFilter, setDateFilter] = useState(getTodayDateString());
  const [currentPage, setCurrentPage] = useState(1);
  const ITEMS_PER_PAGE = 10;

  // สถานะเปิด/ปิด Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingBooking, setEditingBooking] = useState<Booking | null>(null);
  // สถานะกำลังบันทึกฟอร์ม (ป้องกันกดซ้ำ + ให้ผู้ใช้เห็นว่ากำลังรอผลบันทึกจริง ไม่ใช่ปิด Modal ทันทีแบบเดิม)
  const [isSaving, setIsSaving] = useState(false);

  // สถานะบริการที่เลือกอยู่ในฟอร์มปัจจุบัน
  const [formServices, setFormServices] = useState<BookingService[]>([]);
  const [activeServiceId, setActiveServiceId] = useState("");
  const [activeServiceQty, setActiveServiceQty] = useState(1.0);

  // วันที่ปัจจุบันของระบบ YYYY-MM-DD
  const todayStr = getTodayDateString();

  // ตรวจสอบสิทธิ์การแก้ไขข้ามวัน
  const canEditBooking = (bookingDate: string): boolean => {
    if (currentRole === "admin") {
      return bookingDate === todayStr;
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
  } = useForm<BookingFormValues>({
    resolver: zodResolver(bookingSchema),
    defaultValues: {
      date: todayStr,
      therapistName: "",
      timeStart: "",
      timeEnd: "",
      customerName: "",
      remark: "",
      cash: 0,
      transfer: 0,
      card: 0,
      tip: 0,
    },
  });

  // ใช้ useWatch แทน watch() ตรงๆ — เหตุผล (Why): watch() ของ react-hook-form คืนฟังก์ชันที่ React Compiler
  // ไม่สามารถยืนยันได้ว่าปลอดภัยต่อการ memoize (เสี่ยง stale value ถ้าถูกเรียกจากที่ที่ compiler มองไม่เห็น dependency
  // ชัดเจน) useWatch เป็น hook ที่ subscribe แบบ reactive ตรงไปตรงมา ทำให้ compiler วิเคราะห์ dependency ได้ถูกต้อง
  // และพฤติกรรมจริงเหมือนเดิมทุกประการ (ค่าอัปเดตทุกครั้งที่ผู้ใช้พิมพ์ ทำให้ re-render เหมือน watch() เดิม)
  const watchedTimeStart = useWatch({ control, name: "timeStart" });
  const watchedTimeEnd = useWatch({ control, name: "timeEnd" });
  const watchedCash = useWatch({ control, name: "cash" });
  const watchedTransfer = useWatch({ control, name: "transfer" });
  const watchedCard = useWatch({ control, name: "card" });
  const watchedTip = useWatch({ control, name: "tip" });

  // ผลรวมชั่วโมงจริงของบริการทั้งหมดที่ถูกเพิ่มลงตารางแล้ว (Single source of truth ของระยะเวลารวม)
  const getExistingTotalHours = (): number =>
    formServices.reduce((sum, s) => sum + s.quantity, 0);

  // ซิงค์ "ช่วงเวลา เข้า-ออก" ให้ตรงกับผลรวมชั่วโมงจริงของบริการที่เพิ่มแล้วทั้งหมดเสมอ
  // แก้บั๊กเดิม: เดิมคำนวณเวลาออกจากแค่รายการล่าสุดรายการเดียว ทำให้ถูกต้องเฉพาะตอนมีบริการรายการแรกรายการเดียว
  // พอเพิ่มรายการที่ 2 ขึ้นไป เวลาออกจะไม่ขยับตามผลรวมจริง ต้องเรียกฟังก์ชันนี้ทุกครั้งหลังเพิ่ม/ลบรายการ
  const syncTimeEndWithTotalHours = (updatedServices: BookingService[]) => {
    // ใช้ค่า watchedTimeStart ที่ subscribe ผ่าน useWatch ไว้แล้วด้านบน แทนการเรียก watch("timeStart") ซ้ำ
    // ค่าจะตรงกับปัจจุบันเสมอ เพราะฟังก์ชันนี้ถูกสร้างใหม่ทุก render และถูกเรียกจาก event handler
    // ที่ทำงานหลังผู้ใช้กรอกข้อมูลแล้วเท่านั้น (re-render ของ RHF เกิดขึ้นก่อนผู้ใช้กดปุ่มเสมอ)
    const start = watchedTimeStart;
    if (!start) return;
    const totalHours = updatedServices.reduce((sum, s) => sum + s.quantity, 0);
    const computedEnd = addHoursToTime(start, totalHours);
    setValue("timeEnd", computedEnd, { shouldValidate: true });
  };

  // คอยตรวจจับเมื่อเลือกเวลาเข้า-ออก แล้วคำนวณชั่วโมงอัปเดตช่อง ชม. อัตโนมัติ (Time -> Duration)
  // ใช้เดาค่าเริ่มต้นนี้เฉพาะตอนยังไม่มีรายการบริการใดถูกเพิ่มเลย (formServices.length === 0) เท่านั้น
  // เพราะถ้ามีรายการอยู่แล้ว ช่วงเวลาเข้า-ออกจะกลายเป็นผลรวมสะสมของทุกรายการ ไม่ใช่ระยะเวลาของรายการเดียว
  // การเดาค่าทับแบบเดิมจะไปเขียนทับช่อง "ชม. / จำนวน" ที่เพิ่งรีเซ็ตไว้สำหรับรายการถัดไปให้ผิดเพี้ยน
  //
  // หมายเหตุ (Why เปลี่ยนจาก useEffect เป็นการปรับ state ระหว่าง render โดยตรง):
  // เดิมใช้ useEffect + setState ซึ่ง React/React Compiler แนะนำให้เลี่ยง (rule: react-hooks/set-state-in-effect)
  // เพราะทำให้เกิด render ซ้อนสองรอบโดยไม่จำเป็น (คำนวณ state ที่ "ได้มาจากค่าอื่น" ควรทำระหว่าง render เลย)
  // ใช้ pattern "เก็บค่าก่อนหน้าไว้เทียบระหว่าง render" ตามคำแนะนำอย่างเป็นทางการของ React
  // (https://react.dev/reference/react/useState#storing-information-from-previous-renders)
  // ต้องใช้ useState ไม่ใช่ useRef เพราะ React Compiler ห้ามอ่าน/เขียนค่า ref ระหว่าง render โดยตรง (rule: react-hooks/refs)
  // การเรียก setState ระหว่าง render แบบมีเงื่อนไขคุมนี้ React รองรับอย่างเป็นทางการ (จะ re-render ทันทีก่อน commit จริง
  // ไม่ใช่ปัญหาเดียวกับการเรียก setState ใน useEffect)
  const [previousWatchedTimeRange, setPreviousWatchedTimeRange] = useState<{
    start: string;
    end: string;
    formServicesCount: number;
  }>({ start: watchedTimeStart, end: watchedTimeEnd, formServicesCount: formServices.length });

  if (
    previousWatchedTimeRange.start !== watchedTimeStart ||
    previousWatchedTimeRange.end !== watchedTimeEnd ||
    previousWatchedTimeRange.formServicesCount !== formServices.length
  ) {
    setPreviousWatchedTimeRange({
      start: watchedTimeStart,
      end: watchedTimeEnd,
      formServicesCount: formServices.length,
    });
    if (formServices.length === 0 && watchedTimeStart && watchedTimeEnd) {
      const duration = calculateDuration(watchedTimeStart, watchedTimeEnd);
      if (duration > 0 && duration !== activeServiceQty) {
        setActiveServiceQty(duration);
      }
    }
  }

  // ฟังก์ชันรองรับเมื่อผู้ใช้เลือกบริการสปาจาก Dropdown (Auto-fill)
  const handleServiceSelect = (serviceId: string) => {
    setActiveServiceId(serviceId);
    const selectedService = services.find((s) => s.id === serviceId);
    if (selectedService) {
      const standardDuration = selectedService.duration || 1.0;
      setActiveServiceQty(standardDuration);

      // พรีวิวเวลาออกจากผลรวมชั่วโมงที่เพิ่มไปแล้ว + รายการใหม่ที่กำลังจะเพิ่ม
      // ให้ตรงกับสิ่งที่จะเกิดขึ้นจริงหลังกด "เพิ่มงาน" (ไม่ใช่แค่ระยะเวลาของรายการใหม่รายการเดียว)
      const start = watchedTimeStart;
      if (start) {
        const projectedTotal = getExistingTotalHours() + standardDuration;
        const computedEnd = addHoursToTime(start, projectedTotal);
        setValue("timeEnd", computedEnd, { shouldValidate: true });
      }
    }
  };

  // ฟังก์ชันรองรับเมื่อแอดมินหรือผู้กรอกแก้ไขจำนวนชั่วโมงเองโดยตรง (Duration -> Time)
  const handleQtyChange = (val: number) => {
    setActiveServiceQty(val);
    const start = watchedTimeStart;
    if (start && val > 0) {
      const projectedTotal = getExistingTotalHours() + val;
      const computedEnd = addHoursToTime(start, projectedTotal);
      if (computedEnd !== watchedTimeEnd) {
        setValue("timeEnd", computedEnd, { shouldValidate: true });
      }
    }
  };

  // กรองข้อมูลรายการจอง
  const filteredBookings = bookings
    .filter((b) => {
      const matchSearch =
        b.therapistName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.customerName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        b.services.some((s) =>
          s.serviceName.toLowerCase().includes(searchTerm.toLowerCase()),
        );

      const matchDate = dateFilter === "" || b.date === dateFilter;
      return matchSearch && matchDate;
    })
    .sort((a, b) => b.date.localeCompare(a.date) || b.round - a.round);

  const totalPages = Math.ceil(filteredBookings.length / ITEMS_PER_PAGE);
  const paginatedBookings = filteredBookings.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  // เปิดแบบฟอร์มเพื่อบันทึกงานใหม่
  const handleOpenAddModal = () => {
    setEditingBooking(null);
    setFormServices([]);
    setIsModalOpen(true);

    // ตั้งค่าเริ่มต้นใหม่ — ไม่เดาค่าล่วงหน้า ให้ผู้ใช้กรอกเองทั้งหมด (ใช้ placeholder เป็นตัวช่วยแทน)
    reset({
      date: todayStr,
      therapistName: "",
      timeStart: "",
      timeEnd: "",
      customerName: "",
      remark: "",
      cash: 0,
      transfer: 0,
      card: 0,
      tip: 0,
    });
  };

  // เปิดแบบฟอร์มเพื่อแก้ไข
  const handleOpenEditModal = (booking: Booking) => {
    if (!canEditBooking(booking.date)) return;

    setEditingBooking(booking);
    setFormServices([...booking.services]);
    setIsModalOpen(true);

    const times = parseTimeSlot(booking.timeSlot);

    reset({
      date: booking.date,
      round: booking.round,
      therapistName: booking.therapistName,
      timeStart: times.start,
      timeEnd: times.end,
      customerName: booking.customerName,
      remark: booking.remark,
      cash: booking.payment.cash,
      transfer: booking.payment.transfer,
      card: booking.payment.card,
      tip: booking.payment.tip,
    });
  };

  // สั่งลบ
  const handleDeleteBooking = (id: string, date: string) => {
    if (!canEditBooking(date)) return;
    if (confirm("คุณต้องการลบรายการจองนวดชิ้นนี้ใช่หรือไม่?")) {
      removeBooking(id);
    }
  };

  // เพิ่มบริการใหม่ลงในฟอร์ม (คิดเฉลี่ยสัดส่วนราคาตามจริง - Pro-rata)
  const handleAddServiceToForm = () => {
    if (!activeServiceId) return;
    const targetService = services.find((s) => s.id === activeServiceId);
    if (!targetService) return;

    // คำนวณราคาและค่ามือต่อชั่วโมง เพื่อให้คูณ quantity แล้วเท่ากับราคาตามจริงของระยะเวลานั้น
    const hourlyPrice = targetService.price / (targetService.duration || 1.0);
    const hourlyCommission = targetService.commission / (targetService.duration || 1.0);

    const existingIndex = formServices.findIndex(
      (s) => s.serviceId === activeServiceId,
    );
    let updatedServices: BookingService[];
    if (existingIndex >= 0) {
      updatedServices = [...formServices];
      updatedServices[existingIndex] = {
        ...updatedServices[existingIndex],
        quantity: updatedServices[existingIndex].quantity + activeServiceQty,
        price: hourlyPrice,
        commission: hourlyCommission,
      };
    } else {
      updatedServices = [
        ...formServices,
        {
          serviceId: targetService.id,
          serviceName: targetService.name,
          price: hourlyPrice,
          commission: hourlyCommission,
          quantity: activeServiceQty,
        },
      ];
    }

    setFormServices(updatedServices);
    // ซิงค์เวลาออกให้ตรงกับผลรวมชั่วโมงจริงของทุกรายการหลังเพิ่มแล้วเสมอ (แก้บั๊กเวลาไม่ขยับตอนมีรายการที่ 2 ขึ้นไป)
    syncTimeEndWithTotalHours(updatedServices);

    setActiveServiceId("");
    setActiveServiceQty(1.0);
  };

  // ลบบริการออกจากตัวเลือกฟอร์ม
  const handleRemoveServiceFromForm = (serviceId: string) => {
    const updatedServices = formServices.filter((s) => s.serviceId !== serviceId);
    setFormServices(updatedServices);
    // ซิงค์เวลาออกให้ตรงกับผลรวมชั่วโมงจริงที่เหลือหลังลบรายการออกด้วยเช่นกัน
    syncTimeEndWithTotalHours(updatedServices);
  };

  // ยืนยันกดส่งฟอร์ม
  // หมายเหตุ (Why): เดิมเรียก addOrUpdateBooking แบบ fire-and-forget (ไม่ await) แล้วปิด Modal ทันที
  // ถ้าการเขียนขึ้น Firestore ล้มเหลว (เช่น เครือข่ายสะดุด, Security Rule ปฏิเสธ) ผู้ใช้จะไม่เห็น error ใดๆ เลย
  // เห็นแค่ Modal ปิดเหมือนบันทึกสำเร็จ ทั้งที่ข้อมูลจริงไม่ถูกบันทึก ("กรอกได้ปกติ แต่บันทึกแล้วไม่มีอะไรเกิดขึ้น")
  // แก้โดย await + try/catch แล้วปิด Modal เฉพาะตอนบันทึกสำเร็จจริงเท่านั้น พร้อมแจ้งเตือนเมื่อล้มเหลว
  const onSubmit = async (data: BookingFormValues) => {
    if (formServices.length === 0) {
      alert("กรุณาเลือกบริการงานนวดอย่างน้อย 1 รายการ");
      return;
    }

    const bookingData: Booking = {
      id: editingBooking?.id || `bkg_${new Date().getTime()}`,
      date: currentRole === "admin" ? todayStr : data.date,
      round: Number(data.round),
      therapistName: data.therapistName,
      timeSlot: formatTimeSlot(data.timeStart, data.timeEnd),
      services: formServices,
      payment: {
        cash: data.cash ?? 0,
        transfer: data.transfer ?? 0,
        card: data.card ?? 0,
        tip: data.tip ?? 0,
      },
      customerName: data.customerName || "",
      remark: data.remark || "",
      updateDate: new Date().toISOString(),
      updateBy: "",
    };

    setIsSaving(true);
    try {
      await addOrUpdateBooking(bookingData);
      setIsModalOpen(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      alert(`บันทึกข้อมูลไม่สำเร็จ กรุณาลองใหม่อีกครั้ง\n(${message})`);
    } finally {
      setIsSaving(false);
    }
  };

  // คำนวณราคารวมบริการในป็อปอัปเรียลไทม์
  const formTotalPrice = formServices.reduce(
    (sum, s) => sum + s.price * s.quantity,
    0,
  );

  // ยอดรับเงินรวมจริง = ผลรวมของทุกช่องทางที่กรอกจริง (สด+โอน+บัตร+ทิป)
  // แก้บั๊กเดิม: เดิม hardcode ให้เท่ากับราคารวมบริการเฉยๆ ไม่เคยรวมทิปหรือยอดที่กรอกจริงเลย
  // (ค่า watchedCash/Transfer/Card/Tip subscribe ผ่าน useWatch ไว้แล้วด้านบนคู่กับ watchedTimeStart/End)
  const formTotalReceived =
    (Number(watchedCash) || 0) +
    (Number(watchedTransfer) || 0) +
    (Number(watchedCard) || 0) +
    (Number(watchedTip) || 0);

  // ค่ายอมรับความคลาดเคลื่อนจากปัดเศษทศนิยมของ floating point (ไม่ใช่ธุรกิจ แค่กันเตือนหลอกตอนต่างกัน 0.000...1 บาท)
  const PAYMENT_MISMATCH_TOLERANCE = 0.01;
  // ส่วนต่างระหว่างยอดรับเงินรวมกับราคารวมบริการ — ใช้แค่ "แจ้งเตือนแบบไม่บล็อก" (soft warning) เท่านั้น
  // เหตุผล (Why): ร้านอาจมีส่วนลด/ต่อรองราคาหน้างานจริงที่ไม่ได้บันทึกแยกฟิลด์ในระบบ จึงห้ามบล็อกการบันทึกเด็ดขาด
  // ตามคำสั่ง Main Chat (ดู PROJECT_STATUS.md ส่วน Testing Edge case 4) — แค่เตือนให้ผู้ใช้เห็นและยืนยันเองว่าตั้งใจ
  const paymentAmountDifference = formTotalReceived - formTotalPrice;
  const hasPaymentAmountMismatch = Math.abs(paymentAmountDifference) > PAYMENT_MISMATCH_TOLERANCE;
  const paymentMismatchMessage = hasPaymentAmountMismatch
    ? paymentAmountDifference < 0
      ? `ยอดรับเงินไม่ตรงกับราคาบริการ (ขาดไป ${Math.abs(paymentAmountDifference).toLocaleString()} บาท)`
      : `ยอดรับเงินไม่ตรงกับราคาบริการ (เกินราคาบริการ ${paymentAmountDifference.toLocaleString()} บาท)`
    : "";

  return (
    <div className="flex flex-col gap-6">
      {/* 1. ส่วนกรองข้อมูลค้นหา (Filters Header) */}
      <div className="glass-panel p-5 rounded-2xl border border-white/5 shadow-lg flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex flex-col sm:flex-row w-full md:w-auto gap-3 flex-1">
          {/* ช่องกรอกค้นหา */}
          <div className="relative flex-1">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500"
              size={17}
            />
            <input
              type="text"
              placeholder="ค้นหาชื่อหมอ, ลูกค้า หรือรายการนวด..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full pl-9 pr-4 py-2 bg-slate-950/60 border border-white/10 rounded-xl text-xs text-slate-200 placeholder-slate-500 focus:border-spa-gold outline-none transition-colors"
            />
          </div>
          {/* ปฏิทินเลือกวันที่ */}
          <div className="relative w-full sm:w-48 flex items-center gap-1.5">
            <div className="flex-1">
              <DatePicker
                value={dateFilter}
                onChange={(val) => {
                  setDateFilter(val);
                  setCurrentPage(1);
                }}
                align="right"
              />
            </div>
            {dateFilter && (
              <button
                onClick={() => {
                  setDateFilter("");
                  setCurrentPage(1);
                }}
                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-slate-500 hover:text-white"
              >
                <X size={14} />
              </button>
            )}
          </div>
        </div>

        {/* ปุ่มสร้างใหม่ */}
        <button
          onClick={handleOpenAddModal}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-teal to-teal-600 text-white font-semibold text-xs flex items-center gap-2 active:scale-95 transition-transform w-full md:w-auto justify-center shadow-lg shadow-spa-teal/10"
        >
          <Plus size={16} />
          <span>บันทึกงานนวดใหม่</span>
        </button>
      </div>

      {/* 2. ตารางหลักรายการ (Bookings Table) */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  วันที่จอง
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  รอบ
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  เวลา
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  หมอนวด
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  รายการนวด / หัตถการ
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  สรุปการจ่ายเงิน
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ชื่อลูกค้า / หมายเหตุ
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
              {paginatedBookings.length === 0 ? (
                <tr>
                  <td
                    colSpan={9}
                    className="text-center text-xs text-slate-500 py-12"
                  >
                    ไม่พบข้อมูลงานนวดในระบบช่วงเวลาที่เลือก
                  </td>
                </tr>
              ) : (
                paginatedBookings.map((b) => {
                  const editable = canEditBooking(b.date);
                  const totalBookingPrice = b.services.reduce(
                    (sum, s) => sum + s.price * s.quantity,
                    0,
                  );

                  return (
                    <tr
                      key={b.id}
                      className="hover:bg-white/5 transition-colors"
                    >
                      <td className="px-4 py-4 text-xs text-slate-300 font-semibold">
                        {formatDateForDisplay(b.date)}
                      </td>
                      <td className="px-4 py-4 text-center text-xs text-slate-400 font-medium">
                        R{b.round}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded bg-slate-950/60 border border-white/5 text-spa-teal font-semibold">
                          <Clock size={11} />
                          {b.timeSlot || "ไม่ระบุ"}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-sm font-semibold text-slate-200">
                        หมอ{b.therapistName}
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <div className="flex flex-col gap-1.5">
                          {b.services.map((s, idx) => {
                            const serviceObj = services.find(
                              (srv) => srv.id === s.serviceId,
                            );
                            const category = serviceObj?.category || FALLBACK_SERVICE_CATEGORY_LABEL;
                            return (
                              <div
                                key={idx}
                                className="flex items-center gap-1 text-[11px]"
                              >
                                <span className={`px-1.5 py-0.5 rounded text-[8.5px] font-semibold border uppercase ${getCategoryColorClass(category)}`}>
                                  {category}
                                </span>
                                <span className="text-slate-300">
                                  {s.serviceName}
                                </span>
                                <span className="text-spa-gold font-bold">
                                  x{s.quantity}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        <div className="flex flex-col gap-0.5 text-slate-300">
                          <span className="font-semibold text-slate-200">
                            ค่าบริการ: {totalBookingPrice.toLocaleString()} ฿
                          </span>
                          <span className="text-[10px] text-slate-500">
                            {b.payment.cash > 0 && `สด: ${b.payment.cash} `}
                            {b.payment.transfer > 0 &&
                              `โอน: ${b.payment.transfer} `}
                            {b.payment.card > 0 && `บัตร: ${b.payment.card}`}
                          </span>
                          {b.payment.tip > 0 && (
                            <span className="text-[10px] text-emerald-400 font-semibold">
                              ทิปหมอ: {b.payment.tip} ฿
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-xs">
                        {b.customerName && (
                          <p className="text-slate-300 font-medium">
                            <span className="text-slate-500 text-[10px]">
                              ลูกค้า:
                            </span>{" "}
                            {b.customerName}
                          </p>
                        )}
                        {b.remark && (
                          <p className="text-slate-500 italic mt-0.5">
                            &quot;{b.remark}&quot;
                          </p>
                        )}
                        {!b.customerName && !b.remark && (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>
                      <td className="px-4 py-4 text-xs text-slate-500 hidden lg:table-cell">
                        <p className="truncate max-w-[120px] font-medium">
                          {b.updateBy}
                        </p>
                        <p className="text-[10px] text-slate-600 mt-0.5">
                          {new Date(b.updateDate).toLocaleString("th-TH")}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex justify-center gap-1.5">
                          {editable ? (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(b)}
                                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-amber-400 hover:text-white hover:border-amber-400 active:scale-90 transition-all"
                                title="แก้ไขรายการ"
                              >
                                <Edit2 size={13} />
                              </button>
                              <button
                                onClick={() =>
                                  handleDeleteBooking(b.id, b.date)
                                }
                                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-red-400 hover:text-white hover:border-red-400 active:scale-90 transition-all"
                                title="ลบรายการ"
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
          totalItems={filteredBookings.length}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* 3. Modal บันทึกคอร์สการจองนวดประจำวัน (Framer Motion Modal Popup) */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            {/* ฉากหลังกระจกดำเบลอ */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />

            {/* บล็อกกระจกลอยฟอร์ม */}
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 20 }}
              transition={{ type: "spring", damping: 25, stiffness: 220 }}
              className="glass-modal w-full max-w-2xl p-6 rounded-2xl border border-spa-gold/30 shadow-2xl relative z-10 overflow-y-auto max-h-[92vh]"
            >
              {/* ส่วนหัวป็อปอัป */}
              <div className="flex items-center justify-between mb-5 pb-2.5 border-b border-white/5">
                <h3 className="text-md font-bold text-spa-gold flex items-center gap-2">
                  <Tags size={18} />
                  <span>
                    {editingBooking
                      ? "แก้ไขบันทึกงานนวดประจำวัน"
                      : "บันทึกงานนวดสปาประจำวันใหม่"}
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
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {/* วันที่บันทึก */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      วันที่ทำงาน *
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

                  {/* เลือกหมอนวด */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      รายชื่อหมอนวด *
                    </label>
                    <select
                      {...register("therapistName")}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                    >
                      <option value="">— กรุณาเลือกหมอนวด —</option>
                      {therapists.map((t) => (
                        <option key={t.id} value={t.name}>
                          หมอ{t.name} (
                          {t.type === "full-time" ? "ประจำ" : "พาร์ทไทม์"})
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

                  {/* รอบบริการ */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      รอบบริการ (Round) *
                    </label>
                    <input
                      type="number"
                      placeholder="เช่น 1"
                      onKeyDown={blockNonNumericKeyDown}
                      {...register("round", { setValueAs: requiredNumberInput })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    {errors.round && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {errors.round.message}
                      </p>
                    )}
                  </div>

                  {/* เวลาบริการ */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ช่วงเวลา เข้า - ออก *
                    </label>
                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <input
                          type="time"
                          {...register("timeStart")}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs cursor-pointer"
                        />
                      </div>
                      <span className="text-slate-500 text-xs">ถึง</span>
                      <div className="flex-1">
                        <input
                          type="time"
                          {...register("timeEnd")}
                          className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs cursor-pointer"
                        />
                      </div>
                    </div>
                    {(errors.timeStart || errors.timeEnd) && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {errors.timeStart?.message || errors.timeEnd?.message}
                      </p>
                    )}
                  </div>

                  {/* ชื่อลูกค้า */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ชื่อลูกค้า (ไม่บังคับ)
                    </label>
                    <input
                      type="text"
                      placeholder="กรอกชื่อลูกค้า"
                      {...register("customerName")}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                  </div>

                  {/* หมายเหตุ */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      หมายเหตุการจอง (ไม่บังคับ)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น คองานบ่าย, รีเควสพิเศษ"
                      {...register("remark")}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                  </div>
                </div>

                {/* กล่องจัดคอร์สหัตถการนวด (Spa Services Selector) */}
                <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-3.5">
                  <span className="text-xs font-bold text-spa-teal block">
                    รายการหัตถการบริการนวด
                  </span>

                  <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="flex-1 w-full">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        เลือกรายการนวดสปา
                      </label>
                      <select
                        value={activeServiceId}
                        onChange={(e) => handleServiceSelect(e.target.value)}
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                      >
                        <option value="">— กรุณาเลือกหัตถการนวด —</option>
                        {uniqueServiceCategoryLabels.map((categoryLabel) => (
                          <optgroup key={categoryLabel} label={categoryLabel}>
                            {services
                              .filter((s) => (s.category || FALLBACK_SERVICE_CATEGORY_LABEL) === categoryLabel)
                              .map((s) => (
                                <option key={s.id} value={s.id}>
                                  {s.name} - {s.price} ฿ / {s.duration} ชม. (ค่ามือ {s.commission} ฿)
                                </option>
                              ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>

                    <div className="w-full sm:w-24">
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        ชม. / จำนวน
                      </label>
                      <input
                        type="number"
                        step="0.5"
                        min="0.5"
                        placeholder="1"
                        onKeyDown={blockNonNumericKeyDown}
                        value={activeServiceQty}
                        onChange={(e) =>
                          handleQtyChange(Number(e.target.value))
                        }
                        className="w-full px-3 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                      />
                    </div>

                    <button
                      type="button"
                      onClick={handleAddServiceToForm}
                      className="px-4 py-2 rounded-lg bg-slate-900 border border-white/10 hover:border-spa-teal hover:text-spa-teal text-slate-300 text-xs font-semibold h-[38px] active:scale-95 transition-transform"
                    >
                      เพิ่มงาน
                    </button>
                  </div>

                  {/* ตารางแสดงรายการบริการที่คัดเลือก */}
                  <div className="border border-white/5 rounded-lg overflow-hidden bg-slate-950/20">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="bg-slate-950/40 border-b border-white/5 text-slate-400">
                          <th className="px-3 py-2.5 text-left">บริการ</th>
                          <th className="px-3 py-2.5 text-center">ราคา</th>
                          <th className="px-3 py-2.5 text-center">ค่ามือหมอ</th>
                          <th className="px-3 py-2.5 text-center">จำนวนชม.</th>
                          <th
                            className="px-3 py-2.5 text-center"
                            style={{ width: "50px" }}
                          >
                            ลบ
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-slate-300">
                        {formServices.length === 0 ? (
                          <tr>
                            <td
                              colSpan={5}
                              className="text-center text-[11px] text-slate-500 py-6"
                            >
                              ยังไม่ได้เลือกรายการบริการ
                              (กรุณากดเลือกจากแถบด้านบน)
                            </td>
                          </tr>
                        ) : (
                          formServices.map((item, idx) => (
                            <tr key={idx} className="hover:bg-white/5">
                              <td className="px-3 py-2.5 font-medium">
                                {item.serviceName}
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                {(item.price * item.quantity).toLocaleString()} ฿
                              </td>
                              <td className="px-3 py-2.5 text-center text-spa-teal font-semibold">
                                +{(item.commission * item.quantity).toLocaleString()} ฿
                              </td>
                              <td className="px-3 py-2.5 text-center font-bold text-spa-gold">
                                {item.quantity} ชม.
                              </td>
                              <td className="px-3 py-2.5 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    handleRemoveServiceFromForm(item.serviceId)
                                  }
                                  className="text-red-400 hover:text-red-300"
                                >
                                  <X size={15} />
                                </button>
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* ยอดเงินและช่องทางจ่าย */}
                <div className="p-4 rounded-xl bg-slate-950/40 border border-white/5 space-y-3.5">
                  <span className="text-xs font-bold text-spa-gold block">
                    สรุปการรับเงินหน้าร้าน
                  </span>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3.5">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        เงินสด (฿) (ไม่บังคับ)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        onKeyDown={blockNonNumericKeyDown}
                        {...register("cash", { setValueAs: optionalNumberInputToZero })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                      />
                      {errors.cash && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={10} />
                          {errors.cash.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        เงินโอน (฿) (ไม่บังคับ)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        onKeyDown={blockNonNumericKeyDown}
                        {...register("transfer", { setValueAs: optionalNumberInputToZero })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                      />
                      {errors.transfer && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={10} />
                          {errors.transfer.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        บัตรเครดิต (฿) (ไม่บังคับ)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        onKeyDown={blockNonNumericKeyDown}
                        {...register("card", { setValueAs: optionalNumberInputToZero })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                      />
                      {errors.card && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={10} />
                          {errors.card.message}
                        </p>
                      )}
                    </div>
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 mb-1">
                        ทิปหมอพิเศษ (฿) (ไม่บังคับ)
                      </label>
                      <input
                        type="number"
                        placeholder="0"
                        onKeyDown={blockNonNumericKeyDown}
                        {...register("tip", { setValueAs: optionalNumberInputToZero })}
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                      />
                      {errors.tip && (
                        <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                          <AlertCircle size={10} />
                          {errors.tip.message}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex justify-between items-center text-xs text-slate-400 pt-2 border-t border-white/5">
                    <span>
                      ราคารวมบริการ:{" "}
                      <strong>{formTotalPrice.toLocaleString()} ฿</strong>
                    </span>
                    <span>
                      ยอดรับเงินรวม:{" "}
                      <strong className="text-spa-gold">
                        {formTotalReceived.toLocaleString()} ฿
                      </strong>
                    </span>
                  </div>

                  {/* คำเตือนแบบไม่บล็อกการบันทึก (soft warning) — แสดงเฉพาะตอนยอดไม่ตรงกันเท่านั้น
                      ปุ่มบันทึกด้านล่างยังกดได้ปกติเสมอ ไม่มีการดัก validation ใดๆ เพิ่มจากข้อความนี้ */}
                  {hasPaymentAmountMismatch && (
                    <p className="flex items-center gap-1.5 text-[11px] text-amber-400 font-semibold bg-amber-950/30 border border-amber-900/50 rounded-lg px-3 py-2">
                      <AlertCircle size={13} className="shrink-0" />
                      {paymentMismatchMessage}
                    </p>
                  )}
                </div>

                {/* ปุ่มยืนยัน / ยกเลิก */}
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
                    disabled={isSaving}
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-transform shadow-lg shadow-spa-gold/10 disabled:opacity-60 disabled:cursor-not-allowed disabled:active:scale-100"
                  >
                    <Check size={14} />
                    <span>{isSaving ? "กำลังบันทึก..." : "บันทึกงานนวด"}</span>
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
