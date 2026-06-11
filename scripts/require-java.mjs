#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const bundledJre = join(repoRoot, ".tools", "jdk-11", "bin", "java");

function javaBin() {
  if (process.env.JAVA_HOME) {
    const fromHome = join(process.env.JAVA_HOME, "bin", "java");
    if (existsSync(fromHome)) return fromHome;
  }
  if (existsSync(bundledJre)) return bundledJre;
  return "java";
}

function parseMajor(versionOutput) {
  const m = /version "([^"]+)"/.exec(versionOutput);
  if (!m) return 0;
  const v = m[1];
  if (v.startsWith("1.")) return Number(v.split(".")[1] ?? 0);
  return Number(v.split(".")[0] ?? 0);
}

export function ensureJava11() {
  const bin = javaBin();
  const result = spawnSync(bin, ["-version"], { encoding: "utf8" });
  const versionText = `${result.stderr ?? ""}${result.stdout ?? ""}`;
  const major = parseMajor(versionText);
  if (major < 11) {
    console.error(
      "\n[test] Java 11+ is required for Firebase emulators.\n" +
        `Current: ${versionText.trim() || "unknown"}\n\n` +
        "Options:\n" +
        "  1. Install system JDK 11+: sudo apt-get install openjdk-11-jre-headless\n" +
        "  2. Bundle locally: node scripts/setup-local-jdk.mjs\n" +
        "  3. Local skip (not for CI): npm run test:rules:optional\n"
    );
    process.exit(1);
  }
  if (existsSync(bundledJre)) {
    const home = join(repoRoot, ".tools", "jdk-11");
    process.env.JAVA_HOME = home;
    const binDir = join(home, "bin");
    process.env.PATH = `${binDir}${process.env.PATH ? `:${process.env.PATH}` : ""}`;
  }
  return bin;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  ensureJava11();
  console.log("Java 11+ OK");
}
