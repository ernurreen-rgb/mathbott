"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import Icon from "@/components/ui/Icon";
import { getAdminStudentActivity } from "@/lib/api";
import type { StatisticsStudent, StatisticsStudentActivity, StatisticsStudents } from "@/types";
import styles from "../Statistics.module.css";
import { BucketChart, type ChartRow } from "./charts";
import {
  ACTIVE_DAY_LABELS, BUCKET_NAMES, bucketLabel, bucketTitle, downloadCsv, formatAgo, formatDate, formatDateTime, formatNumber, formatPercent, formatVisitPath,
} from "./format";
import { VIZ } from "./palette";
import { Card, clampPage, Empty, Meter, Pager, ShareBar, SortHeader, sortRows, StatTile, type SortState } from "./primitives";

/** "silent" is a new student who has not answered anything yet. */
export type StudentSegment = "all" | "active" | "new" | "churned" | "silent" | "never";
type SortKey = "nickname" | "registered_at" | "last_seen_at" | "attempts" | "accuracy" | "active_days" | "trial_attempts" | "quiz_answers" | "total_solved" | "streak";

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
  quiz_answers: (student) => student.quiz_answers * 1000 + student.quiz_sessions,
  total_solved: (student) => student.total_solved,
  streak: (student) => student.streak,
};

type Props = { data: StatisticsStudents; initialSegment?: StudentSegment; viewerEmail?: string | null };

type ActivityEntry = { loading: boolean; error: string | null; data: StatisticsStudentActivity | null };

