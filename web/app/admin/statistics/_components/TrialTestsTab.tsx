"use client";

import Link from "next/link";
import { Fragment, useState } from "react";
import Icon from "@/components/ui/Icon";
import MathRender from "@/components/ui/MathRender";
import type { StatisticsTrialTest, StatisticsTrialTests, TrialQuestionStat } from "@/types";
import styles from "../Statistics.module.css";
import { BucketChart, type ChartRow } from "./charts";
import {
  BUCKET_NAMES, bucketLabel, bucketTitle, describeDelta, formatAgo, formatDateTime, formatNumber, formatPercent, previousPeriodLabel,
} from "./format";
import { heatColor, heatInk, VIZ } from "./palette";
import { Card, Empty, Meter, ShareBar, StatTile } from "./primitives";

const HARDEST_SHOWN = 5;
const errorShare = (question: TrialQuestionStat) => (question.accuracy === null ? 0 : 1 - question.accuracy);

/** Every question of a test coloured by its share of wrong answers, then the hardest ones in full. */
function Questions({ test }: { test: StatisticsTrialTest }) {
  const answered = test.questions.filter((question) => question.answers > 0);
  if (!answered.length) return <Empty>Бұл кезеңдегі тапсыруларда сұрақ деректері жоқ.</Empty>;
  const hardest = [...answered].sort((a, b) => (a.accuracy ?? 1) - (b.accuracy ?? 1) || a.number - b.number).slice(0, HARDEST_SHOWN);
  return (
    <div className={styles.detail}>
      <p className={styles.note} style={{ marginBottom: 8 }}>
        Әр шаршы — бір сұрақ. Түс қою болған сайын қате жауап көп; бос қалдырылған жауап та қате саналады.
      </p>
      <div className={styles.questions}>
        {test.questions.map((question) => (
          <div key={question.task_id} className={styles.question} tabIndex={0}
            style={{ background: heatColor(errorShare(question), 1), color: heatInk(errorShare(question), 1) }}
            aria-label={`${question.number}-сұрақ: дұрыс ${question.correct} / ${question.answers}`}>
            {question.number}
            <span>
              <strong>№{question.number}</strong>{question.deleted ? " (тесттен алынған)" : ""}<br />
              Дұрыс: {formatNumber(question.correct)} / {formatNumber(question.answers)} ({formatPercent(question.accuracy)})
              {question.skipped > 0 && <><br />Бос қалдырған: {formatNumber(question.skipped)}</>}
            </span>
          </div>
        ))}
      </div>
      <h4 className={styles.sectionTitle} style={{ marginBottom: 10 }}>Ең қиын сұрақтар</h4>
      <div className={styles.meters}>
        {hardest.map((question) => (
          <Meter key={question.task_id}
            name={<><strong>№{question.number}</strong> {question.text_preview ? <MathRender latex={question.text_preview} inline /> : null}</>}
            sub={question.skipped ? `${formatNumber(question.skipped)} оқушы бос қалдырды` : undefined}
            share={question.accuracy} figure={formatPercent(question.accuracy)} note={`${formatNumber(question.correct)} / ${formatNumber(question.answers)}`} />
        ))}
      </div>
    </div>
  );
}

