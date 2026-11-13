import { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import { apiPath } from "@/lib/api";
import { normalizeMathFieldValueForStorage } from "@/lib/math-normalize";
import { MCQ_OPTION_LABELS, serializeMcqAnswerLabels } from "@/lib/question-options";
import { AnswerMode } from "@/types";
import type { Session } from "next-auth";
import type { Dispatch, SetStateAction } from "react";
import type { CreateTaskFormState } from "./model";
import { parseBankTaskId, parseBankTopicsRaw } from "./model";

const getRequiredOptionError = (form: CreateTaskFormState): string | null => {
  if (!["mcq", "mcq6", "select"].includes(form.question_type)) return null;
  const options = [form.optionA, form.optionB, form.optionC, form.optionD, form.optionE, form.optionF];
  const emptyIndex = options.slice(0, form.question_type === "mcq6" ? 6 : 4).findIndex((text) => !text.trim());
  return emptyIndex >= 0 ? `${MCQ_OPTION_LABELS[emptyIndex]} жауап нұсқасын толтырыңыз` : null;
};

const serializeMathOptions = (options: { label: string; text: string }[]) =>
  JSON.stringify(options.map((option) => ({ ...option, text: normalizeMathFieldValueForStorage(option.text) })));

type Context = {
  session: Session | null;
  selectedMiniLesson: number | null;
  taskForm: CreateTaskFormState;
  setError: Dispatch<SetStateAction<string | null>>;
  taskAnswerMode: AnswerMode;
  fetchMiniTasks: (miniLessonId: number) => Promise<void>;
  setTaskForm: Dispatch<SetStateAction<CreateTaskFormState>>;
  setTaskAnswerMode: Dispatch<SetStateAction<AnswerMode>>;
};

export function createTaskActions({
  session,
  selectedMiniLesson,
  taskForm,
  setError,
  taskAnswerMode,
  fetchMiniTasks,
  setTaskForm,
  setTaskAnswerMode,
}: Context) {
  const createMiniLessonTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !selectedMiniLesson) return;

    const rawBankTaskId = taskForm.bankTaskId.trim();
    const linkedBankTaskId = parseBankTaskId(rawBankTaskId);
    if (rawBankTaskId && !linkedBankTaskId) {
      setError("БАНК тапсырма ID қате");
      return;
    }
    const optionError = !linkedBankTaskId && getRequiredOptionError(taskForm);
    if (optionError) {
      setError(optionError);
      return;
    }

    const formData = new FormData();
    formData.append("sort_order", taskForm.sort_order.toString());
    formData.append("question_type", taskForm.question_type);
    formData.append("answer_mode", taskAnswerMode);
    formData.append("text_scale", taskForm.text_scale);
    formData.append("email", session.user.email);
    formData.append("bank_difficulty", taskForm.bank_difficulty);
    formData.append("bank_topics", JSON.stringify(parseBankTopicsRaw(taskForm.bank_topics_raw)));

    if (linkedBankTaskId) {
      formData.append("bank_task_id", String(linkedBankTaskId));
    } else {
      formData.append("text", normalizeMathFieldValueForStorage(taskForm.text));
      formData.append("accepted_answers", JSON.stringify(normalizeAcceptedAnswers(taskForm.accepted_answers.map(normalizeMathFieldValueForStorage))));
      if (taskForm.question_type === "mcq" || taskForm.question_type === "mcq6") {
        const options = [
          { label: "A", text: taskForm.optionA },
          { label: "B", text: taskForm.optionB },
          { label: "C", text: taskForm.optionC },
          { label: "D", text: taskForm.optionD },
          ...(taskForm.question_type === "mcq6"
            ? [
              { label: "E", text: taskForm.optionE },
              { label: "F", text: taskForm.optionF },
            ]
            : []),
        ];
        formData.append("options", serializeMathOptions(options));
        formData.append("answer", serializeMcqAnswerLabels(taskForm.correctOptions));
      } else if (taskForm.question_type === "select") {
        if (!taskForm.subQuestion1.trim() || !taskForm.subQuestion2.trim()) {
          setError("select үшін екі қосымша сұрақ мәтінін енгізіңіз");
          return;
        }
        const options = [
          { label: "A", text: taskForm.optionA },
          { label: "B", text: taskForm.optionB },
          { label: "C", text: taskForm.optionC },
          { label: "D", text: taskForm.optionD },
        ];
        const subquestions = [
          { text: normalizeMathFieldValueForStorage(taskForm.subQuestion1), correct: taskForm.correctSub1 },
          { text: normalizeMathFieldValueForStorage(taskForm.subQuestion2), correct: taskForm.correctSub2 },
        ];
        formData.append("options", serializeMathOptions(options));
        formData.append("subquestions", JSON.stringify(subquestions));
        formData.append("answer", JSON.stringify([taskForm.correctSub1, taskForm.correctSub2]));
      } else if (taskForm.question_type === "tf") {
        formData.append("answer", taskForm.correctTf);
      } else {
        formData.append("answer", normalizeMathFieldValueForStorage(taskForm.answer));
      }

      if (taskForm.imageFile) {
        formData.append("image", taskForm.imageFile);
      }
    }

    try {
      const response = await fetch(apiPath(`admin/mini-lessons/${selectedMiniLesson}/tasks`), {
        method: "POST",
        body: formData,
      });
      if (!response.ok) throw new Error("Тапсырма құру мүмкін болмады");
      await fetchMiniTasks(selectedMiniLesson);
      setTaskForm({
        text: "",
        question_type: "mcq",
        text_scale: "md",
        answer: "",
        accepted_answers: [],
        sort_order: 0,
        bankTaskId: "",
        bank_difficulty: "B",
        bank_topics_raw: "",
        imageFile: null,
        optionA: "",
        optionB: "",
        optionC: "",
        optionD: "",
        optionE: "",
        optionF: "",
        correctOptions: ["A"],
        correctTf: "true",
        subQuestion1: "",
        subQuestion2: "",
        correctSub1: "A",
        correctSub2: "A",
      });
      setTaskAnswerMode("choices");
      setError(null);
      return true;
    } catch (err: any) {
      setError(err.message);
      return false;
    }
  };

  const deleteMiniLessonTask = async (taskId: number) => {
    if (!session?.user?.email || !confirm("Есепті жою керек пе?")) return;
    try {
      const response = await fetch(`${apiPath(`admin/tasks/${taskId}`)}?email=${encodeURIComponent(session.user.email)}`, {
        method: "DELETE",
      });
      if (!response.ok) throw new Error("Тапсырманы жою мүмкін болмады");
      if (selectedMiniLesson) await fetchMiniTasks(selectedMiniLesson);
    } catch (err: any) {
      setError(err.message);
    }
  };
  return { createMiniLessonTask, deleteMiniLessonTask };
}
