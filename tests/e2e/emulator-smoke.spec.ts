import { test, expect } from "@playwright/test";

const e2eEnabled = process.env.CRM_E2E_ENABLED === "1";

test.describe("Emulator E2E smoke", () => {
  test.skip(!e2eEnabled, "Set CRM_E2E_ENABLED=1 (use npm run test:e2e)");

  async function signIn(page: import("@playwright/test").Page, email: string, displayName: string) {
    await page.goto("/");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("test-pass-123");
    await page.locator("form").getByRole("button", { name: "Sign in" }).click();
    await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({
      timeout: 30_000,
    });
    await expect(page.getByRole("button", { name: displayName, exact: true }).first()).toBeVisible();
  }

  async function openSettings(page: import("@playwright/test").Page, displayName: string) {
    await page
      .getByRole("button", { name: displayName, exact: true })
      .and(page.locator('[aria-haspopup="menu"]'))
      .click();
    await page.getByRole("menuitem", { name: "Settings" }).click();
  }

  test("founder sees Contacts and seed settings", async ({ page }) => {
    await signIn(page, "founder-e2e@test.local", "E2E Founder");
    await expect(page.getByRole("button", { name: "Contacts" })).toBeVisible();
    await openSettings(page, "E2E Founder");
    await expect(page.getByText("Partner codes")).toBeVisible();
  });

  test("partner hides Contacts and seed settings", async ({ page }) => {
    await signIn(page, "partner-eng-e2e@test.local", "E2E Eng Partner");
    await expect(page.getByRole("button", { name: "Contacts" })).toHaveCount(0);
    await openSettings(page, "E2E Eng Partner");
    await expect(page.getByText("Partner codes")).toHaveCount(0);
    await expect(page.getByText("Appearance")).toBeVisible();
  });

  test("founder sees seeded engineering task in everyone scope", async ({ page }) => {
    await signIn(page, "founder-e2e@test.local", "E2E Founder");
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
    await page.getByRole("button", { name: "Everyone" }).click();
    await expect(page.getByRole("button", { name: "E2E Eng Partner" }).first()).toBeVisible({
      timeout: 30_000,
    });
  });

  test("forbidden deep link does not reveal unknown task to eng partner", async ({ page }) => {
    await signIn(page, "partner-eng-e2e@test.local", "E2E Eng Partner");
    await page.goto("/?tab=tasks&task=e2e-task-sales");
    await expect(page.getByText("Sales task")).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "Tasks" })).toBeVisible();
  });
});
