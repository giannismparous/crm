/** Normalize review checklist from Firestore (supports legacy `prepNotes` text). */
export function normalizeReviewItems(data: Record<string, unknown>): string[] {
  if (Array.isArray(data.reviewItems)) {
    return [
      ...new Set(
        data.reviewItems.map((x) => String(x).trim()).filter(Boolean)
      ),
    ];
  }
  const legacy = String(data.prepNotes ?? "").trim();
  if (!legacy) return [];
  return [
    ...new Set(
      legacy
        .split(/\n/)
        .map((line) => line.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
    ),
  ];
}

export function reviewItemsForSearch(items: string[] | undefined): string {
  return (items ?? []).join(" ");
}
