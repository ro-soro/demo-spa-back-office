// src/app/login/page.tsx
'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { motion } from 'framer-motion';
import { Key, Eye, EyeOff, AlertCircle, RotateCcw } from 'lucide-react';
import { IS_DEMO_MODE } from '@/utils/demoMode';
import { DEMO_PASSWORD } from '@/data/demoData';
import { resetDemoData } from '@/utils/db';

const loginSchema = z.object({
  username: z.string().min(1, 'กรุณากรอกชื่อผู้ใช้งานระบบ'),
  password: z.string().min(1, 'กรุณากรอกรหัสผ่าน'),
});

type LoginFormValues = z.infer<typeof loginSchema>;

interface DemoAccountHint {
  username: string;
  label: string;
  description: string;
}

// ปุ่มลัดบนกล่อง demo — username ต้องตรงกับ demoSystemUsers ใน src/data/demoData.ts
const DEMO_ACCOUNT_HINTS: DemoAccountHint[] = [
  { username: 'demo_super', label: 'Super Manager', description: 'ทุกเมนู + จัดการบัญชีผู้ใช้' },
  { username: 'demo_manager', label: 'Manager', description: 'ตั้งค่าร้าน ราคา คอร์ส และแก้ไขข้ามวันได้' },
  { username: 'demo_admin', label: 'Admin', description: 'คีย์งานของวันนี้ ดูแดชบอร์ดและเงินเดือน' }
];

