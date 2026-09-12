"use client";
import MathRender from "@/components/ui/MathRender";
import {
  MAX_MCQ_CORRECT_OPTIONS,
  McqOptionLabel,
  parseMcqAnswerLabels,
  toggleMcqAnswerLabel
} from "@/lib/question-options";
import { BankPlacementTask } from "@/types";
import { getPlacementOptions, getPlacementQuestionType, getPlacementSubquestions, parseSelectAnswer } from "./model";

type Props = {
  currentPlacement: BankPlacementTask | null;
  previewAnswers: Record<number, string>;
  currentSlotIndex: number;
  setPreviewAnswer: (slotIndex: number, value: string) => void;
};

export default function CurrentSlotControls({ currentPlacement, previewAnswers, currentSlotIndex, setPreviewAnswer }: Props) {
  if (!currentPlacement) return null;

  const questionType = getPlacementQuestionType(currentPlacement);
  const options = getPlacementOptions(currentPlacement);
  const subquestions = getPlacementSubquestions(currentPlacement);
  const value = previewAnswers[currentSlotIndex] || "";

  if (questionType === "tf") {
    const isTrue = value === "true" || value === "1";
    const isFalse = value === "false" || value === "0";
    return (
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => setPreviewAnswer(currentSlotIndex, "true")}
          className={`font-semibold py-2 px-3 rounded-lg border transition-colors ${isTrue
            ? "bg-purple-600 border-purple-700 text-white"
            : "bg-green-600 border-green-700 text-white hover:bg-green-700"
            }`}
        >
          Шын
        </button>
        <button
          type="button"
          onClick={() => setPreviewAnswer(currentSlotIndex, "false")}
          className={`font-semibold py-2 px-3 rounded-lg border transition-colors ${isFalse
            ? "bg-purple-600 border-purple-700 text-white"
            : "bg-red-600 border-red-700 text-white hover:bg-red-700"
            }`}
        >
          Жалған
        </button>
      </div>
    );
  }

  if (questionType === "select") {
    const selected = parseSelectAnswer(value);
    const subLabels = ["A", "B"];
    return (
      <div className="space-y-3">
        {[0, 1].map((subIndex) => {
          const subText = subquestions[subIndex]?.text || `${subIndex + 1}-қосымша сұрақ`;
          return (
            <div key={`slot-${currentSlotIndex}-sub-${subIndex}`} className="space-y-2">
              <div className="font-semibold text-gray-800">{subLabels[subIndex]})</div>
              <div className="text-gray-900">
                <MathRender latex={subText} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                {options.map((option, optionIndex) => {
                  const label = String(option?.label || "");
                  const isSelected = selected[subIndex] === label;
                  return (
                    <button
                      key={`slot-${currentSlotIndex}-sub-${subIndex}-option-${optionIndex}`}
                      type="button"
                      onClick={() => {
                        const next = [...selected] as [string, string];
                        next[subIndex] = label;
                        setPreviewAnswer(currentSlotIndex, JSON.stringify(next));
                      }}
                      className={`text-left border rounded-lg p-2 transition-colors ${isSelected
                        ? "bg-purple-600 border-purple-700 text-white"
                        : "bg-white border-gray-300 text-gray-900 hover:border-purple-300 hover:bg-purple-50"
                        }`}
                    >
                      <div className="font-bold">{label || `#${optionIndex + 1}`}</div>
                      <div className={isSelected ? "text-white" : "text-gray-700"}>
                        <MathRender inline latex={String(option?.text || "")} />
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  if (questionType === "mcq" || questionType === "mcq6") {
    const selectedLabels = parseMcqAnswerLabels(value);
    return (
      <div className="grid grid-cols-1 gap-2">
        {options.map((option, optionIndex) => {
          const label = String(option?.label || "");
          const isSelected = selectedLabels.includes(label as McqOptionLabel);
          return (
            <button
              key={`slot-${currentSlotIndex}-option-${optionIndex}`}
              type="button"
              onClick={() =>
                setPreviewAnswer(
                  currentSlotIndex,
                  toggleMcqAnswerLabel(value, label as McqOptionLabel, MAX_MCQ_CORRECT_OPTIONS)
                )
              }
              className={`text-left border rounded-lg p-3 transition-colors ${isSelected
                ? "bg-purple-600 border-purple-700 text-white"
                : "border-gray-200 bg-white text-gray-900 hover:border-purple-300 hover:bg-purple-50"
                }`}
            >
              <div className={`font-bold ${isSelected ? "text-white" : "text-gray-900"}`}>{label}</div>
              <div className={isSelected ? "text-white" : "text-gray-700"}>
                <MathRender inline latex={String(option?.text || "")} />
              </div>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <input
      value={value}
      onChange={(e) => setPreviewAnswer(currentSlotIndex, e.target.value)}
      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-gray-900 placeholder:text-gray-400"
      placeholder="Жауапты енгізіңіз"
    />
  );
}
