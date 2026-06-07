import { getBytes, ref } from "firebase/storage";
import { getFirebaseAuth, getFirebaseStorage } from "../firebase/config";
import { deleteImageFromStorage, isOrgStoragePath, uploadSingleImageFile } from "./imageAttachments";

const AVATAR_GRADIENTS = [
  "from-rose-400 to-orange-400",
  "from-violet-400 to-indigo-500",
  "from-teal-400 to-cyan-500",
  "from-amber-400 to-orange-500",
  "from-fuchsia-400 to-pink-500",
  "from-emerald-400 to-teal-500",
  "from-sky-400 to-blue-500",
  "from-lime-400 to-emerald-500",
] as const;

function hashName(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h;
}

/** First letter of the first name for avatar placeholders. */
export function personInitials(name: string): string {
  const first = name.trim().split(/\s+/).filter(Boolean)[0];
  if (!first) return "·";
  return first[0]!.toUpperCase();
}

/** Stable Tailwind gradient class from a person's name. */
export function personAvatarGradient(name: string): (typeof AVATAR_GRADIENTS)[number] {
  const key = name.trim() || "member";
  return AVATAR_GRADIENTS[hashName(key) % AVATAR_GRADIENTS.length]!;
}

const OUTPUT_SIZE = 256;

/** Draw a circular JPEG from an image with pan/zoom in a square viewport. */
export function renderCircularAvatarBlob(
  image: HTMLImageElement,
  scale: number,
  offsetX: number,
  offsetY: number,
  viewportSize: number
): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Could not prepare image."));

  ctx.beginPath();
  ctx.arc(OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, OUTPUT_SIZE / 2, 0, Math.PI * 2);
  ctx.closePath();
  ctx.clip();

  const baseScale = Math.max(viewportSize / image.naturalWidth, viewportSize / image.naturalHeight);
  const drawScale = baseScale * scale;
  const drawW = image.naturalWidth * drawScale;
  const drawH = image.naturalHeight * drawScale;
  const x = (OUTPUT_SIZE - drawW) / 2 + offsetX * (OUTPUT_SIZE / viewportSize);
  const y = (OUTPUT_SIZE - drawH) / 2 + offsetY * (OUTPUT_SIZE / viewportSize);
  ctx.drawImage(image, x, y, drawW, drawH);

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("Could not save cropped image."))),
      "image/jpeg",
      0.92
    );
  });
}

export async function uploadPersonAvatar(
  personId: string,
  file: File
): Promise<{ avatarUrl: string; avatarStoragePath: string }> {
  const uploaded = await uploadSingleImageFile(`people/${personId}/avatar`, file, 0);
  return { avatarUrl: uploaded.url, avatarStoragePath: uploaded.storagePath };
}

export async function deletePersonAvatar(storagePath: string | undefined): Promise<void> {
  if (!storagePath?.trim()) return;
  await deleteImageFromStorage(storagePath);
}

/** Load avatar bytes via Firebase SDK (avoids CORS issues when re-cropping). */
export async function fetchPersonAvatarBlob(storagePath: string): Promise<Blob> {
  const path = storagePath.trim();
  if (!path || !isOrgStoragePath(path)) throw new Error("Invalid storage path.");
  const auth = getFirebaseAuth();
  await auth.authStateReady();
  if (!auth.currentUser) throw new Error("not signed in");
  const bytes = await getBytes(ref(getFirebaseStorage(), path));
  const ext = path.split(".").pop()?.toLowerCase() ?? "jpg";
  const type =
    ext === "png" ? "image/png" : ext === "webp" ? "image/webp" : ext === "gif" ? "image/gif" : "image/jpeg";
  return new Blob([bytes], { type });
}
