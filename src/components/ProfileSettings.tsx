import { useEffect, useId, useRef, useState } from "react";
import { api, useStore, type ConfigStatus } from "@/state/store";
import { t } from "@/lib/i18n";
import { saveTeamProfile } from "@/lib/own-profile";
import { IMAGE_MAX_BYTES, imageAttachmentFromFile, isImageFile } from "@/lib/composer-attachments";
import type { LocaleKey } from "@/locales";
import { botAvatarUrlFromStoredPath } from "../../shared/bot-avatar";
import { AboutMeSettings } from "./AboutMeSettings";
import { ImagePlus } from "lucide-react";
import { PersonAvatar, personalAvatarBot } from "./PersonAvatar";
import { AvatarColors, AvatarShapes } from "./AvatarAppearancePicker";
import { DEFAULT_PERSON_MASCOT, personMascotSchema, type PersonMascot } from "../../shared/person-avatar";

const PHOTO_MIN_SIDE = 64;
const PHOTO_MAX_SIDE = 8192;
/** What is stored is always this square WebP, drawn fresh: the original's metadata (location, camera) never leaves the picker. */
const PHOTO_STORED_SIDE = 512;

type PhotoDraft = { file: File; previewUrl: string; width: number; height: number; zoom: number };

/** Checked before the picture is even decoded; null when the file may become a draft. */
export function profilePhotoFileProblem(file: { type: string; size: number }): LocaleKey | null {
  if (!isImageFile(file)) return "settings.profile.avatar.invalidType";
  if (file.size > IMAGE_MAX_BYTES) return "settings.profile.avatar.tooLarge";
  return null;
}

export function profilePhotoSizeProblem(width: number, height: number): LocaleKey | null {
  if (width < PHOTO_MIN_SIDE || height < PHOTO_MIN_SIDE) return "settings.profile.avatar.tooSmall";
  if (width > PHOTO_MAX_SIDE || height > PHOTO_MAX_SIDE) return "settings.profile.avatar.tooLargeDimensions";
  return null;
}