function StudentActivityDetail({ entry }: { entry: ActivityEntry | undefined }) {
  if (!entry || entry.loading) {
    return <p className={styles.note}>Белсенділік тарихы жүктелуде...</p>;
  }
  if (entry.error) {
    return <p className={styles.note} style={{ color: "var(--bad)" }}>Қате: {entry.error}</p>;
  }
  const activity = entry.data;
  if (!activity) return null;
  if (!activity.visit_tracking_enabled) {
    return (
      <p className={styles.note}>
        Беттер тарихы миграция (<code>0013_user_page_visits</code>) қолданылғаннан кейін жазылады.
      </p>
    );
  }
  return (
    <div className={styles.detail}>
      <div style={{ display: "grid", gap: 12 }}>
        <div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>
            Соңғы ашқан беттері ({formatNumber(activity.visits.length)})
            <span className={styles.muted} style={{ fontWeight: 400, fontSize: 12 }}>
              {" "}· тарих {formatNumber(activity.visit_retention_days)} күн сақталады
            </span>
          </div>
          {!activity.visits.length ? (
            <p className={styles.note}>Жаңа бетке кіру жазбасы әлі түспеген.</p>
          ) : (
            <div className={styles.list}>
              {activity.visits.slice(0, 15).map((visit) => (
                <div key={visit.id} className={styles.listItem} style={{ padding: "5px 0" }}>
                  <div className={styles.listMain}>
                    <span>{visit.label}</span>{" "}
                    <span className={styles.muted} style={{ fontSize: 11 }}>{visit.path}</span>
                  </div>
                  <div className={styles.listSide} title={formatDateTime(visit.visited_at)}>
                    <small>{formatDateTime(visit.visited_at)}</small>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
        {activity.drafts.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Тест черновиктері</div>
            <div className={styles.list}>
              {activity.drafts.map((draft) => (
                <div key={draft.trial_test_id} className={styles.listItem} style={{ padding: "4px 0" }}>
                  <span className={styles.listMain}>{draft.title}</span>
                  <span className={styles.listSide}>
                    <small>{formatNumber(draft.answers_count)} жауап · {formatDateTime(draft.updated_at)}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
        {activity.quizzes.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, marginBottom: 4 }}>Квиз ойындары</div>
            <div className={styles.list}>
              {activity.quizzes.map((quiz) => (
                <div key={`${quiz.session_id}-${quiz.joined_at ?? ""}`} className={styles.listItem} style={{ padding: "4px 0" }}>
                  <span className={styles.listMain}>{quiz.title}</span>
                  <span className={styles.listSide}>
                    <small>{formatNumber(quiz.correct)} / {formatNumber(quiz.answers)} дұрыс · {formatDateTime(quiz.joined_at)}</small>
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function StudentsTab({ data, initialSegment = "all", viewerEmail = null }: Props) {
  const { summary, series, period } = data;
  const [segment, setSegment] = useState<StudentSegment>(initialSegment);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<SortState<SortKey>>({ key: "attempts", descending: true });
  const [page, setPage] = useState(0);
  const [expandedUserId, setExpandedUserId] = useState<number | null>(null);
  const [activityMap, setActivityMap] = useState<Record<number, ActivityEntry>>({});

  const toggleActivity = async (userId: number) => {
    if (expandedUserId === userId) {
      setExpandedUserId(null);
      return;
    }
    setExpandedUserId(userId);
    if (!viewerEmail) return;
    setActivityMap((prev) => ({
      ...prev,
      [userId]: { loading: true, error: null, data: prev[userId]?.data ?? null },
    }));
    const result = await getAdminStudentActivity(userId, viewerEmail);
    setActivityMap((prev) => ({
      ...prev,
      [userId]: { loading: false, error: result.error, data: result.data },
    }));
  };

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
    ["ID", "Оқушы", ...(data.emails_visible ? ["Email"] : []), "Тіркелген", "Соңғы рет көрінді", "Соңғы бет", "Қаралған беттер",
      "Жауаптар", "Дұрыс", "Дәлдік %",
      "Белсенді күндер", "Сынақ тесттері", "Тесттің орташа нәтижесі %", "Тест черновигі", "Черновик жауаптары",
      "Квиздер", "Квиз жауаптары", "Квиз дәлдігі %", "Барлығы шешілген", "Серия"],
    visible.map((student) => [
      student.user_id, student.nickname, ...(data.emails_visible ? [student.email] : []), formatDateTime(student.registered_at),
      formatDateTime(student.last_seen_at), student.last_seen_path || "", student.page_visits,
      student.attempts, student.correct,
      student.accuracy === null ? "" : Math.round(student.accuracy * 1000) / 10, student.active_days, student.trial_attempts,
      student.trial_average === null ? "" : Math.round(student.trial_average * 1000) / 10,
      student.trial_drafts, student.trial_draft_answers, student.quiz_sessions, student.quiz_answers,
      student.quiz_accuracy === null ? "" : Math.round(student.quiz_accuracy * 1000) / 10,
      student.total_solved, student.streak,
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
      hint={`Жауаптар, дәлдік, белсенді күндер, сынақ тесттер мен квиздер — таңдалған кезең үшін. «Барлығы шешілген», серия және тест черновиктері — қазіргі күй.${data.truncated ? " Тізімде ең белсенді 2000 оқушы көрсетілген." : ""}`}
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
          <table className={styles.table} style={{ minWidth: 960 }}>
            <thead><tr>
              <SortHeader label="Оқушы" column="nickname" sort={sort} onSort={reset(setSort)} />
              <SortHeader label="Соңғы рет көрінді" column="last_seen_at" sort={sort} onSort={reset(setSort)} hint="Белсенді көрініп тұрған соңғы уақыты мен беті. Басып соңғы ашқан беттерін көруге болады" />
              <SortHeader label="Жауаптар" column="attempts" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңдегі модуль есептеріне жауаптар" />
              <SortHeader label="Дәлдік" column="accuracy" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңдегі дұрыс жауап үлесі" />
              <SortHeader label="Белсенді күн" column="active_days" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңде неше түрлі күні оқыды" />
              <SortHeader label="Сынақ тест" column="trial_attempts" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңде тапсырылған тест саны, орташа нәтижесі және аяқталмаған черновиктер" />
              <SortHeader label="Квиз" column="quiz_answers" sort={sort} onSort={reset(setSort)} numeric hint="Кезеңдегі тікелей квиз ойындары мен жауаптар" />
              <SortHeader label="Барлығы шешілген" column="total_solved" sort={sort} onSort={reset(setSort)} numeric hint="Барлық уақытта дұрыс шығарылған есептер" />
              <SortHeader label="Серия" column="streak" sort={sort} onSort={reset(setSort)} numeric hint="Қатарынан неше күн оқып келеді" />
              <SortHeader label="Тіркелген" column="registered_at" sort={sort} onSort={reset(setSort)} numeric />
            </tr></thead>
            <tbody>
              {pageRows.map((student) => {
                const open = expandedUserId === student.user_id;
                const visitLabel = formatVisitPath(student.last_seen_path);
                return (
                  <Fragment key={student.user_id}>
                    <tr className={open ? styles.expanded : undefined}>
                      <td>
                        <div className={styles.cellMain}>
                          <Link href={`/profile/${student.user_id}`}>{student.nickname || `Оқушы #${student.user_id}`}</Link>
                          <span className={styles.badges}>
                            {student.is_admin && <span className={styles.badge} data-tone="accent">әкімші</span>}
                            {student.is_new && <span className={styles.badge} data-tone="good">жаңа</span>}
                            {student.is_churned && <span className={styles.badge} data-tone="warn">тоқтап қалды</span>}
                            {student.never_active && student.trial_drafts > 0 && (
                              <span className={styles.badge} data-tone="warn" title="Сынақ тестті ашып, жауаптар сақтаған, бірақ «Тапсыру» батырмасын баспаған">
                                тест черновигі
                              </span>
                            )}
                            {student.never_active && student.has_quiz_history && (
                              <span className={styles.badge} data-tone="accent" title="Тікелей квиз ойынына қатысқан">
                                квиз ойнаған
                              </span>
                            )}
                            {student.never_active && !student.trial_drafts && !student.has_quiz_history && (
                              <span className={styles.badge}>бастамаған</span>
                            )}
                          </span>
                        </div>
                        {student.email && <div className={styles.cellSub}>{student.email}</div>}
                      </td>
                      <td title={formatDateTime(student.last_seen_at)}>
                        <button
                          type="button"
                          className={styles.rowButton}
                          aria-expanded={open}
                          onClick={() => void toggleActivity(student.user_id)}
                        >
                          <span>{formatAgo(student.last_seen_at)}</span>
                          <Icon name={open ? "chevronUp" : "chevronDown"} variant="outline" size={12} />
                        </button>
                        {(visitLabel || student.page_visits > 0) && (
                          <div className={styles.cellSub} title={student.last_seen_path || undefined}>
                            {visitLabel || "—"}
                            {student.page_visits > 0 && ` · ${formatNumber(student.page_visits)} бет`}
                          </div>
                        )}
                      </td>
                      <td className={styles.num}>{student.attempts ? formatNumber(student.attempts) : <span className={styles.muted}>—</span>}</td>
                      <td className={styles.num}>{student.accuracy === null ? <span className={styles.muted}>—</span>
                        : <ShareBar share={student.accuracy} label={formatPercent(student.accuracy)} />}</td>
                      <td className={styles.num}>{student.active_days || <span className={styles.muted}>—</span>}</td>
                      <td className={styles.num}>
                        {student.trial_attempts
                          ? <>{formatNumber(student.trial_attempts)} <span className={styles.muted}>· {formatPercent(student.trial_average)}</span></>
                          : !student.trial_drafts && <span className={styles.muted}>—</span>}
                        {student.trial_drafts > 0 && (
                          <div
                            className={styles.cellSub}
                            title="Оқушы тестті ашып, жауаптарды сақтаған, бірақ тапсырмаған"
                          >
                            {student.trial_draft_answers > 0
                              ? `${formatNumber(student.trial_drafts)} черновик · ${formatNumber(student.trial_draft_answers)} жауап`
                              : `${formatNumber(student.trial_drafts)} басталған`}
                          </div>
                        )}
                      </td>
                      <td
                        className={styles.num}
                        title={student.quiz_answers > 0 ? `${formatNumber(student.quiz_correct)} / ${formatNumber(student.quiz_answers)} дұрыс` : undefined}
                      >
                        {student.quiz_sessions > 0
                          ? student.quiz_answers > 0
                            ? <>{formatNumber(student.quiz_sessions)} <span className={styles.muted}>· {formatPercent(student.quiz_accuracy)}</span></>
                            : <>{formatNumber(student.quiz_sessions)} <span className={styles.muted}>· 0 жауап</span></>
                          : <span className={styles.muted}>—</span>}
                      </td>
                      <td className={styles.num}>{formatNumber(student.total_solved)}</td>
                      <td className={styles.num}>{student.streak ? `${student.streak} күн` : <span className={styles.muted}>—</span>}</td>
                      <td className={styles.num}>{formatDate(student.registered_at)}</td>
                    </tr>
                    {open && (
                      <tr className={styles.expanded}>
                        <td colSpan={10}>
                          <StudentActivityDetail entry={activityMap[student.user_id]} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={currentPage} pageSize={PAGE_SIZE} total={visible.length} onPage={setPage} />
    </Card>
  </>;
}
