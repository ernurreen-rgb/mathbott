"use client";

import MathRender from "@/components/ui/MathRender";
import { hasEmptyMcqOptionTexts } from "@/lib/comparison-task";
import { getTaskMcqCorrectCount, parseMcqAnswerLabels } from "@/lib/question-options";
import { parseWrittenAnswerSlots } from "@/lib/written-answer";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { TrialTestDetails } from "@/types";
import type { ReviewAnswer } from "@/lib/trial-test-review";
import { useI18n } from "@/lib/i18n/provider";

type QuestionType = "input" | "tf" | "mcq" | "mcq6" | "select" | "context";

export type TrialTestReviewAnswer = ReviewAnswer;

const parseSelectAnswerPair = (value?: string): [string, string] => {
  if (!value) return ["", ""];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return [String(parsed[0] || ""), String(parsed[1] || "")];
    }
  } catch {
    // Ignore malformed historic payloads.
  }
  return ["", ""];
};

const normalizeTfValue = (value?: string | null): "true" | "false" | "" => {
  const lowered = String(value ?? "").trim().toLowerCase();
  if (lowered === "true" || lowered === "1") return "true";
  if (lowered === "false" || lowered === "0") return "false";
  return "";
};

const renderMathOrText = (value: string, emptyLabel: string) => {
  if (!value) return <span>{emptyLabel}</span>;
  return <MathRender inline latex={value} />;
};

export const isReviewResultActuallyCorrect = (
  _task: TrialTestDetails["tasks"][number],
  result?: TrialTestReviewAnswer | null
) => result?.correct ?? false;

const renderSelectChoice = (
  options: NonNullable<TrialTestDetails["tasks"][number]["options"]>,
  label: string,
  noAnswer: string,
  preferWritten = false
) => {
  const trimmed = label.trim();
  const upper = trimmed.toUpperCase();
  if (!upper) return <span>{noAnswer}</span>;
  if (preferWritten) return <MathRender inline latex={trimmed} />;
  const option = options.find((item) => (item.label || "").trim().toUpperCase() === upper);
  if (!option) return <MathRender inline latex={trimmed} />;
  return (
    <span className="inline-flex flex-wrap items-center gap-2">
      <span className="font-semibold">{option.label}</span>
      <MathRender inline latex={option.text} />
    </span>
  );
};

