// src/app/users/page.tsx
// คำอธิบายเหตุผลของดีไซน์ใหม่ (Why):
// 1. หน้าจัดการบัญชีระบบจำลองสำหรับ Super Manager จัดการสิทธิ์การเข้าใช้งานระบบและรหัสผ่าน
// 2. เปลี่ยนจากการเชื่อมโยงหมอนวด (linkedTherapistName) เป็นชื่อแสดงตัวตนผู้ใช้ในระบบ (displayName)
//    และเพิ่มช่องกรอก "ชื่อ-นามสกุลจริง" (fullName) เพื่อนำไปแสดงในแถบ header ป้องกันความซ้ำซ้อนกับป้ายบทบาท
// 3. เพิ่มการกรอกและแก้ไขรหัสผ่าน (Password) โดยสำหรับผู้ใช้ใหม่จะต้องกำหนดรหัสผ่านเสมอ (ไม่ต่ำกว่า 6 ตัว)
//    ส่วนการแก้ไขผู้ใช้เดิม สามารถเว้นว่างรหัสผ่านเพื่อไม่เปลี่ยนได้
// 4. รักษาการป้องกันปัญหา Self-Lockout (ห้ามลบบัญชีตัวเอง, ห้ามลบ Super Manager บัญชีสุดท้าย)

'use client';

import React, { useState } from 'react';
import { useApp } from '@/context/AppContext';
import { SystemUser } from '@/data/initialData';
import { motion, AnimatePresence } from 'framer-motion';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Plus,
  Edit2,
  Trash2,
  Check,
  X,
  Key,
  UserCheck,
  AlertCircle
} from 'lucide-react';

// Zod Schema สำหรับฟอร์มบัญชีผู้ใช้ระบบ
const systemUserSchema = z.object({
  username: z.string().min(1, 'กรุณากรอกชื่อผู้ใช้งานระบบ'),
  role: z.enum(['admin', 'manager', 'super-manager'], { message: 'กรุณาเลือกระดับสิทธิ์' }),
  displayName: z.string().min(1, 'กรุณากรอกชื่อแสดงผลในระบบ'),
  fullName: z.string().min(1, 'กรุณากรอกชื่อ-นามสกุลจริง'),
  password: z.string().optional()
});

type SystemUserFormValues = z.infer<typeof systemUserSchema>;