export default function LoginPage() {
  const router = useRouter();
  const { login, currentUser, sessionExpiredMessage, clearSessionExpiredMessage } = useApp();
  const [showPassword, setShowPassword] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // ตรวจจับหากผู้ใช้งานล็อกอินอยู่แล้ว ให้ข้ามหน้าล็อกอินและเด้งไปแดชบอร์ดทันที
  useEffect(() => {
    if (currentUser) {
      router.replace('/');
    }
  }, [currentUser, router]);

  // แสดงข้อความแจ้งเตือนเมื่อระบบพาผู้ใช้มาหน้านี้เพราะเซสชันหมดอายุระหว่างใช้งาน (ไม่ใช่ผู้ใช้กด
  // ออกจากระบบเอง) — ยืมกล่องแจ้งเตือนสีแดงเดิมของ loginError มาใช้ซ้ำ (DRY ไม่สร้าง UI ซ้ำซ้อน) แล้วเคลียร์
  // ค่าใน context ทันทีหลังแสดง กันไม่ให้ข้อความค้างแสดงซ้ำถ้าผู้ใช้กลับมาหน้านี้อีกครั้งในภายหลัง
  useEffect(() => {
    if (sessionExpiredMessage) {
      // จำเป็นต้อง setState ตรงนี้ (Why): เป็นการ subscribe รับค่าจากระบบภายนอก (AppContext) มาสะท้อนใน
      // state ท้องถิ่นของหน้านี้ — pattern เดียวกับที่ src/components/MainLayout.tsx ใช้กับ `setMounted`
      /* eslint-disable-next-line react-hooks/set-state-in-effect */
      setLoginError(sessionExpiredMessage);
      clearSessionExpiredMessage();
    }
  }, [sessionExpiredMessage, clearSessionExpiredMessage]);

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors, isSubmitting },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { username: '', password: '' },
  });

  const fillDemoAccount = (username: string): void => {
    setLoginError(null);
    setValue('username', username, { shouldValidate: true });
    setValue('password', DEMO_PASSWORD, { shouldValidate: true });
  };

  // ล้างข้อมูลที่ผู้ทดลองใช้แก้ไขไว้ แล้วโหลดหน้าใหม่ให้ AppContext seed ข้อมูลตัวอย่างชุดเดิมกลับมา
  const handleResetDemoData = (): void => {
    resetDemoData();
    window.location.reload();
  };

  const onSubmit = async (data: LoginFormValues) => {
    setLoginError(null);
    // เพิ่มการดีเลย์จำลองการเรียก API ให้มีความไหลลื่น
    await new Promise((resolve) => setTimeout(resolve, 600));
    
    const success = await login(data.username, data.password);
    if (success) {
      router.replace('/');
    } else {
      setLoginError('ชื่อผู้ใช้งานหรือรหัสผ่านระบบไม่ถูกต้อง กรุณาลองใหม่อีกครั้ง');
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-950 text-slate-200 relative overflow-hidden font-body px-4 selection:bg-spa-gold selection:text-slate-900">
      
      {/* วงแหวนและแสงพื้นหลังสปาสไตล์พรีเมียม (Decorative background) */}
      <div className="absolute top-1/4 left-1/4 -translate-x-1/2 -translate-y-1/2 w-[350px] h-[350px] rounded-full bg-spa-teal/10 blur-[80px]" />
      <div className="absolute bottom-1/4 right-1/4 translate-x-1/2 translate-y-1/2 w-[350px] h-[350px] rounded-full bg-spa-gold/5 blur-[80px]" />

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', damping: 20, stiffness: 120 }}
        className="w-full max-w-md"
      >
        <div className="text-center mb-8">
          {/* โลโก้แบรนด์สปา */}
          <div className="inline-flex p-3 rounded-full bg-gradient-to-br from-spa-gold/20 to-transparent border border-spa-gold/30 mb-3 shadow-xl">
            <Key size={30} className="text-spa-gold" />
          </div>
          <h2 className="text-2xl font-bold font-display text-transparent bg-clip-text bg-gradient-to-r from-spa-gold to-yellow-500 tracking-wider">
            DEMO SPA
          </h2>
          <p className="text-[10px] uppercase tracking-widest text-slate-400 mt-1.5 font-semibold">
            ระบบบริหารจัดการหลังบ้านสปา
          </p>
        </div>

        {/* แผงฟอร์มสไตล์ Glassmorphism */}
        <div className="glass-modal p-8 rounded-3xl border border-white/10 shadow-2xl relative">
          <h3 className="text-sm font-bold text-slate-100 mb-6 border-b border-white/5 pb-3">
            กรุณาเข้าสู่ระบบเพื่อใช้งาน
          </h3>

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
            {/* ชื่อผู้ใช้งาน */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                ชื่อผู้ใช้งาน หรือ อีเมลระบบ *
              </label>
              <input
                type="text"
                placeholder="กรอกชื่อผู้ใช้งาน หรือ อีเมล"
                disabled={isSubmitting}
                {...register('username')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
              />
              {errors.username && (
                <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={10} />
                  {errors.username.message}
                </p>
              )}
            </div>

            {/* รหัสผ่าน */}
            <div>
              <label className="block text-xs font-semibold text-slate-400 mb-1.5">
                รหัสผ่านเข้าระบบ *
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  placeholder="กรอกรหัสผ่าน"
                  disabled={isSubmitting}
                  {...register('password')}
                  className="w-full pl-3.5 pr-10 py-2.5 rounded-xl bg-slate-950 border border-white/10 focus:border-spa-gold text-slate-200 outline-none text-xs transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-500 hover:text-slate-200 transition-colors"
                >
                  {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              {errors.password && (
                <p className="text-[10px] text-red-400 mt-1 flex items-center gap-1">
                  <AlertCircle size={10} />
                  {errors.password.message}
                </p>
              )}
            </div>

            {/* แสดงข้อผิดพลาดการ Login */}
            {loginError && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                className="p-3 rounded-xl bg-red-950/40 border border-red-900/30 text-red-400 text-[10px] leading-relaxed flex items-start gap-2.5"
              >
                <AlertCircle size={14} className="flex-shrink-0 mt-0.5" />
                <span>{loginError}</span>
              </motion.div>
            )}

            {/* ปุ่มล็อกอิน */}
            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full py-2.5 mt-2 rounded-xl bg-gradient-to-r from-spa-gold to-yellow-600 hover:from-spa-gold hover:to-yellow-500 text-slate-950 font-bold text-xs tracking-wider uppercase transition-all shadow-lg active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? 'กำลังเข้าสู่ระบบ...' : 'เข้าสู่ระบบ'}
            </button>
          </form>
        </div>

        {/* กล่องบัญชีทดลองใช้ — แสดงเฉพาะเมื่อเปิด NEXT_PUBLIC_DEMO_MODE=true (บนเว็บ demo สาธารณะเท่านั้น) */}
        {IS_DEMO_MODE && (
          <div className="mt-6 p-4 rounded-2xl bg-slate-950/50 border border-spa-gold/20 text-[11px] text-slate-400">
            <p className="font-semibold text-spa-gold mb-1 text-xs">บัญชีทดลองใช้ (Demo)</p>
            <p className="mb-3 leading-relaxed">
              ข้อมูลทั้งหมดเป็นข้อมูลสมมติและเก็บอยู่ในเบราว์เซอร์ของคุณเท่านั้น ลองเพิ่ม/แก้ไขได้เต็มที่
              (รหัสผ่านทุกบัญชี: <span className="font-mono text-slate-200">{DEMO_PASSWORD}</span>)
            </p>
            <ul className="space-y-1.5">
              {DEMO_ACCOUNT_HINTS.map((account) => (
                <li key={account.username}>
                  <button
                    type="button"
                    onClick={() => fillDemoAccount(account.username)}
                    disabled={isSubmitting}
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-slate-900/70 border border-white/5 hover:border-spa-gold/40 text-left transition-colors disabled:opacity-50"
                  >
                    <span>
                      <span className="block font-semibold text-slate-200">{account.label}</span>
                      <span className="block text-[10px] text-slate-500">{account.description}</span>
                    </span>
                    <span className="font-mono text-spa-gold">{account.username}</span>
                  </button>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={handleResetDemoData}
              className="mt-3 inline-flex items-center gap-1.5 text-[10px] text-slate-500 hover:text-slate-200 transition-colors"
            >
              <RotateCcw size={11} />
              รีเซ็ตข้อมูลตัวอย่าง
            </button>
          </div>
        )}
      </motion.div>
    </div>
  );
}
