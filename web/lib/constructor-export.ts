/**
 * Browser side of the task constructor's downloads: preparing uploaded backgrounds, loading the
 * images a deck needs and saving the finished files. The PDF itself is made by
 * export-bank-worksheet.ts, the PPTX by lib/pptx/task-deck.ts.
 */
import { apiPath } from "@/lib/api/client";
import type { WorksheetAnswer } from "@/components/admin/BankWorksheetDocument";
import type { WorksheetTask } from "@/lib/bank-worksheet";
import { taskAnswerPieces, type ConstructorLanguage } from "@/lib/constructor-answers";
import type { DeckImage } from "@/lib/pptx/task-deck";
import type { ConstructorTask, TaskCollection } from "@/types/constructor";

export const PPTX_MIME = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const BACKGROUND_WIDTH = 1920;
const BACKGROUND_HEIGHT = 1080;
/** Uploads above this are rejected before they reach the server (its own limit is 5 MB). */
export const MAX_BACKGROUND_SOURCE_BYTES = 20 * 1024 * 1024;

export function constructorFilename(title: string, extension: "pdf" | "pptx"): string {
  const name = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, "").replace(/[. ]+$/g, "").slice(0, 100);
  return `${name || "QazMath-esepter"}.${extension}`;
}

export function saveFile(bytes: Uint8Array | Blob, filename: string, type: string) {
  const blob = bytes instanceof Blob ? bytes : new Blob([Uint8Array.from(bytes).buffer], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

async function decode(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob);
  } catch {
    throw new Error("image-decode");
  }
}

function canvasBlob(canvas: HTMLCanvasElement, type: "image/jpeg" | "image/png", quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("image-encode"))), type, quality);
  });
}

/**
 * A background as the deck needs it: 16:9, 1920 × 1080, JPEG. The picture is cropped to cover
 * the slide (never stretched) and stays well under the upload limit.
 */
export async function prepareBackground(file: File): Promise<Blob> {
  if (file.size > MAX_BACKGROUND_SOURCE_BYTES) throw new Error("image-too-large");
  const bitmap = await decode(file);
  const canvas = document.createElement("canvas");
  canvas.width = BACKGROUND_WIDTH;
  canvas.height = BACKGROUND_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("image-encode");
  const scale = Math.max(BACKGROUND_WIDTH / bitmap.width, BACKGROUND_HEIGHT / bitmap.height);
  const width = bitmap.width * scale;
  const height = bitmap.height * scale;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, BACKGROUND_WIDTH, BACKGROUND_HEIGHT);
  context.drawImage(bitmap, (BACKGROUND_WIDTH - width) / 2, (BACKGROUND_HEIGHT - height) / 2, width, height);
  bitmap.close();
  try {
    return await canvasBlob(canvas, "image/jpeg", 0.9);
  } finally {
    canvas.width = 0;
    canvas.height = 0;
  }
}

/** An uploaded image for the deck. PNG and JPEG go in as they are; anything else becomes PNG. */
export async function loadDeckImage(filename: string, signal?: AbortSignal): Promise<DeckImage> {
  const response = await fetch(apiPath(`images/${filename}`), { signal });
  if (!response.ok) throw new Error("image-load");
  const blob = await response.blob();
  const bitmap = await decode(blob);
  const { width, height } = bitmap;
  try {
    const type = (response.headers.get("content-type") || blob.type).split(";")[0].trim();
    if (type === "image/png" || type === "image/jpeg") {
      return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: type === "image/png" ? "png" : "jpeg", width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(bitmap, 0, 0);
    const png = await canvasBlob(canvas, "image/png");
    canvas.width = 0;
    canvas.height = 0;
    return { bytes: new Uint8Array(await png.arrayBuffer()), ext: "png", width, height };
  } finally {
    bitmap.close();
  }
}

export function worksheetTasks(tasks: ConstructorTask[]): WorksheetTask[] {
  return tasks.map((task) => ({
    id: task.id,
    text: task.text,
    question_type: task.question_type,
    answer_mode: task.answer_mode,
    image_filename: task.image_filename,
    options: task.options.map(({ label, text }) => ({ label, text })),
    subquestions: task.subquestions.map(({ text }) => ({ text })),
  }));
}

export function answerKey(tasks: ConstructorTask[], language: ConstructorLanguage): WorksheetAnswer[] {
  return tasks.map((task, index) => ({ number: index + 1, pieces: taskAnswerPieces(task, language) }));
}

/** Build the collection's PPTX in the browser and save it. */
export async function downloadCollectionPptx(
  collection: TaskCollection,
  options: { language: ConstructorLanguage; author: string; signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
) {
  const { buildTaskDeck } = await import("@/lib/pptx/task-deck");
  const withImages = collection.tasks.filter((task) => task.image_filename);
  const total = withImages.length + (collection.title_image ? 1 : 0) + (collection.background_image ? 1 : 0);
  let done = 0;
  const step = <T,>(value: T) => {
    done += 1;
    options.onProgress?.(done, total);
    return value;
  };
  const [titleImage, background] = await Promise.all([
    collection.title_image ? loadDeckImage(collection.title_image, options.signal).then(step) : null,
    collection.background_image ? loadDeckImage(collection.background_image, options.signal).then(step) : null,
  ]);
  const taskImages = new Map<number, DeckImage>();
  for (const task of withImages) {
    options.signal?.throwIfAborted();
    taskImages.set(task.id, step(await loadDeckImage(task.image_filename as string, options.signal)));
  }
  options.signal?.throwIfAborted();
  const { bytes } = await buildTaskDeck({
    title: collection.title,
    author: options.author,
    language: options.language,
    tasks: collection.tasks,
    titleImage,
    background,
    taskImages,
  });
  options.signal?.throwIfAborted();
  saveFile(bytes, constructorFilename(collection.title, "pptx"), PPTX_MIME);
}
