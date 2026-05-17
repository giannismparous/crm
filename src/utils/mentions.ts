import type { Person } from "../types";
import { TEAM_DEPARTMENTS } from "../types";

export type ParsedMention =
  | { kind: "person"; id: string; label: string }
  | { kind: "department"; id: string; label: string };

/** Find @mentions in text (longest names first, case-insensitive match). */
export function parseMentionsFromText(body: string, people: Person[]): ParsedMention[] {
  const entries: { kind: "person" | "department"; name: string; id: string }[] = [
    ...people.map((p) => ({ kind: "person" as const, name: p.name.trim(), id: p.id })),
    ...TEAM_DEPARTMENTS.map((d) => ({ kind: "department" as const, name: d, id: d })),
  ]
    .filter((e) => e.name.length > 0)
    .sort((a, b) => b.name.length - a.name.length);

  const found: ParsedMention[] = [];
  const seen = new Set<string>();
  const lower = body.toLowerCase();

  for (let i = 0; i < body.length; i++) {
    if (body[i] !== "@") continue;
    const restLower = lower.slice(i + 1);
    for (const entry of entries) {
      const nameLower = entry.name.toLowerCase();
      if (!restLower.startsWith(nameLower)) continue;
      const after = body[i + 1 + entry.name.length];
      if (after && !/[\s,.!?;:]/.test(after)) continue;
      const key = `${entry.kind}:${entry.id}`;
      if (seen.has(key)) break;
      seen.add(key);
      found.push(
        entry.kind === "person"
          ? { kind: "person", id: entry.id, label: entry.name }
          : { kind: "department", id: entry.id, label: entry.name }
      );
      break;
    }
  }
  return found;
}
