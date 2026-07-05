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

/** Version string from Firestore doc data — falls back to common CRM fields when updatedAt is absent. */
export function firestoreDocListVersion(data: Record<string, unknown>): string {
  const base = firestoreDocVersion(data);
  if (base) return base;
  return [
    data.status,
    data.dueDate,
    data.completedAt,
    data.startsAt,
    data.title,
    data.done,
    data.read,
  ]
    .map((v) => String(v ?? ""))
    .join("|");
}

/** Team directory docs have no updatedAt — include profile fields so renames refresh the UI. */
export function personFirestoreListVersion(data: Record<string, unknown>): string {
  const base = firestoreDocVersion(data);
  if (base) return base;
  const depts = Array.isArray(data.departments)
    ? data.departments.map(String).join(",")
    : String(data.department ?? "");
  return [
    data.name,
    data.title,
    data.role,
    depts,
    data.avatarUrl,
    data.avatarStoragePath,
    data.orgRole,
    data.profileSetupComplete,
  ]
    .map((v) => String(v ?? ""))
    .join("|");
}

export type CommitFirestoreDocListOptions<T> = {
  sort?: (a: T, b: T) => number;
  docVersion?: (data: Record<string, unknown>) => string;
};

export function commitFirestoreDocList<T extends { id: string }>(
  fingerprintRef: { current: string },
  docs: Array<{ id: string; data: () => Record<string, unknown> }>,
  normalize: (id: string, data: Record<string, unknown>) => T,
  apply: (list: T[]) => void,
  options?: CommitFirestoreDocListOptions<T>
): void {
  const versionFn = options?.docVersion ?? firestoreDocListVersion;
  const versions = new Map(
    docs.map((d) => [d.id, versionFn(d.data() as Record<string, unknown>)])
  );
  const list = docs.map((d) => normalize(d.id, d.data() as Record<string, unknown>));
  if (options?.sort) list.sort(options.sort);
  applyFirestoreListIfChanged(fingerprintRef, list, (item) => versions.get(item.id) ?? item.id, apply);
}
