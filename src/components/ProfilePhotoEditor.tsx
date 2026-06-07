import { useState } from "react";
import { Camera } from "lucide-react";
import type { Person } from "../types";
import { deletePersonAvatar, uploadPersonAvatar } from "../utils/personAvatar";
import { storageUploadErrorMessage } from "../utils/imageAttachments";
import { PERSON_AVATAR_SIZE_CLASS, PersonAvatar } from "./PersonAvatar";
import { ProfilePhotoCropModal } from "./ProfilePhotoCropModal";

export function ProfilePhotoAvatar({
  person,
  onChange,
  editable,
  size = "lg",
  className = "",
}: {
  person: Person;
  onChange?: (patch: Partial<Person>) => void | Promise<void>;
  editable: boolean;
  size?: keyof typeof PERSON_AVATAR_SIZE_CLASS;
  className?: string;
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function saveBlob(blob: Blob) {
    if (!onChange) return;
    setSaving(true);
    setError(null);
    try {
      const file = new File([blob], "avatar.jpg", { type: "image/jpeg" });
      const { avatarUrl, avatarStoragePath } = await uploadPersonAvatar(person.id, file);
      const oldPath = person.avatarStoragePath;
      await onChange({ avatarUrl, avatarStoragePath });
      if (oldPath && oldPath !== avatarStoragePath) {
        await deletePersonAvatar(oldPath).catch(console.error);
      }
      setModalOpen(false);
    } catch (err) {
      console.error("profile photo upload", err);
      setError(storageUploadErrorMessage(err));
      throw err;
    } finally {
      setSaving(false);
    }
  }

  async function removePhoto() {
    if (!onChange || (!person.avatarUrl && !person.avatarStoragePath)) return;
    setSaving(true);
    setError(null);
    try {
      await deletePersonAvatar(person.avatarStoragePath);
      await onChange({ avatarUrl: "", avatarStoragePath: "" });
      setModalOpen(false);
    } catch (err) {
      console.error("profile photo delete", err);
      setError(storageUploadErrorMessage(err));
    } finally {
      setSaving(false);
    }
  }

  if (!editable) {
    return <PersonAvatar person={person} size={size} className={className} />;
  }

  const hasExistingPhoto = Boolean(person.avatarUrl?.trim());

  return (
    <>
      <div className="relative">
        <button
          type="button"
          disabled={saving}
          onClick={() => setModalOpen(true)}
          className="group inline-flex shrink-0 rounded-full border-0 bg-transparent p-0 focus-visible:outline focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 disabled:opacity-60"
          aria-label={person.avatarUrl ? "Change profile photo" : "Add profile photo"}
          title={person.avatarUrl ? "Change profile photo" : "Add profile photo"}
        >
          <span
            className={`relative inline-flex overflow-hidden rounded-full ${PERSON_AVATAR_SIZE_CLASS[size]} ${className}`}
          >
            <PersonAvatar person={person} size={size} className="ring-4 ring-slate-100 shadow-none" />
            <span className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 overflow-hidden rounded-full bg-black/50 text-white opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100">
              <Camera
                className={`shrink-0 ${size === "2xl" ? "h-6 w-6" : size === "xl" ? "h-5 w-5" : "h-4 w-4"}`}
                aria-hidden
              />
              <span
                className={`font-semibold leading-none ${
                  size === "2xl" ? "text-xs" : size === "xl" ? "text-[10px]" : "text-[9px]"
                }`}
              >
                {person.avatarUrl ? "Change" : "Add"}
              </span>
            </span>
          </span>
        </button>
        {error && <p className="absolute left-0 top-full z-10 mt-1 max-w-[12rem] text-[10px] text-rose-600">{error}</p>}
      </div>
      <ProfilePhotoCropModal
        open={modalOpen}
        saving={saving}
        existingPhotoUrl={hasExistingPhoto ? person.avatarUrl : undefined}
        existingPhotoStoragePath={hasExistingPhoto ? person.avatarStoragePath : undefined}
        onRemove={hasExistingPhoto ? () => void removePhoto() : undefined}
        onClose={() => !saving && setModalOpen(false)}
        onSave={saveBlob}
      />
    </>
  );
}
