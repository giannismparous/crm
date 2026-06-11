#!/usr/bin/env node
/**
 * Staging frontend deploy to crm-simasiaai.netlify.app only.
 * Requires NETLIFY_AUTH_TOKEN in environment. Never logs the token.
 */
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const STAGING_HOST = "crm-simasiaai.netlify.app";
const ROOT = resolve(import.meta.dirname, "..");

function fail(msg) {
  console.error(msg);
  process.exit(1);
}

function loadToken() {
  const fromEnv = process.env.NETLIFY_AUTH_TOKEN?.trim();
  if (fromEnv) return fromEnv;
  const localPath = resolve(ROOT, ".netlify-auth.local");
  if (existsSync(localPath)) {
    const fromFile = readFileSync(localPath, "utf8").trim();
    if (fromFile) return fromFile;
  }
  return "";
}

const token = loadToken();
if (!token) fail("NETLIFY_AUTH_TOKEN is NOT set");

console.log("NETLIFY_AUTH_TOKEN is set");

const listRes = await fetch("https://api.netlify.com/api/v1/sites?per_page=100", {
  headers: { Authorization: `Bearer ${token}` },
});
if (!listRes.ok) {
  fail(`Netlify API list sites failed: HTTP ${listRes.status}`);
}
const sites = await listRes.json();
const target = sites.find(
  (s) =>
    s.ssl_url === `https://${STAGING_HOST}/` ||
    s.url === `https://${STAGING_HOST}/` ||
    s.name === "crm-simasiaai" ||
    (s.custom_domain && s.custom_domain === STAGING_HOST) ||
    (Array.isArray(s.domain_aliases) && s.domain_aliases.includes(STAGING_HOST))
);

if (!target?.id) {
  console.error("Could not resolve staging site. Sites returned:");
  for (const s of sites) {
    console.error(`- ${s.name} | ${s.ssl_url || s.url} | id=${s.id}`);
  }
  fail(`STOP: staging site ${STAGING_HOST} not found — do not guess site id.`);
}

console.log(`Target site confirmed: ${target.name}`);
console.log(`Site URL: ${target.ssl_url || target.url}`);
console.log(`Site ID: ${target.id}`);

if (!existsSync(resolve(ROOT, "dist/index.html"))) {
  fail("dist/index.html missing — run npm run build first");
}

const deploy = spawnSync(
  "npx",
  [
    "netlify-cli",
    "deploy",
    "--prod",
    "--dir=dist",
    "--no-build",
    `--site=${target.id}`,
    "--message=fix staging Firebase API key",
  ],
  {
    cwd: ROOT,
    env: { ...process.env, NETLIFY_AUTH_TOKEN: token },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }
);

if (deploy.stdout) process.stdout.write(deploy.stdout);
if (deploy.stderr) process.stderr.write(deploy.stderr);
if (deploy.status !== 0) fail(`Netlify deploy failed with exit code ${deploy.status}`);

const out = `${deploy.stdout}\n${deploy.stderr}`;
const liveMatch = out.match(/https?:\/\/[^\s]+/g) || [];
const unique = [...new Set(liveMatch)].filter((u) => u.includes("netlify.app"));
console.log("Deploy URLs:");
for (const u of unique) console.log(u);
