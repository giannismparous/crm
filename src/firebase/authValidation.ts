/** 32-char hex codes from `generateSeedCode()`. */
export const REGISTRATION_SEED_PATTERN = /^[a-f0-9]{32}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function normalizeSeedCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export function validateRegistrationSeedCode(raw: string): string {
  const code = normalizeSeedCode(raw);
  if (!code) throw new Error("Enter a registration seed.");
  if (!REGISTRATION_SEED_PATTERN.test(code)) {
    throw new Error("Invalid seed format. Paste the full one-time code from your admin.");
  }
  return code;
}

export function validateEmail(raw: string): string {
  const email = raw.trim();
  if (!email) throw new Error("Enter your email.");
  if (!EMAIL_PATTERN.test(email)) throw new Error("Enter a valid email address.");
  if (email.length > 254) throw new Error("Email is too long.");
  return email;
}

export function validatePassword(raw: string, { forRegistration = false }: { forRegistration?: boolean } = {}): string {
  const password = raw;
  if (!password) throw new Error("Enter your password.");
  if (password.length < 6) throw new Error("Password must be at least 6 characters.");
  if (password.length > 128) throw new Error("Password is too long.");
  if (forRegistration && password.trim() !== password) {
    throw new Error("Password cannot start or end with spaces.");
  }
  return password;
}

export function validateSignInCredentials(email: string, password: string): { email: string; password: string } {
  return {
    email: validateEmail(email),
    password: validatePassword(password),
  };
}

export function validateRegistrationCredentials(
  email: string,
  password: string,
  seedCode: string
): { email: string; password: string; seedCode: string } {
  return {
    email: validateEmail(email),
    password: validatePassword(password, { forRegistration: true }),
    seedCode: validateRegistrationSeedCode(seedCode),
  };
}