export default function UsersPage() {
  const {
    systemUsers,
    addOrUpdateSystemUser,
    removeSystemUser,
    currentUser
  } = useApp();

  // สถานะเปิด/ปิด Modal
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingUser, setEditingUser] = useState<SystemUser | null>(null);

  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors }
  } = useForm<SystemUserFormValues>({
    resolver: zodResolver(systemUserSchema),
    defaultValues: { username: '', role: 'admin', displayName: '', fullName: '', password: '' }
  });

  // เปิดแบบฟอร์มเพื่อสร้างใหม่
  const handleOpenAddModal = () => {
    setEditingUser(null);
    reset({ username: '', role: 'admin', displayName: '', fullName: '', password: '' });
    setIsModalOpen(true);
  };

  // เปิดแบบฟอร์มเพื่อแก้ไข
  const handleOpenEditModal = (user: SystemUser) => {
    setEditingUser(user);
    reset({
      username: user.username,
      role: user.role,
      displayName: user.displayName,
      fullName: user.fullName || '',
      password: ''
    });
    setIsModalOpen(true);
  };

  // ลบบัญชีผู้ใช้งานระบบ
  const handleDeleteUser = (username: string) => {
    if (currentUser && currentUser.username === username) {
      alert('คุณไม่สามารถลบบัญชีผู้ใช้ที่คุณกำลังเข้าใช้งานอยู่ในปัจจุบันได้');
      return;
    }

    const superManagers = systemUsers.filter(u => u.role === 'super-manager');
    const targetUser = systemUsers.find(u => u.username === username);

    if (targetUser?.role === 'super-manager' && superManagers.length <= 1) {
      alert('ระบบถูกบล็อก! คุณไม่สามารถลบบัญชี Super Manager บัญชีสุดท้ายของระบบได้ เพราะจะทำให้ระบบไม่เหลือผู้ดูแลระดับสูงสุด');
      return;
    }

    if (confirm(`คุณต้องการลบบัญชีผู้ใช้งานระบบ "${username}" ใช่หรือไม่?`)) {
      removeSystemUser(username);
    }
  };

  // กดส่งฟอร์มบัญชีผู้ใช้
  const onSubmit = (data: SystemUserFormValues) => {
    // 1. ตรวจสอบชื่อผู้ใช้ซ้ำเมื่อสร้างบัญชีใหม่
    if (!editingUser) {
      const isExist = systemUsers.some(
        (u) => u.username.toLowerCase() === data.username.trim().toLowerCase()
      );
      if (isExist) {
        setError('username', { message: 'ชื่อผู้ใช้งานนี้มีอยู่ในระบบแล้ว กรุณาเลือกใช้ชื่ออื่น' });
        return;
      }

      // บังคับกรอกรหัสผ่านสำหรับบัญชีใหม่
      if (!data.password || data.password.length < 6) {
        setError('password', { message: 'กรุณากรอกรหัสผ่านอย่างน้อย 6 ตัวอักษรสำหรับบัญชีใหม่' });
        return;
      }
    }

    // 2. ตรวจสอบเงื่อนไขรหัสผ่านเมื่อต้องการเปลี่ยนรหัสผ่านใหม่
    if (data.password && data.password.length < 6) {
      setError('password', { message: 'รหัสผ่านใหม่ต้องมีอย่างน้อย 6 ตัวอักษร' });
      return;
    }

    const userData: SystemUser = {
      username: data.username.trim(),
      role: data.role,
      displayName: data.displayName.trim(),
      fullName: data.fullName.trim()
    };

    if (data.password) {
      userData.password = data.password;
    } else if (editingUser) {
      // ดึงรหัสผ่านเก่าหากผู้ใช้ไม่ได้พิมพ์เปลี่ยนรหัสผ่าน
      userData.password = editingUser.password;
    }

    addOrUpdateSystemUser(userData);
    setIsModalOpen(false);
  };

  return (
    <div className="flex flex-col gap-6">

      {/* ส่วนควบคุมและปุ่มสร้างบัญชี */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-lg flex items-center justify-between">
        <div>
          <h3 className="text-sm font-semibold tracking-wider uppercase text-spa-gold flex items-center gap-2">
            <Key size={18} />
            <span>จัดการสิทธิ์การเข้าใช้และบัญชีระบบ</span>
          </h3>
          <p className="text-[10px] text-slate-400 mt-1">คีย์ชื่อล็อกอิน กำหนดระดับสิทธิ์ รหัสผ่าน และชื่อแสดงผลตัวตนในระบบ</p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2 rounded-xl bg-gradient-to-r from-spa-teal to-teal-600 text-white text-xs font-semibold tracking-wide flex items-center gap-1.5 active:scale-95 transition-transform"
        >
          <Plus size={14} />
          <span>สร้างบัญชีผู้ใช้ใหม่</span>
        </button>
      </div>

      {/* ตารางรายชื่อบัญชีระบบ */}
      <div className="glass-panel p-6 rounded-2xl border border-white/5 shadow-xl">
        <div className="table-container border border-white/5 rounded-xl overflow-hidden">
          <table className="custom-table w-full">
            <thead>
              <tr className="bg-slate-950/60 border-b border-white/5">
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">ชื่อผู้ใช้งาน (Username)</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">ระดับสิทธิ์ (Role)</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">ชื่อแสดงตัวตน (Display Name)</th>
                <th className="px-5 py-4 text-left text-xs font-semibold text-slate-400 uppercase tracking-wider">ชื่อ-นามสกุลจริง</th>
                <th className="px-5 py-4 text-center text-xs font-semibold text-slate-400 uppercase tracking-wider" style={{ width: '100px' }}>จัดการ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {systemUsers.map((user) => (
                <tr key={user.username} className="hover:bg-white/5 transition-colors">
                  <td className="px-5 py-4 text-sm font-bold text-slate-200">
                    <span className="flex items-center gap-2.5">
                      <UserCheck size={16} className="text-spa-teal" />
                      <span>{user.username}</span>
                    </span>
                  </td>
                  <td className="px-5 py-4 text-xs">
                    {user.role === 'super-manager' && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-red-950/40 text-red-400 border border-red-900/60">Super Manager</span>}
                    {user.role === 'manager' && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-950/40 text-spa-gold border border-amber-900/60">Manager</span>}
                    {user.role === 'admin' && <span className="px-2 py-0.5 rounded-md text-[10px] font-bold bg-teal-950/40 text-teal-400 border border-teal-900/60">Admin</span>}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">
                    {user.displayName}
                  </td>
                  <td className="px-5 py-4 text-sm text-slate-300">
                    {user.fullName}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex justify-center gap-1.5">
                      <button
                        onClick={() => handleOpenEditModal(user)}
                        className="p-2 rounded-lg bg-slate-900 border border-white/5 text-amber-400 hover:text-white hover:border-amber-400 active:scale-90 transition-all"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        onClick={() => handleDeleteUser(user.username)}
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

      {/* Modal สำหรับ เพิ่ม/แก้ไข สิทธิ์ผู้ใช้ระบบ */}
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
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className="glass-modal w-full max-w-sm p-6 rounded-2xl border border-spa-gold/30 shadow-2xl relative z-10"
            >
              <div className="flex items-center justify-between mb-5 pb-2.5 border-b border-white/5">
                <h3 className="text-md font-bold text-spa-gold flex items-center gap-2">
                  <Key size={18} />
                  <span>{editingUser ? 'แก้ไขระดับสิทธิ์ผู้ใช้' : 'สร้างบัญชีผู้ใช้งานเข้าระบบใหม่'}</span>
                </h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                {/* ชื่อผู้ใช้งาน */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">ชื่อผู้ใช้งานเข้าระบบ (Username) *</label>
                  <input
                    type="text"
                    placeholder="เช่น admin_user, manager_user"
                    {...register('username')}
                    disabled={!!editingUser}
                    className={`w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 text-slate-200 outline-none text-xs ${
                      editingUser ? 'text-slate-500 bg-slate-900/60 border-white/5 cursor-not-allowed' : 'focus:border-spa-gold'
                    }`}
                  />
                  {errors.username && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />{errors.username.message}
                    </p>
                  )}
                </div>

                {/* เลือกระดับสิทธิ์ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">ระดับสิทธิ์การเข้าถึงระบบ *</label>
                  <select
                    {...register('role')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs glass-select"
                  >
                    <option value="admin">Admin (พนักงานทั่วไป)</option>
                    <option value="manager">Manager (ผู้จัดการ)</option>
                    <option value="super-manager">Super Manager (ผู้จัดการสูงสุด)</option>
                  </select>
                </div>

                {/* ชื่อแสดงผลระบบ */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">ชื่อแสดงตัวตนในระบบ (Display Name) *</label>
                  <input
                    type="text"
                    placeholder="เช่น Admin User, Manager User, Super Manager"
                    {...register('displayName')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                  {errors.displayName && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />{errors.displayName.message}
                    </p>
                  )}
                </div>

                {/* ชื่อ-นามสกุลจริง */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">ชื่อ-นามสกุลจริง *</label>
                  <input
                    type="text"
                    placeholder="เช่น วิชัย เก่งงาน"
                    {...register('fullName')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                  {errors.fullName && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />{errors.fullName.message}
                    </p>
                  )}
                </div>

                {/* กำหนดรหัสผ่าน */}
                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                    {editingUser ? 'รหัสผ่านใหม่ (เว้นว่างไว้เพื่อไม่ต้องการเปลี่ยน)' : 'รหัสผ่านเข้าระบบ *'}
                  </label>
                  <input
                    type="password"
                    placeholder={editingUser ? 'รหัสผ่านใหม่ (ไม่ต่ำกว่า 6 ตัว)' : 'กำหนดรหัสผ่าน (ไม่ต่ำกว่า 6 ตัว)'}
                    {...register('password')}
                    className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs"
                  />
                  {errors.password && (
                    <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                      <AlertCircle size={10} />{errors.password.message}
                    </p>
                  )}
                </div>

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
                    <span>บันทึกบัญชีผู้ใช้</span>
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
