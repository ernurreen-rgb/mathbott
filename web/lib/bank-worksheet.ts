import type { BankPlacementTask, BankTask } from '@/types';

export const MAX_WORKSHEET_TASKS = 100;
export const WORKSHEET_BRAND = 'Ернұр ағайдан есептер';

// A worksheet contains student-facing content only. Keep this model independent
// of bank screens so a future bank UI can use the same exporter.
export type WorksheetTask = Pick<BankTask, 'id' | 'text' | 'question_type' | 'answer_mode' | 'image_filename'> & {
  options: { label: string; text: string }[];
  subquestions: { text: string }[];
};

export function worksheetTask(task: BankTask): WorksheetTask {
  if (task.deleted_at) throw new Error(`Банк №${task.id} есебі себетте. Оны жинақтан алып тастаңыз.`);
  return {
    id: task.id, text: task.text || '', question_type: task.question_type,
    answer_mode: task.answer_mode, image_filename: task.image_filename,
    options: (task.options || []).map(({ label, text }) => ({ label, text })),
    subquestions: (task.subquestions || []).map(({ text }) => ({ text })),
  };
}

export function trialPlacementToWorksheetTask(task: BankPlacementTask): WorksheetTask {
  const text = task.text || task.bank_task?.text || '';
  const questionType = task.question_type || task.bank_task?.question_type || 'input';
  const answerMode = task.answer_mode || task.bank_task?.answer_mode || 'choices';
  const imageFilename = task.image_filename || task.bank_task?.image_filename || null;
  const options = (task.options || task.bank_task?.options || []).map(({ label, text }) => ({
    label,
    text,
  }));
  const subquestions = (task.subquestions || task.bank_task?.subquestions || []).map(({ text }) => ({
    text,
  }));

  return {
    id: task.bank_task_id || task.id,
    text,
    question_type: questionType,
    answer_mode: answerMode,
    image_filename: imageFilename,
    options,
    subquestions,
  };
}

export function worksheetFilename(title: string) {
  const name = title.trim().replace(/[<>:"/\\|?*\u0000-\u001f]/g, '').replace(/[. ]+$/g, '').slice(0, 100);
  return `${name || 'QazMath-esepter'}.pdf`;
}
