import { deleteObject, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseAuth, getFirebaseStorage, SIMASIA_AI_ORG_ID } from "../firebase/config";
import type { ImageAttachment, InlineMediaKind } from "../types";
import { MAX_AUDIO_BYTES, MAX_IMAGE_BYTES, MAX_VIDEO_BYTES } from "../types";

const ORG_STORAGE_PREFIX = `organizations/${SIMASIA_AI_ORG_ID}/`;

/** Reject path traversal and paths outside this org's Storage tree. */
export function sanitizeStorageDir(dir: string): string {
  const cleaned = dir
    .replace(/\\/g, "/")
    .replace(/\.\./g, "")
    .replace(/^\/+/, "")
    .replace(/\/+/g, "/")
    .trim();
  if (!cleaned || !/^[a-zA-Z0-9][a-zA-Z0-9_\-/]*$/.test(cleaned)) {
    throw new Error("Invalid storage path.");
  }
  return cleaned;
}

export function isOrgStoragePath(path: string): boolean {
  const normalized = path.trim().replace(/\\/g, "/");
  return normalized.startsWith(ORG_STORAGE_PREFIX) && !normalized.includes("..");
}

function assertOrgStoragePath(path: string): string {
  const normalized = path.trim().replace(/\\/g, "/");
  if (!isOrgStoragePath(normalized)) {
    throw new Error("Invalid storage path.");
  }
  return normalized;
}

export function normalizeImageAttachments(value: unknown): ImageAttachment[] {
  if (!Array.isArray(value)) return [];
  const out: ImageAttachment[] = [];
  for (const raw of value) {
    if (!raw || typeof raw !== "object") continue;
    const o = raw as Record<string, unknown>;
    const url = String(o.url ?? "").trim();
    const storagePath = String(o.storagePath ?? "").trim();
    if (!url || !storagePath || !isOrgStoragePath(storagePath)) continue;
    const name = String(o.name ?? "").trim();
    const kindRaw = String(o.kind ?? "").trim();
    const kind =
      kindRaw === "image" || kindRaw === "video" || kindRaw === "audio" || kindRaw === "file"
        ? (kindRaw as InlineMediaKind)
        : undefined;
    const fingerprint = String(o.fingerprint ?? "").trim() || undefined;
    const row: ImageAttachment = { url, storagePath };
    if (name) row.name = name;
    if (kind) row.kind = kind;
    if (fingerprint) row.fingerprint = fingerprint;
    out.push(row);
  }
  return out;
}

export function imageAttachmentsForFirestore(attachments: ImageAttachment[]): Record<string, unknown>[] {
  return attachments.map((a) => {
    const row: Record<string, unknown> = { url: a.url, storagePath: a.storagePath };
    if (a.name) row.name = a.name;
    if (a.kind) row.kind = a.kind;
    if (a.fingerprint) row.fingerprint = a.fingerprint;
    return row;
  });
}

export function attachmentMediaKind(attachment: ImageAttachment): InlineMediaKind {
  if (attachment.kind) return attachment.kind;
  const hint = `${attachment.storagePath} ${attachment.name ?? ""}`.toLowerCase();
  if (/\.(mp4|webm|mov|m4v)(\?|$)/.test(hint)) return "video";
  if (/\.(mp3|wav|m4a|aac|flac|ogg)(\?|$)/.test(hint)) return "audio";
  if (/\.(jpe?g|png|webp|gif|avif)(\?|$)/.test(hint)) return "image";
  return "file";
}

export function mediaKindForFile(file: File): InlineMediaKind | null {
  if (file.type.startsWith("image/")) return "image";
  if (file.type.startsWith("video/")) return "video";
  if (file.type.startsWith("audio/")) return "audio";
  const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
  if (["jpg", "jpeg", "png", "webp", "gif", "avif"].includes(ext)) return "image";
  if (["mp4", "webm", "mov", "ogg", "m4v"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "m4a", "aac", "flac", "webm"].includes(ext)) return "audio";
  return null;
}

function maxBytesForKind(kind: InlineMediaKind): number {
  if (kind === "video") return MAX_VIDEO_BYTES;
  if (kind === "audio") return MAX_AUDIO_BYTES;
  return MAX_IMAGE_BYTES;
}

