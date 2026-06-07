const { readFileSync, existsSync } = require("node:fs");
const { resolve } = require("node:path");

const CRM_ROOT = resolve(__dirname, "..");

const DEFAULT_SERVICE_ACCOUNT_FILES = ["service-account.json", "serviceAccount.json"];

function serviceAccountCandidates() {
  const explicit = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  return [
    explicit ? resolve(explicit) : null,
    explicit ? resolve(CRM_ROOT, explicit) : null,
    ...DEFAULT_SERVICE_ACCOUNT_FILES.map((name) => resolve(CRM_ROOT, name)),
  ].filter(Boolean);
}

function resolveServiceAccountPath() {
  const candidates = serviceAccountCandidates();
  const path = candidates.find((p) => existsSync(p));
  if (!path) return null;

  const explicit = process.env.FIREBASE_SERVICE_ACCOUNT_PATH?.trim();
  const usedDefault =
    explicit &&
    !existsSync(resolve(explicit)) &&
    !existsSync(resolve(CRM_ROOT, explicit)) &&
    DEFAULT_SERVICE_ACCOUNT_FILES.some((name) => path === resolve(CRM_ROOT, name));

  if (usedDefault) {
    console.warn(`FIREBASE_SERVICE_ACCOUNT_PATH not found — using ${path}`);
  }

  return path;
}

function loadServiceAccount() {
  const path = resolveServiceAccountPath();
  if (!path) {
    console.error(
      "Missing service account JSON.\n" +
        "  Option A: place file at crm/service-account.json\n" +
        "  Option B: set FIREBASE_SERVICE_ACCOUNT_PATH in .env"
    );
    process.exit(1);
  }
  return JSON.parse(readFileSync(path, "utf-8"));
}

module.exports = {
  CRM_ROOT,
  DEFAULT_SERVICE_ACCOUNT_FILES,
  loadServiceAccount,
  resolveServiceAccountPath,
};
