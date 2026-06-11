#!/usr/bin/env node
/**
 * Download a portable Temurin JRE 11 into .tools/jdk-11 (repo-local, no sudo).
 */
import { spawnSync } from "node:child_process";
import { createWriteStream, existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { pipeline } from "node:stream/promises";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = join(__dirname, "..");
const toolsDir = join(repoRoot, ".tools");
const targetDir = join(toolsDir, "jdk-11");
const javaBin = join(targetDir, "bin", "java");

const URL =
  "https://github.com/adoptium/temurin11-binaries/releases/download/jdk-11.0.26%2B4/OpenJDK11U-jre_x64_linux_hotspot_11.0.26_4.tar.gz";

async function download(url, dest) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed: ${res.status} ${url}`);
  await pipeline(res.body, createWriteStream(dest));
}

async function main() {
  if (existsSync(javaBin)) {
    console.log("Bundled JDK already present at", targetDir);
    return;
  }
  mkdirSync(toolsDir, { recursive: true });
  const archive = join(toolsDir, "temurin11-jre.tar.gz");
  console.log("Downloading Temurin JRE 11...");
  await download(URL, archive);
  console.log("Extracting...");
  const extract = spawnSync("tar", ["-xzf", archive, "-C", toolsDir], { stdio: "inherit" });
  if (extract.status !== 0) process.exit(extract.status ?? 1);
  const extracted = readdirSync(toolsDir).find((e) => e.startsWith("jdk-11"));
  if (!extracted) throw new Error("Extracted JDK folder not found");
  if (extracted !== "jdk-11") {
    spawnSync("mv", [join(toolsDir, extracted), targetDir], { stdio: "inherit" });
  }
  rmSync(archive, { force: true });
  console.log("JDK ready:", javaBin);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
