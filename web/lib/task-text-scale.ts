import { TaskTextScale } from "@/types";

export const normalizeTaskTextScale = (value?: string | null): TaskTextScale => {
  if (value === "sm" || value === "md" || value === "lg") {
    return value;
  }
  return "md";
};

export const getTaskTextScaleClass = (scale: TaskTextScale): string => {
  if (scale === "sm") return "text-base";
  if (scale === "lg") return "text-xl md:text-2xl";
  return "text-lg";
};
