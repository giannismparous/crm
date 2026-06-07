export function formatAuthError(err: unknown): string {
  if (err instanceof Error && err.message && !isFirebaseError(err)) {
    return err.message;
  }

  const code = (err as { code?: string })?.code ?? "";
  switch (code) {
    case "auth/email-already-in-use":
      return "An account with this email already exists. Sign in instead.";
    case "auth/invalid-email":
      return "Enter a valid email address.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
    case "auth/invalid-login-credentials":
      return "Incorrect email or password.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/weak-password":
      return "Password must be at least 6 characters.";
    case "auth/network-request-failed":
      return "Network error. Check your connection and try again.";
    case "permission-denied":
      return "Permission denied. Check your connection or contact your admin.";
    default:
      break;
  }

  if (err instanceof Error && err.message) return err.message;
  return "Something went wrong. Try again.";
}

function isFirebaseError(err: Error): boolean {
  return typeof (err as { code?: string }).code === "string" && (err as { code?: string }).code!.startsWith("auth/");
}
