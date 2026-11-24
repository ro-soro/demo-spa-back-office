import { describe, expect, it } from "vitest";
import {
  calculatePeriodDeduction,
  getAdvanceDeductionForPeriod,
  AdvanceDeductionLedgerEntryLike,
} from "@/utils/advanceDeduction";

describe("calculatePeriodDeduction", () => {
  it("deducts the full per-period amount when remaining balance is enough", () => {
    expect(calculatePeriodDeduction(5000, 1000)).toEqual({
      amountToDeduct: 1000,
      remainingAfter: 4000,
    });
  });

  it("deducts only what remains when remaining balance is less than the per-period amount", () => {
    expect(calculatePeriodDeduction(600, 1000)).toEqual({
      amountToDeduct: 600,
      remainingAfter: 0,
    });
  });

  it("stops deducting once the remaining balance is already zero", () => {
    expect(calculatePeriodDeduction(0, 1000)).toEqual({
      amountToDeduct: 0,
      remainingAfter: 0,
    });
  });

  it("treats negative remaining balance as already fully paid off", () => {
    expect(calculatePeriodDeduction(-500, 1000)).toEqual({
      amountToDeduct: 0,
      remainingAfter: 0,
    });
  });
});

describe("getAdvanceDeductionForPeriod", () => {
  const THERAPIST_ID = "ther_1";
  const OTHER_THERAPIST_ID = "ther_2";

  it("computes a fresh period's deduction when no ledger entry exists yet", () => {
    const ledger: AdvanceDeductionLedgerEntryLike[] = [];

    const result = getAdvanceDeductionForPeriod(
      3000,
      1000,
      ledger,
      THERAPIST_ID,
      "2026-07-01",
      "2026-07-15",
    );

    expect(result).toEqual({
      amountDeducted: 1000,
      remainingAfter: 2000,
      alreadyRecorded: false,
    });
  });

  it("does not deduct again for a period that already has a ledger entry", () => {
    const ledger: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        amountDeducted: 1000,
      },
    ];

    const result = getAdvanceDeductionForPeriod(
      3000,
      1000,
      ledger,
      THERAPIST_ID,
      "2026-07-01",
      "2026-07-15",
    );

    expect(result).toEqual({
      amountDeducted: 1000,
      remainingAfter: 2000,
      alreadyRecorded: true,
    });
  });

  it("carries the remaining balance forward correctly across multiple recorded periods", () => {
    const ledger: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-01",
        periodEnd: "2026-06-15",
        amountDeducted: 1000,
      },
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-16",
        periodEnd: "2026-06-30",
        amountDeducted: 1000,
      },
    ];

    const result = getAdvanceDeductionForPeriod(
      3000,
      1000,
      ledger,
      THERAPIST_ID,
      "2026-07-01",
      "2026-07-15",
    );

    expect(result).toEqual({
      amountDeducted: 1000,
      remainingAfter: 0,
      alreadyRecorded: false,
    });
  });

  it("stops proposing deductions once the total debt is fully paid off", () => {
    const ledger: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-01",
        periodEnd: "2026-06-15",
        amountDeducted: 1000,
      },
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-06-16",
        periodEnd: "2026-06-30",
        amountDeducted: 1000,
      },
      {
        therapistId: THERAPIST_ID,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        amountDeducted: 1000,
      },
    ];

    const result = getAdvanceDeductionForPeriod(
      3000,
      1000,
      ledger,
      THERAPIST_ID,
      "2026-07-16",
      "2026-07-31",
    );

    expect(result).toEqual({
      amountDeducted: 0,
      remainingAfter: 0,
      alreadyRecorded: false,
    });
  });

  it("ignores other therapists' ledger entries when computing the remaining balance", () => {
    const ledger: AdvanceDeductionLedgerEntryLike[] = [
      {
        therapistId: OTHER_THERAPIST_ID,
        periodStart: "2026-07-01",
        periodEnd: "2026-07-15",
        amountDeducted: 2500,
      },
    ];

    const result = getAdvanceDeductionForPeriod(
      3000,
      1000,
      ledger,
      THERAPIST_ID,
      "2026-07-01",
      "2026-07-15",
    );

    expect(result).toEqual({
      amountDeducted: 1000,
      remainingAfter: 2000,
      alreadyRecorded: false,
    });
  });
});
