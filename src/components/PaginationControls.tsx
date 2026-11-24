// src/components/PaginationControls.tsx
// เหตุผลที่ต้องมีตัวกลางนี้ (Why): ตรรกะแบ่งหน้าตาราง (ยุบเลขหน้าด้วย "...", ปุ่มก่อนหน้า/ถัดไป)
// ซ้ำกันทุกหน้าที่มีตารางยาว (บันทึกงานนวด, บันทึกขายคอร์ส, จัดการคอร์สสปา) เดิมแต่ละหน้าแสดงเลขหน้าทุกหมายเลข
// ทำให้แถวปุ่มยาวเกินจอมือถือ การรวมเป็น component เดียวช่วยลดโค้ดซ้ำ (DRY) และแก้ปัญหา Responsive ได้ที่เดียว

import React from 'react';

interface PaginationControlsProps {
  currentPage: number;
  totalPages: number;
  totalItems: number;
  onPageChange: (page: number) => void;
}

// จำนวนหน้าข้างซ้าย/ขวาของหน้าปัจจุบันที่จะแสดงเป็นตัวเลข นอกนั้นยุบเป็น "..."
const NEIGHBOR_PAGE_COUNT = 1;

type PageEntry = number | 'ellipsis';

// สร้างรายการเลขหน้าที่จะแสดง โดยยุบช่วงที่ห่างจากหน้าปัจจุบันเป็น "..." เสมอแสดงหน้าแรกและหน้าสุดท้าย
const buildPageEntries = (currentPage: number, totalPages: number): PageEntry[] => {
  const entries: PageEntry[] = [];

  for (let page = 1; page <= totalPages; page++) {
    const isFirstOrLastPage = page === 1 || page === totalPages;
    const isNearCurrentPage = Math.abs(page - currentPage) <= NEIGHBOR_PAGE_COUNT;

    if (isFirstOrLastPage || isNearCurrentPage) {
      entries.push(page);
    } else if (entries[entries.length - 1] !== 'ellipsis') {
      entries.push('ellipsis');
    }
  }

  return entries;
};

export const PaginationControls: React.FC<PaginationControlsProps> = ({
  currentPage,
  totalPages,
  totalItems,
  onPageChange
}) => {
  if (totalPages <= 1) return null;

  const pageEntries = buildPageEntries(currentPage, totalPages);

  return (
    <div className="flex flex-col sm:flex-row items-center justify-between mt-5 gap-3 pt-3 border-t border-white/5 no-print">
      <span className="text-xs text-slate-400 whitespace-nowrap">
        แสดงหน้า {currentPage} จาก {totalPages} (ทั้งหมด {totalItems} รายการ)
      </span>
      <div className="flex flex-wrap items-center justify-center gap-1">
        <button
          type="button"
          disabled={currentPage === 1}
          onClick={() => onPageChange(Math.max(currentPage - 1, 1))}
          className="px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
        >
          ก่อนหน้า
        </button>

        {pageEntries.map((entry, index) =>
          entry === 'ellipsis' ? (
            <span key={`ellipsis-${index}`} className="px-1.5 text-xs text-slate-600">
              ...
            </span>
          ) : (
            <button
              key={entry}
              type="button"
              onClick={() => onPageChange(entry)}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                currentPage === entry
                  ? 'bg-spa-gold text-slate-950 shadow-md font-semibold'
                  : 'bg-slate-950 border border-white/5 text-slate-400 hover:text-white'
              }`}
            >
              {entry}
            </button>
          )
        )}

        <button
          type="button"
          disabled={currentPage === totalPages}
          onClick={() => onPageChange(Math.min(currentPage + 1, totalPages))}
          className="px-3 py-1.5 rounded-lg bg-slate-950 border border-white/10 text-slate-300 hover:text-white disabled:opacity-40 disabled:cursor-not-allowed text-xs font-semibold"
        >
          ถัดไป
        </button>
      </div>
    </div>
  );
};
