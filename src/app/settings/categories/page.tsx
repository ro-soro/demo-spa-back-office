// src/app/settings/categories/page.tsx
// หน้าจัดการหมวดหมู่บริการนวดและสปา (Master Data — สำหรับ Manager ขึ้นไป)

'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { ServiceCategory } from '@/data/initialData';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Plus, Edit2, Trash2, X, Layers, AlertCircle, ShieldAlert } from 'lucide-react';

// ตัวเลือกสีป้ายหมวดหมู่
const COLOR_OPTIONS: { value: string; label: string; previewClass: string }[] = [
  { value: 'teal',   label: 'เขียวมรกต', previewClass: 'bg-teal-900/40 text-teal-300 border-teal-800/60'        },
  { value: 'gold',   label: 'ทอง',       previewClass: 'bg-amber-900/40 text-amber-300 border-amber-800/60'      },
  { value: 'rose',   label: 'ชมพู',      previewClass: 'bg-rose-900/40 text-rose-300 border-rose-800/60'         },
  { value: 'violet', label: 'ม่วง',      previewClass: 'bg-violet-900/40 text-violet-300 border-violet-800/60'   },
  { value: 'amber',  label: 'ส้มทอง',    previewClass: 'bg-amber-950/50 text-amber-400 border-amber-900/60'      },
  { value: 'sky',    label: 'ฟ้า',       previewClass: 'bg-sky-900/40 text-sky-300 border-sky-800/60'            },
];

// ดึง Tailwind class สำหรับแสดงป้ายหมวดหมู่
function getCategoryBadgeClass(colorClass: string): string {
  const found = COLOR_OPTIONS.find((c) => c.value === colorClass);
  return found?.previewClass ?? 'bg-slate-800/60 text-slate-300 border-slate-700/60';
}

// สร้าง id หมวดหมู่ใหม่ — เหตุผล (Why) ที่แยกออกมาเป็นฟังก์ชันนอก component:
// เดิมเรียก Date.now() แทรกอยู่กลาง onSubmit ซึ่งอยู่ใน scope ของ component ทำให้ React Compiler มองว่า
// เป็นการเรียกฟังก์ชัน impure ระหว่างวิเคราะห์ความ pure ของ component/hook (แม้จริงๆ จะถูกเรียกเฉพาะตอน submit
// ฟอร์มเท่านั้น ไม่ใช่ตอน render ก็ตาม) ย้ายมาไว้เป็นฟังก์ชันระดับโมดูล (นอก component) ทำให้ compiler ไม่นับรวม
// อยู่ใน purity check ของ component อีกต่อไป พฤติกรรมการสร้าง id ยังเหมือนเดิมทุกประการ
function generateCategoryId(): string {
  return 'cat_' + Date.now();
}

// Zod Schema
const categorySchema = z.object({
  name: z.string().min(1, 'กรุณากรอกชื่อหมวดหมู่').max(30, 'ชื่อยาวเกินไป'),
  description: z.string().max(80, 'คำอธิบายยาวเกินไป').optional(),
  colorClass: z.string().min(1, 'กรุณาเลือกสีป้าย')
});

type CategoryFormValues = z.infer<typeof categorySchema>;

