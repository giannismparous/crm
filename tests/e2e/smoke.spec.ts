import { test, expect } from "@playwright/test";

const e2eEnabled = process.env.CRM_E2E_ENABLED === "1";

test.describe("CRM E2E smoke", () => {
  test.skip(!e2eEnabled, "Set CRM_E2E_ENABLED=1 with emulator-backed dev server to run E2E");

  test("login page loads", async ({ page }) => {
    await page.goto("/");
    await expect(page.getByRole("heading", { name: /sign in|login|crm/i })).toBeVisible({
      timeout: 15_000,
    });
  });
});
