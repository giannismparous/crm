import type { TFunction } from "../i18n/helpers";

export function formatAuthError(err: unknown, t: TFunction): string {
  if (err instanceof Error && err.message && !isFirebaseError(err)) {
    return err.message;
  }

  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return t("auth.error.emailInUse");
    case "auth/invalid-email":
      return t("auth.error.invalidEmail");
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return t("auth.error.wrongCredentials");
    case "auth/too-many-requests":
      return t("auth.error.tooManyRequests");
    case "auth/weak-password":
      return t("auth.error.weakPassword");
    case "auth/network-request-failed":
      return t("auth.error.network");
    case "permission-denied":
      return t("auth.error.permissionDenied");
    default:
      break;
  }

  if (err instanceof Error && err.message) return err.message;
  return t("auth.error.generic");
}

function isFirebaseError(err: Error): boolean {
  return typeof (err as { code?: string }).code === "string" && (err as { code?: string }).code!.startsWith("auth/");
}
