// Setup ไฟล์นี้จำเป็นเพราะ vitest ต้อง import jest-dom matchers (เช่น toBeInTheDocument)
// ก่อนรัน test ใด ๆ — ถ้าไม่มีไฟล์นี้ ทุก test ที่ใช้ jest-dom matcher จะ fail ทันที
import "@testing-library/jest-dom";