export default function SettingsCategoriesPage() {
  const { currentRole, serviceCategories, services, addOrUpdateServiceCategory, removeServiceCategory } = useApp();
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<ServiceCategory | null>(null);

  const { register, handleSubmit, control, reset, formState: { errors } } = useForm<CategoryFormValues>({
    resolver: zodResolver(categorySchema),
    defaultValues: { name: '', description: '', colorClass: 'teal' }
  });

  // ใช้ useWatch แทน watch() ตรงๆ — เหตุผล (Why): watch() คืนฟังก์ชันที่ React Compiler ไม่สามารถยืนยันได้ว่า
  // ปลอดภัยต่อการ memoize ทำให้ compiler ข้ามการ memoize ทั้ง component ไปเลย useWatch เป็น hook ที่ subscribe
  // แบบ reactive ตรงไปตรงมา ทำให้ compiler วิเคราะห์ dependency ได้ถูกต้อง พฤติกรรม sync สีตัวอย่างยังเหมือนเดิมทุกประการ
  const selectedColor = useWatch({ control, name: 'colorClass', defaultValue: 'teal' });
  const previewName = useWatch({ control, name: 'name' });

  // Guard: เฉพาะ Manager ขึ้นไป
  if (currentRole === 'admin') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4">
        <ShieldAlert size={48} className="text-red-400" />
        <p className="text-sm text-slate-400">สิทธิ์ไม่เพียงพอ — เฉพาะ Manager ขึ้นไปเท่านั้น</p>
      </div>
    );
  }

  const handleOpenAdd = () => {
    setEditingCategory(null);
    reset({ name: '', description: '', colorClass: 'teal' });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (cat: ServiceCategory) => {
    setEditingCategory(cat);
    reset({ name: cat.name, description: cat.description, colorClass: cat.colorClass });
    setIsModalOpen(true);
  };

  const handleDelete = (cat: ServiceCategory) => {
    const isUsedInServices = services.some((s) => s.category === cat.name);
    if (isUsedInServices) {
      alert('ไม่สามารถลบ "' + cat.name + '" ได้\nยังมีรายการบริการใช้หมวดหมู่นี้อยู่ กรุณาแก้ไขรายการบริการก่อน');
      return;
    }
    if (confirm('ยืนยันการลบหมวดหมู่ "' + cat.name + '" ?')) {
      removeServiceCategory(cat.id);
    }
  };

  const onSubmit = (data: CategoryFormValues) => {
    const categoryData: ServiceCategory = {
      id: editingCategory?.id ?? generateCategoryId(),
      name: data.name,
      description: data.description ?? '',
      colorClass: data.colorClass
    };
    addOrUpdateServiceCategory(categoryData);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="glass-panel p-5 rounded-2xl border border-white/5 shadow-lg flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-spa-gold flex items-center gap-2">
            <Layers size={18} />
            จัดการหมวดหมู่บริการและสปา
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Master Data สำหรับจัดกลุ่มเมนูบริการ — ใช้กรอง Dropdown ในหน้าบันทึกงานนวด
          </p>
        </div>
        <button
          onClick={handleOpenAdd}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-teal to-teal-600 text-white font-semibold text-xs flex items-center gap-2 active:scale-95 transition-transform w-full md:w-auto justify-center"
        >
          <Plus size={16} />
          <span>เพิ่มหมวดหมู่ใหม่</span>
        </button>
      </div>

      {/* ตารางหมวดหมู่ */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">ชื่อหมวดหมู่</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider hidden sm:table-cell">คำอธิบาย</th>
                <th className="px-5 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider">บริการที่ใช้</th>
                <th className="px-5 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider w-24">จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {serviceCategories.length === 0 ? (
                <tr>
                  <td colSpan={4} className="text-center text-xs text-slate-500 py-12">
                    ยังไม่มีหมวดหมู่ในระบบ กดปุ่มด้านบนเพื่อเพิ่ม
                  </td>
                </tr>
              ) : (
                serviceCategories.map((cat) => {
                  const usedCount = services.filter((s) => s.category === cat.name).length;
                  return (
                    <tr key={cat.id} className="hover:bg-white/5 transition-colors">
                      <td className="px-5 py-4 text-xs">
                        <span className={'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ' + getCategoryBadgeClass(cat.colorClass)}>
                          {cat.name}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-xs text-slate-400 hidden sm:table-cell">
                        {cat.description || <span className="text-slate-600 italic">ไม่มีคำอธิบาย</span>}
                      </td>
                      <td className="px-5 py-4 text-center text-xs">
                        {usedCount > 0
                          ? <span className="px-2 py-0.5 rounded bg-teal-950/40 text-teal-400 border border-teal-900/60">{usedCount} รายการ</span>
                          : <span className="text-slate-600">—</span>
                        }
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex justify-center gap-1.5">
                          <button onClick={() => handleOpenEdit(cat)} className="p-2 rounded-lg bg-slate-900 border border-white/5 text-amber-400 hover:border-amber-400 active:scale-90 transition-all" title="แก้ไข">
                            <Edit2 size={13} />
                          </button>
                          <button onClick={() => handleDelete(cat)} className="p-2 rounded-lg bg-slate-900 border border-white/5 text-red-400 hover:border-red-400 active:scale-90 transition-all" title="ลบ">
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }} animate={{ opacity: 0.6 }} exit={{ opacity: 0 }}
              onClick={() => setIsModalOpen(false)}
              className="absolute inset-0 bg-black/80 backdrop-blur-sm"
            />
            <motion.div
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="glass-modal w-full max-w-sm p-6 rounded-2xl border border-spa-gold/30 shadow-2xl relative z-10"
            >
              <div className="flex items-center justify-between mb-5 pb-2.5 border-b border-white/5">
                <h3 className="text-sm font-bold text-spa-gold flex items-center gap-2">
                  <Layers size={16} />
                  {editingCategory ? 'แก้ไขหมวดหมู่' : 'เพิ่มหมวดหมู่ใหม่'}
                </h3>
                <button onClick={() => setIsModalOpen(false)} className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white">
                  <X size={18} />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">ชื่อหมวดหมู่ *</label>
                  <input
                    {...register('name')}
                    placeholder="เช่น นวดแผนไทย, สปาหน้า"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
                  />
                  {errors.name && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />{errors.name.message}
                    </p>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">คำอธิบาย (ไม่บังคับ)</label>
                  <input
                    {...register('description')}
                    placeholder="คำอธิบายสั้นๆ เกี่ยวกับหมวดหมู่นี้"
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-2">สีป้ายหมวดหมู่ *</label>
                  <div className="grid grid-cols-3 gap-2">
                    {COLOR_OPTIONS.map((color) => (
                      <label
                        key={color.value}
                        className={
                          'flex items-center justify-center cursor-pointer px-2 py-2 rounded-lg border text-[10px] font-semibold transition-all ' +
                          color.previewClass +
                          (selectedColor === color.value ? ' ring-2 ring-spa-gold' : ' opacity-60 hover:opacity-100')
                        }
                      >
                        <input {...register('colorClass')} type="radio" value={color.value} className="sr-only" />
                        {color.label}
                      </label>
                    ))}
                  </div>
                </div>

                {/* ตัวอย่างป้าย */}
                <div className="py-2">
                  <p className="text-[10px] text-slate-500 mb-2">ตัวอย่างป้าย:</p>
                  <span className={'inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ' + getCategoryBadgeClass(selectedColor)}>
                    {previewName || 'ชื่อหมวดหมู่'}
                  </span>
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
                    {editingCategory ? 'บันทึกการแก้ไข' : 'เพิ่มหมวดหมู่'}
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
