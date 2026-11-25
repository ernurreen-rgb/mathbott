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
const DEFAULT_COLLECTION_TITLES = new Set(["жаңа жинақ", "новый сборник"]);

/** Returns the teacher's custom title, or "" when the collection still has the auto-generated default title. */
export function customCollectionTitle(title: string | null | undefined): string {
  const trimmed = (title ?? "").trim();
  return DEFAULT_COLLECTION_TITLES.has(trimmed.toLowerCase()) ? "" : trimmed;
}

/** Moves an item from `fromIndex` to `toIndex`, returning a new array (or a shallow copy if out of bounds / same). */
export function reorderItems<T>(items: readonly T[], fromIndex: number, toIndex: number): T[] {
  if (
    fromIndex === toIndex ||
    fromIndex < 0 ||
    toIndex < 0 ||
    fromIndex >= items.length ||
    toIndex >= items.length
  ) {
    return [...items];
  }
  const next = [...items];
  const [moved] = next.splice(fromIndex, 1);
  next.splice(toIndex, 0, moved);
  return next;
}

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

type DecodedImage = {
  source: CanvasImageSource;
  width: number;
  height: number;
  close: () => void;
};

const MAX_ENCODED_BACKGROUND_BYTES = 4 * 1024 * 1024;

function decodeViaImageElement(blob: Blob): Promise<DecodedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      resolve({
        source: img,
        width: img.naturalWidth || img.width,
        height: img.naturalHeight || img.height,
        close: () => URL.revokeObjectURL(url),
      });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image-decode"));
    };
    img.src = url;
  });
}

async function decode(blob: Blob): Promise<DecodedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(blob);
      return {
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
        close: () => bitmap.close(),
      };
    } catch {
      // Fall back to HTMLImageElement for formats/EXIF quirks where createImageBitmap fails.
    }
  }
  return decodeViaImageElement(blob);
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
  const decoded = await decode(file);
  if (!decoded.width || !decoded.height) {
    decoded.close();
    throw new Error("image-decode");
  }
  const canvas = document.createElement("canvas");
  canvas.width = BACKGROUND_WIDTH;
  canvas.height = BACKGROUND_HEIGHT;
  const context = canvas.getContext("2d");
  if (!context) {
    decoded.close();
    throw new Error("image-encode");
  }
  const scale = Math.max(BACKGROUND_WIDTH / decoded.width, BACKGROUND_HEIGHT / decoded.height);
  const width = decoded.width * scale;
  const height = decoded.height * scale;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, BACKGROUND_WIDTH, BACKGROUND_HEIGHT);
  context.drawImage(decoded.source, (BACKGROUND_WIDTH - width) / 2, (BACKGROUND_HEIGHT - height) / 2, width, height);
  decoded.close();
  try {
    for (const quality of [0.9, 0.8, 0.7]) {
      const blob = await canvasBlob(canvas, "image/jpeg", quality);
      if (blob.size <= MAX_ENCODED_BACKGROUND_BYTES || quality === 0.7) {
        return blob;
      }
    }
    throw new Error("image-encode");
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
  const decoded = await decode(blob);
  const { width, height } = decoded;
  try {
    const type = (response.headers.get("content-type") || blob.type).split(";")[0].trim();
    if (type === "image/png" || type === "image/jpeg") {
      return { bytes: new Uint8Array(await blob.arrayBuffer()), ext: type === "image/png" ? "png" : "jpeg", width, height };
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d")?.drawImage(decoded.source, 0, 0);
    const png = await canvasBlob(canvas, "image/png");
    canvas.width = 0;
    canvas.height = 0;
    return { bytes: new Uint8Array(await png.arrayBuffer()), ext: "png", width, height };
  } finally {
    decoded.close();
  }
}

export function worksheetTasks(tasks: ConstructorTask[]): WorksheetTask[] {
  return tasks.map((task) => ({
    id: task.id,
    text: task.text,
    question_type: task.question_type,
    answer_mode: task.answer_mode,
    difficulty: task.difficulty,
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
  options: {
    language: ConstructorLanguage;
    author: string;
    includeAnswers?: boolean;
    signal?: AbortSignal;
    onProgress?: (done: number, total: number) => void;
  },
) {
  const { buildTaskDeck } = await import("@/lib/pptx/task-deck");
  const uniqueTaskFilenames = Array.from(
    new Set(collection.tasks.map((task) => task.image_filename).filter((name): name is string => Boolean(name))),
  );
  const total = uniqueTaskFilenames.length + (collection.title_image ? 1 : 0) + (collection.background_image ? 1 : 0);
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
  const loadedByFilename = new Map<string, DeckImage>();
  const IMAGE_FETCH_CONCURRENCY = 4;
  for (let i = 0; i < uniqueTaskFilenames.length; i += IMAGE_FETCH_CONCURRENCY) {
    options.signal?.throwIfAborted();
    const batch = uniqueTaskFilenames.slice(i, i + IMAGE_FETCH_CONCURRENCY);
    const images = await Promise.all(
      batch.map((name) => loadDeckImage(name, options.signal).then(step)),
    );
    batch.forEach((name, idx) => loadedByFilename.set(name, images[idx]));
  }
  const taskImages = new Map<number, DeckImage>();
  for (const task of collection.tasks) {
    if (task.image_filename) {
      const image = loadedByFilename.get(task.image_filename);
      if (image) taskImages.set(task.id, image);
    }
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
    font: collection.pptx_font,
    includeAnswers: options.includeAnswers,
  });
  options.signal?.throwIfAborted();
  saveFile(bytes, constructorFilename(collection.title, "pptx"), PPTX_MIME);
}
