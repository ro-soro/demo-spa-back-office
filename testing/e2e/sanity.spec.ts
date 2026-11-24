import { expect, test } from "@playwright/test";

// Sanity test นี้ไม่ใช่ feature test — จุดประสงค์คือพิสูจน์ว่า Playwright harness
// (webServer auto-start + browser launch + navigation) ทำงานได้ถูกต้องเท่านั้น
// ไม่ตรวจสอบเนื้อหาเฉพาะของแอป
test("home page responds and renders an HTML root element", async ({ page }) => {
  const response = await page.goto("/");

  expect(response?.ok()).toBe(true);
  await expect(page.locator("html")).toBeAttached();
});
