import { normalizeAcceptedAnswers } from "@/components/admin/AcceptedAnswersEditor";
import { getTaskAnswerMode } from "@/lib/answer-mode";
import { apiPath } from "@/lib/api";
import {
  McqOptionLabel,
  parseMcqAnswerLabels,
  serializeMcqAnswerLabels
} from "@/lib/question-options";
import { normalizeTaskTextScale } from "@/lib/task-text-scale";
import { AnswerMode } from "@/types";
import type { Session } from "next-auth";
import type { Dispatch, SetStateAction } from "react";
import type { CreateTaskFormState, EditTaskFormState } from "./model";
import { MiniLessonTask, parseBankTaskId, parseBankTopicsRaw, stringifyTopics } from "./model";

type Context = {
  session: Session | null;
  selectedMiniLesson: number | null;
  taskForm: CreateTaskFormState;
  setError: Dispatch<SetStateAction<string | null>>;
  taskAnswerMode: AnswerMode;
  fetchMiniTasks: (miniLessonId: number) => Promise<void>;
  setTaskForm: Dispatch<SetStateAction<CreateTaskFormState>>;
  setTaskAnswerMode: Dispatch<SetStateAction<AnswerMode>>;
  setEditingMiniTask: Dispatch<SetStateAction<number | null>>;
  setEditTaskForm: Dispatch<SetStateAction<EditTaskFormState>>;
  setEditTaskAnswerMode: Dispatch<SetStateAction<AnswerMode>>;
  editingMiniTask: number | null;
  editTaskForm: EditTaskFormState;
  editTaskAnswerMode: AnswerMode;
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
  setEditingMiniTask,
  setEditTaskForm,
  setEditTaskAnswerMode,
  editingMiniTask,
  editTaskForm,
  editTaskAnswerMode,
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
      formData.append("text", taskForm.text || "");
      formData.append("accepted_answers", JSON.stringify(normalizeAcceptedAnswers(taskForm.accepted_answers)));
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
        formData.append("options", JSON.stringify(options));
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
          { text: taskForm.subQuestion1.trim(), correct: taskForm.correctSub1 },
          { text: taskForm.subQuestion2.trim(), correct: taskForm.correctSub2 },
        ];
        formData.append("options", JSON.stringify(options));
        formData.append("subquestions", JSON.stringify(subquestions));
        formData.append("answer", JSON.stringify([taskForm.correctSub1, taskForm.correctSub2]));
      } else if (taskForm.question_type === "tf") {
        formData.append("answer", taskForm.correctTf);
      } else {
        formData.append("answer", taskForm.answer || "");
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
    } catch (err: any) {
      setError(err.message);
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

  const startEditMiniLessonTask = (task: MiniLessonTask) => {
    setEditingMiniTask(task.id);

    let optionA = "";
    let optionB = "";
    let optionC = "";
    let optionD = "";
    let optionE = "";
    let optionF = "";
    try {
      const parsed = task.options
        ? (typeof task.options === "string" ? JSON.parse(task.options) : task.options)
        : null;
      if (Array.isArray(parsed)) {
        for (const o of parsed) {
          if (o?.label === "A") optionA = o.text || "";
          if (o?.label === "B") optionB = o.text || "";
          if (o?.label === "C") optionC = o.text || "";
          if (o?.label === "D") optionD = o.text || "";
          if (o?.label === "E") optionE = o.text || "";
          if (o?.label === "F") optionF = o.text || "";
        }
      }
    } catch {
      // ignore
    }

    let subQuestion1 = "";
    let subQuestion2 = "";
    let correctSub1: "A" | "B" | "C" | "D" = "A";
    let correctSub2: "A" | "B" | "C" | "D" = "A";
    if (task.subquestions) {
      try {
        const parsed = typeof task.subquestions === "string"
          ? JSON.parse(task.subquestions)
          : task.subquestions;
        if (Array.isArray(parsed) && parsed.length >= 2) {
          subQuestion1 = parsed[0]?.text || "";
          subQuestion2 = parsed[1]?.text || "";
          correctSub1 = (parsed[0]?.correct || "A") as any;
          correctSub2 = (parsed[1]?.correct || "A") as any;
        }
      } catch {
        // ignore parse errors
      }
    } else if (task.answer) {
      try {
        const parsedAnswer = JSON.parse(task.answer);
        if (Array.isArray(parsedAnswer) && parsedAnswer.length >= 2) {
          correctSub1 = (parsedAnswer[0] || "A") as any;
          correctSub2 = (parsedAnswer[1] || "A") as any;
        }
      } catch {
        // ignore
      }
    }

    const correctOptions: McqOptionLabel[] =
      (task.question_type || "input") === "mcq" || (task.question_type || "input") === "mcq6"
        ? parseMcqAnswerLabels(task.answer || "A")
        : ["A"];
    const fallbackDifficulty = (task as any)?.bank_task?.difficulty;
    const fallbackTopics = Array.isArray((task as any)?.bank_task?.topics) ? (task as any).bank_task.topics : [];
    const fallbackTextScale = normalizeTaskTextScale(
      task.text_scale || (task as any)?.bank_task?.text_scale || "md"
    );

    setEditTaskForm({
      text: task.text || "",
      question_type: (task.question_type || "input") as any,
      text_scale: fallbackTextScale,
      answer: task.answer || "",
      accepted_answers: normalizeAcceptedAnswers(
        Array.isArray(task.accepted_answers)
          ? task.accepted_answers
          : Array.isArray((task as any)?.bank_task?.accepted_answers)
            ? (task as any).bank_task.accepted_answers
            : []
      ),
      sort_order: task.sort_order || 0,
      bank_task_id: parseBankTaskId(task.bank_task_id),
      bank_difficulty: ((task.bank_difficulty || fallbackDifficulty || "B") as "A" | "B" | "C"),
      bank_topics_raw: stringifyTopics(Array.isArray(task.bank_topics) ? task.bank_topics : fallbackTopics),
      imageFile: null,
      optionA,
      optionB,
      optionC,
      optionD,
      optionE,
      optionF,
      correctOptions: correctOptions.length ? correctOptions : ["A"],
      correctTf: (task.answer === "false" ? "false" : "true") as any,
      subQuestion1,
      subQuestion2,
      correctSub1,
      correctSub2,
    });
    setEditTaskAnswerMode(getTaskAnswerMode(task));
  };

  const cancelEditMiniLessonTask = () => {
    setEditingMiniTask(null);
    setEditTaskForm({
      text: "",
      question_type: "mcq",
      text_scale: "md",
      answer: "",
      accepted_answers: [],
      sort_order: 0,
      bank_task_id: null,
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
    setEditTaskAnswerMode("choices");
  };

  const updateMiniLessonTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!session?.user?.email || !editingMiniTask) return;

    const formData = new FormData();
    formData.append("text", editTaskForm.text || "");
    formData.append("sort_order", editTaskForm.sort_order.toString());
    formData.append("question_type", editTaskForm.question_type);
    formData.append("answer_mode", editTaskAnswerMode);
    formData.append("text_scale", editTaskForm.text_scale);
    formData.append("email", session.user.email);
    formData.append("accepted_answers", JSON.stringify(normalizeAcceptedAnswers(editTaskForm.accepted_answers)));
    if (editTaskForm.bank_difficulty) {
      formData.append("bank_difficulty", editTaskForm.bank_difficulty);
    }
    formData.append("bank_topics", JSON.stringify(parseBankTopicsRaw(editTaskForm.bank_topics_raw)));

    if (editTaskForm.question_type === "mcq" || editTaskForm.question_type === "mcq6") {
      const options = [
        { label: "A", text: editTaskForm.optionA },
        { label: "B", text: editTaskForm.optionB },
        { label: "C", text: editTaskForm.optionC },
        { label: "D", text: editTaskForm.optionD },
        ...(editTaskForm.question_type === "mcq6"
          ? [
            { label: "E", text: editTaskForm.optionE },
            { label: "F", text: editTaskForm.optionF },
          ]
          : []),
      ];
      formData.append("options", JSON.stringify(options));
      formData.append("answer", serializeMcqAnswerLabels(editTaskForm.correctOptions));
    } else if (editTaskForm.question_type === "select") {
      if (!editTaskForm.subQuestion1.trim() || !editTaskForm.subQuestion2.trim()) {
        setError("select үшін екі қосымша сұрақ мәтінін енгізіңіз");
        return;
      }
      const options = [
        { label: "A", text: editTaskForm.optionA },
        { label: "B", text: editTaskForm.optionB },
        { label: "C", text: editTaskForm.optionC },
        { label: "D", text: editTaskForm.optionD },
      ];
      const subquestions = [
        { text: editTaskForm.subQuestion1.trim(), correct: editTaskForm.correctSub1 },
        { text: editTaskForm.subQuestion2.trim(), correct: editTaskForm.correctSub2 },
      ];
      formData.append("options", JSON.stringify(options));
      formData.append("subquestions", JSON.stringify(subquestions));
      formData.append("answer", JSON.stringify([editTaskForm.correctSub1, editTaskForm.correctSub2]));
    } else if (editTaskForm.question_type === "tf") {
      formData.append("answer", editTaskForm.correctTf);
      formData.append("options", "");
    } else {
      formData.append("answer", editTaskForm.answer || "");
      formData.append("options", "");
    }

    if (editTaskForm.imageFile) {
      formData.append("image", editTaskForm.imageFile);
    }

    try {
      const response = await fetch(apiPath(`admin/tasks/${editingMiniTask}`), {
        method: "PUT",
        body: formData,
      });
      if (!response.ok) throw new Error("Тапсырманы жаңарту мүмкін болмады");
      if (selectedMiniLesson) await fetchMiniTasks(selectedMiniLesson);
      cancelEditMiniLessonTask();
    } catch (err: any) {
      setError(err.message);
    }
  };
  return { createMiniLessonTask, deleteMiniLessonTask, startEditMiniLessonTask, cancelEditMiniLessonTask, updateMiniLessonTask };
}
