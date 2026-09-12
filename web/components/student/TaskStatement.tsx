"use client";

import Image from "next/image";
import MathRender from "@/components/ui/MathRender";
import { apiPath } from "@/lib/api/client";
import { getTaskTextScaleClass, normalizeTaskTextScale } from "@/lib/task-text-scale";
import type { LessonTask } from "@/types";

export default function TaskStatement({ task, imageSrc }: {
  task: Pick<LessonTask, "text" | "text_scale" | "image_filename">;
  imageSrc?: string | null;
}) {
  const src = imageSrc === undefined && task.image_filename
    ? apiPath(`images/${task.image_filename}`) : imageSrc;
  return (
    <div className="space-y-4 min-w-0">
      <div className={`min-w-0 break-words font-semibold text-gray-900 ${getTaskTextScaleClass(normalizeTaskTextScale(task.text_scale))}`}>
        {task.text ? <MathRender latex={task.text} /> : <span className="text-gray-400">Тапсырма мәтіні осы жерде көрсетіледі</span>}
      </div>
      {src && <Image src={src} alt="Тапсырма" width={1280} height={720} unoptimized
        className="max-h-64 w-auto max-w-full rounded-lg border border-gray-200 object-contain" />}
    </div>
  );
}
