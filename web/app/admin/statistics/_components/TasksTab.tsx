"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import type { StatisticsBreakdown, StatisticsTask, StatisticsTasks } from "@/types";
import styles from "../Statistics.module.css";
import { DIFFICULTY_LABELS, downloadCsv, formatNumber, formatPercent, questionTypeLabel } from "./format";
import { Card, clampPage, Empty, Meter, Pager, ShareBar, SortHeader, sortRows, StatTile, type SortState } from "./primitives";

export type TaskFilter = "all" | "hard" | "reported";
type SortKey = "attempts" | "students" | "accuracy" | "first_accuracy";

const PAGE_SIZE = 20;
const TOPICS_SHOWN = 8;
const FILTERS: Array<{ key: TaskFilter; label: string; match: (task: StatisticsTask) => boolean }> = [
  { key: "all", label: "Барлығы", match: () => true },
  { key: "hard", label: "Тым қиын", match: (task) => task.is_hard },
  { key: "reported", label: "Қаралмаған хабарламасы бар", match: (task) => task.pending_reports > 0 },
];
const SORT_VALUE: Record<SortKey, (task: StatisticsTask) => number | null> = {
  attempts: (task) => task.attempts,
  students: (task) => task.students,
  accuracy: (task) => task.accuracy,
  first_accuracy: (task) => task.first_accuracy,
};

function placeOf(task: StatisticsTask): string {
  const { module_name, lesson_number, lesson_title, mini_index } = task.location;
  const lesson = lesson_title || (lesson_number ? `${lesson_number}-сабақ` : null);
  return [module_name, lesson, mini_index ? `${mini_index}-мини-сабақ` : null].filter(Boolean).join(" · ") || "Модульге байланбаған";
}

function Breakdown({ groups, label, limit }: { groups: StatisticsBreakdown[]; label: (key: string) => string; limit?: number }) {
  const [expanded, setExpanded] = useState(false);
  if (!groups.length) return <Empty>Бұл кезеңде жауап берілмеген.</Empty>;
  const shown = limit && !expanded ? groups.slice(0, limit) : groups;
  return (
    <div className={styles.meters}>
      {shown.map((group) => (
        <Meter key={group.key} name={label(group.key)} sub={`${formatNumber(group.tasks)} есеп · ${formatNumber(group.attempts)} жауап`}
          share={group.accuracy} figure={formatPercent(group.accuracy)} />
      ))}
      {limit && groups.length > limit && (
        <button type="button" className={`${styles.button} ${styles.buttonSmall}`} style={{ justifySelf: "start" }}
          onClick={() => setExpanded((current) => !current)}>
          {expanded ? "Жасыру" : `Тағы ${groups.length - limit} тақырып`}
        </button>
      )}
    </div>
  );
}

type Props = { data: StatisticsTasks; initialFilter?: TaskFilter };

