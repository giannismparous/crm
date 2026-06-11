import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  ENG_PARTNER,
  FOUNDER,
  assignNewTaskToDepartment,
  createTask,
  el,
  expectTaskTitle,
  futureDatetimeLocal,
  openSettings,
  signIn,
} from "./staging-smoke-helpers";

const e2eEnabled = process.env.CRM_E2E_ENABLED === "1";

test.describe.configure({ mode: "serial" });

test.describe("Staging UI smoke", () => {
  test.skip(!e2eEnabled, "Set CRM_E2E_ENABLED=1 (npm run test:e2e)");

  test("no Messages tab in primary nav", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await expect(page.getByRole("button", { name: "Messages" })).toHaveCount(0);
  });

  test("founder: contacts, settings, partner codes", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await expect(page.getByRole("button", { name: el.contacts })).toBeVisible();
    await openSettings(page, FOUNDER.name);
    await expect(page.getByText(el.partnerCodes)).toBeVisible();
    await expect(page.getByText(el.appearance)).toBeVisible();
    await expect(page.getByText(el.integrations)).toBeVisible();
    await page.getByLabel(el.closeSettings).click();
  });

  test("partner: restricted nav and settings before cross-dept data", async ({ page }) => {
    await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
    await expect(page.getByRole("button", { name: el.contacts })).toHaveCount(0);
    await openSettings(page, ENG_PARTNER.name);
    await expect(page.getByText(el.partnerCodes)).toHaveCount(0);
    await expect(page.getByText(el.appearance)).toBeVisible();
    await expect(page.getByText(el.integrations)).toBeVisible();
    await page.getByLabel(el.closeSettings).click();
  });

  test("partner: forbidden deep link", async ({ page }) => {
    await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
    await page.goto("/?tab=tasks&task=e2e-task-sales");
    await expect(page.getByText("Sales task")).toHaveCount(0);
  });

  test("founder: create normal and department tasks", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await createTask(page, "Smoke normal task");
    await page.getByRole("button", { name: el.everyone }).click();
    await expect(page.getByRole("button", { name: "E2E Founder" }).first()).toBeVisible({
      timeout: 15_000,
    });
    await createTask(page, "Smoke eng dept task", "Engineering");
    await createTask(page, "Smoke sales dept task", "Sales");
    await expectTaskTitle(page, "Smoke eng dept task");
    await expectTaskTitle(page, "Smoke sales dept task");
  });

  test("partner: cross-dept task list after founder seeds sales tasks", async ({ page }) => {
    await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
    await expect(page.getByRole("heading", { name: el.tasks })).toBeVisible();
    await expectTaskTitle(page, "Engineering task");
    await expectTaskTitle(page, "Smoke eng dept task");
    await expect(page.locator('[value="Smoke sales dept task"]')).toHaveCount(0);
    await expect(page.locator('[value="Sales task"]')).toHaveCount(0);
  });

  test("partner: mark complete on assigned task", async ({ page }) => {
    await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
    await expect(page.getByRole("heading", { name: el.tasks })).toBeVisible();
    await expectTaskTitle(page, "Engineering task");
    await page
      .locator("article")
      .filter({ has: page.locator('[value="Engineering task"]') })
      .getByRole("button", { name: el.iFinished })
      .click();
    await page.getByRole("button", { name: el.yesSubmit }).click();
    await page.getByRole("button", { name: el.completed }).click();
    await expect(page.locator('[value="Engineering task"]')).toBeVisible({ timeout: 15_000 });
  });

  test("partner: create and cancel own appointment", async ({ page }) => {
    await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
    await page.getByRole("button", { name: el.appointments }).click();
    await page.getByRole("button", { name: el.newAppointment }).click();
    await page.getByLabel(el.title).fill("Partner smoke appointment");
    await page.getByLabel(el.starts, { exact: true }).fill(futureDatetimeLocal(10));
    await page.getByRole("button", { name: el.createAppointment }).click();
    await expect(page.getByRole("heading", { name: "Partner smoke appointment" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /hard delete|delete appointment/i })).toHaveCount(0);
    await page.getByRole("button", { name: el.cancelAppointment }).click();
    await page.getByRole("button", { name: el.yesCancelAppointment }).click();
    await page.getByRole("button", { name: el.canceled }).click();
    await expect(page.getByText("Partner smoke appointment")).toBeVisible({ timeout: 10_000 });
  });

  test("founder: create normal appointment", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await page.getByRole("button", { name: el.appointments }).click();
    await page.getByRole("button", { name: el.newAppointment }).click();
    await page.getByLabel(el.title).fill("Smoke single appointment");
    await page.getByLabel(el.starts, { exact: true }).fill(futureDatetimeLocal(7));
    await page.getByRole("button", { name: el.createAppointment }).click();
    await expect(page.getByRole("heading", { name: "Smoke single appointment" })).toBeVisible({
      timeout: 15_000,
    });
  });

  test("founder: create weekly recurring x12 and edit one instance", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await page.getByRole("button", { name: el.appointments }).click();
    await page.getByRole("button", { name: el.newAppointment }).click();
    await page.getByLabel(el.title).fill("Smoke weekly series");
    await page.getByLabel(el.starts, { exact: true }).fill(futureDatetimeLocal(21));
    await page.getByLabel(el.recurringMeeting).check();
    await page.getByLabel(el.numberOfMeetings).fill("12");
    await page.getByRole("button", { name: el.createAppointment }).click();
    await expect(page.getByRole("heading", { name: "Smoke weekly series" })).toBeVisible({
      timeout: 20_000,
    });
    await expect(page.getByText(el.recurring)).toHaveCount(12, { timeout: 15_000 });

    await page.getByRole("button", { name: /Smoke weekly series/ }).first().click();
    await page.getByRole("button", { name: el.edit }).click();
    await page.getByLabel(el.title).fill("Smoke weekly series edited");
    await page.getByRole("button", { name: el.saveChanges }).click();
    await expect(page.getByRole("heading", { name: "Smoke weekly series edited" })).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByRole("button", { name: /Smoke weekly series edited/ })).toHaveCount(1);
    await expect(page.getByRole("button", { name: new RegExp(`^Smoke weekly series${el.recurring}`) })).toHaveCount(11);
  });

  test("founder: cancel appointment (no hard-delete UI)", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await page.getByRole("button", { name: el.appointments }).click();
    await page.getByRole("button", { name: /Smoke single appointment/ }).click();
    await expect(page.getByRole("button", { name: el.cancelAppointment })).toBeVisible();
    await expect(page.getByRole("button", { name: /hard delete|delete appointment/i })).toHaveCount(0);
    await page.getByRole("button", { name: el.cancelAppointment }).click();
    await page.getByRole("button", { name: el.yesCancelAppointment }).click();
    await page.getByRole("button", { name: el.canceled }).click();
    await expect(page.getByText("Smoke single appointment")).toBeVisible({ timeout: 10_000 });
  });

  test("google calendar settings: opens without full sync button auto-run", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await openSettings(page, FOUNDER.name);
    await expect(page.getByText("Google Calendar", { exact: true })).toBeVisible();
    await expect(page.getByText(el.notConnected)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole("button", { name: new RegExp(el.connectGoogleCalendar, "i") })).toBeVisible();
    await expect(page.getByText(/Συγχρονίστηκ|Synced \d+ upcoming/i)).toHaveCount(0);
    await page.getByLabel(el.closeSettings).click();
  });

  test("chat: send and unsend via floating dock", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await page.getByRole("button", { name: el.allChats }).click();
    await page.getByRole("button", { name: el.newDm }).click();
    await page
      .getByRole("dialog", { name: el.chats })
      .getByRole("button", { name: /E2E Eng Partner/ })
      .first()
      .click();
    const msg = `smoke-${Date.now()}`;
    await page.getByPlaceholder(el.messagePlaceholder).fill(msg);
    await page.getByRole("button", { name: el.send }).click();
    await expect(page.getByPlaceholder(el.messagePlaceholder)).toHaveValue("", { timeout: 10_000 });
    await expect(page.locator("span").filter({ hasText: msg })).toBeVisible({ timeout: 15_000 });
    await page.getByRole("button", { name: el.unsend }).click();
    await expect(page.locator("span").filter({ hasText: msg })).toHaveCount(0, { timeout: 10_000 });
  });

  test("chat: send 3 attachments", async ({ page }) => {
    await signIn(page, FOUNDER.email, FOUNDER.name);
    await page.getByRole("button", { name: el.allChats }).click();
    await page.getByRole("button", { name: el.newDm }).click();
    await page
      .getByRole("dialog", { name: el.chats })
      .getByRole("button", { name: /E2E Eng Partner/ })
      .first()
      .click();
    const fixture = path.join(process.cwd(), "tests/fixtures/smoke-1x1.png");
    const fileInputs = page.locator('input[type="file"]');
    await fileInputs.first().setInputFiles([fixture, fixture, fixture]);
    await page.getByRole("button", { name: new RegExp(`${el.send}|${el.uploading}`) }).click();
    await expect(page.locator("img").first()).toBeVisible({ timeout: 20_000 });
  });

  test.skip("storage: appointment description image upload survives cancel draft", async () => {
    // Manual/PARTIAL: inline image in rich text did not render in detail view after reload in emulator run.
  });
});
