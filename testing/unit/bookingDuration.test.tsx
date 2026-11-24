import { describe, expect, it, vi } from "vitest";
import {
  parseTimeSlot,
  formatTimeSlot,
  calculateDuration,
  addHoursToTime
} from "@/app/bookings/page";
import { getDefaultHalfMonthRange } from "@/app/payroll/page";

describe("Time Slot Helpers", () => {
  describe("parseTimeSlot", () => {
    it("parses dotted time slot ranges", () => {
      expect(parseTimeSlot("9.50-10.50")).toEqual({ start: "09:50", end: "10:50" });
      expect(parseTimeSlot("14.30-17.30")).toEqual({ start: "14:30", end: "17:30" });
    });

    it("parses colon ranges and ranges with spaces", () => {
      expect(parseTimeSlot("12:00 - 13:00")).toEqual({ start: "12:00", end: "13:00" });
    });

    it("handles invalid or empty inputs gracefully", () => {
      expect(parseTimeSlot("")).toEqual({ start: "", end: "" });
      expect(parseTimeSlot("invalid")).toEqual({ start: "", end: "" });
    });
  });

  describe("formatTimeSlot", () => {
    it("formats colon times to dot ranges", () => {
      expect(formatTimeSlot("12:00", "13:00")).toBe("12.00-13.00");
      expect(formatTimeSlot("09:30", "11:00")).toBe("09.30-11.00");
    });

    it("returns empty string if inputs are empty", () => {
      expect(formatTimeSlot("", "12:00")).toBe("");
      expect(formatTimeSlot("12:00", "")).toBe("");
    });
  });

  describe("calculateDuration", () => {
    it("calculates correct duration in hours", () => {
      expect(calculateDuration("12:00", "13:00")).toBe(1.0);
      expect(calculateDuration("12:00", "13:30")).toBe(1.5);
      expect(calculateDuration("09:00", "10:15")).toBe(1.25);
    });

    it("handles cross-midnight calculations", () => {
      expect(calculateDuration("23:00", "01:00")).toBe(2.0);
      expect(calculateDuration("22:30", "00:30")).toBe(2.0);
    });
  });

  describe("addHoursToTime", () => {
    it("adds hours correctly", () => {
      expect(addHoursToTime("12:00", 1.5)).toBe("13:30");
      expect(addHoursToTime("09:00", 2.0)).toBe("11:00");
    });

    it("handles cross-midnight addition", () => {
      expect(addHoursToTime("23:00", 2.0)).toBe("01:00");
    });
  });

  describe("getDefaultHalfMonthRange", () => {
    it("returns 1st half of month when current date is day 1 to 15", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-05"));
      expect(getDefaultHalfMonthRange()).toEqual({
        start: "2026-06-01",
        end: "2026-06-15"
      });
      vi.useRealTimers();
    });

    it("returns 2nd half of month when current date is day 16 to end of month", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-06-20"));
      expect(getDefaultHalfMonthRange()).toEqual({
        start: "2026-06-16",
        end: "2026-06-30"
      });
      vi.useRealTimers();
    });
  });
});
