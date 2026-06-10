import type { Person } from "../types";
import { TEAM_DEPARTMENTS } from "../types";

export type ParsedMention =
  | { kind: "person"; id: string; label: string }
  | { kind: "department"; id: string; label: string }
  | { kind: "update"; id: string; label: string };

export type UpdateMentionOption = { id: string; label: string };

function mentionBoundaryOk(body: string, start: number, nameLen: number): boolean {
  const after = body[start + 1 + nameLen];
  return !after || /[\s,.!?;:]/.test(after);
}

/** Find @mentions in text (longest names first, case-insensitive match). */
export function parseMentionsFromText(
  body: string,
  people: Person[],
  updateMentions: UpdateMentionOption[] = []
): ParsedMention[] {
  const entries: { kind: ParsedMention["kind"]; name: string; id: string }[] = [
    ...updateMentions.map((u) => ({ kind: "update" as const, name: u.label.trim(), id: u.id })),
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
      if (!mentionBoundaryOk(body, i, entry.name.length)) continue;
      const key = `${entry.kind}:${entry.id}`;
      if (seen.has(key)) break;
      seen.add(key);
      found.push({ kind: entry.kind, id: entry.id, label: entry.name });
      break;
    }
  }
  return found;
}
