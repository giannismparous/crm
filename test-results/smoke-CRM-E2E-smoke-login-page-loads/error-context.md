# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: smoke.spec.ts >> CRM E2E smoke >> login page loads
- Location: tests/e2e/smoke.spec.ts:8:3

# Error details

```
Error: expect(locator).toBeVisible() failed

Locator: getByRole('button', { name: /Σύνδεση|Sign in/i })
Expected: visible
Error: strict mode violation: getByRole('button', { name: /Σύνδεση|Sign in/i }) resolved to 2 elements:
    1) <button type="button" class="rounded-md px-3 py-1.5 text-xs font-semibold bg-white text-slate-900 shadow-sm ring-1 ring-slate-200">Σύνδεση</button> aka getByRole('button', { name: 'Σύνδεση' }).first()
    2) <button type="submit" class="w-full rounded-lg bg-accent py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-accent-dim disabled:opacity-60">Σύνδεση</button> aka locator('form').getByRole('button', { name: 'Σύνδεση' })

Call log:
  - Expect "toBeVisible" with timeout 15000ms
  - waiting for getByRole('button', { name: /Σύνδεση|Sign in/i })

```

# Page snapshot

```yaml
- generic [ref=e4]:
  - heading "SimasiaAI CRM" [level=1] [ref=e5]:
    - generic [ref=e6]:
      - generic [ref=e7]: SimasiaAI
      - generic [ref=e8]:
        - generic [ref=e9]: ·
        - generic [ref=e10]: CRM
  - paragraph [ref=e11]: Συνδεθείτε με το email της ομάδας σας για να φορτώσετε τα δεδομένα.
  - generic [ref=e12]:
    - button "Σύνδεση" [ref=e13] [cursor=pointer]
    - button "Εγγραφή" [ref=e14] [cursor=pointer]
  - generic [ref=e15]:
    - generic [ref=e16]:
      - text: Email
      - textbox "Email" [ref=e17]
    - generic [ref=e18]:
      - text: Κωδικός πρόσβασης
      - textbox "Κωδικός πρόσβασης" [ref=e19]
    - button "Σύνδεση" [ref=e20] [cursor=pointer]
```

# Test source

```ts
  1  | import { test, expect } from "@playwright/test";
  2  | 
  3  | const e2eEnabled = process.env.CRM_E2E_ENABLED === "1";
  4  | 
  5  | test.describe("CRM E2E smoke", () => {
  6  |   test.skip(!e2eEnabled, "Set CRM_E2E_ENABLED=1 with emulator-backed dev server to run E2E");
  7  | 
  8  |   test("login page loads", async ({ page }) => {
  9  |     await page.goto("/");
> 10 |     await expect(page.getByRole("button", { name: /Σύνδεση|Sign in/i })).toBeVisible({
     |                                                                          ^ Error: expect(locator).toBeVisible() failed
  11 |       timeout: 15_000,
  12 |     });
  13 |   });
  14 | });
  15 | 
```