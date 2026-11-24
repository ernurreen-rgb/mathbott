"use client";

import MathRender from "@/components/ui/MathRender";
import { apiPath } from "@/lib/api/client";
import { useI18n } from "@/lib/i18n/provider";
import type { ConstructorTask } from "@/types/constructor";

/** A bank task as the constructor lists it: the statement, its picture and its options. */
export default function TaskPreview({ task, compact = false }: { task: ConstructorTask; compact?: boolean }) {
  const { t } = useI18n();
  const statement = task.text.trim()
    ? <MathRender latex={task.text} className="text-slate-900" />
    : <span className="italic text-slate-500">{t("constructor.imageTask")}</span>;
  if (compact) return <div className="line-clamp-2 text-sm">{statement}</div>;

  const showOptions = task.answer_mode !== "written" && (task.question_type === "mcq" || task.question_type === "mcq6" || task.question_type === "select");
  const options = task.options.filter((option) => option.text.trim());
  return (
    <div className="min-w-0 text-[15px] leading-relaxed">
      {statement}
      {task.image_filename && (
        // The bank picture at its own proportions; a fixed box would crop diagrams.
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={apiPath(`images/${task.image_filename}`)}
          alt={t("constructor.taskImageAlt", { id: task.id })}
          loading="lazy"
          className="mt-2 max-h-40 w-auto max-w-full rounded-lg border border-slate-100 object-contain"
        />
      )}
      {task.question_type === "select" && task.subquestions.length > 0 && (
        <ol className="mt-2 space-y-1">
          {task.subquestions.map((subquestion, index) => (
            <li key={index} className="flex gap-1.5">
              <strong>{String.fromCharCode(65 + index)})</strong>
              <MathRender latex={subquestion.text} inline />
            </li>
          ))}
        </ol>
      )}
      {showOptions && options.length > 0 && (
        <div className="mt-2 grid grid-cols-1 gap-x-6 gap-y-1 sm:grid-cols-2">
          {options.map((option) => (
            <div key={option.label} className="flex min-w-0 items-baseline gap-1.5">
              <strong className="shrink-0">{option.label})</strong>
              <MathRender latex={option.text} inline />
            </div>
          ))}
        </div>
      )}
      {task.question_type === "tf" && (
        <p className="mt-2 text-sm text-slate-600">{t("constructor.type.tf")}</p>
      )}
    </div>
  );
}