function extForFile(file: File): string {
  const base = file.name.trim().toLowerCase();
  const fromName = base.includes(".") ? base.split(".").pop() : "";
  if (fromName && /^[a-z0-9]{1,10}$/.test(fromName)) return fromName;
  if (file.type === "image/png") return "png";
  if (file.type === "image/webp") return "webp";
  if (file.type === "image/gif") return "gif";
  if (file.type === "video/webm") return "webm";
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "audio/mpeg") return "mp3";
  if (file.type === "audio/wav") return "wav";
  if (file.type === "audio/mp4" || file.type === "audio/x-m4a") return "m4a";
  const kind = mediaKindForFile(file);
  if (kind === "video") return "mp4";
  if (kind === "audio") return "mp3";
  return "jpg";
}

function mimeForFile(file: File): string {
  if (file.type) return file.type;
  const ext = extForFile(file);
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "webm") return "video/webm";
  if (ext === "mov") return "video/quicktime";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "wav") return "audio/wav";
  if (ext === "m4a") return "audio/mp4";
  if (mediaKindForFile(file) === "video") return "video/mp4";
  if (mediaKindForFile(file) === "audio") return "audio/mpeg";
  if (mediaKindForFile(file) === "image") return "image/jpeg";
  return "application/octet-stream";
}

function isValidMediaFile(file: File, kind: InlineMediaKind): boolean {
  return mediaKindForFile(file) === kind && file.size > 0 && file.size <= maxBytesForKind(kind);
}

function isValidImageFile(file: File): boolean {
  return isValidMediaFile(file, "image");
}

/** Any attachment: video up to 100 MB, everything else up to 20 MB. */
export function isValidAttachmentFile(file: File): boolean {
  if (file.size <= 0) return false;
  const kind = mediaKindForFile(file);
  if (kind === "video") return file.size <= MAX_VIDEO_BYTES;
  return file.size <= MAX_IMAGE_BYTES;
}

export function partitionAttachmentFiles(files: File[]): {
  valid: File[];
  rejected: number;
} {
  const valid: File[] = [];
  let rejected = 0;
  for (const file of files) {
    if (!isValidAttachmentFile(file)) {
      rejected++;
      continue;
    }
    valid.push(file);
  }
  return { valid, rejected };
}

/** Validate picked files before upload (client-side). */
export function filterValidImageFiles(files: File[]): File[] {
  return files.filter(isValidImageFile);
}

/** Split a file pick into uploadable files and skip reasons (for UI messages). */
export function partitionImageFiles(files: File[]): {
  valid: File[];
  rejected: number;
} {
  const accepted: File[] = [];
  let rejected = 0;
  for (const f of files) {
    if (!isValidImageFile(f)) {
      rejected++;
      continue;
    }
    accepted.push(f);
  }
  return { valid: accepted, rejected };
}

/** Decode a Firebase Storage download URL back to its object path. */
export function storagePathFromDownloadUrl(url: string): string | null {
  try {
    const parsed = new URL(url.trim());
    if (!parsed.hostname.includes("firebasestorage.googleapis.com")) return null;
    const encoded = parsed.pathname.match(/\/o\/(.+)$/)?.[1];
    if (!encoded) return null;
    return decodeURIComponent(encoded);
  } catch {
    return null;
  }
}

/** Turn Firebase Storage failures into actionable messages. */
export function storageUploadErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  if (code === "storage/unauthorized") {
    return "Storage blocked (403). Firebase Console → Storage → Rules → Publish rules with allow read, allow delete, and allow create/update for signed-in users (see storage.rules). Also check App Check enforcement.";
  }
  if (code === "storage/unauthenticated") {
    return "You must be signed in.";
  }
  if (err instanceof Error && err.message) return err.message;
  return "Storage operation failed. Try again.";
}

async function uploadOneImage(
  storageDir: string,
  file: File,
  index: number
): Promise<ImageAttachment> {
  const storage = getFirebaseStorage();
  const base = `${ORG_STORAGE_PREFIX}${sanitizeStorageDir(storageDir)}`;
  const id = `${Date.now()}_${index}_${Math.random().toString(36).slice(2, 9)}`;
  const storagePath = `${base}/${id}.${extForFile(file)}`;
  const storageRef = ref(storage, storagePath);
  await uploadBytes(storageRef, file, { contentType: mimeForFile(file) });
  const url = await getDownloadURL(storageRef);
  const kind = mediaKindForFile(file) ?? "file";
  return {
    url,
    storagePath,
    name: file.name || undefined,
    kind,
    fingerprint: mediaFileFingerprint(file),
  };
}

async function ensureUploadAuth(): Promise<void> {
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw Object.assign(new Error("You must be signed in to upload images."), {
      code: "storage/unauthenticated",
    });
  }
}

/** Stable id for the same local file (name + size + lastModified). */
export function mediaFileFingerprint(file: File): string {
  return `${file.name}\0${file.size}\0${file.lastModified}`;
}

