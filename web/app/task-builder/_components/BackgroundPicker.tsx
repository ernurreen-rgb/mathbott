"use client";

import { useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { apiPath } from "@/lib/api/client";
import { deleteTaskCollectionImage, uploadTaskCollectionImage } from "@/lib/api/constructor";
import { prepareBackground } from "@/lib/constructor-export";
import { useI18n } from "@/lib/i18n/provider";
import type { TaskCollectionImageKind, TaskCollectionSummary } from "@/types/constructor";

/** One of the deck's two pictures: the title slide or the background of the task slides. */
export default function BackgroundPicker({
  collectionId,
  email,
  kind,
  filename,
  disabled,
  onChange,
}: {
  collectionId: number;
  email: string;
  kind: TaskCollectionImageKind;
  filename: string | null;
  disabled?: boolean;
  onChange: (summary: TaskCollectionSummary) => void;
}) {
  const { t } = useI18n();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const label = t(kind === "title" ? "constructor.titleImage" : "constructor.background");

  const upload = async (file: File) => {
    setBusy(true);
    setError(null);
    try {
      const prepared = await prepareBackground(file);
      const result = await uploadTaskCollectionImage(collectionId, kind, prepared, email);
      if (!result.data) {
        if (result.status === 413) throw new Error("image-too-large");
        console.error("Background image upload failed:", result.status, result.error);
        throw new Error("upload");
      }
      onChange(result.data);
    } catch (problem) {
      setError(t(problem instanceof Error && problem.message === "image-too-large" ? "constructor.imageTooLarge" : "constructor.imageFailed"));
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    const result = await deleteTaskCollectionImage(collectionId, kind, email);
    setBusy(false);
    if (result.data) onChange(result.data);
    else setError(t("constructor.loadError"));
  };

  return (
    <div className="min-w-0">
      <p className="text-sm font-semibold text-slate-800">{label}</p>
      <p className="text-xs text-slate-500">{t(kind === "title" ? "constructor.titleImageHint" : "constructor.backgroundHint")}</p>
      <div className="relative mt-2 aspect-video overflow-hidden rounded-xl border border-slate-200 bg-white">
        {filename ? (
          // A 16:9 preview of the uploaded slide picture.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={apiPath(`images/${filename}`)} alt={label} className="h-full w-full object-cover" />
        ) : (
          <div className={`flex h-full justify-center text-xs text-slate-400 ${kind === "background" ? "items-end pb-2" : "items-center"}`}>
            {t("constructor.noImage")}
          </div>
        )}
        {kind === "background" && (
          // Where a slide puts "Есеп №N:" and the task text, on the background itself.
          <div aria-hidden="true" className="absolute left-[6%] top-[22%] w-[60%] space-y-[6%]">
            <div className="h-1.5 w-1/4 rounded-full bg-[#2436AE]" />
            <div className="h-1 w-full rounded-full bg-slate-500/70" />
            <div className="h-1 w-4/5 rounded-full bg-slate-500/70" />
            <div className="h-1 w-1/3 rounded-full bg-slate-500/50" />
            <div className="h-1 w-1/3 rounded-full bg-slate-500/50" />
          </div>
        )}
        {busy && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/70 text-xs font-semibold text-slate-700">
            <Icon name="loader" className="mr-1.5 h-4 w-4 animate-spin" />
            {t("constructor.uploading")}
          </div>
        )}
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          disabled={busy || disabled}
          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-3 py-1.5 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
        >
          <Icon name="upload" className="h-4 w-4" />
          {t(filename ? "constructor.replace" : "constructor.upload")}
        </button>
        {filename && (
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy || disabled}
            className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-semibold text-slate-500 hover:bg-red-50 hover:text-red-700 disabled:opacity-50"
          >
            <Icon name="trash" className="h-4 w-4" />
            {t("constructor.remove")}
          </button>
        )}
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg"
          className="sr-only"
          aria-label={`${label}: ${t("constructor.upload")}`}
          onChange={(event) => {
            const file = event.target.files?.[0];
            if (file) void upload(file);
          }}
        />
      </div>
      {error && <p role="alert" className="mt-1 text-xs text-red-700">{error}</p>}
    </div>
  );
}
