// src/components/MainLayout.tsx
// คำอธิบายเหตุผลของโครงสร้างดีไซน์ใหม่ (Why):
// 1. นำ Framer Motion เข้ามาจัดการอนิเมชันตอนย่อ/ขยาย Sidebar และการเด้งป๊อปอัปสลับสิทธิ์ผู้ใช้
//    เพื่อให้การเปลี่ยนสภาพเลย์เอาต์บนหน้าจอดูไหลลื่นและสัมผัสพรีเมียมเป็นธรรมชาติ
// 2. ใช้ Tailwind CSS ในการทำกริดและควบคุมการตอบสนองหน้าจอ (Responsive Flex/Grid) 
//    ทดแทน CSS Variables เดิม ทำให้จัดระยะขอบ padding และการย่อหดเลย์เอาต์สอดคล้องกันทุกความละเอียดหน้าจอ
// 3. ปรับโครงสร้างส่วนโมบายล์ให้เป็นเมนูลิ้นชักสไลด์ (Sliding Drawer) ร่วมกับ Bottom Bar 
//    เพื่อไม่ให้เกิดการทับซ้อนของข้อความตามปัญหาที่พบในภาพแคปเจอร์เดิม

'use client';

import React, { useState, useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useApp } from '@/context/AppContext';
import { LoadingSpinner } from '@/components/LoadingSpinner';
import { motion, AnimatePresence } from 'framer-motion';
import {
  LayoutDashboard,
  CalendarRange,
  Settings,
  Users,
  Award,
  CircleUser,
  Menu,
  TrendingUp,
  Key,
  ChevronLeft,
  ChevronRight,
  ChevronDown,
  X,
  ShieldAlert,
  Layers,
  BookOpen,
  LogOut
} from 'lucide-react';

interface NavItem {
  name: string;
  path: string;
  icon: React.ReactNode;
  minRole: 'admin' | 'manager' | 'super-manager';
}

