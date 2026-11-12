"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import type { StatisticsStudent, StatisticsStudents } from "@/types";
import styles from "../Statistics.module.css";
import { BucketChart, type ChartRow } from "./charts";
import {
  ACTIVE_DAY_LABELS, BUCKET_NAMES, bucketLabel, bucketTitle, downloadCsv, formatAgo, formatDate, formatDateTime, formatNumber, formatPercent,
} from "./format";
import { VIZ } from "./palette";
import { Card, clampPage, Empty, Meter, Pager, ShareBar, SortHeader, sortRows, StatTile, type SortState } from "./primitives";

/** "silent" is a new student who has not answered anything yet. */
export type StudentSegment = "all" | "active" | "new" | "churned" | "silent" | "never";
type SortKey = "nickname" | "registered_at" | "last_seen_at" | "attempts" | "accuracy" | "active_days" | "trial_attempts" | "total_solved" | "streak";

const PAGE_SIZE = 25;
const SEGMENTS: Array<{ key: StudentSegment; label: string; match: (student: StatisticsStudent) => boolean }> = [
  { key: "all", label: "Барлығы", match: () => true },
  { key: "active", label: "Белсенді", match: (student) => student.is_active },
  { key: "new", label: "Жаңа", match: (student) => student.is_new },
  { key: "silent", label: "Жаңа, әлі бастамаған", match: (student) => student.is_new && student.never_active },
  { key: "churned", label: "Тоқтап қалған", match: (student) => student.is_churned },
  { key: "never", label: "Ешқашан бастамаған", match: (student) => student.never_active },
];
const SORT_VALUE: Record<SortKey, (student: StatisticsStudent) => number | string | null> = {
  nickname: (student) => student.nickname?.toLowerCase() ?? null,
  registered_at: (student) => student.registered_at,
  last_seen_at: (student) => student.last_seen_at,
  attempts: (student) => student.attempts,
  accuracy: (student) => student.accuracy,
  active_days: (student) => student.active_days,
  trial_attempts: (student) => student.trial_attempts,
  total_solved: (student) => student.total_solved,
  streak: (student) => student.streak,
};

type Props = { data: StatisticsStudents; initialSegment?: StudentSegment };

