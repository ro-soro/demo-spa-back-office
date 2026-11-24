// src/app/layout.tsx
// คำอธิบายเหตุผลของการสร้างตัวกลางนี้ (Why):
// ไฟล์ Layout หลักของระบบ ทำหน้าที่โหลด Font จาก Google Fonts 
// และทำการห่อหุ้ม (Wrap) แอปพลิเคชันทั้งหมดด้วย AppProvider สำหรับแชร์ข้อมูล
// และ MainLayout สำหรับแถบเมนูนำทาง เพื่อให้ทุกลิงก์ย่อยมีโครงสร้างที่ตรงกัน

import type { Metadata } from "next";
import "./globals.css";
import { AppProvider } from "@/context/AppContext";
import { MainLayout } from "@/components/MainLayout";

export const metadata: Metadata = {
  title: "Demo Spa & Thai Massage - ระบบหลังบ้าน",
  description: "ระบบบริหารจัดการและสรุปยอดค่าแรงร้านนวดและสปา Demo Spa",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="th">
      <body>
        <AppProvider>
          <MainLayout>
            {children}
          </MainLayout>
        </AppProvider>
      </body>
    </html>
  );
}
