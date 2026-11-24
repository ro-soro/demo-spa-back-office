// src/utils/numericInput.ts
// เหตุผลที่ต้องมีตัวกลางนี้ (Why): ทุกช่องกรอกตัวเลข/จำนวนเงินทั้งระบบต้องพิมพ์ได้แค่ตัวเลขกับจุดทศนิยม
// เดียวกันหมด แยกฟังก์ชันไว้ที่เดียวกันพฤติกรรมเพี้ยนถ้าไปเขียน onKeyDown ซ้ำเองทีละฟอร์ม

import { KeyboardEvent } from 'react';

// ปุ่มควบคุม/นำทางที่ต้องยอมให้กดผ่านเสมอ ไม่งั้นจะพิมพ์ลบ/ย้ายเคอร์เซอร์ไม่ได้เลย
const ALWAYS_ALLOWED_KEYS = [
  'Backspace', 'Delete', 'Tab', 'Escape', 'Enter',
  'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'
];

// บล็อกไม่ให้พิมพ์อะไรนอกจากตัวเลข 0-9 และจุดทศนิยม (.) หนึ่งจุดต่อค่าเดียว
// ใช้กับทุกช่องกรอกตัวเลข/จำนวนเงินในระบบ (ราคา, ค่าคอม, จำนวนเงินสด/โอน/บัตร, ประกันมือ ฯลฯ)
export const blockNonNumericKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
  // อนุญาตปุ่มลัด Ctrl/Cmd + A/C/V/X (เลือกทั้งหมด/คัดลอก/วาง/ตัด) เสมอ
  if (event.ctrlKey || event.metaKey) return;

  if (ALWAYS_ALLOWED_KEYS.includes(event.key)) return;

  const isDigit = /^[0-9]$/.test(event.key);
  if (isDigit) return;

  const isDecimalPoint = event.key === '.';
  const alreadyHasDecimalPoint = event.currentTarget.value.includes('.');
  if (isDecimalPoint && !alreadyHasDecimalPoint) return;

  event.preventDefault();
};

// ใช้กับ register(..., { setValueAs }) ของฟิลด์ตัวเลข "บังคับกรอก" (มี * ในป้ายกำกับ)
// ทำหน้าที่เดียวกับพฤติกรรม valueAsNumber มาตรฐานของเบราว์เซอร์ (ช่องว่าง -> NaN) แต่เขียนไว้ชัดเจน
// เป็นความตั้งใจของโค้ดแทนที่จะพึ่งพฤติกรรมโดยนัยของเบราว์เซอร์ — NaN จะชนกฎ z.number({ message })
// ทำให้ขึ้น error message ที่กำหนดไว้ตามจริง ไม่ใช่ปล่อยให้ฟอร์มเงียบ
export const requiredNumberInput = (value: unknown): number => {
  if (value === '' || value === null || value === undefined) return NaN;
  return Number(value);
};

// ใช้กับฟิลด์ตัวเลข "ไม่บังคับ" ที่ลบให้ว่างได้ (เช่น ยอดเงิน/ยอดเบิกที่ปกติเป็น 0)
// ต่างจาก requiredNumberInput ตรงที่ช่องว่างแปลว่า "ไม่ได้กรอก = 0" ไม่ใช่ค่าที่ผิดพลาด
export const optionalNumberInputToZero = (value: unknown): number => {
  if (value === '' || value === null || value === undefined) return 0;
  return Number(value);
};