async function withImage<T>(file: File, use: (image: HTMLImageElement) => T | Promise<T>): Promise<T> {
  const url = URL.createObjectURL(file);
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image();
      element.onload = () => resolve(element);
      element.onerror = () => reject(new Error("invalid-image"));
      element.src = url;
    });
    if (image.naturalWidth <= 0 || image.naturalHeight <= 0) throw new Error("invalid-image");
    return await use(image);
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The centred square the zoom slider previews. */
function croppedPhoto(file: File, zoom: number): Promise<File> {
  return withImage(file, async (image) => {
    const side = Math.min(image.naturalWidth, image.naturalHeight) / Math.max(1, zoom);
    const canvas = document.createElement("canvas");
    canvas.width = PHOTO_STORED_SIDE;
    canvas.height = PHOTO_STORED_SIDE;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("canvas-unavailable");
    context.drawImage(image, (image.naturalWidth - side) / 2, (image.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_STORED_SIDE, PHOTO_STORED_SIDE);
    const blob = await new Promise<Blob>((resolve, reject) => canvas.toBlob((value) => value ? resolve(value) : reject(new Error("image-encode-failed")), "image/webp", 0.9));
    return new File([blob], "profile-photo.webp", { type: "image/webp" });
  });
}

function ProfilePhoto() {
  const { state, dispatch } = useStore();
  const currentProfile = state.config?.profile;
  const avatarUrl = currentProfile?.avatarUrl ?? "";
  const parsedMascot = personMascotSchema.safeParse(currentProfile?.avatarMascot);
  const mascot = parsedMascot.success ? parsedMascot.data : DEFAULT_PERSON_MASCOT;
  const hasImage = Boolean(avatarUrl) && !parsedMascot.success;
  const [pending, setPending] = useState<"photo" | "appearance" | null>(null);
  const busy = pending !== null;
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<PhotoDraft | null>(null);
  const draftRef = useRef<PhotoDraft | null>(null);
  const replaceDraft = (next: PhotoDraft | null) => {
    const previous = draftRef.current;
    if (previous && previous.previewUrl !== next?.previewUrl) URL.revokeObjectURL(previous.previewUrl);
    draftRef.current = next;
    setDraft(next);
  };
  useEffect(() => () => {
    if (draftRef.current) URL.revokeObjectURL(draftRef.current.previewUrl);
  }, []);
  const team = Boolean(state.config?.team);
  const store = async (patch: { avatarUrl: string; avatarMascot: PersonMascot | null }) => {
    const profile = team
      ? await saveTeamProfile(patch)
      : (await api<ConfigStatus>("/api/config", { method: "PUT", body: JSON.stringify({ profile: patch }) })).profile;
    dispatch({ type: "profileSaved", profile: { avatarUrl: profile?.avatarUrl, avatarMascot: profile?.avatarMascot } });
  };
  const pick = (file: File | undefined) => {
    if (!file) return;
    setError(null);
    const fileProblem = profilePhotoFileProblem(file);
    if (fileProblem) return setError(t(fileProblem));
    void withImage(file, (image) => ({ width: image.naturalWidth, height: image.naturalHeight })).then(({ width, height }) => {
      const sizeProblem = profilePhotoSizeProblem(width, height);
      if (sizeProblem) return setError(t(sizeProblem));
      replaceDraft({ file, previewUrl: URL.createObjectURL(file), width, height, zoom: 1 });
    }, () => setError(t("settings.profile.avatar.invalidType")));
  };
  const save = (file: File, zoom = 1) => {
    setPending("photo");
    setError(null);
    void croppedPhoto(file, zoom)
      .then((cropped) => imageAttachmentFromFile(cropped))
      .then((saved) => {
        const next = saved ? botAvatarUrlFromStoredPath(saved.path) : null;
        if (!next) throw new Error("avatar");
        return store({ avatarUrl: next, avatarMascot: null });
      })
      .then(() => replaceDraft(null), () => setError(t("settings.profile.avatar.saveError")))
      .finally(() => setPending(null));
  };
  const remove = () => {
    setError(null);
    setPending("appearance");
    void store({ avatarUrl: "", avatarMascot: null }).catch(() => setError(t("settings.profile.avatar.saveError"))).finally(() => setPending(null));
  };

  const chooseMascot = (next: PersonMascot) => {
    setPending("appearance");
    setError(null);
    void store({ avatarUrl: "", avatarMascot: next })
      .catch(() => setError(t("settings.profile.avatar.saveError")))
      .finally(() => setPending(null));
  };
  const preview = personalAvatarBot(currentProfile);

  return <section className="space-y-3" aria-label={t("settings.profile.avatar.title")} data-person-avatar-picker>
    <div className="flex items-center gap-4">
      <PersonAvatar profile={currentProfile} size={64} />
      <div className="min-w-0 space-y-1.5">
        <p className="text-[13px] text-ink">{t("settings.profile.avatar.title")}</p>
        <p className="text-[12px] leading-5 text-ink-secondary">{t("settings.profile.avatar.hint")}</p>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-hairline/40 bg-composer px-3 py-1.5 text-[12px] text-ink hover:bg-control focus-within:ring-2 focus-within:ring-focus">
            <ImagePlus size={14} aria-hidden="true" />
            {pending === "photo" ? t("settings.profile.avatar.uploading") : t("settings.profile.avatar.choose")}
            <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="sr-only" disabled={busy} onChange={event => {
              const file = event.target.files?.[0];
              event.currentTarget.value = "";
              pick(file);
            }} />
          </label>
          {(avatarUrl || currentProfile?.avatarMascot) && !draft && <button type="button" disabled={busy} className="text-[12px] text-ink-secondary enabled:hover:text-ink" onClick={remove}>{t("settings.profile.avatar.reset")}</button>}
        </div>
      </div>
    </div>
    {draft ? <div className="rounded-xl border border-hairline/40 p-3">
      <div className="flex flex-wrap items-center gap-3">
        <div className="size-20 shrink-0 overflow-hidden rounded-full bg-raised">
          <img src={draft.previewUrl} alt="" className="size-full object-cover" style={{ transform: `scale(${draft.zoom})` }} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-[12px] text-ink">{t("settings.profile.avatar.cropTitle")}</p>
          <p className="text-[11px] text-ink-secondary">{draft.width} × {draft.height}px</p>
          <label className="mt-2 flex items-center gap-2 text-[12px] text-ink-secondary">{t("settings.profile.avatar.zoom")}
            <input aria-label={t("settings.profile.avatar.zoom")} type="range" min="1" max="2.5" step="0.05" value={draft.zoom} disabled={busy} onChange={event => replaceDraft({ ...draft, zoom: Number(event.target.value) })} className="min-w-0 flex-1 accent-accent" />
          </label>
        </div>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" disabled={busy} className="rounded-lg px-3 py-1.5 text-[12px] text-ink-secondary" onClick={() => replaceDraft(null)}>{t("settings.profile.avatar.cancel")}</button>
        <button type="button" className="rounded-lg bg-accent px-3 py-1.5 text-[12px] text-white disabled:opacity-50" disabled={busy} onClick={() => save(draft.file, draft.zoom)}>{t("settings.profile.avatar.save")}</button>
      </div>
    </div> : <div className="space-y-3">
      <div>
        <p className="mb-2 text-[12px] text-ink-secondary">{t("botIdentity.color")}</p>
        <AvatarColors bot={preview} busy={busy} hasImage={hasImage} onColor={color => chooseMascot({ ...mascot, color })} />
      </div>
      <AvatarShapes bot={preview} busy={busy} hasImage={hasImage} onBody={body => chooseMascot({ ...mascot, body })} />
    </div>}
    {error && <p role="alert" className="text-[12px] text-danger">{error}</p>}
  </section>;

}

export function ProfileFields({ nameOnly = false }: { nameOnly?: boolean }) {
  const { state, dispatch } = useStore();
  const [name, setName] = useState(state.config?.profile?.name ?? "");
  const [email, setEmail] = useState(state.config?.profile?.email ?? "");
  useEffect(() => {
    setName(state.config?.profile?.name ?? "");
    setEmail(state.config?.profile?.email ?? "");
  }, [state.config?.profile?.name, state.config?.profile?.email]);

  const team = Boolean(state.config?.team);
  const save = () => {
    if (team) {
      void saveTeamProfile({ name: name.trim() })
        .then((profile) => dispatch({ type: "profileSaved", profile: { name: profile.name, email: profile.email } }))
        .catch(() => {});
      return;
    }
    void fetch("/api/config", {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ profile: { name: name.trim(), email: email.trim().toLowerCase() } }),
    })
      .then((r) => { if (!r.ok) throw new Error("Profile save failed"); return r.json(); })
      .then((config: ConfigStatus) => {
        if (config.profile) dispatch({ type: "profileSaved", profile: { name: config.profile.name, email: config.profile.email } });
      })
      .catch(() => {});
  };

  const inputClass =
    "w-full rounded-lg border border-hairline/40 bg-inset px-3 py-2 text-[14px] text-ink placeholder:text-ink-secondary focus:outline-none";
  return (
    <div className="flex flex-col gap-3">
      <ProfilePhoto />
      <input aria-label={t("settings.profile.name")} value={name} onChange={(e) => setName(e.target.value)} onBlur={save} placeholder={t("settings.profile.name")} className={inputClass} />
      {!nameOnly && <input
        type="email"
        aria-label={t("phone.signIn.email")}
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        onBlur={team ? undefined : save}
        readOnly={team}
        placeholder="you@example.com"
        className={inputClass}
      />}
      {!nameOnly && <AboutMeSettings />}
    </div>
  );
}

