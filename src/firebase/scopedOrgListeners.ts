import {
  collection,
  onSnapshot,
  query,
  where,
  type Firestore,
  type Query,
  type Unsubscribe,
} from "firebase/firestore";

export function chunk<T>(items: T[], size: number): T[][] {
  const batches: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    batches.push(items.slice(i, i + size));
  }
  return batches;
}

export type MergeSnapshotOptions<T> = {
  normalize: (id: string, data: Record<string, unknown>) => T;
  onData: (list: T[]) => void;
  onError: (message: string) => void;
  sort?: (a: T, b: T) => number;
};

/** Merge multiple rule-compatible queries into one listener result (deduped by doc id). */
export function subscribeMergedQueries<T>(
  queries: Query[],
  options: MergeSnapshotOptions<T>
): Unsubscribe {
  const buckets = new Map<number, Map<string, T>>();
  let alive = true;

  const emit = () => {
    if (!alive) return;
    const merged = new Map<string, T>();
    for (const bucket of buckets.values()) {
      for (const [id, item] of bucket) merged.set(id, item);
    }
    const list = Array.from(merged.values());
    if (options.sort) list.sort(options.sort);
    options.onData(list);
  };

  if (queries.length === 0) {
    options.onData([]);
    return () => {
      alive = false;
    };
  }

  const unsubs = queries.map((q, index) =>
    onSnapshot(
      q,
      (snap) => {
        const bucket = new Map<string, T>();
        for (const d of snap.docs) {
          bucket.set(d.id, options.normalize(d.id, d.data() as Record<string, unknown>));
        }
        buckets.set(index, bucket);
        emit();
      },
      (e) => {
        const code = (e as { code?: string }).code;
        const msg = e.message ?? String(e);
        if (code === "permission-denied") {
          console.warn("scoped query permission denied", index, msg);
          buckets.set(index, new Map());
          emit();
          return;
        }
        options.onError(msg);
      }
    )
  );

  return () => {
    alive = false;
    for (const unsub of unsubs) unsub();
    buckets.clear();
  };
}

export function partnerTaskQueries(
  db: Firestore,
  orgId: string,
  uid: string,
  departments: string[],
  visibleProjectIds: string[]
): Query[] {
  const col = collection(db, "organizations", orgId, "tasks");
  const queries: Query[] = [
    query(col, where("assigneeIds", "array-contains", uid)),
    query(col, where("assigneeDepartmentIds", "array-contains", "General")),
    query(col, where("assigneeDepartmentIds", "==", [])),
  ];
  if (departments.length > 0) {
    queries.push(query(col, where("assigneeDepartmentIds", "array-contains-any", departments)));
  }
  for (const batch of chunk(
    [...new Set(visibleProjectIds.filter(Boolean))],
    10
  )) {
    queries.push(query(col, where("projectId", "in", batch)));
  }
  return queries;
}

export function partnerProjectQueries(
  db: Firestore,
  orgId: string,
  departments: string[]
): Query[] {
  const col = collection(db, "organizations", orgId, "projects");
  const queries: Query[] = [
    query(col, where("departmentIds", "array-contains", "General")),
    query(col, where("departmentIds", "==", [])),
  ];
  if (departments.length > 0) {
    queries.push(query(col, where("departmentIds", "array-contains-any", departments)));
  }
  return queries;
}

export function partnerAppointmentQueries(
  db: Firestore,
  orgId: string,
  uid: string,
  departments: string[]
): Query[] {
  const col = collection(db, "organizations", orgId, "appointments");
  const queries: Query[] = [
    query(col, where("createdById", "==", uid)),
    query(col, where("participantIds", "array-contains", uid)),
  ];
  if (departments.length > 0) {
    queries.push(query(col, where("participantDepartmentIds", "array-contains-any", departments)));
  }
  return queries;
}

export function partnerPersonalReminderQueries(
  db: Firestore,
  orgId: string,
  uid: string,
  departments: string[]
): Query[] {
  const col = collection(db, "organizations", orgId, "personalReminders");
  const queries: Query[] = [
    query(col, where("ownerId", "==", uid)),
    query(col, where("participantIds", "array-contains", uid)),
  ];
  if (departments.length > 0) {
    queries.push(query(col, where("participantDepartmentIds", "array-contains-any", departments)));
  }
  return queries;
}

export function partnerPeopleQueries(
  db: Firestore,
  orgId: string,
  departments: string[]
): Query[] {
  if (departments.length === 0) return [];
  const col = collection(db, "organizations", orgId, "people");
  return [query(col, where("departments", "array-contains-any", departments))];
}