export const MainLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const pathname = usePathname();
  const router = useRouter();
  const { currentRole, currentUser, systemUsers, switchUser, logout, isLoading, isInitialLoading } = useApp();
  
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const [isSwitcherOpen, setIsSwitcherOpen] = useState(false);
  // เปิด/ปิด Accordion เมนูย่อยตั้งค่าร้าน
  const [isSettingsOpen, setIsSettingsOpen] = useState(
    pathname.startsWith('/settings')
  );

  // รายการเมนูหลักและการจำกัดสิทธิ์
  const navItems: NavItem[] = [
    {
      name: 'แดชบอร์ด',
      path: '/',
      icon: <LayoutDashboard size={20} />,
      minRole: 'admin'
    },
    {
      name: 'บันทึกงานนวด',
      path: '/bookings',
      icon: <CalendarRange size={20} />,
      minRole: 'admin'
    },
    {
      name: 'บันทึกขายคอร์ส',
      path: '/courses',
      icon: <TrendingUp size={20} />,
      minRole: 'admin'
    },
    {
      name: 'สรุปเงินเดือน',
      path: '/payroll',
      icon: <Award size={20} />,
      minRole: 'admin'
    },
    {
      name: 'บัญชีระบบ',
      path: '/users',
      icon: <Users size={20} />,
      minRole: 'super-manager'
    }
  ];

  // เมนูย่อยตั้งค่าร้าน (เฉพาะ Manager ขึ้นไป)
  const settingsSubItems = [
    { name: 'ตั้งค่าร้านทั่วไป', path: '/settings',            icon: <Settings size={16} />  },
    { name: 'จัดการหมวดหมู่',       path: '/settings/categories',  icon: <Layers size={16} />    },
    { name: 'จัดการคอร์สสปา',         path: '/settings/courses',      icon: <BookOpen size={16} />   },
  ];

  // ตรวจสอบระดับการเข้าถึง
  const hasAccess = (itemRole: 'admin' | 'manager' | 'super-manager'): boolean => {
    if (currentRole === 'super-manager') return true;
    if (currentRole === 'manager') return itemRole !== 'super-manager';
    return itemRole === 'admin';
  };

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    /* eslint-disable-next-line react-hooks/set-state-in-effect */
    setMounted(true);
  }, []);

  // ดักจับระบบเพื่อทำ Route Guard (หากผู้ใช้ไม่ได้ล็อกอิน ให้เปลี่ยนเส้นทางไปหน้า Login ทันที)
  // ใช้ isInitialLoading (ไม่ใช่ isLoading) เพราะ guard นี้ต้องรอเฉพาะตอนโหลดเซสชันครั้งแรกเท่านั้น
  // ไม่ควรถูกกระทบทุกครั้งที่มีการบันทึกข้อมูล CRUD ทั่วไประหว่างใช้งาน
  useEffect(() => {
    if (mounted && !isInitialLoading) {
      if (!currentUser && pathname !== '/login') {
        router.replace('/login');
      }
    }
  }, [currentUser, pathname, mounted, isInitialLoading, router]);

  const currentActiveItem = navItems.find(item => item.path === pathname);
  const unauthorized = currentActiveItem && !hasAccess(currentActiveItem.minRole);

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'super-manager':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-red-950/60 text-red-400 border border-red-800">Super Manager</span>;
      case 'manager':
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-amber-950/60 text-amber-400 border border-amber-800/80">Manager</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold rounded-full bg-teal-950/60 text-teal-400 border border-teal-800/80">Admin</span>;
    }
  };

  if (!mounted || isInitialLoading) {
    return <LoadingSpinner label="กำลังโหลดระบบ..." fullScreen />;
  }

  // หากอยู่หน้าล็อกอิน ให้เรนเดอร์เนื้อหาเพจเดี่ยวๆ โดยไม่มี Sidebar/Layout ซ้อนทับ
  if (pathname === '/login') {
    return <>{children}</>;
  }

  // หากไม่ได้ล็อกอินและกำลังถูกเปลี่ยนเส้นทาง ให้ค้างหน้ารอความปลอดภัยไว้ ป้องกันการสั่นของหน้าจอ
  if (!currentUser && pathname !== '/login') {
    return <LoadingSpinner label="กำลังโหลดระบบความปลอดภัย..." fullScreen />;
  }

  return (
    <div className="min-h-screen md:h-screen md:overflow-hidden flex flex-col bg-slate-950 text-slate-100 overflow-x-hidden font-body selection:bg-spa-gold selection:text-slate-900">
      
      {/* 1. Mobile Bottom Bar + Mobile Header */}
      <div className="md:hidden no-print fixed top-0 left-0 right-0 z-40 h-16 glass-panel px-4 flex items-center justify-between">
        <div className="flex flex-col">
          <h1 className="text-base font-bold font-display text-spa-gold tracking-wide">Demo Spa</h1>
          <p className="text-[10px] text-slate-400">Thai massage & Spa</p>
        </div>
        
        <div className="flex items-center gap-2">
          <button 
            onClick={() => setIsSwitcherOpen(true)}
            className="p-2 rounded-lg bg-slate-900/60 border border-white/5 text-spa-gold active:scale-95 transition-transform"
            title="สลับผู้ใช้จำลอง"
          >
            <Key size={18} />
          </button>
          <button 
            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
            className="p-2 rounded-lg bg-slate-900/60 border border-white/5 text-slate-300 active:scale-95 transition-transform"
          >
            <Menu size={18} />
          </button>
        </div>
      </div>

      {/* Mobile Nav Drawer (อนิเมชันลิ้นชักด้านข้างสำหรับมือถือ) */}
      <AnimatePresence>
        {isMobileMenuOpen && (
          <>
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsMobileMenuOpen(false)}
              className="fixed inset-0 z-45 bg-black no-print md:hidden"
            />
            <motion.div 
              initial={{ x: '100%' }}
              animate={{ x: 0 }}
              exit={{ x: '100%' }}
              transition={{ type: 'tween', duration: 0.3, ease: 'easeInOut' }}
              className="fixed top-0 right-0 bottom-0 z-50 w-72 glass-modal p-6 flex flex-col no-print md:hidden"
            >
              <div className="flex items-center justify-between mb-8">
                <span className="text-sm font-bold text-spa-gold">เมนูนำทาง</span>
                <button 
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"
                >
                  <X size={20} />
                </button>
              </div>

              <div className="flex flex-col gap-2 flex-1">
                {navItems.map((item) => {
                  const active = pathname === item.path;
                  const allowed = hasAccess(item.minRole);
                  if (!allowed) return null;

                  return (
                    <button
                      key={item.path}
                      onClick={() => {
                        router.push(item.path);
                        setIsMobileMenuOpen(false);
                      }}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left ${
                        active 
                          ? 'bg-gradient-to-r from-spa-gold/10 to-transparent border-l-2 border-spa-gold text-spa-gold font-semibold' 
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                    >
                      {item.icon}
                      <span className="text-sm">{item.name}</span>
                    </button>
                  );
                })}

                {/* Accordion: ตั้งค่าร้าน (เฉพาะ Manager ขึ้นไป) */}
                {hasAccess('manager') && (
                  <div>
                    <button
                      onClick={() => setIsSettingsOpen(!isSettingsOpen)}
                      className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-left w-full ${
                        pathname.startsWith('/settings')
                          ? 'text-spa-gold font-semibold'
                          : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                      }`}
                    >
                      <Settings size={20} />
                      <span className="text-sm flex-1">ตั้งค่าร้าน</span>
                      <ChevronDown
                        size={14}
                        className={`transition-transform duration-200 ${
                          isSettingsOpen ? 'rotate-180' : ''
                        }`}
                      />
                    </button>
                    <AnimatePresence initial={false}>
                      {isSettingsOpen && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.2 }}
                          className="overflow-hidden ml-4 pl-3 border-l border-white/10 flex flex-col gap-1 mt-1"
                        >
                          {settingsSubItems.map((sub) => (
                            <button
                              key={sub.path}
                              onClick={() => {
                                router.push(sub.path);
                                setIsMobileMenuOpen(false);
                              }}
                              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-left ${
                                pathname === sub.path
                                  ? 'bg-spa-gold/10 text-spa-gold font-semibold'
                                  : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                              }`}
                            >
                              {sub.icon}
                              <span className="text-xs">{sub.name}</span>
                            </button>
                          ))}
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
              </div>

              {currentUser && (
                <div className="mt-auto flex flex-col gap-2">
                  <div className="glass-panel p-4 rounded-xl border border-white/5 flex items-center gap-3">
                    <CircleUser size={28} className="text-slate-400" />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-semibold truncate">
                        {currentUser.displayName}
                      </p>
                      <div className="mt-1 flex">{getRoleBadge(currentUser.role)}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      logout();
                      setIsMobileMenuOpen(false);
                    }}
                    className="w-full py-2.5 rounded-xl bg-red-950/40 hover:bg-red-900/40 border border-red-900/30 text-red-400 text-xs font-semibold text-center transition-colors active:scale-95"
                  >
                    ออกจากระบบ
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      <div className="flex flex-1 pt-16 md:pt-0 min-h-screen md:h-screen md:overflow-hidden">

        {/* 2. Desktop Collapsible Sidebar (Sidebar สไลด์หดขยาย) */}
        {/* หมายเหตุ: ต้องล็อกความสูงเท่าจอ (md:h-screen) มิเช่นนั้นหน้าที่เนื้อหายาว (แดชบอร์ด/ตั้งค่าร้าน)
            จะดันทั้งหน้ารวมถึง Sidebar ให้สูงเกินจอ ทำให้ปุ่ม Logout ท้าย Sidebar ตกไปอยู่นอกวิวพอร์ต
            ต้องเลื่อนลงสุดหน้าเว็บถึงจะเห็น ซึ่งผู้ใช้เข้าใจผิดว่าปุ่มหายไป */}
        <motion.aside
          animate={{ width: isSidebarOpen ? 260 : 78 }}
          transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
          className="hidden md:flex flex-col border-r border-white/5 bg-slate-900/40 backdrop-blur-xl relative no-print flex-shrink-0 md:h-screen"
        >
          {/* หัวข้อ Sidebar */}
          <div className="h-20 flex items-center justify-between px-5 border-b border-white/5">
            {isSidebarOpen ? (
              <motion.div 
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col"
              >
                <h1 className="text-lg font-bold font-display text-spa-gold tracking-wider">Demo Spa</h1>
                <p className="text-[10px] text-slate-500 tracking-tight">Thai massage & Spa</p>
              </motion.div>
            ) : (
              <span className="text-xl font-bold font-display text-spa-gold mx-auto">T</span>
            )}
            
            {/* ปุ่มย่อหด */}
            {isSidebarOpen && (
              <button 
                onClick={() => setIsSidebarOpen(false)}
                className="p-1 rounded-lg hover:bg-white/5 text-slate-400 hover:text-white"
              >
                <ChevronLeft size={16} />
              </button>
            )}
          </div>

          {!isSidebarOpen && (
            <button 
              onClick={() => setIsSidebarOpen(true)}
              className="absolute top-7 -right-3 z-30 p-1 rounded-full bg-slate-900 border border-white/10 hover:border-spa-gold text-spa-gold active:scale-90 transition-transform"
            >
              <ChevronRight size={12} />
            </button>
          )}

          {/* รายการลิงก์ Sidebar — เลื่อนได้อิสระภายในตัวเอง เพื่อไม่ให้ดันปุ่ม Logout ท้าย Sidebar หลุดจอ */}
          <nav className="flex-1 min-h-0 overflow-y-auto px-3 py-4 flex flex-col gap-1.5">
            {navItems.map((item) => {
              const active = pathname === item.path;
              const allowed = hasAccess(item.minRole);
              if (!allowed) return null;

              return (
                <button
                  key={item.path}
                  onClick={() => router.push(item.path)}
                  className={`relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left group ${
                    active 
                      ? 'bg-gradient-to-r from-spa-gold/10 to-transparent border-l-2 border-spa-gold text-spa-gold font-semibold' 
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <div className={`${active ? 'text-spa-gold' : 'text-slate-400 group-hover:text-slate-200'}`}>
                    {item.icon}
                  </div>
                  {isSidebarOpen ? (
                    <motion.span 
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      className="text-sm"
                    >
                      {item.name}
                    </motion.span>
                  ) : (
                    <div className="absolute left-16 z-50 glass-modal px-3 py-1.5 rounded-lg text-xs text-spa-gold font-semibold whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-xl border border-white/10">
                      {item.name}
                    </div>
                  )}
                </button>
              );
            })}

            {/* Accordion: ตั้งค่าร้าน (เฉพาะ Manager ขึ้นไป) */}
            {hasAccess('manager') && (
              <div>
                <button
                  onClick={() => {
                    if (isSidebarOpen) {
                      setIsSettingsOpen(!isSettingsOpen);
                    } else {
                      // ถ้า Sidebar ย่อ ให้ไปหน้าตั้งค่าหลักได้เลย
                      router.push('/settings');
                    }
                  }}
                  className={`relative flex items-center gap-3 px-3 py-3 rounded-xl transition-all text-left w-full group ${
                    pathname.startsWith('/settings')
                      ? 'bg-gradient-to-r from-spa-gold/10 to-transparent border-l-2 border-spa-gold text-spa-gold font-semibold'
                      : 'text-slate-400 hover:bg-white/5 hover:text-slate-200'
                  }`}
                >
                  <div className={`${
                    pathname.startsWith('/settings') ? 'text-spa-gold' : 'text-slate-400 group-hover:text-slate-200'
                  }`}>
                    <Settings size={20} />
                  </div>
                  {isSidebarOpen ? (
                    <>
                      <motion.span
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        className="text-sm flex-1"
                      >
                        ตั้งค่าร้าน
                      </motion.span>
                      <ChevronDown
                        size={13}
                        className={`transition-transform duration-200 ${
                          isSettingsOpen ? 'rotate-180 text-spa-gold' : 'text-slate-500'
                        }`}
                      />
                    </>
                  ) : (
                    <div className="absolute left-16 z-50 glass-modal px-3 py-1.5 rounded-lg text-xs text-spa-gold font-semibold whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-xl border border-white/10">
                      ตั้งค่าร้าน
                    </div>
                  )}
                </button>

                {/* รายการเมนูย่อย */}
                <AnimatePresence initial={false}>
                  {isSettingsOpen && isSidebarOpen && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.2 }}
                      className="overflow-hidden ml-4 pl-3 border-l border-white/10 flex flex-col gap-1 mt-1"
                    >
                      {settingsSubItems.map((sub) => (
                        <button
                          key={sub.path}
                          onClick={() => router.push(sub.path)}
                          className={`flex items-center gap-2.5 px-3 py-2.5 rounded-lg transition-all text-left ${
                            pathname === sub.path
                              ? 'bg-spa-gold/10 text-spa-gold font-semibold'
                              : 'text-slate-400 hover:bg-white/5 hover:text-slate-300'
                          }`}
                        >
                          <span className={`${
                            pathname === sub.path ? 'text-spa-gold' : 'text-slate-500'
                          }`}>
                            {sub.icon}
                          </span>
                          <span className="text-xs">{sub.name}</span>
                        </button>
                      ))}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            )}
          </nav>

          {/* ข้อมูลผู้ใช้ท้าย Sidebar */}
          {currentUser && (
            <div className="p-4 border-t border-white/5 flex justify-center">
              {isSidebarOpen ? (
                <button
                  onClick={logout}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-red-950/20 hover:bg-red-950/40 border border-red-900/20 text-red-400 text-xs font-semibold tracking-wide transition-all active:scale-95 animate-fade-in"
                >
                  <LogOut size={16} />
                  <span>ออกจากระบบ</span>
                </button>
              ) : (
                <button
                  onClick={logout}
                  className="p-2.5 rounded-xl bg-red-950/20 hover:bg-red-950/40 border border-red-900/20 text-red-400 flex items-center justify-center active:scale-95 transition-all group relative"
                  title="ออกจากระบบ"
                >
                  <LogOut size={16} />
                  <div className="absolute left-16 bottom-2 z-50 glass-modal px-3 py-1.5 rounded-lg text-xs text-red-400 font-semibold whitespace-nowrap opacity-0 pointer-events-none group-hover:opacity-100 transition-opacity duration-200 shadow-xl border border-white/10">
                    ออกจากระบบ
                  </div>
                </button>
              )}
            </div>
          )}
        </motion.aside>

        {/* 3. Main content area */}
        <main className="flex-1 flex flex-col min-w-0 md:min-h-0">
          
          {/* Header */}
          <header className="hidden md:flex h-20 items-center justify-between px-8 border-b border-white/5 bg-slate-900/20 backdrop-blur-md no-print flex-shrink-0">
            <h1 className="text-lg font-bold font-display text-slate-100">
              {currentActiveItem ? currentActiveItem.name : 'ระบบหลังบ้านสปา'}
            </h1>
            
            <div className="flex items-center gap-5">
              {currentUser && (
                <div className="flex items-center gap-2.5">
                  <div className="text-right">
                    <p className="text-xs font-semibold text-slate-200">
                      {currentUser.displayName}
                    </p>
                    <p className="text-[10px] text-slate-400 mt-0.5">
                      {currentUser.fullName}
                    </p>
                  </div>
                  {getRoleBadge(currentUser.role)}
                </div>
              )}

              <button 
                onClick={() => setIsSwitcherOpen(true)}
                className="px-3.5 py-1.5 rounded-lg bg-gradient-to-r from-spa-gold/10 to-transparent border border-spa-gold/20 hover:border-spa-gold/40 text-spa-gold text-xs font-semibold tracking-wide flex items-center gap-2 active:scale-95 transition-transform"
              >
                <Key size={13} />
                <span>สลับผู้ใช้จำลอง</span>
              </button>
            </div>
          </header>

          {/* Main child viewport */}
          <div className="p-4 md:p-8 flex-1 flex flex-col overflow-y-auto">
            {unauthorized ? (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="glass-panel text-center max-w-xl mx-auto my-auto p-10 rounded-2xl flex flex-col items-center gap-5 border border-red-500/10 shadow-2xl"
              >
                <div className="p-4 rounded-full bg-red-950/40 text-red-500 border border-red-500/20">
                  <ShieldAlert size={42} />
                </div>
                <h2 className="text-lg font-bold text-red-400">สิทธิ์ไม่เพียงพอในการเข้าถึง</h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  บัญชีของคุณได้รับสิทธิ์ในระดับ <strong>{currentRole.toUpperCase()}</strong> <br />
                  ซึ่งไม่ได้รับอนุญาตให้ใช้เมนู <strong>{currentActiveItem?.name}</strong> <br />
                  หากต้องการเข้าใช้งานหน้านี้ กรุณากดสลับบัญชีสิทธิ์ผู้ใช้จำลองเป็น Manager หรือ Super Manager
                </p>
                <button 
                  onClick={() => setIsSwitcherOpen(true)}
                  className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-spa-gold to-yellow-600 text-slate-950 text-sm font-semibold flex items-center gap-2 active:scale-95 transition-transform"
                >
                  <Key size={16} />
                  <span>เปิดแผงสลับผู้ใช้จำลอง</span>
                </button>
              </motion.div>
            ) : (
              <div className="flex-1">
                {children}
              </div>
            )}
          </div>
        </main>
      </div>

      {/* 4. Floating Simulated Switcher Modal Dialog */}
      <AnimatePresence>
        {isSwitcherOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 no-print">
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.6 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsSwitcherOpen(false)}
              className="absolute inset-0 bg-black/80"
            />
            
            <motion.div 
              initial={{ scale: 0.95, opacity: 0, y: 15 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.95, opacity: 0, y: 15 }}
              transition={{ type: 'spring', damping: 25, stiffness: 250 }}
              className="glass-modal w-full max-w-md p-6 rounded-2xl border border-spa-gold/30 shadow-2xl relative z-10"
            >
              <div className="flex items-center justify-between mb-4 pb-2 border-b border-white/5">
                <h3 className="text-md font-bold text-spa-gold flex items-center gap-2">
                  <Key size={18} />
                  <span>ระบบจำลองสลับสิทธิ์การทดสอบ</span>
                </h3>
                <button 
                  onClick={() => setIsSwitcherOpen(false)}
                  className="p-1 rounded-lg hover:bg-white/5 text-slate-500 hover:text-white"
                >
                  <X size={18} />
                </button>
              </div>

              <p className="text-xs text-slate-400 mb-6 leading-relaxed">
                สำหรับจำลองบัญชีเพื่อทดสอบการคุมระบบของแต่ละแผนก สิทธิ์ในระบบจะเปลี่ยนเป็นสิทธิ์ของบุคคลนั้นทันที:
              </p>

              <div className="flex flex-col gap-3">
                {systemUsers.map((user) => {
                  const isActive = currentUser?.username === user.username;
                  return (
                    <button
                      key={user.username}
                      onClick={() => {
                        switchUser(user.username);
                        setIsSwitcherOpen(false);
                      }}
                      className={`w-full flex items-center justify-between p-4 rounded-xl text-left transition-all border ${
                        isActive 
                          ? 'bg-spa-gold/5 border-spa-gold/50 shadow-md shadow-spa-gold/5' 
                          : 'bg-white/5 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <strong className={`block text-xs font-semibold truncate ${isActive ? 'text-spa-gold' : 'text-slate-200'}`}>
                          {user.displayName} ({user.username})
                        </strong>
                        <span className="text-[10px] text-slate-400 mt-1 block tracking-wide">
                          {user.role === 'admin' && 'Admin: คีย์แค่งานวันนี้, ตั้งค่าร้านไม่ได้'}
                          {user.role === 'manager' && 'Manager: แก้ไขข้ามวันได้, ตั้งราคาได้'}
                          {user.role === 'super-manager' && 'Super Manager: จัดการสิทธิ์แอดมินคนอื่นได้'}
                        </span>
                      </div>
                      {getRoleBadge(user.role)}
                    </button>
                  );
                })}
              </div>

              <div className="mt-6 flex justify-end">
                <button 
                  onClick={() => setIsSwitcherOpen(false)}
                  className="px-4 py-2 rounded-xl bg-slate-900 border border-white/5 text-slate-300 hover:text-white text-xs font-semibold tracking-wide active:scale-95 transition-transform"
                >
                  ยกเลิก
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* 5. ตัวแจ้งเตือนกำลังบันทึกข้อมูล (มุมขวาล่าง) — ไม่บังทั้งหน้า ต่างจากจอโหลดเต็มจอตอนเปิดแอปครั้งแรก */}
      <AnimatePresence>
        {isLoading && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 10 }}
            className="fixed bottom-5 right-5 z-[60] no-print glass-panel px-4 py-2.5 rounded-xl border border-spa-gold/20 shadow-xl"
          >
            <LoadingSpinner label="กำลังบันทึกข้อมูล..." size="sm" inline />
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
};
