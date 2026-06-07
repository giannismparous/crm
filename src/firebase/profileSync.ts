/** Set after registerWithSeed finishes consume + ensureUserProfile (avoids auth race). */
const synchronizedUids = new Set<string>();

export function markUserProfileSynchronized(uid: string): void {
  synchronizedUids.add(uid);
}

export function consumeUserProfileSynchronized(uid: string): boolean {
  if (!synchronizedUids.has(uid)) return false;
  synchronizedUids.delete(uid);
  return true;
}
