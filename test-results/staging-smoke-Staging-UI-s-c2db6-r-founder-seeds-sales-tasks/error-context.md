# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: staging-smoke.spec.ts >> Staging UI smoke >> partner: cross-dept task list after founder seeds sales tasks
- Location: tests/e2e/staging-smoke.spec.ts:66:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('heading', { name: 'Εργασίες' })
Expected: visible
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toBeVisible" with timeout 5000ms
  - waiting for getByRole('heading', { name: 'Εργασίες' })

```

```yaml
- banner:
  - text: SimasiaAI CRM
  - navigation "Κύρια":
    - button "Εργασίες"
    - button "Έργα"
    - button "Ραντεβού"
    - button "Ομάδα"
    - button "Υπενθυμίσεις"
    - button "Ημερολόγιο"
  - text: Συγχρονισμός…
  - button "Ειδοποιήσεις, 1 αδιάβαστες": "1"
  - button "E2E Eng Partner"
- main
- button "Όλες οι συνομιλίες"
```

# Test source

```ts
  1   | import { test, expect } from "@playwright/test";
  2   | import path from "node:path";
  3   | import {
  4   |   ENG_PARTNER,
  5   |   FOUNDER,
  6   |   assignNewTaskToDepartment,
  7   |   createTask,
  8   |   el,
  9   |   expectTaskTitle,
  10  |   futureDatetimeLocal,
  11  |   openSettings,
  12  |   signIn,
  13  | } from "./staging-smoke-helpers";
  14  | 
  15  | const e2eEnabled = process.env.CRM_E2E_ENABLED === "1";
  16  | 
  17  | test.describe.configure({ mode: "serial" });
  18  | 
  19  | test.describe("Staging UI smoke", () => {
  20  |   test.skip(!e2eEnabled, "Set CRM_E2E_ENABLED=1 (npm run test:e2e)");
  21  | 
  22  |   test("no Messages tab in primary nav", async ({ page }) => {
  23  |     await signIn(page, FOUNDER.email, FOUNDER.name);
  24  |     await expect(page.getByRole("button", { name: "Messages" })).toHaveCount(0);
  25  |   });
  26  | 
  27  |   test("founder: contacts, settings, partner codes", async ({ page }) => {
  28  |     await signIn(page, FOUNDER.email, FOUNDER.name);
  29  |     await expect(page.getByRole("button", { name: el.contacts })).toBeVisible();
  30  |     await openSettings(page, FOUNDER.name);
  31  |     await expect(page.getByText(el.partnerCodes)).toBeVisible();
  32  |     await expect(page.getByText(el.appearance)).toBeVisible();
  33  |     await expect(page.getByText(el.integrations)).toBeVisible();
  34  |     await page.getByLabel(el.closeSettings).click();
  35  |   });
  36  | 
  37  |   test("partner: restricted nav and settings before cross-dept data", async ({ page }) => {
  38  |     await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
  39  |     await expect(page.getByRole("button", { name: el.contacts })).toHaveCount(0);
  40  |     await openSettings(page, ENG_PARTNER.name);
  41  |     await expect(page.getByText(el.partnerCodes)).toHaveCount(0);
  42  |     await expect(page.getByText(el.appearance)).toBeVisible();
  43  |     await expect(page.getByText(el.integrations)).toBeVisible();
  44  |     await page.getByLabel(el.closeSettings).click();
  45  |   });
  46  | 
  47  |   test("partner: forbidden deep link", async ({ page }) => {
  48  |     await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
  49  |     await page.goto("/?tab=tasks&task=e2e-task-sales");
  50  |     await expect(page.getByText("Sales task")).toHaveCount(0);
  51  |   });
  52  | 
  53  |   test("founder: create normal and department tasks", async ({ page }) => {
  54  |     await signIn(page, FOUNDER.email, FOUNDER.name);
  55  |     await createTask(page, "Smoke normal task");
  56  |     await page.getByRole("button", { name: el.everyone }).click();
  57  |     await expect(page.getByRole("button", { name: "E2E Founder" }).first()).toBeVisible({
  58  |       timeout: 15_000,
  59  |     });
  60  |     await createTask(page, "Smoke eng dept task", "Engineering");
  61  |     await createTask(page, "Smoke sales dept task", "Sales");
  62  |     await expectTaskTitle(page, "Smoke eng dept task");
  63  |     await expectTaskTitle(page, "Smoke sales dept task");
  64  |   });
  65  | 
  66  |   test("partner: cross-dept task list after founder seeds sales tasks", async ({ page }) => {
  67  |     await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
> 68  |     await expect(page.getByRole("heading", { name: el.tasks })).toBeVisible();
      |                                                                 ^ Error: expect(locator).toBeVisible() failed
  69  |     await expectTaskTitle(page, "Engineering task");
  70  |     await expectTaskTitle(page, "Smoke eng dept task");
  71  |     await expect(page.locator('[value="Smoke sales dept task"]')).toHaveCount(0);
  72  |     await expect(page.locator('[value="Sales task"]')).toHaveCount(0);
  73  |   });
  74  | 
  75  |   test("partner: mark complete on assigned task", async ({ page }) => {
  76  |     await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
  77  |     await expect(page.getByRole("heading", { name: el.tasks })).toBeVisible();
  78  |     await expectTaskTitle(page, "Engineering task");
  79  |     await page
  80  |       .locator("article")
  81  |       .filter({ has: page.locator('[value="Engineering task"]') })
  82  |       .getByRole("button", { name: el.iFinished })
  83  |       .click();
  84  |     await page.getByRole("button", { name: el.yesSubmit }).click();
  85  |     await page.getByRole("button", { name: el.completed }).click();
  86  |     await expect(page.locator('[value="Engineering task"]')).toBeVisible({ timeout: 15_000 });
  87  |   });
  88  | 
  89  |   test("partner: create and cancel own appointment", async ({ page }) => {
  90  |     await signIn(page, ENG_PARTNER.email, ENG_PARTNER.name);
  91  |     await page.getByRole("button", { name: el.appointments }).click();
  92  |     await page.getByRole("button", { name: el.newAppointment }).click();
  93  |     await page.getByLabel(el.title).fill("Partner smoke appointment");
  94  |     await page.getByLabel(el.starts, { exact: true }).fill(futureDatetimeLocal(10));
  95  |     await page.getByRole("button", { name: el.createAppointment }).click();
  96  |     await expect(page.getByRole("heading", { name: "Partner smoke appointment" })).toBeVisible({
  97  |       timeout: 15_000,
  98  |     });
  99  |     await expect(page.getByRole("button", { name: /hard delete|delete appointment/i })).toHaveCount(0);
  100 |     await page.getByRole("button", { name: el.cancelAppointment }).click();
  101 |     await page.getByRole("button", { name: el.yesCancelAppointment }).click();
  102 |     await page.getByRole("button", { name: el.canceled }).click();
  103 |     await expect(page.getByText("Partner smoke appointment")).toBeVisible({ timeout: 10_000 });
  104 |   });
  105 | 
  106 |   test("founder: create normal appointment", async ({ page }) => {
  107 |     await signIn(page, FOUNDER.email, FOUNDER.name);
  108 |     await page.getByRole("button", { name: el.appointments }).click();
  109 |     await page.getByRole("button", { name: el.newAppointment }).click();
  110 |     await page.getByLabel(el.title).fill("Smoke single appointment");
  111 |     await page.getByLabel(el.starts, { exact: true }).fill(futureDatetimeLocal(7));
  112 |     await page.getByRole("button", { name: el.createAppointment }).click();
  113 |     await expect(page.getByRole("heading", { name: "Smoke single appointment" })).toBeVisible({
  114 |       timeout: 15_000,
  115 |     });
  116 |   });
  117 | 
  118 |   test("founder: create weekly recurring x12 and edit one instance", async ({ page }) => {
  119 |     await signIn(page, FOUNDER.email, FOUNDER.name);
  120 |     await page.getByRole("button", { name: el.appointments }).click();
  121 |     await page.getByRole("button", { name: el.newAppointment }).click();
  122 |     await page.getByLabel(el.title).fill("Smoke weekly series");
  123 |     await page.getByLabel(el.starts, { exact: true }).fill(futureDatetimeLocal(21));
  124 |     await page.getByLabel(el.recurringMeeting).check();
  125 |     await page.getByLabel(el.numberOfMeetings).fill("12");
  126 |     await page.getByRole("button", { name: el.createAppointment }).click();
  127 |     await expect(page.getByRole("heading", { name: "Smoke weekly series" })).toBeVisible({
  128 |       timeout: 20_000,
  129 |     });
  130 |     await expect(page.getByText(el.recurring)).toHaveCount(12, { timeout: 15_000 });
  131 | 
  132 |     await page.getByRole("button", { name: /Smoke weekly series/ }).first().click();
  133 |     await page.getByRole("button", { name: el.edit }).click();
  134 |     await page.getByLabel(el.title).fill("Smoke weekly series edited");
  135 |     await page.getByRole("button", { name: el.saveChanges }).click();
  136 |     await expect(page.getByRole("heading", { name: "Smoke weekly series edited" })).toBeVisible({
  137 |       timeout: 15_000,
  138 |     });
  139 |     await expect(page.getByRole("button", { name: /Smoke weekly series edited/ })).toHaveCount(1);
  140 |     await expect(page.getByRole("button", { name: new RegExp(`^Smoke weekly series${el.recurring}`) })).toHaveCount(11);
  141 |   });
  142 | 
  143 |   test("founder: cancel appointment (no hard-delete UI)", async ({ page }) => {
  144 |     await signIn(page, FOUNDER.email, FOUNDER.name);
  145 |     await page.getByRole("button", { name: el.appointments }).click();
  146 |     await page.getByRole("button", { name: /Smoke single appointment/ }).click();
  147 |     await expect(page.getByRole("button", { name: el.cancelAppointment })).toBeVisible();
  148 |     await expect(page.getByRole("button", { name: /hard delete|delete appointment/i })).toHaveCount(0);
  149 |     await page.getByRole("button", { name: el.cancelAppointment }).click();
  150 |     await page.getByRole("button", { name: el.yesCancelAppointment }).click();
  151 |     await page.getByRole("button", { name: el.canceled }).click();
  152 |     await expect(page.getByText("Smoke single appointment")).toBeVisible({ timeout: 10_000 });
  153 |   });
  154 | 
  155 |   test("google calendar settings: opens without full sync button auto-run", async ({ page }) => {
  156 |     await signIn(page, FOUNDER.email, FOUNDER.name);
  157 |     await openSettings(page, FOUNDER.name);
  158 |     await expect(page.getByText("Google Calendar", { exact: true })).toBeVisible();
  159 |     await expect(page.getByText(el.notConnected)).toBeVisible({ timeout: 10_000 });
  160 |     await expect(page.getByRole("button", { name: new RegExp(el.connectGoogleCalendar, "i") })).toBeVisible();
  161 |     await expect(page.getByText(/Συγχρονίστηκ|Synced \d+ upcoming/i)).toHaveCount(0);
  162 |     await page.getByLabel(el.closeSettings).click();
  163 |   });
  164 | 
  165 |   test("chat: send and unsend via floating dock", async ({ page }) => {
  166 |     await signIn(page, FOUNDER.email, FOUNDER.name);
  167 |     await page.getByRole("button", { name: el.allChats }).click();
  168 |     await page.getByRole("button", { name: el.newDm }).click();
```