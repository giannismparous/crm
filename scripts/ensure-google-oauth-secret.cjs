const { execSync } = require("node:child_process");

/** Load Google OAuth client secret for local admin scripts (Firebase secret in production). */
function ensureGoogleOAuthClientSecret() {
  if (process.env.GOOGLE_OAUTH_CLIENT_SECRET?.trim()) return;
  try {
    const secret = execSync("npx firebase functions:secrets:access GOOGLE_OAUTH_CLIENT_SECRET", {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
    if (secret) process.env.GOOGLE_OAUTH_CLIENT_SECRET = secret;
  } catch {
    /* caller will fail with a clear OAuth error */
  }
}

module.exports = { ensureGoogleOAuthClientSecret };
