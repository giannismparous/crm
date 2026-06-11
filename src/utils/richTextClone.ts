import { getBytes, getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { getFirebaseStorage, SIMASIA_AI_ORG_ID } from "../firebase/config";
import type { ImageAttachment } from "../types";
import { isOrgStoragePath } from "./imageAttachments";
import { storagePathsInUpdatesHtml } from "./richTextImages";

function extFromPath(path: string): string {
  const base = path.split("/").pop() ?? "";
  const dot = base.lastIndexOf(".");
  if (dot >= 0) return base.slice(dot + 1).toLowerCase() || "bin";
  return "bin";
}

function contentTypeForExt(ext: string): string {
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "mp3") return "audio/mpeg";
  if (ext === "m4a") return "audio/mp4";
  return "application/octet-stream";
}

async function copyStoragePath(
  fromPath: string,
  toDir: string
): Promise<{ fromPath: string; toPath: string; url: string }> {
  const storage = getFirebaseStorage();
  const from = fromPath.trim();
  if (!isOrgStoragePath(from)) throw new Error("Invalid storage path.");
  const bytes = await getBytes(ref(storage, from));
  const ext = extFromPath(from);
  const id = `${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
  const toPath = `${toDir.replace(/\/+$/, "")}/${id}.${ext}`;
  const toRef = ref(storage, toPath);
  await uploadBytes(toRef, bytes, { contentType: contentTypeForExt(ext) });
  const url = await getDownloadURL(toRef);
  return { fromPath: from, toPath, url };
}

/** Deep-copy attachment files to a new appointment folder. */
export async function cloneAttachmentsForAppointment(
  attachments: ImageAttachment[],
  targetAppointmentId: string
): Promise<ImageAttachment[]> {
  if (attachments.length === 0) return [];
  const toDir = `organizations/${SIMASIA_AI_ORG_ID}/appointments/${targetAppointmentId}/attachments`;
  const out: typeof attachments = [];
  for (const att of attachments) {
    const { toPath, url } = await copyStoragePath(att.storagePath, toDir);
    out.push({ ...att, storagePath: toPath, url });
  }
  return out;
}

/** Deep-copy inline media in rich HTML to a new appointment storage folder. */
export async function cloneRichTextHtmlForAppointment(
  html: string,
  targetAppointmentId: string
): Promise<string> {
  const trimmed = html.trim();
  if (!trimmed) return html;
  const paths = [...new Set(storagePathsInUpdatesHtml(trimmed))];
  if (paths.length === 0) return html;

  const toDir = `organizations/${SIMASIA_AI_ORG_ID}/appointments/${targetAppointmentId}/description`;
  let next = trimmed;
  for (const fromPath of paths) {
    const { fromPath: src, toPath, url } = await copyStoragePath(fromPath, toDir);
    next = next.split(src).join(toPath);
    // Replace old download URLs in src/href with new ones
    const oldUrlMatch = trimmed.match(
      new RegExp(`https://firebasestorage[^"'\\s]*${src.replace(/\//g, "%2F")}[^"'\\s]*`, "i")
    );
    if (oldUrlMatch?.[0]) {
      next = next.split(oldUrlMatch[0]).join(url);
    }
  }
  return next;
}
