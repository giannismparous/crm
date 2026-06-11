import { expect, type Page } from "@playwright/test";

export const FOUNDER = { email: "founder-e2e@test.local", name: "E2E Founder" };
export const ENG_PARTNER = { email: "partner-eng-e2e@test.local", name: "E2E Eng Partner" };

export async function signIn(page: Page, email: string, displayName: string) {
  await page.goto("/");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("test-pass-123");
  await page.locator("form").getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: displayName, exact: true }).first()).toBeVisible();
}

export async function openSettings(page: Page, displayName: string) {
  await page.getByRole("button", { name: displayName, exact: true }).and(page.locator('[aria-haspopup="menu"]')).click();
  await page.getByRole("menuitem", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();
}

export function futureDatetimeLocal(daysAhead = 14, hour = 10): string {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export async function assignNewTaskToDepartment(page: Page, dept: string) {
  const form = page.locator("form").filter({ hasText: "New task" });
  await form.getByRole("button").filter({ hasText: /Open|Engineering|Sales|people|dept/ }).first().click();
  const listbox = page.getByRole("listbox", { name: "Choose assignees" });
  await listbox.getByRole("checkbox", { name: dept, exact: true }).check();
  await page.keyboard.press("Escape");
}

export async function expectTaskTitle(page: Page, title: string) {
  await expect(page.locator(`[value="${title}"]`)).toBeVisible({ timeout: 15_000 });
}

export async function createTask(page: Page, title: string, dept?: string) {
  await page.getByRole("button", { name: "New task" }).click();
  const form = page.locator("form").filter({ hasText: "New task" });
  await form.getByLabel("Title").fill(title);
  const due = new Date();
  due.setDate(due.getDate() + 7);
  await form.getByLabel("Due").fill(due.toISOString().slice(0, 10));
  if (dept) await assignNewTaskToDepartment(page, dept);
  await form.getByRole("button", { name: "Create" }).click();
  await expect(form).toHaveCount(0, { timeout: 15_000 });
}
