"use client";

import React from "react";

interface ProgressBarProps {
  progress: number; // 0-100
  className?: string;
  showLabel?: boolean;
  label?: string;
  color?: "blue" | "green" | "red" | "yellow" | "purple";
  size?: "sm" | "md" | "lg";
  animated?: boolean;
}

const colorClasses = {
  blue: "bg-blue-600",
  green: "bg-green-600",
  red: "bg-red-600",
  yellow: "bg-yellow-600",
  purple: "bg-purple-600",
};

const sizeClasses = {
  sm: "h-1",
  md: "h-2",
  lg: "h-4",
};

export function ProgressBar({
  progress,
  className = "",
  showLabel = false,
  label,
  color = "blue",
  size = "md",
  animated = true,
}: ProgressBarProps) {
  const clampedProgress = Math.max(0, Math.min(100, progress));
  const colorClass = colorClasses[color];
  const sizeClass = sizeClasses[size];

  return (
    <div className={`w-full ${className}`}>
      {showLabel && (
        <div className="flex justify-between items-center mb-1">
          <span className="text-sm text-gray-700">{label || "Прогресс"}</span>
          <span className="text-sm font-semibold text-gray-700">{Math.round(clampedProgress)}%</span>
        </div>
      )}
      <div className={`w-full ${sizeClass} bg-gray-200 rounded-full overflow-hidden`}>
        <div
          className={`${colorClass} ${sizeClass} rounded-full transition-all duration-300 ${
            animated ? "ease-out" : ""
          }`}
          style={{ width: `${clampedProgress}%` }}
          role="progressbar"
          aria-valuenow={clampedProgress}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label={label || "Прогресс"}
        />
      </div>
    </div>
  );
}

// Pre-built progress bar components
export function ModuleProgressBar({ progress }: { progress: number }) {
  return (
    <ProgressBar
      progress={progress}
      color="blue"
      size="md"
      showLabel={true}
      label="Прогресс модуля"
    />
  );
}

export function LessonProgressBar({ progress }: { progress: number }) {
  return (
    <ProgressBar
      progress={progress}
      color="green"
      size="sm"
      showLabel={true}
      label="Прогресс урока"
    />
  );
}

export function TaskProgressBar({ completed, total }: { completed: number; total: number }) {
  const progress = total > 0 ? (completed / total) * 100 : 0;
  return (
    <ProgressBar
      progress={progress}
      color="purple"
      size="md"
      showLabel={true}
      label={`${completed} из ${total} задач`}
    />
  );
}

