// src/app/settings/courses/page.tsx
// หน้าจัดการ Master Data คอร์สสปา (สำหรับ Manager ขึ้นไป)

"use client";

import React, { useState, useMemo } from "react";
import { useApp } from "@/context/AppContext";
import { CourseTemplate } from "@/data/initialData";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { PaginationControls } from "@/components/PaginationControls";
import { blockNonNumericKeyDown, requiredNumberInput } from "@/utils/numericInput";
import {
  Plus,
  Edit2,
  Trash2,
  X,
  BookOpen,
  AlertCircle,
  ShieldAlert,
} from "lucide-react";

const ITEMS_PER_PAGE = 10;

// Zod Schema
const courseTemplateSchema = z.object({
  category: z.string().min(1, "กรุณาเลือกหมวดหมู่"),
  name: z.string().min(1, "กรุณากรอกชื่อคอร์ส").max(60, "ชื่อยาวเกินไป"),
  defaultPrice: z
    .number({ message: "กรุณากรอกราคา" })
    .min(1, "ราคาต้องมากกว่า 0"),
  description: z.string().max(100, "รายละเอียดยาวเกินไป").optional(),
});

type CourseTemplateFormValues = z.infer<typeof courseTemplateSchema>;

// แยกหมวดหมู่ของคอร์ส (ต่างจากหมวดหมู่บริการ — เป็นหมวดสำหรับคอร์สโดยเฉพาะ)
const COURSE_CATEGORY_OPTIONS = [
  "คอร์สสปาตัว",
  "คอร์สสปาหน้า",
  "คอร์สนวดไทย",
  "คอร์สออยล์",
  "คอร์สอื่น ๆ",
];