export default function TrialTestsTab({ data }: { data: StatisticsTrialTests }) {
  const { summary, series, period } = data;
  const [expanded, setExpanded] = useState<number | null>(null);
  const comparedWith = previousPeriodLabel(period);
  const taken = data.tests.filter((test) => test.attempts > 0);
  const untaken = data.tests.length - taken.length;

  const rows: ChartRow[] = series.points.map((point) => ({
    label: bucketLabel(point, series.granularity),
    title: bucketTitle(point, series.granularity),
    attempts: point.attempts,
    note: point.attempts ? `Орташа нәтиже: ${formatPercent(point.average)}` : null,
  }));
  const distribution: ChartRow[] = data.distribution.map((bucket) => ({
    label: `${bucket.from}–${bucket.to}`,
    title: `${bucket.from}–${bucket.to}% нәтиже`,
    count: bucket.count,
  }));

  return <>
    <div className={styles.tiles}>
      <StatTile label="Тапсыру саны" value={formatNumber(summary.attempts.value)}
        hint="Осы кезеңде аяқталған сынақ тест әрекеттері. Бір оқушы бір тестті қайта тапсырса, әр әрекет бөлек саналады."
        delta={describeDelta(summary.attempts, "count")} comparedWith={comparedWith}
        note={!comparedWith ? <span>{formatNumber(summary.tests_taken)} / {formatNumber(summary.tests_total)} тест бойынша</span> : undefined} />
      <StatTile label="Тапсырған оқушылар" value={formatNumber(summary.students.value)}
        hint="Осы кезеңде кемінде бір сынақ тест тапсырған оқушылар."
        delta={describeDelta(summary.students, "count")} comparedWith={comparedWith} />
      <StatTile label="Орташа нәтиже" value={formatPercent(summary.average.value)}
        hint="Барлық тапсырудағы дұрыс жауап үлесінің орташа мәні."
        delta={describeDelta(summary.average, "share")} comparedWith={comparedWith} meter={summary.average.value} />
      <StatTile label="Медиана" value={formatPercent(summary.median)}
        hint="Ортадағы нәтиже: тапсырулардың жартысы осыдан жоғары, жартысы төмен. Орташадан айырмашылығы үлкен болса, бірнеше өте жоғары не өте төмен нәтиже бар."
        meter={summary.median} />
      <StatTile label="Ең жоғары нәтиже" value={formatPercent(summary.best)} hint="Осы кезеңдегі ең жақсы тапсыру." meter={summary.best} />
      <StatTile label="Жеке / жұппен" value={<>{formatNumber(summary.solo)} <small>/</small> {formatNumber(summary.coop)}</>}
        hint="Жеке тапсырылған және досымен бірге (жұппен) тапсырылған тесттер саны."
        note={<span>{formatNumber(summary.tests_taken)} / {formatNumber(summary.tests_total)} тест тапсырылды</span>} />
    </div>

    <div className={`${styles.row} ${styles.rowHalf}`}>
      <Card title="Тапсырулар динамикасы" hint={`Әр баған — бір ${BUCKET_NAMES[series.granularity].noun}: сол кезде неше тест аяқталды.`}>
        <BucketChart title="Тапсырулар" kind="columns" rows={rows} height={210} axisName={BUCKET_NAMES[series.granularity].column}
          series={[{ key: "attempts", name: "Тапсырулар", color: VIZ.primary }]} emptyText="Бұл кезеңде сынақ тест тапсырылмаған." />
      </Card>
      <Card title="Нәтижелердің таралуы" hint="Тапсырулар дұрыс жауап пайызы бойынша топтастырылған. Бағандар солға ығысса — тесттер тым қиын, оңға ығысса — тым жеңіл.">
        <BucketChart title="Тапсыру саны" subtitle="нәтиже аралығы бойынша, %" kind="columns" rows={distribution} height={210} axisName="Нәтиже"
          series={[{ key: "count", name: "Тапсырулар", color: VIZ.primary }]} emptyText="Бұл кезеңде сынақ тест тапсырылмаған." />
      </Card>
    </div>

    <Card title="Тесттер" hint="Тесттің атын басып, сұрақтар бойынша дәлдікті ашыңыз.">
      {!taken.length ? <Empty>Бұл кезеңде сынақ тест тапсырылмаған.</Empty> : (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 760 }}>
            <thead><tr>
              <th>Тест</th><th className={styles.num}>Тапсыру</th><th className={styles.num}>Оқушылар</th>
              <th className={styles.num}>Орташа нәтиже</th><th className={styles.num}>Медиана</th><th className={styles.num}>Ең жоғары</th>
              <th className={styles.num}>Соңғы тапсыру</th>
            </tr></thead>
            <tbody>
              {taken.map((test) => {
                const open = expanded === test.id;
                return (
                  <Fragment key={test.id}>
                    <tr className={open ? styles.expanded : undefined}>
                      <td>
                        <button type="button" className={styles.rowButton} aria-expanded={open} onClick={() => setExpanded(open ? null : test.id)}>
                          <Icon name="chevronDown" variant="outline" size={13} className={styles.chevron} data-open={open} /> {test.title}
                        </button>
                        <div className={styles.cellSub} style={{ marginLeft: 19 }}>
                          {test.folder ? `${test.folder} · ` : ""}{formatNumber(test.questions_count)} сұрақ
                          {test.coop > 0 && ` · ${formatNumber(test.coop)} рет жұппен`}
                        </div>
                      </td>
                      <td className={styles.num}>{formatNumber(test.attempts)}</td>
                      <td className={styles.num}>{formatNumber(test.students)}</td>
                      <td className={styles.num}><ShareBar share={test.average} label={formatPercent(test.average)} /></td>
                      <td className={styles.num}>{formatPercent(test.median)}</td>
                      <td className={styles.num}>{formatPercent(test.best)}</td>
                      <td className={styles.num} title={formatDateTime(test.last_completed_at)}>{formatAgo(test.last_completed_at)}</td>
                    </tr>
                    {open && <tr className={styles.expanded}><td colSpan={7}><Questions test={test} /></td></tr>}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      {untaken > 0 && <p className={styles.note} style={{ marginTop: 12 }}>Бұл кезеңде тағы {formatNumber(untaken)} тест бірде-бір рет тапсырылмаған.</p>}
    </Card>

    <Card title="Соңғы тапсырулар" hint="Осы кезеңдегі ең соңғы аяқталған 20 әрекет.">
      {!data.recent.length ? <Empty>Бұл кезеңде сынақ тест тапсырылмаған.</Empty> : (
        <div className={styles.list}>
          {data.recent.map((result) => (
            <div key={result.result_id} className={styles.listItem}>
              <div className={styles.listMain}>
                <Link href={`/profile/${result.user_id}`} style={{ color: "var(--ink)", fontWeight: 500 }}>{result.nickname || `Оқушы #${result.user_id}`}</Link>
                {result.submit_mode === "coop" && <span className={styles.badges}><span className={styles.badge} data-tone="accent">жұппен</span></span>}
                <small>{result.title || `Тест #${result.trial_test_id}`}</small>
              </div>
              <div className={styles.listSide}>
                {formatPercent(result.percentage)} <span className={styles.muted} style={{ fontWeight: 400 }}>· {result.score} / {result.total}</span>
                <small title={formatDateTime(result.completed_at)}>{formatAgo(result.completed_at)}</small>
              </div>
            </div>
          ))}
        </div>
      )}
    </Card>
  </>;
}
