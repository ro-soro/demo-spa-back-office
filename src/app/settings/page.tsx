// src/app/settings/page.tsx
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. หน้าตั้งค่าร้านใช้ Tailwind CSS ในการทำกริดแบ่งออกเป็น 2 หมวดหลัก: จัดการหมอนวด และจัดการเมนูราคา
//    ช่วยให้การกรอกและแก้ไขข้อมูลเรียงตัวสวยงาม ค้นหารายละเอียดได้รวดเร็วขึ้น
// 2. ใช้ Framer Motion AnimatePresence ตกแต่งฟอร์มแก้ไขข้อมูลพนักงานและบริการสปาใหม่
//    เพื่อไม่ให้ฟอร์มเด้งติดขัดหรือทำเลย์เอาต์หน้าจอรวมสั่นไหวขณะกดเปิดหรือส่งข้อมูลบันทึก
// 3. ซ่อนหรือปิดกั้นปุ่มแก้ไขเรทเงินประกันและค่ากะดึกร้านสำหรับ Admin ทั่วไป
//    เพื่อป้องกันการเปลี่ยนแปลงข้อมูลจากบุคคลที่ไม่มีอำนาจจัดการ
// 4. ใช้ React Hook Form + Zod กับฟอร์มพนักงาน/บริการเช่นเดียวกับทุกฟอร์ม CRUD อื่นในระบบ
//    (เดิมหน้านี้ใช้ useState + alert() ตรวจสอบเอง ทำให้ pattern การ validate ไม่ตรงกันทั้งระบบ)

"use client";

import React, { useState } from "react";
import { useApp } from "@/context/AppContext";
import { Therapist, Service } from "@/data/initialData";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { blockNonNumericKeyDown, requiredNumberInput, optionalNumberInputToZero } from "@/utils/numericInput";
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Users,
  Compass,
  Sliders,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";

// Zod Schema สำหรับฟอร์มพนักงานนวด
// หมายเหตุ: bankName/bankAccount/bankAccountName/phone เป็น optional เพราะพนักงานใหม่อาจยังไม่มีข้อมูลบัญชี
// ธนาคารพร้อมตอนสมัครวันแรก และค่าที่ขาดหายไปไม่กระทบการคำนวณเงินเดือน (ต่างจาก name/type/dailyGuarantee
// ที่ทุกสูตรคำนวณค่าคอม/ประกันมือพึ่งพาโดยตรง — ขาดไปจะทำให้ระบบคำนวณผิดพลาดจริง)
const therapistSchema = z.object({
  name: z.string().min(1, "กรุณากรอกชื่อเล่นพนักงาน"),
  type: z.enum(["full-time", "part-time"], {
    message: "กรุณาเลือกประเภทพนักงาน",
  }),
  dailyGuarantee: z
    .number({ message: "กรุณากรอกจำนวนเงินประกันมือ" })
    .nonnegative("เงินประกันมือต้องไม่ติดลบ"),
  bankName: z.string().optional(),
  bankAccount: z.string().optional(),
  bankAccountName: z.string().optional(),
  phone: z.string().optional(),
  worksLateShift: z.boolean().optional(),
  advanceDeductionTotal: z
    .number()
    .nonnegative("ยอดรวมหักเบิกต้องไม่ติดลบ")
    .optional(),
  advanceDeductionPerPeriod: z
    .number()
    .nonnegative("ยอดหักเบิกต่องวดต้องไม่ติดลบ")
    .optional(),
});

type TherapistFormValues = z.infer<typeof therapistSchema>;

// Zod Schema สำหรับฟอร์มบริการสปา
const serviceSchema = z.object({
  category: z.string().min(1, "กรุณาเลือกหมวดหมู่"),
  name: z.string().min(1, "กรุณากรอกชื่อรายการบริการ"),
  duration: z
    .number({ message: "กรุณากรอกเวลาบริการ" })
    .min(0.1, "เวลาบริการต้องมากกว่า 0 ชม."),
  price: z.number({ message: "กรุณากรอกราคา" }).min(1, "ราคาต้องมากกว่า 0 บาท"),
  commission: z
    .number({ message: "กรุณากรอกค่ามือ" })
    .nonnegative("ค่ามือต้องไม่ติดลบ"),
});

