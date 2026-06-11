/** Skip ensureUserProfile while registerWithSeed is writing org profile docs. */
const synchronizedUids = new Set<string>();

/** Until profile doc is read, keep new sign-ups on the setup gate (not the main shell). */
const profileSetupPendingUids = new Set<string>();

export function markUserProfileSynchronized(uid: string): void {
  synchronizedUids.add(uid);
}

export function clearUserProfileSynchronized(uid: string): void {
  synchronizedUids.delete(uid);
}

export function consumeUserProfileSynchronized(uid: string): boolean {
  if (!synchronizedUids.has(uid)) return false;
  synchronizedUids.delete(uid);
  return true;
}

export function markProfileSetupPending(uid: string): void {
  profileSetupPendingUids.add(uid);
}

export function clearProfileSetupPending(uid: string): void {
  profileSetupPendingUids.delete(uid);
}

export function isProfileSetupPending(uid: string): boolean {
  return profileSetupPendingUids.has(uid);
}