export function ProfileSummaryRow() {
  const { state } = useStore();
  const [editing, setEditing] = useState(false);
  const profile = state.config?.profile;
  const name = profile?.name?.trim() ?? "";
  const email = profile?.email?.trim() ?? "";
  const fieldsId = useId();
  const fields = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (editing) fields.current?.querySelector<HTMLInputElement>("input:not([type=file])")?.focus();
  }, [editing]);
  return (
    <div data-profile-summary="" className="px-4 py-[13px]">
      <div className="flex min-w-0 items-center gap-3">
        <PersonAvatar profile={profile} size={44} />
        <div className="min-w-0 flex-1">
          {name || email ? <>
            <div className="truncate text-[14px] leading-5 text-ink">{name || email}</div>
            {name && email && <div className="truncate text-[13px] leading-[18px] text-ink-secondary">{email}</div>}
          </> : <div className="truncate text-[14px] leading-5 text-ink-secondary">{t("settings.simple.account.noName")}</div>}
        </div>
        <button type="button" aria-expanded={editing} aria-controls={fieldsId} className="ui-button shrink-0" onClick={() => setEditing(!editing)}>
          {editing ? t("common.done") : t(name || email ? "settings.simple.account.edit" : "settings.simple.account.add")}
        </button>
      </div>
      <div id={fieldsId} ref={fields} hidden={!editing} className="mt-4">
        {editing && <ProfileFields />}
      </div>
    </div>
  );
}
