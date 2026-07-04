/** Skip React state updates when a Firestore snapshot normalizes to the same logical data. */
export function firestoreListFingerprint<T extends { id: string }>(
  list: T[],
  version: (item: T) => string
): string {
  if (list.length === 0) return "";
  const parts = list.map((item) => `${item.id}:${version(item)}`);
  parts.sort();
  return parts.join("|");
}

export function firestoreDocVersion(data: Record<string, unknown>): string {
  const updated = data.updatedAt;
  const created = data.createdAt;
  if (updated != null && updated !== "") return String(updated);
  if (created != null && created !== "") return String(created);
  return "";
}

export function applyFirestoreListIfChanged<T extends { id: string }>(
  fingerprintRef: { current: string },
  list: T[],
  version: (item: T) => string,
  apply: (list: T[]) => void
): void {
  const next = firestoreListFingerprint(list, version);
  if (next === fingerprintRef.current) return;
  fingerprintRef.current = next;
  apply(list);
}
