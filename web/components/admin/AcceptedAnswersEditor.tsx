"use client";

import MathFieldInput from "@/components/ui/MathFieldInput";

interface AcceptedAnswersEditorProps {
  value?: string[] | null;
  onChange: (answers: string[]) => void;
  disabled?: boolean;
  className?: string;
}

export const normalizeAcceptedAnswers = (answers?: string[] | null): string[] => {
  const seen = new Set<string>();
  return (answers || [])
    .map((answer) => answer.trim())
    .filter((answer) => {
      if (!answer || seen.has(answer)) return false;
      seen.add(answer);
      return true;
    })
    .slice(0, 20);
};

export default function AcceptedAnswersEditor({
  value,
  onChange,
  disabled = false,
  className = "",
}: AcceptedAnswersEditorProps) {
  const answers = Array.isArray(value) ? value : [];

  const updateAnswer = (index: number, answer: string) => {
    const next = [...answers];
    next[index] = answer;
    onChange(next);
  };

  return (
    <div className={className}>
      <div className="flex items-center justify-between gap-3">
        <div>
          <div className="text-sm font-semibold text-gray-700">Қосымша қабылданатын жауаптар</div>
          <div className="mt-1 text-xs text-gray-500">
            Негізгі жауаптан басқа дұрыс деп саналатын жазбалар. Ең көбі 20.
          </div>
        </div>
        <button
          type="button"
          disabled={disabled || answers.length >= 20}
          onClick={() => onChange([...answers, ""])}
          className="shrink-0 rounded-lg border border-purple-300 bg-purple-50 px-3 py-2 text-sm font-semibold text-purple-700 hover:bg-purple-100 disabled:cursor-not-allowed disabled:opacity-50"
        >
          + Жауап
        </button>
      </div>

      {answers.length > 0 && (
        <div className="mt-3 space-y-2">
          {answers.map((answer, index) => (
            <div key={index} className="flex items-center gap-2">
              <MathFieldInput
                value={answer}
                onChange={(next) => updateAnswer(index, next)}
                readOnly={disabled}
                className="min-w-0 flex-1 rounded-lg border border-gray-300 px-3 py-2"
                placeholder={`Балама жауап ${index + 1}`}
              />
              <button
                type="button"
                disabled={disabled}
                onClick={() => onChange(answers.filter((_, answerIndex) => answerIndex !== index))}
                aria-label={`Балама жауапты жою ${index + 1}`}
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-red-600 hover:bg-red-100 disabled:opacity-50"
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
