"use client";

import { useRef } from "react";
import MathRender from "@/components/ui/MathRender";
import StudentMathAnswerInput from "./StudentMathAnswerInput";
import { parseWrittenAnswerSlots, serializeWrittenAnswerSlots } from "@/lib/written-answer";

interface StudentWrittenAnswerFieldsProps {
  value: string | undefined;
  onChange: (value: string) => void;
  count?: number;
  disabled?: boolean;
  /** One per field, e.g. a matching task's "A)" and its subquestion; the text may hold formulas. */
  labels?: WrittenAnswerLabel[];
}

export type WrittenAnswerLabel = { prefix: string; text: string };

export default function StudentWrittenAnswerFields({
  value,
  onChange,
  count = 1,
  disabled = false,
  labels = [],
}: StudentWrittenAnswerFieldsProps) {
  const slots = parseWrittenAnswerSlots(value, count);
  const slotsRef = useRef<string[]>(slots);
  slotsRef.current = slots;

  return (
    <div className="space-y-3">
      {slots.map((slot, index) => (
        <div key={`written-answer-${index}`} className="space-y-1.5">
          {labels[index] && (
            <div className="text-sm font-semibold text-gray-700">
              {labels[index].prefix} <MathRender inline latex={labels[index].text} />
            </div>
          )}
          <StudentMathAnswerInput
            value={slot}
            onChange={(nextValue) => {
              const next = [...slotsRef.current];
              next[index] = nextValue;
              slotsRef.current = next;
              onChange(serializeWrittenAnswerSlots(next));
            }}
            disabled={disabled}
            ariaLabel={labels[index] ? `${labels[index].prefix} ${labels[index].text}` : slots.length > 1 ? `Жауап ${index + 1}` : "Математикалық жауап"}
            placeholder={slots.length > 1 ? `${index + 1}-жауап` : "Жауапты жазыңыз"}
          />
        </div>
      ))}
    </div>
  );
}