/** Read-only view of one answered task: the student's choice and, when wrong, the right answer. */
export function ReviewAnswerBlock({
  task,
  result,
}: {
  task: TrialTestDetails["tasks"][number];
  result?: TrialTestReviewAnswer | null;
}) {
  const { t } = useI18n();
  const noAnswer = t("review.noAnswer");
  const resultAnswer = result && typeof result === "object" ? result : undefined;
  const userAnswerRaw = resultAnswer?.answer ?? "";
  const userAnswer = userAnswerRaw || noAnswer;
  const correctAnswer = resultAnswer?.correct_answer ?? task.answer ?? "";
  const qt: QuestionType = (task.question_type || "input") as QuestionType;
  const isCorrect = isReviewResultActuallyCorrect(task, resultAnswer);
  const userMcqLabels = parseMcqAnswerLabels(userAnswerRaw);
  const correctMcqLabels = parseMcqAnswerLabels(correctAnswer);
  const renderAnswerBlock = () => {
    if (qt === "mcq" || qt === "mcq6" || qt === "context") {
      const options = task.options || [];
      const isWrittenAnswer = getTaskAnswerMode(task) === "written";
      const writtenAnswers = parseWrittenAnswerSlots(userAnswerRaw, getTaskMcqCorrectCount(task)).filter((item) => item.trim());
      const isPartial =
        typeof resultAnswer?.score === "number" &&
        typeof resultAnswer?.max_score === "number" &&
        resultAnswer.score > 0 &&
        resultAnswer.score < resultAnswer.max_score;
      return (
        <div className="mt-2 space-y-3">
          {isWrittenAnswer && (
            <div
              className={`rounded-lg border-2 p-3 ${
                isCorrect
                  ? "border-green-500 bg-green-100"
                  : isPartial
                    ? "border-amber-400 bg-amber-50"
                    : "border-red-500 bg-red-100"
              }`}
            >
              <div className="mb-1 text-sm font-semibold text-gray-700">{t("reviewBlock.yourAnswer")}</div>
              <div className="flex flex-wrap gap-3">
                {writtenAnswers.length > 0 ? (
                  writtenAnswers.map((answer, index) => (
                    <MathRender key={`written-review-${index}`} inline latex={answer} />
                  ))
                ) : (
                  <span className="text-sm text-gray-600">{noAnswer}</span>
                )}
              </div>
            </div>
          )}
          <div className={`grid gap-2 ${hasEmptyMcqOptionTexts(options) ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1"}`}>
            {options.map((option) => {
            const labelUpper = (option.label || "").trim().toUpperCase();
            const isUserChoice = !isWrittenAnswer && userMcqLabels.includes(labelUpper as any);
            const isCorrectOption = correctMcqLabels.includes(labelUpper as any);
            const labelOnly = hasEmptyMcqOptionTexts(options);
            let style = "bg-gray-50 border-gray-200";
            if (isUserChoice && (isCorrect || isCorrectOption)) style = "bg-green-100 border-green-500";
            else if (isUserChoice && !isCorrectOption) style = "bg-red-100 border-red-500";
            else if (!isUserChoice && isCorrectOption) style = "bg-green-50 border-green-400";

              return (
                <div
                  key={option.label}
                  className={`border-2 rounded-lg p-3 ${labelOnly ? "text-center flex items-center justify-center" : "text-left"} ${style}`}
                >
                  {labelOnly ? (
                    <span className="font-bold text-gray-900">{option.label}</span>
                  ) : (
                    <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-x-2 gap-y-1">
                      <span className="font-bold text-gray-900 shrink-0">{option.label}</span>
                      <div className="min-w-0 break-words whitespace-normal">
                        <MathRender inline latex={option.text} className="text-gray-700" />
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    }

    if (qt === "tf") {
      const options = [
        { label: t("footer.tfTrue"), value: "true" },
        { label: t("footer.tfFalse"), value: "false" },
      ] as const;
      const userTf = normalizeTfValue(userAnswerRaw);
      const correctTf = normalizeTfValue(correctAnswer);
      return (
        <div className="flex gap-2 mt-2">
          {options.map((option) => {
            const isUserChoice = userTf === option.value;
            const isCorrectOption = correctTf === option.value;
            let style = "flex-1 border-2 rounded-lg p-3 text-center font-bold border-gray-200 bg-gray-50";
            if (isUserChoice && (isCorrect || isCorrectOption)) {
              style = "flex-1 border-2 border-green-500 rounded-lg p-3 text-center font-bold bg-green-100 text-green-800";
            } else if (isUserChoice && !isCorrect) {
              style = "flex-1 border-2 border-red-500 rounded-lg p-3 text-center font-bold bg-red-100 text-red-800";
            } else if (!isCorrect && isCorrectOption) {
              style = "flex-1 border-2 border-green-400 rounded-lg p-3 text-center font-bold bg-green-100 text-green-800";
            }
            return (
              <div key={option.value} className={style}>
                {option.label}
              </div>
            );
          })}
        </div>
      );
    }

    if (qt === "select") {
      const options = task.options || [];
      const subquestions = task.subquestions || [];
      const userChoices = parseSelectAnswerPair(userAnswerRaw);
      const correctChoices = parseSelectAnswerPair(correctAnswer);
      const isWrittenSelectAnswer = getTaskAnswerMode(task) === "written";

      return (
        <div className="mt-2 space-y-3">
          {[0, 1].map((index) => {
            const subquestion = subquestions[index];
            const userChoice = userChoices[index];
            const correctChoice = correctChoices[index];
            const correctOptionText = options.find(
              (item) => (item.label || "").trim().toUpperCase() === correctChoice.trim().toUpperCase()
            )?.text;
            const rowCorrect = Boolean(
              isCorrect ||
              (!isWrittenSelectAnswer &&
                userChoice.trim().toUpperCase() &&
                userChoice.trim().toUpperCase() === correctChoice.trim().toUpperCase()) ||
              (isWrittenSelectAnswer &&
                userChoice.trim() &&
                (userChoice.trim() === correctChoice.trim() ||
                  (correctOptionText && userChoice.trim() === correctOptionText.trim())))
            );

            return (
              <div key={`select-${task.id}-${index}`} className="rounded-lg border border-gray-200 bg-white/80 p-3">
                <div className="text-sm font-semibold text-gray-700 mb-2">
                  {String.fromCharCode(65 + index)}.{" "}
                  {subquestion?.text ? <MathRender inline latex={subquestion.text} /> : t("reviewBlock.questionNth", { n: index + 1 })}
                </div>
                <div className="text-sm">
                  <span className="font-semibold text-gray-700">{t("reviewBlock.yourAnswer")}: </span>
                  <span className={rowCorrect ? "text-green-700" : "text-red-700"}>
                    {renderSelectChoice(options, userChoice, noAnswer, isWrittenSelectAnswer)}
                  </span>
                </div>
                {!rowCorrect && correctChoice && (
                  <div className="text-sm mt-1">
                    <span className="font-semibold text-gray-700">{t("quizPlay.correctAnswerLabel")} </span>
                    <span className="text-green-700">{renderSelectChoice(options, correctChoice, noAnswer, isWrittenSelectAnswer && !correctOptionText)}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      );
    }

    return (
      <div className="mt-2 space-y-1">
        <div
          className={`rounded-lg p-3 border-2 ${
            isCorrect ? "bg-green-100 border-green-500 text-green-800" : "bg-red-100 border-red-500 text-red-800"
          }`}
        >
          <span className="font-semibold">{t("reviewBlock.yourAnswer")}: </span>
          {renderMathOrText(userAnswerRaw, userAnswer)}
        </div>
        {!isCorrect && correctAnswer && (
          <div className="rounded-lg p-3 border-2 bg-green-100 border-green-400 text-green-800">
            <span className="font-semibold">{t("quizPlay.correctAnswerLabel")} </span>
            {renderMathOrText(correctAnswer, noAnswer)}
          </div>
        )}
      </div>
    );
  };

  return renderAnswerBlock();
}