export default function StudentsTab({ data, initialSegment = "all" }: Props) {
  const { summary, series, period } = data;
  const [segment, setSegment] = useState<StudentSegment>(initialSegment);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "attempts", descending: true });
  const [page, setPage] = useState(0);

  const segments = SEGMENTS.filter((item) => item.key !== "churned" || period.days);
  const activeSegment = segments.find((item) => item.key === segment) ?? segments[0];
  const visible = useMemo(() => {
    const query = search.trim().toLowerCase();
    const matched = data.students.filter((student) => activeSegment.match(student) && (!query
      || (student.nickname || "").toLowerCase().includes(query)
      || (student.email || "").toLowerCase().includes(query)
      || String(student.user_id) === query));
    // The server already orders by activity, so the default view keeps its tie-breaks.
    return sort.key === "attempts" && sort.descending ? matched : sortRows(matched, SORT_VALUE[sort.key], sort.descending);
  }, [data.students, activeSegment, search, sort]);
  const currentPage = clampPage(page, visible.length, PAGE_SIZE);
  const pageRows = visible.slice(currentPage * PAGE_SIZE, (currentPage + 1) * PAGE_SIZE);
  const reset = <Value,>(setter: (value: Value) => void) => (value: Value) => { setter(value); setPage(0); };

  const rows: ChartRow[] = series.points.map((point) => ({
    label: bucketLabel(point, series.granularity),
    title: bucketTitle(point, series.granularity),
    new_users: point.new_users,
    active_users: point.active_users,
  }));
  const exportCsv = () => downloadCsv(
    `qazmath-oqushylar-${period.end}.csv`,
    ["ID", "Оқушы", ...(data.emails_visible ? ["Email"] : []), "Тіркелген", "Соңғы рет көрінді", "Жауаптар", "Дұрыс", "Дәлдік %",
      "Белсенді күндер", "Сынақ тесттері", "Тесттің орташа нәтижесі %", "Барлығы шешілген", "Серия"],
    visible.map((student) => [
      student.user_id, student.nickname, ...(data.emails_visible ? [student.email] : []), formatDateTime(student.registered_at),
      formatDateTime(student.last_seen_at), student.attempts, student.correct,
      student.accuracy === null ? "" : Math.round(student.accuracy * 1000) / 10, student.active_days, student.trial_attempts,
      student.trial_average === null ? "" : Math.round(student.trial_average * 1000) / 10, student.total_solved, student.streak,
    ]),
  );
  const activeShare = summary.total ? summary.active / summary.total : null;
  const bucket = BUCKET_NAMES[series.granularity];

  return <>
    <div className={styles.tiles}>
      <StatTile label="Барлық оқушылар" value={formatNumber(summary.total)}
        hint="Платформада тіркелген аккаунттар. «Әкімшілерсіз» қосулы болса, әкімшілер саналмайды."
        note={<span>{formatNumber(summary.never_active)} ешқашан бастамаған</span>} />
      <StatTile label="Белсенді" value={formatNumber(summary.active)}
        hint="Осы кезеңде модуль есебіне жауап берген, сынақ тест тапсырған немесе қателерін талдаған оқушылар."
        note={<span>барлық оқушының {formatPercent(activeShare)}</span>} />
      <StatTile label="Жаңа тіркелгендер" value={formatNumber(summary.new)} hint="Осы кезеңде алғаш рет тіркелген аккаунттар." />
      <StatTile label="Қайта оралғандар" value={formatNumber(summary.returning)}
        hint="Алдыңғы кезеңде де, осы кезеңде де белсенді болған оқушылар. «Барлық уақыт» үшін есептелмейді." />
      <StatTile label="Тоқтап қалғандар" value={formatNumber(summary.churned)}
        hint="Алдыңғы кезеңде белсенді болған, бірақ осы кезеңде бірде-бір әрекет жасамаған оқушылар." />
      <StatTile label="Орташа белсенді күн" value={summary.average_active_days === null ? "—" : String(summary.average_active_days).replace(".", ",")}
        hint="Белсенді оқушы осы кезеңде орта есеппен неше түрлі күні оқыды."
        note={summary.median_attempts === null ? undefined : <span>медиана: {formatNumber(summary.median_attempts)} жауап</span>} />
    </div>

    <div className={`${styles.row} ${styles.rowHalf}`}>
      <Card title="Тіркелулер" hint={`Әр баған — бір ${bucket.noun}: сол кезде неше жаңа аккаунт ашылды.`}>
        <BucketChart title="Жаңа тіркелгендер" kind="columns" rows={rows} height={200} axisName={bucket.column}
          series={[{ key: "new_users", name: "Жаңа тіркелгендер", color: VIZ.primary }]} emptyText="Бұл кезеңде ешкім тіркелмеген." />
      </Card>
      <Card title="Белсенділік" hint={`Әр нүкте — бір ${bucket.noun}: сол кезде кемінде бір әрекет жасаған оқушылар саны.`}>
        <BucketChart title="Белсенді оқушылар" kind="line" rows={rows} height={200} axisName={bucket.column}
          series={[{ key: "active_users", name: "Белсенді оқушылар", color: VIZ.primary }]} />
      </Card>
    </div>

    <div className={`${styles.row} ${styles.rowHalf}`}>
      <Card title="Оқушылар қаншалықты тұрақты оқиды" hint="Белсенді оқушылар осы кезеңде неше түрлі күні оқыды. Бір күн ғана кірген оқушы көп болса, оларды қайтару жолын ойластырыңыз.">
        {!summary.active ? <Empty>Бұл кезеңде белсенді оқушы жоқ.</Empty> : (
          <div className={styles.meters}>
            {data.activity_distribution.filter((bucket) => bucket.key !== "8+" || period.days !== 7).map((bucket) => (
              <Meter key={bucket.key} name={ACTIVE_DAY_LABELS[bucket.key] || bucket.key} share={bucket.count / summary.active}
                figure={formatNumber(bucket.count)} note={formatPercent(bucket.count / summary.active)} />
            ))}
          </div>
        )}
      </Card>
      <Card title="Жетістіктер" hint="Әр жетістікті неше оқушы ашты. Барлық уақыт бойынша, кезеңге тәуелсіз.">
        <div className={styles.meters}>
          {data.achievements.map((achievement) => (
            <Meter key={achievement.id} name={achievement.name} share={summary.total ? achievement.count / summary.total : null}
              figure={formatNumber(achievement.count)} note={formatPercent(summary.total ? achievement.count / summary.total : null)} />
          ))}
        </div>
      </Card>
    </div>

    <Card title="Оқушылар тізімі"
      hint={`Жауаптар, дәлдік, белсенді күндер мен сынақ тесттер — таңдалған кезең үшін. «Барлығы шешілген» мен серия — қазіргі жалпы күй.${data.truncated ? " Тізімде ең белсенді 2000 оқушы көрсетілген." : ""}`}
      actions={<button type="button" className={`${styles.button} ${styles.buttonSmall}`} onClick={exportCsv} disabled={!visible.length}>
        <Icon name="download" variant="outline" size={13} /> CSV жүктеп алу
      </button>}>
      <div className={styles.toolbar}>
        <label className={styles.search}>
          <Icon name="search" variant="outline" size={15} />
          <input type="search" value={search} onChange={(event) => reset(setSearch)(event.target.value)}
            placeholder={data.emails_visible ? "Аты немесе email бойынша іздеу" : "Аты бойынша іздеу"} aria-label="Оқушыны іздеу" />
        </label>
        <div className={styles.chips} role="group" aria-label="Оқушылар тобы">
          {segments.map((item) => (
            <button key={item.key} type="button" className={styles.chip} aria-pressed={activeSegment.key === item.key}
              onClick={() => reset(setSegment)(item.key)}>
              {item.label} <b>{formatNumber(data.students.filter(item.match).length)}</b>
            </button>
          ))}
        </div>
      </div>
      {!visible.length ? <Empty>Бұл шарттарға сай оқушы табылмады.</Empty> : (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 860 }}>
            <thead><tr>
              <SortHeader label="Оқушы" column="nickname" sort={sort} onSort={reset(setSort)} />
              <SortHeader label="Соңғы рет көрінді" column="last_seen_at" sort={sort} onSort={reset(setSort)} hint="Сайтта соңғы рет болған уақыты" />
              <SortHeader label="Жауаптар" column="attempts" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңдегі модуль есептеріне жауаптар" />
              <SortHeader label="Дәлдік" column="accuracy" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңдегі дұрыс жауап үлесі" />
              <SortHeader label="Белсенді күн" column="active_days" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңде неше түрлі күні оқыды" />
              <SortHeader label="Сынақ тест" column="trial_attempts" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңде тапсырылған тест саны және орташа нәтижесі" />
              <SortHeader label="Барлығы шешілген" column="total_solved" sort={sort} onSort={reset(setSort)} numeric hint="Барлық уақытта дұрыс шығарылған есептер" />
              <SortHeader label="Серия" column="streak" sort={sort} onSort={reset(setSort)} numeric hint="Қатарынан неше күн оқып келеді" />
              <SortHeader label="Тіркелген" column="registered_at" sort={sort} onSort={reset(setSort)} numeric />
            </tr></thead>
            <tbody>
              {pageRows.map((student) => (
                <tr key={student.user_id}>
                  <td>
                    <div className={styles.cellMain}>
                      <Link href={`/profile/${student.user_id}`}>{student.nickname || `Оқушы #${student.user_id}`}</Link>
                      <span className={styles.badges}>
                        {student.is_admin && <span className={styles.badge} data-tone="accent">әкімші</span>}
                        {student.is_new && <span className={styles.badge} data-tone="good">жаңа</span>}
                        {student.is_churned && <span className={styles.badge} data-tone="warn">тоқтап қалды</span>}
                        {student.never_active && <span className={styles.badge}>бастамаған</span>}
                      </span>
                    </div>
                    {student.email && <div className={styles.cellSub}>{student.email}</div>}
                  </td>
                  <td title={formatDateTime(student.last_seen_at)}>{formatAgo(student.last_seen_at)}</td>
                  <td className={styles.num}>{student.attempts ? formatNumber(student.attempts) : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.num}>{student.accuracy === null ? <span className={styles.muted}>—</span>
                    : <ShareBar share={student.accuracy} label={formatPercent(student.accuracy)} />}</td>
                  <td className={styles.num}>{student.active_days || <span className={styles.muted}>—</span>}</td>
                  <td className={styles.num}>{student.trial_attempts
                    ? <>{formatNumber(student.trial_attempts)} <span className={styles.muted}>· {formatPercent(student.trial_average)}</span></>
                    : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.num}>{formatNumber(student.total_solved)}</td>
                  <td className={styles.num}>{student.streak ? `${student.streak} күн` : <span className={styles.muted}>—</span>}</td>
                  <td className={styles.num}>{formatDate(student.registered_at)}</td>
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
