import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");

const baseUrl = process.argv[2] || "http://127.0.0.1:4173/";

const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.BROWSER_PATH || undefined,
});
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1,
});

const messages = [];
page.on("console", (message) => {
  if (["error", "warning"].includes(message.type())) {
    messages.push({ type: message.type(), text: message.text() });
  }
});
page.on("pageerror", (error) => {
  messages.push({ type: "pageerror", text: error.message });
});

await page.goto(baseUrl, { waitUntil: "networkidle", timeout: 90000 });
await page.waitForSelector(".auth-shell", { timeout: 90000 });
await page.screenshot({ path: "C:/tmp/antescargo-auth-desktop.png", fullPage: true });
const adminPassword = `qa-${Date.now()}-${Math.random().toString(16).slice(2)}`;
await page.fill('[data-form="admin-auth"] input[name="password"]', adminPassword);
const confirmPassword = page.locator('[data-form="admin-auth"] input[name="confirm_password"]');
if ((await confirmPassword.count()) > 0) {
  await confirmPassword.fill(adminPassword);
}
await page.click('[data-form="admin-auth"] button[type="submit"]');
await page.waitForSelector(".app-shell", { timeout: 90000 });

const financeTitle = await page.locator("h1").first().innerText();
const kpis = await page.locator(".kpi").count();
const navButtons = await page.locator(".nav-btn").count();
await page.screenshot({ path: "C:/tmp/antescargo-finance-desktop.png", fullPage: true });

await page.click('button[data-view="vehicles"]');
await page.waitForSelector('[data-form="add-vehicle"]', { timeout: 15000 });
await page.fill('[data-form="add-vehicle"] input[name="vehicle_code"]', "QA Truck");
await page.fill('[data-form="add-vehicle"] input[name="plate"]', "А001АА761");
await page.click('[data-form="add-vehicle"] button[type="submit"]');
await page.waitForSelector("[data-vehicle-row]", { timeout: 15000 });
const vehicleRows = await page.locator("[data-vehicle-row]").count();

await page.click('button[data-view="uploads"]');
await page.waitForSelector('input[data-upload-section="fuel"]', { timeout: 15000 });
await page.locator('input[data-upload-section="fuel"]').first().setInputFiles([
  {
    name: "fuel-1.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Дата;Госномер;Сумма;Литры\n07.05.2026;А001АА761;12000;220\n", "utf8"),
  },
  {
    name: "fuel-2.csv",
    mimeType: "text/csv",
    buffer: Buffer.from("Дата;Госномер;Сумма;Литры\n08.05.2026;А001АА761;13000;235\n", "utf8"),
  },
]);
await page.waitForFunction(() => document.querySelectorAll("tbody tr").length >= 2, null, { timeout: 30000 });
const uploadRows = await page.locator("tbody tr").count();
await page.screenshot({ path: "C:/tmp/antescargo-uploads-desktop.png", fullPage: true });

await page.click('button[data-view="driver"]');
await page.waitForSelector('[data-form="driver-register"]', { timeout: 15000 });
await page.fill('[data-form="driver-register"] input[name="full_name"]', "QA Driver");
await page.fill('[data-form="driver-register"] input[name="phone"]', "+7 999 100-10-03");
await page.selectOption('[data-form="driver-register"] select[name="vehicle_id"]', { index: 1 });
await page.click('[data-form="driver-register"] button[type="submit"]');
await page.waitForSelector(".driver-actions", { timeout: 15000 });
const driverTitle = await page.locator(".panel-title h2").first().innerText();

await page.screenshot({ path: "C:/tmp/antescargo-desktop.png", fullPage: true });

await page.click('button[data-action="logout"]');
await page.waitForSelector(".auth-shell", { timeout: 15000 });
await page.fill('[data-form="admin-auth"] input[name="password"]', adminPassword);
await page.click('[data-form="admin-auth"] button[type="submit"]');
await page.waitForSelector(".app-shell", { timeout: 15000 });
await page.setViewportSize({ width: 390, height: 844 });
await page.click('button[data-view="finance"]');
await page.waitForSelector(".kpi-grid", { timeout: 15000 });
const mobileOverflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 2);
await page.screenshot({ path: "C:/tmp/antescargo-mobile.png", fullPage: true });

await browser.close();

console.log(
  JSON.stringify(
    {
      baseUrl,
      financeTitle,
      kpis,
      navButtons,
      vehicleRows,
      uploadRows,
      driverTitle,
      mobileOverflow,
      messages,
      screenshots: [
        "C:/tmp/antescargo-auth-desktop.png",
        "C:/tmp/antescargo-finance-desktop.png",
        "C:/tmp/antescargo-uploads-desktop.png",
        "C:/tmp/antescargo-desktop.png",
        "C:/tmp/antescargo-mobile.png",
      ],
    },
    null,
    2,
  ),
);