/** User-facing copy when a pick overlaps existing or in-flight uploads. */
export function duplicateUploadMessage(duplicates: number, partial = false): string {
  if (duplicates <= 0) return "";
  if (!partial) {
    return duplicates === 1
      ? "This file is already uploaded."
      : "These files are already uploaded.";
  }
  return duplicates === 1 ? "1 file already uploaded." : `${duplicates} files already uploaded.`;
}

/** Drop files already present in `existing` or repeated within the pick. */
export function partitionUniqueFiles(
  files: File[],
  existing: ReadonlySet<string>
): { valid: File[]; duplicates: number } {
  const seen = new Set(existing);
  const valid: File[] = [];
  let duplicates = 0;
  for (const file of files) {
    const fp = mediaFileFingerprint(file);
    if (seen.has(fp)) {
      duplicates++;
      continue;
    }
    seen.add(fp);
    valid.push(file);
  }
  return { valid, duplicates };
}

/** Split a file pick by media kind (for UI messages). */
export function partitionMediaFiles(files: File[], kind: InlineMediaKind): {
  valid: File[];
  rejected: number;
} {
  const accepted: File[] = [];
  let rejected = 0;
  for (const f of files) {
    if (!isValidMediaFile(f, kind)) {
      rejected++;
      continue;
    }
    accepted.push(f);
  }
  return { valid: accepted, rejected };
}

/** Upload any file (image, video, audio, or generic attachment). */
export async function uploadSingleFile(
  storageDir: string,
  file: File,
  index = 0
): Promise<ImageAttachment> {
  if (!isValidAttachmentFile(file)) {
    throw new Error("Invalid file.");
  }
  await ensureUploadAuth();
  return uploadOneImage(storageDir, file, index);
}

/** Upload one media file (image, video, or audio). */
export async function uploadSingleMediaFile(
  storageDir: string,
  file: File,
  index = 0
): Promise<ImageAttachment> {
  const kind = mediaKindForFile(file);
  if (!kind || !isValidMediaFile(file, kind)) {
    throw new Error("Invalid media file.");
  }
  await ensureUploadAuth();
  return uploadOneImage(storageDir, file, index);
}

/** Upload one image file. */
export async function uploadSingleImageFile(
  storageDir: string,
  file: File,
  index = 0
): Promise<ImageAttachment> {
  if (!isValidImageFile(file)) {
    throw new Error("Invalid image file.");
  }
  await ensureUploadAuth();
  return uploadOneImage(storageDir, file, index);
}

/** Upload images under organizations/{orgId}/{storageDir}/ (in parallel). */
export async function uploadImageFiles(storageDir: string, files: File[]): Promise<ImageAttachment[]> {
  const { valid } = partitionImageFiles(files);
  if (valid.length === 0) return [];
  await ensureUploadAuth();
  return Promise.all(valid.map((file, index) => uploadOneImage(storageDir, file, index)));
}

/** Upload files in parallel; fires `onFileDone` as each one finishes. */
export async function uploadImageFilesProgressive(
  storageDir: string,
  files: File[],
  onFileDone?: (index: number, attachment: ImageAttachment) => void
): Promise<ImageAttachment[]> {
  const { valid } = partitionImageFiles(files);
  if (valid.length === 0) return [];
  await ensureUploadAuth();

  const results: ImageAttachment[] = new Array(valid.length);
  await Promise.all(
    valid.map(async (file, index) => {
      const attachment = await uploadOneImage(storageDir, file, index);
      results[index] = attachment;
      onFileDone?.(index, attachment);
    })
  );
  return results;
}

/** Remove one file from Firebase Storage (no-op if path empty). Ignores object-not-found. */
export async function deleteImageFromStorage(storagePath: string): Promise<void> {
  const path = storagePath.trim();
  if (!path) return;
  assertOrgStoragePath(path);

  const auth = getFirebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) {
    throw Object.assign(new Error("You must be signed in to delete images."), {
      code: "storage/unauthenticated",
    });
  }

  try {
    await deleteObject(ref(getFirebaseStorage(), path));
  } catch (err) {
    const code = (err as { code?: string })?.code ?? "";
    if (code === "storage/object-not-found") return;
    throw err;
  }
}

/** Delete several storage objects; continues if some are already gone or fail. */
export async function deleteImagesFromStorage(storagePaths: string[]): Promise<void> {
  const paths = [...new Set(storagePaths.map((p) => p.trim()).filter(Boolean))];
  const results = await Promise.allSettled(paths.map((p) => deleteImageFromStorage(p)));
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error("deleteImagesFromStorage: some paths failed", failed);
  }
}
