#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { ensureJava11 } from "./require-java.mjs";

const mode = process.argv[2];
if (mode !== "rules" && mode !== "integration") {
  console.error("Usage: node scripts/run-emulator-tests.mjs <rules|integration>");
  process.exit(1);
}

ensureJava11();

const only =
  mode === "rules" ? "firestore" : "auth,firestore,storage";
const config =
  mode === "rules" ? "vitest.rules.config.ts" : "vitest.integration.config.ts";
const cmd = `vitest run --config ${config}`;

const result = spawnSync(
  "firebase",
  ["emulators:exec", `--only`, only, cmd],
  { stdio: "inherit", shell: false, env: { ...process.env, CRM_TEST_STRICT: "1" } }
);

process.exit(result.status ?? 1);
