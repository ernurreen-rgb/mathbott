import type { AnswerMode, LessonTask, QuestionType } from "@/types";

import { apiPath, fetchWithErrorHandling } from "./client";

export interface AdminTaskPreviewCheckResponse {
  correct: boolean;
  question_type: QuestionType;
  answer_mode: AnswerMode;
}

export async function checkAdminTaskAnswerPreview(
  task: Partial<LessonTask>,
  userAnswer: string
): Promise<{ data: AdminTaskPreviewCheckResponse | null; error: string | null }> {
  return fetchWithErrorHandling<AdminTaskPreviewCheckResponse>(
    apiPath("admin/task-answer/preview-check"),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        task: {
          question_type: task.question_type || "input",
          answer_mode: task.answer_mode,
          answer: task.answer || "",
          accepted_answers: Array.isArray(task.accepted_answers) ? task.accepted_answers : [],
          options: Array.isArray(task.options) ? task.options : [],
          subquestions: Array.isArray(task.subquestions) ? task.subquestions : [],
        },
        user_answer: userAnswer,
      }),
    }
  );
}
