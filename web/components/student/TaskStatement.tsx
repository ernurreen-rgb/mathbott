"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import MathRender from "@/components/ui/MathRender";
import ComparisonTableView from "@/components/student/ComparisonTableView";
import { hasEmptyMcqOptionTexts, parseComparisonTask } from "@/lib/comparison-task";
import { splitLeadingTitle } from "@/lib/context-title";
import { apiPath } from "@/lib/api/client";
import {
  TaskFontViewport,
  getTaskTextScaleClass,
  getTaskTextScaleStyle,
  normalizeTaskTextScale,
} from "@/lib/task-text-scale";
import type { LessonTask } from "@/types";
import { useI18n } from "@/lib/i18n/provider";

export default function TaskStatement({ task, imageSrc, viewport }: {
  task: Pick<LessonTask, "text" | "text_scale" | "image_filename"> & {
    question_type?: string | null;
    options?: ReadonlyArray<{ text?: string | null }> | null;
  };
  imageSrc?: string | null;
  viewport?: TaskFontViewport;
}) {
  const src = imageSrc === undefined && task.image_filename
    ? apiPath(`images/${task.image_filename}`) : imageSrc;
  const [imageFailed, setImageFailed] = useState(false);
  const { t } = useI18n();
  useEffect(() => {
    setImageFailed(false);
  }, [src]);
  const normalizedScale = normalizeTaskTextScale(task.text_scale);
  const { title, body } = splitLeadingTitle(task.text);
  const comparisonParts = parseComparisonTask(body);
  const isLabelOnlyMcq =
    (!task.question_type || task.question_type === "mcq" || task.question_type === "mcq6") &&
    hasEmptyMcqOptionTexts(task.options);
  return (
    <div className="w-full space-y-4 min-w-0">
      <div
        className={`min-w-0 break-words font-semibold leading-[1.65] text-gray-900 ${viewport ? "" : getTaskTextScaleClass(normalizedScale)}`}
        style={getTaskTextScaleStyle(normalizedScale, viewport)}
      >
        {title && (
          <div data-task-title className="mb-2 flex flex-col items-center justify-center text-center text-[1.08em] font-bold">
            <MathRender latex={title} />
          </div>
        )}
        {comparisonParts ? (
          <ComparisonTableView parts={comparisonParts} />
        ) : body ? (
          isLabelOnlyMcq ? (
            <div
              data-comparison-body
              className="min-w-0 flex flex-col items-center justify-center text-center"
            >
              <MathRender latex={body} />
            </div>
          ) : (
            <MathRender latex={body} />
          )
        ) : title ? null : (
          <span className="text-gray-400">{t("task.textPlaceholder")}</span>
        )}
      </div>
      {src && !imageFailed && (
        <Image
          src={src}
          alt={t("task.imageAlt")}
          width={1280}
          height={720}
          unoptimized
          onError={() => setImageFailed(true)}
          className="qm-image-backdrop mx-auto block max-h-64 w-auto max-w-full rounded-lg border border-gray-200 object-contain"
        />
      )}
      {src && imageFailed && (
        <div className="mx-auto rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-center text-xs text-amber-800">
          {t("task.imageFailed")}
        </div>
      )}
    </div>
  );
}