export default function TasksTab({ data, initialFilter = "all" }: Props) {
  const { summary, thresholds, period } = data;
  const [filter, setFilter] = useState<TaskFilter>(initialFilter);
  const [search, setSearch] = useState("");
  const [moduleId, setModuleId] = useState<number | null>(null);
  const [minimum, setMinimum] = useState(1);
  // Hard tasks open sorted by accuracy so the worst ones lead.
  const [sort, setSort] = useState<SortState<SortKey>>(initialFilter === "hard" ? { key: "accuracy", descending: false } : { key: "attempts", descending: true });
  const [page, setPage] = useState(0);
  const reset = <Value,>(setter: (value: Value) => void) => (value: Value) => { setter(value); setPage(0); };

  const modules = useMemo(() => {
    const names = new Map<number, string>();
    for (const task of data.tasks) if (task.location.module_id && task.location.module_name) names.set(task.location.module_id, task.location.module_name);
    return [...names.entries()].sort((a, b) => a[1].localeCompare(b[1], "kk"));
  }, [data.tasks]);
  const scoped = useMemo(() => {
    const query = search.trim().toLowerCase();
    return data.tasks.filter((task) => task.attempts >= minimum
      && (moduleId === null || task.location.module_id === moduleId)
      && (!query || `${task.text_preview} ${placeOf(task)} ${task.topics.join(" ")} ${task.task_id} ${task.bank_task_id ?? ""}`.toLowerCase().includes(query)));
  }, [data.tasks, search, moduleId, minimum]);
  const activeFilter = FILTERS.find((item) => item.key === filter) ?? FILTERS[0];
  const visible = useMemo(
    () => sortRows(scoped.filter(activeFilter.match), SORT_VALUE[sort.key], sort.descending),
    [scoped, activeFilter, sort],
  );
  const currentPage = clampPage(page, visible.length, PAGE_SIZE);
  const pageRows = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);

  const exportCsv = () => downloadCsv(
    `qazmath-esepter-${period.end}.csv`,
    ["Есеп ID", "Банк ID", "Мәтін", "Модуль", "Сабақ", "Мини-сабақ", "Түрі", "Деңгейі", "Тақырыптар", "Жауаптар", "Дұрыс", "Дәлдік %",
      "Жауап берген оқушылар", "Шығарған оқушылар", "Бірінші әрекеттер", "Бірінші әрекеттегі дәлдік %", "Қаралмаған хабарламалар"],
    visible.map((task) => [
      task.task_id, task.bank_task_id, task.text_preview, task.location.module_name, task.location.lesson_title, task.location.mini_index,
      questionTypeLabel(task.question_type), task.difficulty, task.topics.join("; "), task.attempts, task.correct,
      task.accuracy === null ? "" : Math.round(task.accuracy * 1000) / 10, task.students, task.solved_students, task.first_attempts,
      task.first_accuracy === null ? "" : Math.round(task.first_accuracy * 1000) / 10, task.pending_reports,
    ]),
  );
  const hardRule = `кемінде ${thresholds.hard_task_min_attempts} жауап, дұрысы ${formatPercent(thresholds.hard_task_max_accuracy)}-дан аз`;

  return <>
    <div className={styles.tiles}>
      <StatTile label="Жауаптар" value={formatNumber(summary.attempts)}
        hint="Осы кезеңде модуль есептеріне жіберілген барлық жауап. Сынақ тесттер мен квиздер мұнда кірмейді."
        note={<span>{formatNumber(summary.students)} оқушыдан</span>} />
      <StatTile label="Дәлдік" value={formatPercent(summary.accuracy)} hint="Дұрыс жауаптардың барлық жауаптағы үлесі." meter={summary.accuracy} />
      <StatTile label="Бірінші әрекеттегі дәлдік" value={formatPercent(summary.first_accuracy)}
        hint="Оқушы есепке ең алғаш жауап бергенде дұрыс шығарған үлесі. Қайталап көрген әрекеттер есепке алынбайды, сондықтан есептің шынайы қиындығын көрсетеді."
        meter={summary.first_accuracy} />
      <StatTile label="Жауап берілген есептер" value={formatNumber(summary.tasks_attempted)} unit={`/ ${formatNumber(summary.tasks_total)}`}
        hint="Осы кезеңде кемінде бір жауап алған есептер / модульдердегі барлық есеп." />
      <StatTile label="Тым қиын есептер" value={formatNumber(summary.hard_tasks)}
        hint={`Шарты: ${hardRule}. Мұндай есептің шартында не жауабында қате болуы мүмкін.`} />
      <StatTile label="Қаралмаған хабарламалар" value={formatNumber(summary.pending_reports)}
        hint="Оқушылар модуль есептері бойынша жіберген, әлі қаралмаған хабарламалар."
        note={summary.pending_reports ? <Link href="/admin/reports" style={{ color: "var(--accent-ink)" }}>Хабарламаларды ашу</Link> : undefined} />
    </div>

    <div className={`${styles.row} ${styles.rowThird}`}>
      <Card title="Сұрақ түрі бойынша дәлдік" hint="Жолақ — дұрыс жауап үлесі.">
        <Breakdown groups={data.by_type} label={questionTypeLabel} />
      </Card>
      <Card title="Күрделілік деңгейі бойынша дәлдік" hint="Банктегі A, B, C деңгейлері. C деңгейі A-дан оңай шықса, деңгейлерді қайта қараңыз.">
        <Breakdown groups={data.by_difficulty} label={(key) => DIFFICULTY_LABELS[key] || key} />
      </Card>
      <Card title="Тақырып бойынша дәлдік" hint="Жауап саны көп тақырыптар жоғарыда. Бірнеше тақырыбы бар есеп әрқайсысында саналады.">
        <Breakdown groups={data.by_topic} label={(key) => key || "Тақырыпсыз"} limit={TOPICS_SHOWN} />
      </Card>
    </div>

    <Card title="Есептер"
      hint={<>Осы кезеңде жауап берілген модуль есептері.{data.truncated ? " Ең көп жауап алған 1000 есеп көрсетілген." : ""} Қателерді егіз есептермен талдау нәтижесі — <Link href="/admin/mistakes" style={{ color: "var(--accent-ink)" }}>«Қателер талдауы»</Link> бетінде.</>}
      actions={<button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={exportCsv} disabled={!visible.length}>
        <Icon name="download" variant="outline" size={13} /> CSV жүктеп алу
      </button>}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icon name="search" variant="outline" size={15} />
          <input type="search" value={search} onChange={(event) => reset(setSearch)(event.target.value)}
            placeholder="Мәтін, тақырып немесе сабақ бойынша іздеу" aria-label="Есепті іздеу" />
        </label>
        <select className={styles.select} aria-label="Модуль" value={moduleId ?? ""}
          onChange={(event) => reset(setModuleId)(event.target.value ? Number(event.target.value) : null)}>
          <option value="">Барлық модульдер</option>
          {modules.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select className={styles.select} aria-label="Ең аз жауап саны" value={minimum} onChange={(event) => reset(setMinimum)(Number(event.target.value))}>
          {[1, 3, 5, 10, 20].map((count) => <option key={count} value={count}>{count === 1 ? "Кез келген жауап саны" : `Кемінде ${count} жауап`}</option>)}
        </select>
      </div>
      <div className={styles.toolbar}>
        <div className={styles.chips} role="group" aria-label="Есептер тобы">
          {FILTERS.map((item) => (
            <button key={item.key} type="button" className={styles.chip} aria-pressed={activeFilter.key === item.key}
              onClick={() => reset(setFilter)(item.key)}>
              {item.label} <b>{formatNumber(scoped.filter(item.match).length)}</b>
            </button>
          ))}
        </div>
      </div>
      {!visible.length ? <Empty>{data.tasks.length ? "Бұл шарттарға сай есеп табылмады." : "Бұл кезеңде модуль есептеріне жауап берілмеген."}</Empty> : (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 820 }}>
            <thead><tr>
              <th>Есеп</th>
              <SortHeader label="Жауаптар" column="attempts" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңдегі барлық жауап" />
              <SortHeader label="Оқушылар" column="students" sort={sort} onSort={reset(setSort)} numeric hint="Шығарғаны / жауап бергені" />
              <SortHeader label="Дәлдік" column="accuracy" sort={sort} onSort={reset(setSort)} numeric hint="Барлық жауаптағы дұрыс үлесі" />
              <SortHeader label="Бірінші әрекет" column="first_accuracy" sort={sort} onSort={reset(setSort)} numeric hint="Алғашқы жауаптағы дұрыс үлесі" />
            </tr></thead>
            <tbody>
              {pageRows.map((task) => (
                <tr key={task.task_id}>
                  <td style={{ minWidth: 300 }}>
                    <div className={`${styles.cellMain} ${styles.taskText}`}>
                      {task.text_preview ? <MathRender latex={task.text_preview} /> : `Есеп №${task.task_id}`}
                    </div>
                    <div className={styles.cellSub}>
                      {task.location.lesson_id ? <Link href={`/lessons/${task.location.lesson_id}`}>{placeOf(task)}</Link> : placeOf(task)}
                      {task.topics.length > 0 && ` · ${task.topics.join(", ")}`}
                    </div>
                    <div className={styles.cellSub}>
                      <span className={styles.badge}>{questionTypeLabel(task.question_type)}</span>{" "}
                      {task.difficulty && <><span className={styles.badge}>{task.difficulty}</span>{" "}</>}
                      {task.is_hard && <><span className={styles.badge} data-tone="bad" title={hardRule}>тым қиын</span>{" "}</>}
                      {task.pending_reports > 0 && <><Link href="/admin/reports" className={styles.badge} data-tone="warn">{task.pending_reports} хабарлама</Link>{" "}</>}
                      {task.deleted && <><span className={styles.badge}>жойылған</span>{" "}</>}
                      {task.bank_task_id && <Link href={`/admin/bank?task=${task.bank_task_id}`}>Банкте ашу</Link>}
                    </div>
                  </td>
                  <td className={styles.num}>{formatNumber(task.attempts)}</td>
                  <td className={styles.num} title={`${task.students} оқушы жауап берді, ${task.solved_students} оқушы дұрыс шығарды`}>
                    {formatNumber(task.solved_students)} <span className={styles.muted}>/ {formatNumber(task.students)}</span>
                  </td>
                  <td className={styles.num}>
                    <ShareBar share={task.accuracy} label={formatPercent(task.accuracy)} />
                  </td>
                  <td className={styles.num} title={`${task.first_correct} / ${task.first_attempts} алғашқы жауап дұрыс`}>
                    {task.first_attempts ? formatPercent(task.first_accuracy) : <span className={styles.muted}>—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={currentPage} pageSize={PAGE_SIZE} total={visible.length} onPage={setPage} />
    </Card>
  </>;
}
