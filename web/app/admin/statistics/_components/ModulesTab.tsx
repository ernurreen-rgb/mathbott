"use client";

import Link from "next/link";
import { useState } from "react";
import Icon from "@/components/ui/Icon";
import type { StatisticsLesson, StatisticsModule, StatisticsModules } from "@/types";
import styles from "../Statistics.module.css";
import { formatNumber, formatPercent } from "./format";
import { VIZ } from "./palette";
import { Card, Empty, Legend, StatTile } from "./primitives";

const lessonName = (lesson: StatisticsLesson) => lesson.title || `${lesson.lesson_number ?? ""}-сабақ`;

/** Started and completed students of one lesson on a scale shared by every lesson. */
function LessonRow({ lesson, scale }: { lesson: StatisticsLesson; scale: number }) {
  const share = (count: number) => `${scale > 0 ? Math.min(100, (count / scale) * 100) : 0}%`;
  return (
    <div className={styles.lesson}>
      <div className={styles.lessonName}>
        <Link href={`/lessons/${lesson.id}`}>{lesson.lesson_number ? `${lesson.lesson_number}. ` : ""}{lessonName(lesson)}</Link>
        <small>{lesson.tasks ? `${formatNumber(lesson.tasks)} есеп` : "Есеп қосылмаған"}</small>
      </div>
      <div title={`Бастады: ${lesson.started}, аяқтады: ${lesson.completed}`}>
        <div className={styles.funnel} aria-hidden="true">
          <i style={{ width: share(lesson.started), background: VIZ.primarySoft }} />
          <i style={{ width: share(lesson.completed), background: VIZ.primary }} />
        </div>
        <div className={styles.minis}>
          {lesson.minis.map((mini) => (
            <i key={mini.id} title={mini.tasks
              ? `${mini.mini_index}-мини-сабақ: ${mini.tasks} есеп, бастады ${mini.started}, аяқтады ${mini.completed}`
              : `${mini.mini_index}-мини-сабақ: есеп қосылмаған`}>
              <b style={{ width: `${mini.started ? (mini.completed / mini.started) * 100 : 0}%`, background: VIZ.primary }} />
            </i>
          ))}
        </div>
      </div>
      <div className={styles.lessonFigure}>
        {lesson.started ? <>
          {formatNumber(lesson.completed)} <small>/ {formatNumber(lesson.started)} · {formatPercent(lesson.completed / lesson.started)}</small>
        </> : <small>әлі ешкім бастамаған</small>}
      </div>
      <div className={styles.lessonFigure}>
        {lesson.attempts ? <>
          {formatNumber(lesson.attempts)} <small>жауап · {formatPercent(lesson.accuracy)}</small>
        </> : <small>жауап жоқ</small>}
      </div>
    </div>
  );
}

function ModuleCard({ module, scale, defaultOpen }: { module: StatisticsModule; scale: number; defaultOpen: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`${styles.card} ${styles.module}`}>
      <button type="button" className={styles.moduleHead} aria-expanded={open} onClick={() => setOpen((current) => !current)}>
        <div>
          <div className={styles.moduleName}>
            {module.name} <Icon name="chevronDown" variant="outline" size={14} className={styles.chevron} data-open={open} />
          </div>
          <div className={styles.moduleMeta}>{formatNumber(module.lessons_count)} сабақ · {formatNumber(module.tasks)} есеп</div>
        </div>
        <div className={styles.moduleFigures}>
          <div className={styles.moduleFigure}><b>{formatNumber(module.started)}</b><span>бастады</span></div>
          <div className={styles.moduleFigure}><b>{formatNumber(module.completed)}</b><span>толық аяқтады</span></div>
          <div className={styles.moduleFigure}><b>{formatPercent(module.average_progress)}</b><span>орташа прогресс</span></div>
          <div className={styles.moduleFigure}><b>{formatNumber(module.attempts)}</b><span>жауап · {formatPercent(module.accuracy)}</span></div>
        </div>
      </button>
      {open && (
        <div className={styles.moduleBody}>
          {!module.lessons.length ? <Empty>Бұл модульде әлі сабақ жоқ.</Empty> : <>
            <div className={`${styles.lesson} ${styles.lessonHead}`} aria-hidden="true">
              <span>Сабақ</span><span>Бастағандар мен аяқтағандар · төменде 4 мини-сабақ</span><span>Аяқтады / бастады</span><span>Кезеңдегі жауаптар · дәлдік</span>
            </div>
            {module.lessons.map((lesson) => <LessonRow key={lesson.id} lesson={lesson} scale={scale} />)}
          </>}
        </div>
      )}
    </section>
  );
}

