// src/components/LoadingSpinner.tsx
// คำอธิบายเหตุผลของตัวกลางนี้ (Why): เดิมทุกจุดที่ต้องรอข้อมูล (โหลดระบบครั้งแรก, ตรวจสอบสิทธิ์, รอกราฟ)
// ใช้ข้อความกระพริบ (animate-pulse) เต็มจอ ทำให้ดูเหมือนหน้าเว็บค้าง/กระตุก แทนที่ด้วยไอคอนหมุนตัวเดียวกัน
// ทุกจุดในระบบ เพื่อความสม่ำเสมอของ UX และไม่ต้องเขียนโครง loading ซ้ำทีละหน้า

"use client";

import React from "react";
import { Loader2 } from "lucide-react";

interface LoadingSpinnerProps {
  label?: string;
  size?: "sm" | "md" | "lg";
  fullScreen?: boolean;
  inline?: boolean; // เรียงไอคอน+ข้อความแนวนอน เหมาะกับใช้แปะในแถบแจ้งเตือนเล็กๆ มุมจอ
}

const ICON_SIZE_BY_VARIANT: Record<NonNullable<LoadingSpinnerProps["size"]>, number> = {
  sm: 18,
  md: 28,
  lg: 40,
};

export const LoadingSpinner: React.FC<LoadingSpinnerProps> = ({
  label,
  size = "md",
  fullScreen = false,
  inline = false,
}) => {
  const content = (
    <div
      className={`flex items-center justify-center ${inline ? "flex-row gap-2.5" : "flex-col gap-3"}`}
    >
      <Loader2
        size={ICON_SIZE_BY_VARIANT[size]}
        className="text-spa-gold animate-spin"
      />
      {label && (
        <span className="font-body text-xs font-semibold text-spa-gold tracking-wide">
          {label}
        </span>
      )}
    </div>
  );

  if (!fullScreen) {
    return content;
  }

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center font-body">
      {content}
    </div>
  );
};