type ServiceFormValues = z.infer<typeof serviceSchema>;

export default function SettingsPage() {
  const {
    currentRole,
    therapists,
    services,
    serviceCategories,
    lateShiftRate,
    addOrUpdateTherapist,
    removeTherapist,
    addOrUpdateService,
    removeService,
    updateLateShiftRate,
  } = useApp();

  // ดึงคลาสสีสำหรับแสดงป้ายหมวดหมู่
  const getCategoryColorClass = (catName: string): string => {
    const found = serviceCategories.find((c) => c.name === catName);
    if (!found) return "bg-slate-800/60 text-slate-300 border-slate-700/60";
    switch (found.colorClass) {
      case "teal":
        return "bg-teal-900/40 text-teal-300 border-teal-800/60";
      case "rose":
        return "bg-rose-900/40 text-rose-300 border-rose-800/60";
      case "violet":
        return "bg-violet-900/40 text-violet-300 border-violet-800/60";
      case "amber":
        return "bg-amber-950/50 text-amber-400 border-amber-900/60";
      case "sky":
        return "bg-sky-900/40 text-sky-300 border-sky-800/60";
      case "gold":
        return "bg-amber-900/40 text-amber-300 border-amber-800/60";
      default:
        return "bg-slate-800/60 text-slate-300 border-slate-700/60";
    }
  };

  // สถานะเปิด/ปิด Modal พนักงาน
  const [isTherapistModalOpen, setIsTherapistModalOpen] = useState(false);
  const [editingTherapist, setEditingTherapist] = useState<Therapist | null>(
    null,
  );

  // สถานะเปิด/ปิด Modal บริการ
  const [isServiceModalOpen, setIsServiceModalOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);

  // สถานะปรับอัตราค่ากะดึก
  const [tempLateShiftRate, setTempLateShiftRate] = useState(lateShiftRate);
  const [isLateShiftEditing, setIsLateShiftEditing] = useState(false);

  // React Hook Form — ฟอร์มพนักงานนวด
  const {
    register: registerTherapist,
    handleSubmit: handleTherapistFormSubmit,
    reset: resetTherapistForm,
    formState: { errors: therapistErrors },
  } = useForm<TherapistFormValues>({
    resolver: zodResolver(therapistSchema),
    defaultValues: {
      name: "",
      type: "full-time",
      bankName: "",
      bankAccount: "",
      bankAccountName: "",
      phone: "",
      worksLateShift: false,
      advanceDeductionTotal: 0,
      advanceDeductionPerPeriod: 0,
    },
  });

  // React Hook Form — ฟอร์มบริการสปา
  const {
    register: registerService,
    handleSubmit: handleServiceFormSubmit,
    reset: resetServiceForm,
    formState: { errors: serviceErrors },
  } = useForm<ServiceFormValues>({
    resolver: zodResolver(serviceSchema),
    defaultValues: { category: "", name: "", duration: 1.0 },
  });

  // Guard: เฉพาะ Manager ขึ้นไป — เหตุผล (Why) ที่ต้องมี guard ในตัวหน้าเองอีกชั้น แม้ MainLayout.tsx จะ
  // ซ่อนเมนู "ตั้งค่าร้าน" ไว้แล้วสำหรับ admin: MainLayout.tsx คำนวณสิทธิ์จาก navItems เท่านั้น แต่ path
  // "/settings" ไม่ได้ถูกลงทะเบียนอยู่ใน navItems เลย (อยู่แค่ใน settingsSubItems ที่ไม่มีการตรวจสิทธิ์ใดๆ)
  // ทำให้ผู้ใช้ที่พิมพ์ URL "/settings" ตรงๆ ในแอดเดรสบาร์เข้าถึงได้เต็มรูปแบบโดยไม่ถูก block เลย — ใช้
  // pattern เดียวกับ settings/categories/page.tsx และ settings/courses/page.tsx ที่มี guard ถูกต้องอยู่แล้ว
  // (วางไว้หลัง Hook ทั้งหมดเสมอ — react-hooks/rules-of-hooks ห้าม return ก่อนเรียก Hook ครบทุกตัว)
  if (currentRole === "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-sm text-slate-400">สิทธิ์ไม่เพียงพอ — เฉพาะ Manager ขึ้นไปเท่านั้น</p>
      </div>
    );
  }

  // เปิดป๊อปอัปเพิ่มพนักงาน — ไม่เดาค่าล่วงหน้า ให้ผู้ใช้กรอกเองทั้งหมด
  const handleOpenAddTherapist = () => {
    setEditingTherapist(null);
    resetTherapistForm({
      name: "",
      type: "full-time",
      bankName: "",
      bankAccount: "",
      bankAccountName: "",
      phone: "",
      worksLateShift: false,
      advanceDeductionTotal: 0,
      advanceDeductionPerPeriod: 0,
    });
    setIsTherapistModalOpen(true);
  };

  // เปิดป๊อปอัปแก้ไขพนักงาน
  const handleOpenEditTherapist = (t: Therapist) => {
    setEditingTherapist(t);
    resetTherapistForm({
      name: t.name,
      type: t.type,
      dailyGuarantee: t.dailyGuarantee,
      bankName: t.bankName,
      bankAccount: t.bankAccount,
      bankAccountName: t.bankAccountName,
      phone: t.phone,
      worksLateShift: t.worksLateShift ?? false,
      advanceDeductionTotal: t.advanceDeductionTotal ?? 0,
      advanceDeductionPerPeriod: t.advanceDeductionPerPeriod ?? 0,
    });
    setIsTherapistModalOpen(true);
  };

  // ลบพนักงาน
  const handleDeleteTherapist = (id: string, name: string) => {
    if (
      confirm(`คุณต้องการลบรายชื่อพนักงานคุณ "${name}" ออกจากระบบใช่หรือไม่?`)
    ) {
      removeTherapist(id);
    }
  };

  // กดส่งฟอร์มพนักงาน
  const onSubmitTherapist = (data: TherapistFormValues) => {
    const therapistData: Therapist = {
      id: editingTherapist?.id || `ther_${new Date().getTime()}`,
      name: data.name.trim(),
      type: data.type,
      dailyGuarantee: Number(data.dailyGuarantee),
      bankName: data.bankName?.trim() ?? "",
      bankAccount: data.bankAccount?.trim() ?? "",
      bankAccountName: data.bankAccountName?.trim() ?? "",
      phone: data.phone?.trim() ?? "",
      worksLateShift: data.worksLateShift ?? false,
      advanceDeductionTotal: Number(data.advanceDeductionTotal) || 0,
      advanceDeductionPerPeriod: Number(data.advanceDeductionPerPeriod) || 0,
    };

    addOrUpdateTherapist(therapistData);
    setIsTherapistModalOpen(false);
  };

  // เปิดป๊อปอัปเพิ่มบริการ — ไม่เดาค่าล่วงหน้า ให้ผู้ใช้กรอกเองทั้งหมด
  const handleOpenAddService = () => {
    setEditingService(null);
    resetServiceForm({ category: "", name: "", duration: 1.0 });
    setIsServiceModalOpen(true);
  };

  // เปิดป๊อปอัปแก้ไขบริการ
  const handleOpenEditService = (s: Service) => {
    setEditingService(s);
    resetServiceForm({
      category: s.category,
      name: s.name,
      duration: s.duration,
      price: s.price,
      commission: s.commission,
    });
    setIsServiceModalOpen(true);
  };

  // ลบบริการ
  const handleDeleteService = (id: string, name: string) => {
    if (
      confirm(`คุณต้องการลบรายการบริการ "${name}" ออกจากระบบสปาใช่หรือไม่?`)
    ) {
      removeService(id);
    }
  };

  // กดส่งฟอร์มบริการ
  const onSubmitService = (data: ServiceFormValues) => {
    const serviceData: Service = {
      id: editingService?.id || `srv_${new Date().getTime()}`,
      category: data.category,
      name: data.name.trim(),
      duration: Number(data.duration),
      price: Number(data.price),
      commission: Number(data.commission),
    };

    addOrUpdateService(serviceData);
    setIsServiceModalOpen(false);
  };

  // บันทึกค่ากะดึกกลาง
  const handleSaveLateShiftRate = () => {
    updateLateShiftRate(tempLateShiftRate);
    setIsLateShiftEditing(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* 1. คอนฟิกค่ากะดึกกลาง (Late Shift Rate) */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-lg flex flex-col sm:flex-row items-center justify-between gap-4">
        <div>
          <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold flex items-center gap-2">
            <Sliders size={18} />
            <span>ตั้งค่าอัตราเบี้ยเลี้ยงค่ากะดึกกลางของร้าน</span>
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">
            เงินสะสมส่วนเบี้ยกะดึกสำหรับหมอนวดที่เข้าเวรกะดึกปลายงวด
          </p>
        </div>

        <div className="flex items-center gap-3">
          {isLateShiftEditing ? (
            <>
              <input
                type="number"
                value={tempLateShiftRate}
                onKeyDown={blockNonNumericKeyDown}
                onChange={(e) => setTempLateShiftRate(Number(e.target.value))}
                className="w-24 px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-slate-200 outline-none focus:border-spa-gold text-xs"
              />
              <button
                onClick={handleSaveLateShiftRate}
                className="p-2 rounded-lg bg-spa-teal/10 border border-spa-teal/20 text-spa-teal hover:bg-spa-teal hover:text-white"
              >
                <Check size={14} />
              </button>
              <button
                onClick={() => {
                  setTempLateShiftRate(lateShiftRate);
                  setIsLateShiftEditing(false);
                }}
                className="p-2 rounded-lg bg-slate-900 border border-white/5 text-slate-400 hover:text-white"
              >
                <X size={14} />
              </button>
            </>
          ) : (
            <>
              <strong className="text-xl font-bold text-spa-gold">
                {lateShiftRate} ฿
              </strong>
              <button
                onClick={() => setIsLateShiftEditing(true)}
                className="px-3.5 py-1.5 rounded-lg bg-slate-900 border border-white/5 text-slate-300 hover:text-white text-xs font-semibold active:scale-95 transition-transform"
              >
                แก้ไข
              </button>
            </>
          )}
        </div>
      </div>

      {/* 2. บัญชีรายชื่อพนักงาน (Therapists Settings) */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold flex items-center gap-2">
            <Users size={18} />
            <span>จัดการโปรไฟล์พนักงานและประกันรายวัน</span>
          </h3>
          <button
            onClick={handleOpenAddTherapist}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-spa-teal to-teal-600 text-white text-xs font-semibold tracking-wide flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus size={14} />
            <span>เพิ่มพนักงานใหม่</span>
          </button>
        </div>

        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ชื่อเล่นพนักงาน
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ประเภทสัญญาจ้าง
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ประกันมือขั้นต่ำ
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  เบอร์โทรศัพท์
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  รายละเอียดบัญชีธนาคาร
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
              {therapists.map((t) => (
                <tr key={t.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-4 text-sm font-semibold text-slate-200">
                    หมอ{t.name}
                  </td>
                  <td className="px-4 py-4 text-xs">
                    {t.type === "full-time" ? (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-teal-950/40 text-teal-400 border border-teal-900/60">
                        ประจำ (Full-Time)
                      </span>
                    ) : (
                      <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-amber-950/40 text-amber-400 border border-amber-900/60">
                        พาร์ทไทม์ (Part-Time)
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4 text-center text-xs text-spa-gold font-bold">
                    {t.dailyGuarantee.toLocaleString()} ฿ / วัน
                  </td>
                  <td className="px-4 py-4 text-xs text-slate-300">
                    {t.phone || "-"}
                  </td>
                  <td className="px-4 py-4 text-xs">
                    <div className="flex flex-col gap-0.5 text-slate-300">
                      <span>
                        {t.bankName} - {t.bankAccount}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        ชื่อบัญชี: {t.bankAccountName}
                      </span>
                    </div>
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditTherapist(t)}
                        className="p-2 rounded-lg bg-slate-900 border border-white/5 text-amber-400 hover:text-white hover:border-amber-400 active:scale-90 transition-all"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteTherapist(t.id, t.name)}
                        className="p-2 rounded-lg bg-slate-900 border border-white/5 text-red-400 hover:text-white hover:border-red-400 active:scale-90 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 3. รายการเมนูบริการสปา (Spa Services Config) */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold flex items-center gap-2">
            <Compass size={18} />
            <span>จัดการรายการเมนูราคาและอัตราค่ามือ</span>
          </h3>
          <button
            onClick={handleOpenAddService}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-spa-teal to-teal-600 text-white text-xs font-semibold tracking-wide flex items-center gap-1.5 active:scale-95 transition-transform"
          >
            <Plus size={14} />
            <span>เพิ่มบริการใหม่</span>
          </button>
        </div>

        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  หมวดหมู่
                </th>
                <th className="px-4 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ชื่อรายการบริการ
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  เวลาบริการ
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ราคาหน้าร้าน
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ค่ามือพนักงาน
                </th>
                <th className="px-4 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  สัดส่วนแบ่งจ่าย
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
              {services.map((s) => (
                <tr key={s.id} className="hover:bg-white/5 transition-colors">
                  <td className="px-4 py-4 text-xs">
                    <span
                      className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${getCategoryColorClass(s.category)} uppercase`}
                    >
                      {s.category || "บริการทั่วไป"}
                    </span>
                  </td>
                  <td className="px-4 py-4 text-sm font-semibold text-slate-200">
                    {s.name}
                  </td>
                  <td className="px-4 py-4 text-center text-xs text-slate-300 font-medium">
                    {s.duration} ชม.
                  </td>
                  <td className="px-4 py-4 text-center text-xs text-slate-300 font-bold">
                    {s.price.toLocaleString()} ฿
                  </td>
                  <td className="px-4 py-4 text-center text-xs text-spa-teal font-bold">
                    {s.commission.toLocaleString()} ฿
                  </td>
                  <td className="px-4 py-4 text-center text-xs text-slate-400">
                    {s.price > 0
                      ? ((s.commission / s.price) * 100).toFixed(0)
                      : 0}
                    %
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditService(s)}
                        className="p-2 rounded-lg bg-slate-900 border border-white/5 text-amber-400 hover:text-white hover:border-amber-400 active:scale-90 transition-all"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteService(s.id, s.name)}
                        className="p-2 rounded-lg bg-slate-900 border border-white/5 text-red-400 hover:text-white hover:border-red-400 active:scale-90 transition-all"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. Modal สำหรับ เพิ่ม/แก้ไข พนักงาน */}
      <AnimatePresence>
        {isTherapistModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTherapistModalOpen(false)}
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
                  <Users size={18} />
                  <span>
                    {editingTherapist
                      ? "แก้ไขข้อมูลพนักงานสปา"
                      : "เพิ่มพนักงานนวดสปาคนใหม่"}
                  </span>
                </h3>
                <button
                  onClick={() => setIsTherapistModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form
                onSubmit={handleTherapistFormSubmit(onSubmitTherapist)}
                className="space-y-4"
              >
                {/* ชื่อเล่นพนักงาน */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    ชื่อเล่นพนักงาน *
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น มะลิ, ฝน"
                    {...registerTherapist("name")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                  {therapistErrors.name && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {therapistErrors.name.message}
                    </p>
                  )}
                </div>

                {/* สัญญาจ้าง */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    ประเภทพนักงานสัญญาจ้าง *
                  </label>
                  <select
                    {...registerTherapist("type")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                  >
                    <option value="full-time">พนักงานประจำ (Full-Time)</option>
                    <option value="part-time">พาร์ทไทม์ (Part-Time)</option>
                  </select>
                </div>

                {/* เงินประกันมือ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    เงินประกันมือขั้นต่ำสะสมรายวัน (฿) *
                  </label>
                  <input
                    type="number"
                    placeholder="เช่น 600"
                    onKeyDown={blockNonNumericKeyDown}
                    {...registerTherapist("dailyGuarantee", {
                      setValueAs: requiredNumberInput,
                    })}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                  {therapistErrors.dailyGuarantee && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {therapistErrors.dailyGuarantee.message}
                    </p>
                  )}
                </div>

                {/* เบอร์โทรศัพท์ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    เบอร์โทรศัพท์ติดต่อ (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    placeholder="กรอกเบอร์โทรศัพท์"
                    {...registerTherapist("phone")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3.5">
                  {/* ธนาคาร */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ธนาคาร (ไม่บังคับ)
                    </label>
                    <input
                      type="text"
                      placeholder="เช่น SCB, BBL"
                      {...registerTherapist("bankName")}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                  </div>
                  {/* เลขบัญชี */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      เลขที่บัญชี (ไม่บังคับ)
                    </label>
                    <input
                      type="text"
                      placeholder="กรอกเลขที่บัญชี"
                      {...registerTherapist("bankAccount")}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                  </div>
                </div>

                {/* ชื่อบัญชี */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    ชื่อบัญชีธนาคาร (ไม่บังคับ)
                  </label>
                  <input
                    type="text"
                    placeholder="กรอกชื่อบัญชีธนาคาร"
                    {...registerTherapist("bankAccountName")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                </div>

                {/* สิทธิ์ค่ากะดึกและยอดเบิกสะสม */}
                <div className="pt-2 border-t border-white/5 space-y-4">
                  <label className="flex items-center gap-2.5 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      {...registerTherapist("worksLateShift")}
                      className="w-4 h-4 rounded bg-slate-950 border border-white/10 accent-spa-gold cursor-pointer"
                    />
                    <span className="text-xs font-semibold text-slate-300">
                      พนักงานได้รับค่ากะดึกเป็นประจำ (Late Shift Allowance)
                    </span>
                  </label>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ยอดรวมหักเบิก (฿)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      onKeyDown={blockNonNumericKeyDown}
                      {...registerTherapist("advanceDeductionTotal", {
                        setValueAs: optionalNumberInputToZero,
                      })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      ยอดสะสมที่เบิกล่วงหน้า/กู้ยืมทั้งหมด — ไม่ถูกหักออกจากเงินเดือนทันที
                      ระบบจะทยอยหักตาม &quot;หักเบิกต่องวด&quot; ด้านล่างจนกว่าจะครบ
                      หากมีการเบิกเพิ่มภายหลัง ให้บวกสะสมเข้ายอดนี้ ไม่ใช่แทนที่ยอดเดิม
                    </p>
                    {therapistErrors.advanceDeductionTotal && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {therapistErrors.advanceDeductionTotal.message}
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      หักเบิกต่องวด (฿)
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      onKeyDown={blockNonNumericKeyDown}
                      {...registerTherapist("advanceDeductionPerPeriod", {
                        setValueAs: optionalNumberInputToZero,
                      })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    <p className="text-[10px] text-slate-500 mt-1">
                      จำนวนเงินที่ระบบหักอัตโนมัติทุกงวดบัญชี จนกว่ายอดรวมหักเบิกจะหมด
                    </p>
                    {therapistErrors.advanceDeductionPerPeriod && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {therapistErrors.advanceDeductionPerPeriod.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* ปุ่มฟอร์ม */}
                <div className="flex justify-end gap-3.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsTherapistModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-slate-300 text-xs font-semibold active:scale-95 transition-transform"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-transform shadow-lg shadow-spa-gold/10"
                  >
                    <Check size={14} />
                    <span>บันทึกข้อมูลพนักงาน</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. Modal สำหรับ เพิ่ม/แก้ไข บริการ */}
      <AnimatePresence>
        {isServiceModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsServiceModalOpen(false)}
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
                  <Compass size={18} />
                  <span>
                    {editingService
                      ? "แก้ไขรายการบริการนวด"
                      : "เพิ่มรายการบริการใหม่"}
                  </span>
                </h3>
                <button
                  onClick={() => setIsServiceModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form
                onSubmit={handleServiceFormSubmit(onSubmitService)}
                className="space-y-4"
              >
                {/* เลือกหมวดหมู่ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    หมวดหมู่กลุ่มบริการ *
                  </label>
                  <select
                    {...registerService("category")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                  >
                    <option value="">— เลือกหมวดหมู่ —</option>
                    {serviceCategories.map((cat) => (
                      <option key={cat.id} value={cat.name}>
                        {cat.name}
                      </option>
                    ))}
                  </select>
                  {serviceErrors.category && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {serviceErrors.category.message}
                    </p>
                  )}
                </div>

                {/* ชื่อบริการ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    ชื่อรายการบริการ *
                  </label>
                  <input
                    type="text"
                    placeholder="เช่น ขัดผิวมะขามทานาคา"
                    {...registerService("name")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                  {serviceErrors.name && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {serviceErrors.name.message}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-3 gap-3">
                  {/* เวลาที่ให้บริการ */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      เวลาบริการ (ชม.) *
                    </label>
                    <input
                      type="number"
                      step="0.5"
                      min="0.5"
                      placeholder="1.0"
                      onKeyDown={blockNonNumericKeyDown}
                      {...registerService("duration", { setValueAs: requiredNumberInput })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    {serviceErrors.duration && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {serviceErrors.duration.message}
                      </p>
                    )}
                  </div>
                  {/* ราคาจำหน่ายหน้าร้าน */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ราคาหน้าร้าน (฿) *
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      onKeyDown={blockNonNumericKeyDown}
                      {...registerService("price", { setValueAs: requiredNumberInput })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    {serviceErrors.price && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {serviceErrors.price.message}
                      </p>
                    )}
                  </div>
                  {/* ค่ามือหมอ */}
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                      ค่ามือที่จะได้รับ (฿) *
                    </label>
                    <input
                      type="number"
                      placeholder="0"
                      onKeyDown={blockNonNumericKeyDown}
                      {...registerService("commission", {
                        setValueAs: requiredNumberInput,
                      })}
                      className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                    />
                    {serviceErrors.commission && (
                      <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                        <AlertCircle size={10} />
                        {serviceErrors.commission.message}
                      </p>
                    )}
                  </div>
                </div>

                {/* ปุ่มฟอร์ม */}
                <div className="flex justify-end gap-3.5 pt-4">
                  <button
                    type="button"
                    onClick={() => setIsServiceModalOpen(false)}
                    className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-slate-300 text-xs font-semibold active:scale-95 transition-transform"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 font-bold text-xs flex items-center gap-1.5 active:scale-95 transition-transform shadow-lg shadow-spa-gold/10"
                  >
                    <Check size={14} />
                    <span>บันทึกบริการ</span>
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
