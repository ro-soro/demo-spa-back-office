import { describe, expect, it } from "vitest";
import {
  demoServices,
  demoSystemUsers,
  demoTherapists,
  generateDemoActivity,
} from "@/data/demoData";

// วันที่อ้างอิงคงที่ เพื่อให้ผลการสุ่มแบบกำหนด seed ตรวจสอบได้ทุกครั้ง
const REFERENCE_TODAY = new Date(2026, 10, 24);
const REFERENCE_TODAY_STRING = "2026-11-24";
const EARLIEST_EXPECTED_DATE = "2026-07-28"; // 120 วันย้อนหลังนับรวมวันนี้

describe("generateDemoActivity", () => {
  const activity = generateDemoActivity(REFERENCE_TODAY);
  const therapistNames = new Set(demoTherapists.map((therapist) => therapist.name));
  const serviceIds = new Set(demoServices.map((service) => service.id));

  it("สร้างงานนวดย้อนหลังครอบคลุมตั้งแต่ 120 วันก่อนจนถึงวันนี้ และไม่มีวันในอนาคต", () => {
    const dates = activity.bookings.map((booking) => booking.date).sort();
    expect(dates[0]).toBe(EARLIEST_EXPECTED_DATE);
    expect(dates[dates.length - 1]).toBe(REFERENCE_TODAY_STRING);
  });

  it("ทุกงานนวดอ้างถึงหมอนวดและบริการที่มีอยู่จริงในชุดข้อมูล demo", () => {
    activity.bookings.forEach((booking) => {
      expect(therapistNames.has(booking.therapistName)).toBe(true);
      booking.services.forEach((service) => {
        expect(serviceIds.has(service.serviceId)).toBe(true);
      });
    });
  });

  it("ยอดรับเงิน (สด + โอน + บัตร) เท่ากับราคาบริการรวมทุกรายการ", () => {
    activity.bookings.forEach((booking) => {
      const totalPrice = booking.services.reduce(
        (sum, service) => sum + service.price * service.quantity,
        0,
      );
      const totalReceived =
        booking.payment.cash + booking.payment.transfer + booking.payment.card;
      expect(totalReceived).toBe(totalPrice);
    });
  });

  it("รหัสงานนวดและการขายคอร์สไม่ซ้ำกัน", () => {
    const bookingIds = activity.bookings.map((booking) => booking.id);
    const courseSaleIds = activity.courseSales.map((sale) => sale.id);
    expect(new Set(bookingIds).size).toBe(bookingIds.length);
    expect(new Set(courseSaleIds).size).toBe(courseSaleIds.length);
  });

  it("ให้ผลเหมือนเดิมทุกครั้งเมื่อเริ่มจากวันเดียวกัน", () => {
    const secondRun = generateDemoActivity(REFERENCE_TODAY);
    expect(secondRun).toEqual(activity);
  });
});

describe("demoSystemUsers", () => {
  it("มีครบทั้ง 3 role และไม่มี email (ล็อกอินในเบราว์เซอร์ล้วน ไม่วิ่งไป Firebase Auth)", () => {
    const roles = demoSystemUsers.map((user) => user.role).sort();
    expect(roles).toEqual(["admin", "manager", "super-manager"]);
    demoSystemUsers.forEach((user) => {
      expect(user.email).toBeUndefined();
    });
  });
});