export default function ModulesTab({ data }: { data: StatisticsModules }) {
  const { summary, modules } = data;
  const lessons = modules.flatMap((module) => module.lessons.map((lesson) => ({ lesson, module })));
  const scale = Math.max(0, ...lessons.map(({ lesson }) => lesson.started));
  // The lesson where the most students started but did not finish.
  const stuck = lessons.reduce<{ lesson: StatisticsLesson; module: StatisticsModule } | null>((worst, item) => {
    const lost = item.lesson.started - item.lesson.completed;
    return lost > 0 && (!worst || lost > worst.lesson.started - worst.lesson.completed) ? item : worst;
  }, null);

  return <>
    <div className={styles.tiles} data-count="5">
      <StatTile label="Модульдер" value={formatNumber(summary.modules)}
        note={<span>{formatNumber(summary.lessons)} сабақ · {formatNumber(summary.tasks)} есеп</span>} />
      <StatTile label="Бастаған оқушылар" value={formatNumber(summary.students_started)}
        hint="Кез келген модульде кемінде бір есепке жауап берген оқушылар. Барлық уақыт бойынша, кезеңге тәуелсіз." />
      <StatTile label="Сабақ аяқтағандар" value={formatNumber(summary.students_completed_lesson)}
        hint="Кемінде бір сабақтың барлық есебін шығарған оқушылар. Барлық уақыт бойынша, кезеңге тәуелсіз."
        note={summary.students_started ? <span>бастағандардың {formatPercent(summary.students_completed_lesson / summary.students_started)}</span> : undefined} />
      <StatTile label="Кезеңдегі жауаптар" value={formatNumber(summary.attempts)} hint="Таңдалған кезеңде модуль есептеріне жіберілген барлық жауап." />
      <StatTile label="Кезеңдегі дәлдік" value={formatPercent(summary.accuracy)} hint="Таңдалған кезеңдегі дұрыс жауаптардың үлесі." meter={summary.accuracy} />
    </div>

    <Card title="Сабақтар бойынша прогресс"
      hint="Жолақ — оқушылар саны: ашық түс сабақты бастағандарды, қою түс толық аяқтағандарды көрсетеді. Прогресс — қазіргі күй (барлық уақыт), ал жауаптар мен дәлдік таңдалған кезеңге жатады."
      actions={<Legend items={[{ name: "Бастады", color: VIZ.primarySoft }, { name: "Аяқтады", color: VIZ.primary }]} />}>
      {stuck ? (
        <p className={styles.note}>
          Оқушылар ең көп тоқтайтын жер: <strong style={{ color: VIZ.ink }}>{stuck.module.name} · {lessonName(stuck.lesson)}</strong> — {formatNumber(stuck.lesson.started)} оқушы
          бастап, {formatNumber(stuck.lesson.started - stuck.lesson.completed)} оқушы аяқтамады.
        </p>
      ) : <p className={styles.note}>Бастаған оқушылардың бәрі сабақтарын аяқтаған немесе әлі ешкім бастамаған.</p>}
    </Card>

    {!modules.length ? <Empty>Модульдер әлі құрылмаған.</Empty>
      : modules.map((module, index) => <ModuleCard key={module.id} module={module} scale={scale} defaultOpen={index < 3 || modules.length <= 6} />)}
  </>;
}
