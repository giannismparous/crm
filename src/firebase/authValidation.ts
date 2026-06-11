/** 32-char hex codes from `generateSeedCode()`. */
import { loadLocale } from "../i18n/localeStorage";
import { translate } from "../i18n/translate";

export const REGISTRATION_SEED_PATTERN = /^[a-f0-9]{32}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function authMsg(key: string): string {
  return translate(loadLocale(), key);
}

export function normalizeSeedCode(raw: string): string {
  return raw.trim().toLowerCase().replace(/\s+/g, "");
}

export function validateRegistrationSeedCode(raw: string): string {
  const code = normalizeSeedCode(raw);
  if (!code) throw new Error(authMsg("auth.validation.seedRequired"));
  if (!REGISTRATION_SEED_PATTERN.test(code)) {
    throw new Error(authMsg("auth.validation.seedInvalid"));
  }
  return code;
}

export function validateEmail(raw: string): string {
  const email = raw.trim();
  if (!email) throw new Error(authMsg("auth.validation.emailRequired"));
  if (!EMAIL_PATTERN.test(email)) throw new Error(authMsg("auth.error.invalidEmail"));
  if (email.length > 254) throw new Error(authMsg("auth.validation.emailTooLong"));
  return email;
}

export function validatePassword(raw: string, { forRegistration = false }: { forRegistration?: boolean } = {}): string {
  const password = raw;
  if (!password) throw new Error(authMsg("auth.validation.passwordRequired"));
  if (password.length < 6) throw new Error(authMsg("auth.error.weakPassword"));
  if (password.length > 128) throw new Error(authMsg("auth.validation.passwordTooLong"));
  if (forRegistration && password.trim() !== password) {
    throw new Error(authMsg("auth.validation.passwordTrim"));
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
