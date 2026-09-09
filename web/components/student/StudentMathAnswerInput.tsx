"use client";

import MathFieldInput from "@/components/ui/MathFieldInput";

interface StudentMathAnswerInputProps {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  placeholder?: string;
  ariaLabel?: string;
  className?: string;
  compact?: boolean;
  autoFocus?: boolean;
}

export default function StudentMathAnswerInput({
  value,
  onChange,
  disabled = false,
  placeholder = "Жауапты жазыңыз",
  ariaLabel = "Математикалық жауап",
  className = "",
  compact = false,
  autoFocus = false,
}: StudentMathAnswerInputProps) {
  return (
    <div className="relative w-full">
      {!value && placeholder && (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 z-10 -translate-y-1/2 text-gray-400 ${
            compact ? "left-3 text-sm" : "left-5 text-lg"
          }`}
        >
          {placeholder}
        </span>
      )}
      <MathFieldInput
        value={value}
        onChange={onChange}
        readOnly={disabled}
        ariaLabel={ariaLabel}
        autoFocus={autoFocus}
        defaultMode="math"
        smartMode={false}
        virtualKeyboardPolicy="auto"
        virtualKeyboardPreset="student"
        openVirtualKeyboardOnFocus={false}
        className={`${compact ? "student-math-answer-input--compact" : "student-math-answer-input"} ${className}`.trim()}
      />
    </div>
  );
}
