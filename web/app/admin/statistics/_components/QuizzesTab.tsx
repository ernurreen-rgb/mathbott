"use client";

import type { StatisticsQuizzes } from "@/types";
import styles from "../Statistics.module.css";
import { BucketChart, type ChartRow } from "./charts";
import {
  BUCKET_NAMES, bucketLabel, bucketTitle, describeDelta, formatAgo, formatDateTime, formatNumber, formatPercent, previousPeriodLabel, QUIZ_STATUS_LABELS,
} from "./format";
import { VIZ } from "./palette";
import { Card, Empty, ShareBar, StatTile } from "./primitives";

export default function QuizzesTab({ data }: { data: StatisticsQuizzes }) {
  const { summary, series, period } = data;
  const comparedWith = previousPeriodLabel(period);
  const rows: ChartRow[] = series.points.map((point) => ({
    label: bucketLabel(point, series.granularity),
    title: bucketTitle(point, series.granularity),
    sessions: point.sessions,
    note: point.sessions ? `Қатысушылар: ${formatNumber(point.participants)}` : null,
  }));
  const perSession = summary.sessions.value ? Math.round((summary.participants.value / summary.sessions.value) * 10) / 10 : null;

  return <>
    <div className={styles.tiles}>
      <StatTile label="Өткізілген сессиялар" value={formatNumber(summary.sessions.value)}
        hint="Осы кезеңде мұғалімдер ашқан тікелей квиз ойындары."
        delta={describeDelta(summary.sessions, "count")} comparedWith={comparedWith} />
      <StatTile label="Қатысушылар" value={formatNumber(summary.participants.value)}
        hint="Сессияларға қосылған ойыншылар. Бір адам екі сессияға қатысса, екі рет саналады."
        delta={describeDelta(summary.participants, "count")} comparedWith={comparedWith} />
      <StatTile label="Жауаптар" value={formatNumber(summary.answers.value)}
        hint="Квиз сұрақтарына берілген барлық жауап."
        delta={describeDelta(summary.answers, "count")} comparedWith={comparedWith} />
      <StatTile label="Дәлдік" value={formatPercent(summary.accuracy.value)}
        hint="Квиз сұрақтарына берілген дұрыс жауаптардың үлесі."
        delta={describeDelta(summary.accuracy, "share")} comparedWith={comparedWith} meter={summary.accuracy.value} />
      <StatTile label="Бір сессиядағы ойыншы" value={perSession === null ? "—" : String(perSession).replace(".", ",")}
        hint="Бір сессияға орта есеппен неше ойыншы қосылды."
        note={<span>{formatNumber(summary.guests)} қонақ (аккаунтсыз)</span>} />
      <StatTile label="Ойналған квиздер" value={formatNumber(summary.quizzes_played)} unit={`/ ${formatNumber(summary.quizzes_total)}`}
        hint="Осы кезеңде кемінде бір рет өткізілген квиздер / платформадағы барлық квиз."
        note={<span>{formatNumber(summary.finished_sessions)} сессия аяқталды · {formatNumber(summary.hosts)} жүргізуші</span>} />
    </div>

    <p className={styles.note}>
      Квиздерді мұғалімдер жүргізеді, сондықтан «Әкімшілерсіз» сүзгісі бұл бөлімге қолданылмайды.
    </p>

    <div className={`${styles.row} ${styles.rowHalf}`}>
      <Card title="Сессиялар динамикасы" hint={`Әр баған — бір ${BUCKET_NAMES[series.granularity].noun}: сол кезде неше квиз сессиясы ашылды.`}>
        <BucketChart title="Сессиялар" kind="columns" rows={rows} height={210} axisName={BUCKET_NAMES[series.granularity].column}
          series={[{ key: "sessions", name: "Сессиялар", color: VIZ.primary }]} emptyText="Бұл кезеңде квиз өткізілмеген." />
      </Card>
      <Card title="Квиздер" hint="Қай квиз жиі ойналды және оған қалай жауап берілді.">
        {!data.quizzes.length ? <Empty>Бұл кезеңде квиз өткізілмеген.</Empty> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>
                <th>Квиз</th><th className={styles.num}>Сессия</th><th className={styles.num}>Қатысушы</th>
                <th className={styles.num}>Дәлдік</th><th className={styles.num}>Соңғы рет</th>
              </tr></thead>
              <tbody>
                {data.quizzes.map((quiz) => (
                  <tr key={quiz.quiz_id}>
                    <td><div className={styles.cellMain}>{quiz.title}</div><div className={styles.cellSub}>{formatNumber(quiz.answers)} жауап</div></td>
                    <td className={styles.num}>{formatNumber(quiz.sessions)}</td>
                    <td className={styles.num}>{formatNumber(quiz.participants)}</td>
                    <td className={styles.num}>{quiz.accuracy === null ? <span className={styles.muted}>—</span>
                      : <ShareBar share={quiz.accuracy} label={formatPercent(quiz.accuracy)} />}</td>
                    <td className={styles.num} title={formatDateTime(quiz.last_session_at)}>{formatAgo(quiz.last_session_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </div>

    <Card title="Соңғы сессиялар" hint="Осы кезеңдегі ең соңғы 20 сессия.">
      {!data.recent.length ? <Empty>Бұл кезеңде квиз өткізілмеген.</Empty> : (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 720 }}>
            <thead><tr>
              <th>Квиз</th><th>Жүргізуші</th><th>Күйі</th><th className={styles.num}>Қатысушылар</th>
              <th className={styles.num}>Жауаптар</th><th className={styles.num}>Дәлдік</th><th className={styles.num}>Ашылған уақыты</th>
            </tr></thead>
            <tbody>
              {data.recent.map((session) => (
                <tr key={session.session_id}>
                  <td className={styles.cellMain}>{session.title}</td>
                  <td>{session.host_nickname || <span className={styles.muted}>—</span>}</td>
                  <td><span className={styles.badge} data-tone={session.status === "finished" ? "good" : session.status === "in_progress" ? "accent" : undefined}>
                    {QUIZ_STATUS_LABELS[session.status] || session.status}
                  </span></td>
                  <td className={styles.num}>
                    {formatNumber(session.participants)}
                    {session.guests > 0 && <span className={styles.muted}> · {formatNumber(session.guests)} қонақ</span>}
                  </td>
                  <td className={styles.num}>{formatNumber(session.answers)}</td>
                  <td className={styles.num}>{formatPercent(session.accuracy)}</td>
                  <td className={styles.num} title={formatDateTime(session.created_at)}>{formatAgo(session.created_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  </>;
}
