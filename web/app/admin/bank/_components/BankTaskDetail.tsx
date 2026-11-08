"use client";

import MathRender from "@/components/ui/MathRender";
import TaskStatement from "@/components/student/TaskStatement";
import { isMcqQuestionType, parseMcqAnswerLabels } from "@/lib/question-options";
import type { BankTask } from "@/types";
import styles from "../BankWorkspace.module.css";

export default function BankTaskDetail({ task, imageSrc }: { task: BankTask; imageSrc?: string | null }) {
  const correct = new Set<string>(parseMcqAnswerLabels(task.answer));
  const answer = task.question_type === "tf" ? task.answer === "true" ? "Шын" : "Жалған" : task.answer;
  return <div className={styles.taskBody}>
    <section aria-label="Есептің толық көрінісі" className={styles.taskStatement}><TaskStatement task={task} viewport="desktop" imageSrc={imageSrc} /></section>
    {task.question_type === "select" && task.subquestions?.length ? <div className={styles.subquestions}>{task.subquestions.map((item, index) => <div key={index}><strong>{index + 1}. </strong><MathRender inline latex={item.text} /></div>)}</div> : null}
    {(isMcqQuestionType(task.question_type) || task.question_type === "select") && <div className={styles.answerOptions}>{task.options?.map((option) => <div key={option.label} className={`${styles.answerOption} ${isMcqQuestionType(task.question_type) && correct.has(option.label) ? styles.correctOption : ""}`}><span>{option.label}</span><MathRender latex={option.text} /></div>)}</div>}
    <div className={styles.answerKey}><strong>Дұрыс жауап: </strong>{task.question_type === "select" && task.subquestions?.length ? task.subquestions.map((q, index) => `${index + 1} → ${q.correct}`).join("; ") : isMcqQuestionType(task.question_type) ? [...correct].join(", ") : <MathRender inline latex={answer} />}
      {task.accepted_answers?.length ? <p><strong>Балама жауаптар: </strong>{task.accepted_answers.map((alias, index) => <span key={index}>{index > 0 ? "; " : ""}<MathRender inline latex={alias} /></span>)}</p> : null}
    </div>
  </div>;
}