export default function SettingsCoursesPage() {
  const {
    currentRole,
    courseTemplates,
    courseSales,
    addOrUpdateCourseTemplate,
    removeCourseTemplate,
  } = useApp();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<CourseTemplate | null>(
    null,
  );
  const [currentPage, setCurrentPage] = useState(1);
  const [filterCategory, setFilterCategory] = useState("");

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CourseTemplateFormValues>({
    resolver: zodResolver(courseTemplateSchema),
    defaultValues: { category: "", name: "", description: "" },
  });

  // Filter และ Pagination
  const filteredTemplates = useMemo(() => {
    if (!filterCategory) return courseTemplates;
    return courseTemplates.filter((t) => t.category === filterCategory);
  }, [courseTemplates, filterCategory]);

  // Guard: เฉพาะ Manager ขึ้นไป
  if (currentRole === "admin") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-sm text-slate-400">
          สิทธิ์ไม่เพียงพอ — เฉพาะ Manager ขึ้นไปเท่านั้น
        </p>
      </div>
    );
  }

  const totalPages = Math.max(
    1,
    Math.ceil(filteredTemplates.length / ITEMS_PER_PAGE),
  );
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedTemplates = filteredTemplates.slice(
    (safeCurrentPage - 1) * ITEMS_PER_PAGE,
    safeCurrentPage * ITEMS_PER_PAGE,
  );

  const handleOpenAdd = () => {
    setEditingTemplate(null);
    reset({ category: "", name: "", description: "" });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (template: CourseTemplate) => {
    setEditingTemplate(template);
    reset({
      category: template.category,
      name: template.name,
      defaultPrice: template.defaultPrice,
      description: template.description,
    });
    setIsModalOpen(true);
  };

  const handleDelete = (template: CourseTemplate) => {
    const usageCount = courseSales.filter(
      (s) => s.courseType === template.name,
    ).length;
    if (usageCount > 0) {
      alert(
        'ไม่สามารถลบ "' +
          template.name +
          '" ได้\nมีรายการขายคอร์สใช้ชื่อนี้อยู่ ' +
          usageCount +
          " รายการ",
      );
      return;
    }
    if (confirm('ยืนยันการลบคอร์ส "' + template.name + '" ?')) {
      removeCourseTemplate(template.id);
    }
  };

  const onSubmit = (data: CourseTemplateFormValues) => {
    const templateData: CourseTemplate = {
      id: editingTemplate?.id ?? "ct_" + crypto.randomUUID(),
      category: data.category,
      name: data.name,
      defaultPrice: data.defaultPrice,
      description: data.description ?? "",
    };
    addOrUpdateCourseTemplate(templateData);
    setIsModalOpen(false);
  };

  // รายชื่อหมวดหมู่ที่ไม่ซ้ำสำหรับ Filter
  const uniqueCategories = Array.from(
    new Set(courseTemplates.map((t) => t.category)),
  );

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-white/5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-spa-gold flex items-center gap-2">
            <BookOpen size={18} />
            จัดการ Master Data คอร์สสปา
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            ข้อมูลคอร์สสปาเริ่มต้น — Admin นำไปเลือกในหน้าบันทึกขายคอร์ส พร้อม
            Auto-fill ราคา
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-teal to-teal-600 text-white font-semibold text-xs flex items-center gap-2 active:scale-95 transition-transform w-full md:w-auto justify-center"
        >
          <Plus size={16} />
          <span>เพิ่มคอร์สใหม่</span>
        </button>
      </div>

      {/* Filter */}
      <div className="glass-panel px-4 py-3 rounded-2xl border border-white/5 flex flex-wrap gap-2 items-center">
        <span className="text-xs text-slate-500 mr-1">กรองตามหมวด:</span>
        <button
          onClick={() => {
            setFilterCategory("");
            setCurrentPage(1);
          }}
          className={
            "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " +
            (!filterCategory
              ? "bg-spa-gold/20 text-spa-gold border border-spa-gold/40"
              : "text-slate-400 hover:bg-white/5")
          }
        >
          ทั้งหมด ({courseTemplates.length})
        </button>
        {uniqueCategories.map((cat) => (
          <button
            key={cat}
            onClick={() => {
              setFilterCategory(cat);
              setCurrentPage(1);
            }}
            className={
              "px-3 py-1.5 rounded-lg text-xs font-semibold transition-all " +
              (filterCategory === cat
                ? "bg-spa-teal/20 text-spa-teal border border-spa-teal/40"
                : "text-slate-400 hover:bg-white/5")
            }
          >
            {cat} ({courseTemplates.filter((t) => t.category === cat).length})
          </button>
        ))}
      </div>

      {/* ตาราง */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ชื่อคอร์ส
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden md:table-cell">
                  หมวดหมู่
                </th>
                <th className="px-5 py-4 text-right text-xs font-semibold text-slate-400 uppercase tracking-wider">
                  ราคาเริ่มต้น
                </th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden lg:table-cell">
                  รายละเอียด
                </th>
                <th className="px-5 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">
                  จัดการ
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {paginatedTemplates.length === 0 ? (
                <tr>
                  <td
                    colSpan={5}
                    className="text-center text-xs text-slate-500 py-12"
                  >
                    ยังไม่มีคอร์สในระบบ กดปุ่มด้านบนเพื่อเพิ่ม
                  </td>
                </tr>
              ) : (
                paginatedTemplates.map((template) => (
                  <tr
                    key={template.id}
                    className="hover:bg-white/5 transition-colors"
                  >
                    <td className="px-5 py-4 text-xs text-slate-200 font-medium">
                      {template.name}
                    </td>
                    <td className="px-5 py-4 hidden md:table-cell">
                      <span className="px-2 py-0.5 rounded-md bg-teal-900/30 text-teal-400 border border-teal-900/50 text-[10px] font-semibold">
                        {template.category}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right text-xs text-spa-gold font-semibold">
                      {template.defaultPrice.toLocaleString("th-TH")} ฿
                    </td>
                    <td className="px-5 py-4 text-xs text-slate-400 hidden lg:table-cell">
                      {template.description || (
                        <span className="text-slate-600 italic">—</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex justify-center gap-1.5">
                        <button
                          onClick={() => handleOpenEdit(template)}
                          className="p-2 rounded-lg bg-slate-900 border border-white/5 text-amber-400 hover:border-amber-400 active:scale-90 transition-all"
                          title="แก้ไข"
                        >
                          <Edit2 size={13} />
                        </button>
                        <button
                          onClick={() => handleDelete(template)}
                          className="p-2 rounded-lg bg-slate-900 border border-white/5 text-red-400 hover:border-red-400 active:scale-90 transition-all"
                          title="ลบ"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <PaginationControls
          currentPage={safeCurrentPage}
          totalPages={totalPages}
          totalItems={filteredTemplates.length}
          onPageChange={setCurrentPage}
        />
      </div>

      {/* Modal */}
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
                <h3 className="text-sm font-bold text-spa-gold flex items-center gap-2">
                  <BookOpen size={16} />
                  {editingTemplate ? "แก้ไขคอร์สสปา" : "เพิ่มคอร์สใหม่"}
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* หมวดหมู่ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    หมวดหมู่คอร์ส *
                  </label>
                  <select
                    {...register("category")}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
                  >
                    <option value="">— เลือกหมวดหมู่ —</option>
                    {COURSE_CATEGORY_OPTIONS.map((cat) => (
                      <option key={cat} value={cat}>
                        {cat}
                      </option>
                    ))}
                  </select>
                  {errors.category && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {errors.category.message}
                    </p>
                  )}
                </div>

                {/* ชื่อคอร์ส */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    ชื่อคอร์ส *
                  </label>
                  <input
                    {...register("name")}
                    placeholder="เช่น คอร์สสปาตัวน้ำผึ้ง 10 ครั้ง"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
                  />
                  {errors.name && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {errors.name.message}
                    </p>
                  )}
                </div>

                {/* ราคาเริ่มต้น */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    ราคาเริ่มต้น (บาท) *
                  </label>
                  <input
                    {...register("defaultPrice", { setValueAs: requiredNumberInput })}
                    type="number"
                    min={1}
                    placeholder="0"
                    onKeyDown={blockNonNumericKeyDown}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
                  />
                  {errors.defaultPrice && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />
                      {errors.defaultPrice.message}
                    </p>
                  )}
                </div>

                {/* รายละเอียด */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    รายละเอียด (ไม่บังคับ)
                  </label>
                  <input
                    {...register("description")}
                    placeholder="รายละเอียดเพิ่มเติม"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
                  />
                </div>

                <div className="flex gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-slate-900 border border-white/5 text-slate-400 hover:text-white text-xs font-semibold"
                  >
                    ยกเลิก
                  </button>
                  <button
                    type="submit"
                    className="flex-1 px-4 py-2.5 rounded-xl bg-gradient-to-r from-spa-gold to-yellow-500 text-slate-950 font-bold text-xs"
                  >
                    {editingTemplate ? "บันทึกการแก้ไข" : "เพิ่มคอร์ส"}
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
