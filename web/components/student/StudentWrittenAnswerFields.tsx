"use client";

import StudentMathAnswerInput from "./StudentMathAnswerInput";
import { parseWrittenAnswerSlots, serializeWrittenAnswerSlots } from "@/lib/written-answer";

interface StudentWrittenAnswerFieldsProps {
  value: string | undefined;
  onChange: (value: string) => void;
  count?: number;
  disabled?: boolean;
  labels?: string[];
}

export default function StudentWrittenAnswerFields({
  value,
  onChange,
  count = 1,
  disabled = false,
  labels = [],
}: StudentWrittenAnswerFieldsProps) {
  const slots = parseWrittenAnswerSlots(value, count);

  return (
    <div className="space-y-3">
      {slots.map((slot, index) => (
        <div key={`written-answer-${index}`} className="space-y-1.5">
          {labels[index] && (
            <div className="text-sm font-semibold text-gray-700">{labels[index]}</div>
          )}
          <StudentMathAnswerInput
            value={slot}
            onChange={(nextValue) => {
              const next = [...slots];
              next[index] = nextValue;
              onChange(serializeWrittenAnswerSlots(next));
            }}
            disabled={disabled}
            ariaLabel={labels[index] || (slots.length > 1 ? `Жауап ${index + 1}` : "Математикалық жауап")}
            placeholder={slots.length > 1 ? `${index + 1}-жауап` : "Жауапты жазыңыз"}
          />
        </div>
      ))}
    </div>
  );
}
