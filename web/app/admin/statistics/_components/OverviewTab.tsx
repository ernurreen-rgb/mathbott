"use client";

import Link from "next/link";
import Icon, { type IconName } from "@/components/ui/Icon";
import type { StatisticsOverview } from "@/types";
import styles from "../Statistics.module.css";
import { BucketChart, Heatmap, type ChartRow } from "./charts";
import {
  BUCKET_NAMES, bucketLabel, bucketTitle, describeDelta, formatNumber, formatPercent, JOURNEY_LABELS, previousPeriodLabel,
} from "./format";
import { VIZ } from "./palette";
import { Card, Empty, Meter, StatTile } from "./primitives";
import type { StatisticsIntent } from "./StatisticsWorkspace";

type Props = { data: StatisticsOverview; onNavigate: (intent: StatisticsIntent) => void };
type Warning = { key: string; tone?: "bad"; icon: IconName; title: string; text: string; href?: string; intent?: StatisticsIntent };

export default function OverviewTab({ data, onNavigate }: Props) {
  const { kpis, series, attention, today, totals, thresholds, period } = data;
  const comparedWith = previousPeriodLabel(period);
  const points = series.points;
  const rows: ChartRow[] = points.map((point) => ({
    label: bucketLabel(point, series.granularity),
    title: bucketTitle(point, series.granularity),
    correct: point.correct,
    incorrect: point.attempts - point.correct,
    active_users: point.active_users,
    note: point.attempts ? `Дәлдік: ${formatPercent(point.correct / point.attempts)}` : null,
  }));
  const cohort = data.journey[0]?.count ?? 0;
  const bucket = BUCKET_NAMES[series.granularity];

  const warnings: Warning[] = [];
  if (attention.pending_reports > 0) warnings.push({
    key: "reports", tone: "bad", icon: "report", href: "/admin/reports",
    title: `${formatNumber(attention.pending_reports)} қаралмаған хабарлама`,
    text: "Оқушылар есептегі қате туралы жазды. Хабарламалар бетінде қарап шығыңыз.",
  });
  if (attention.hard_tasks > 0) warnings.push({
    key: "hard", icon: "alert", intent: { tab: "tasks", filter: "hard" },
    title: `${formatNumber(attention.hard_tasks)} тым қиын есеп`,
    text: `Кемінде ${thresholds.hard_task_min_attempts} жауап берілген, ал дұрысы ${formatPercent(thresholds.hard_task_max_accuracy)}-дан аз. Шартында немесе жауабында қате болуы мүмкін.`,
  });
  if (attention.churned_students > 0) warnings.push({
    key: "churned", icon: "users", intent: { tab: "students", segment: "churned" },
    title: `${formatNumber(attention.churned_students)} оқушы тоқтап қалды`,
    text: "Алдыңғы кезеңде оқыған, бірақ бұл кезеңде бірде-бір әрекет жасамаған.",
  });
  if (attention.silent_new_students > 0) warnings.push({
    key: "silent", icon: "user", intent: { tab: "students", segment: "silent" },
    title: `${formatNumber(attention.silent_new_students)} жаңа оқушы әлі бастамады`,
    text: "Осы кезеңде тіркелген, бірақ әлі бірде-бір есеп шығармаған.",
  });

  return <>
    <div className={styles.tiles}>
      <StatTile label="Белсенді оқушылар" value={formatNumber(kpis.active_users.value)}
        hint="Осы кезеңде модуль есебіне жауап берген, сынақ тест тапсырған немесе қателерін талдаған оқушылар."
        delta={describeDelta(kpis.active_users, "count")} comparedWith={comparedWith} spark={points.map((point) => point.active_users)} />
      <StatTile label="Жаңа тіркелгендер" value={formatNumber(kpis.new_users.value)}
        hint="Осы кезеңде алғаш рет тіркелген аккаунттар."
        delta={describeDelta(kpis.new_users, "count")} comparedWith={comparedWith} spark={points.map((point) => point.new_users)} />
      <StatTile label="Жауаптар" value={formatNumber(kpis.attempts.value)}
        hint="Модуль есептеріне жіберілген барлық жауап: дұрысы да, қатесі де. Бір есепке бірнеше рет жауап берілсе, әрқайсысы бөлек саналады."
        delta={describeDelta(kpis.attempts, "count")} comparedWith={comparedWith} spark={points.map((point) => point.attempts)} />
      <StatTile label="Дәлдік" value={formatPercent(kpis.accuracy.value)}
        hint="Дұрыс жауаптардың барлық жауаптағы үлесі."
        delta={describeDelta(kpis.accuracy, "share")} comparedWith={comparedWith} meter={kpis.accuracy.value} />
      <StatTile label="Тапсырылған тесттер" value={formatNumber(kpis.trial_attempts.value)}
        hint="Осы кезеңде аяқталған сынақ тест әрекеттері."
        delta={describeDelta(kpis.trial_attempts, "count")} comparedWith={comparedWith} spark={points.map((point) => point.trial_attempts)} />
      <StatTile label="Тесттердің орташа нәтижесі" value={formatPercent(kpis.trial_average.value)}
        hint="Осы кезеңде тапсырылған сынақ тесттердегі дұрыс жауап үлесінің орташа мәні."
        delta={describeDelta(kpis.trial_average, "share")} comparedWith={comparedWith} meter={kpis.trial_average.value} />
    </div>

    <div className={`${styles.row} ${styles.rowWide}`}>
      <Card title="Белсенділік динамикасы" hint={`Әр баған — бір ${bucket.noun}. Ешкім оқымаған кезеңдер де нөл болып көрсетіледі, сондықтан үзілістер анық көрінеді.`}>
        <BucketChart title="Жауаптар" subtitle="модуль есептеріне" kind="columns" rows={rows} height={230} axisName={bucket.column}
          series={[{ key: "correct", name: "Дұрыс", color: VIZ.primary }, { key: "incorrect", name: "Қате", color: VIZ.secondary }]} />
        <div style={{ height: 18 }} />
        <BucketChart title="Белсенді оқушылар" subtitle="кемінде бір әрекет жасағандар" kind="line" rows={rows} height={150} axisName={bucket.column}
          series={[{ key: "active_users", name: "Белсенді оқушылар", color: VIZ.primary }]} />
      </Card>

      <div className={styles.stack}>
        <Card title="Бүгін" hint="Сіздің уақыт белдеуіңіздегі бүгінгі күн.">
          <dl className={styles.facts}>
            <div className={styles.fact}><dt>Қазір онлайн</dt><dd><i className={styles.dot} />{formatNumber(today.online_now)}</dd></div>
            <div className={styles.fact}><dt>Белсенді оқушылар</dt><dd>{formatNumber(today.active_users)}</dd></div>
            <div className={styles.fact}><dt>Жауаптар</dt><dd>{formatNumber(today.attempts)}</dd></div>
            <div className={styles.fact}><dt>Жаңа тіркелгендер</dt><dd>{formatNumber(today.new_users)}</dd></div>
          </dl>
        </Card>
        <Card title="Назар аударыңыз" hint="Әрекет етуді қажет ететін жайттар. Басып, толығырақ ашыңыз.">
          {!warnings.length ? (
            <p className={styles.allGood}><Icon name="checkCircle" size={18} /> Қазір назар аударатын мәселе жоқ.</p>
          ) : (
            <div className={styles.list}>
              {warnings.map((warning) => {
                const body = <>
                  <span className={styles.attentionIcon} data-tone={warning.tone}><Icon name={warning.icon} size={16} /></span>
                  <span>
                    <span className={styles.attentionTitle}>{warning.title} <Icon name="arrowRight" variant="outline" size={12} /></span>
                    <span className={styles.attentionText} style={{ display: "block" }}>{warning.text}</span>
                  </span>
                </>;
                return warning.href
                  ? <Link key={warning.key} href={warning.href} className={styles.attention}>{body}</Link>
                  : <button key={warning.key} type="button" className={styles.attention} onClick={() => warning.intent && onNavigate(warning.intent)}>{body}</button>;
              })}
            </div>
          )}
        </Card>
      </div>
    </div>

    <div className={`${styles.row} ${styles.rowHalf}`}>
      <Card title="Жаңа оқушылардың жолы"
        hint={period.start ? `Осы кезеңде тіркелген ${formatNumber(cohort)} оқушының қаншасы әр қадамға жетті.` : `Барлық ${formatNumber(cohort)} оқушының қаншасы әр қадамға жетті.`}>
        {!cohort ? <Empty>Бұл кезеңде жаңа оқушы тіркелмеген.</Empty> : (
          <div className={styles.meters}>
            {data.journey.map((step) => (
              <Meter key={step.key} name={JOURNEY_LABELS[step.key].label} sub={JOURNEY_LABELS[step.key].hint}
                share={step.count / cohort} figure={formatNumber(step.count)} note={formatPercent(step.count / cohort)} />
            ))}
          </div>
        )}
      </Card>
      <Card title="Оқушылар қай уақытта оқиды" hint="Модуль есептеріне берілген жауаптар апта күні мен сағат бойынша, сіздің уақыт белдеуіңізде. Түс қою болған сайын жауап көп.">
        <Heatmap cells={data.heatmap} unit="жауап" />
      </Card>
    </div>

    <Card title="Платформа қазір" hint="Таңдалған кезеңге тәуелсіз жалпы сандар.">
      <dl className={styles.facts} data-columns="7">
        <div className={styles.fact}><dt>Тіркелген оқушылар</dt><dd>{formatNumber(totals.users)}</dd></div>
        <div className={styles.fact}><dt>Модульдер</dt><dd>{formatNumber(totals.modules)}</dd></div>
        <div className={styles.fact}><dt>Сабақтар</dt><dd>{formatNumber(totals.lessons)}</dd></div>
        <div className={styles.fact}><dt>Модульдегі есептер</dt><dd>{formatNumber(totals.module_tasks)}</dd></div>
        <div className={styles.fact}><dt>Банктегі есептер</dt><dd>{formatNumber(totals.bank_tasks)}</dd></div>
        <div className={styles.fact}><dt>Сынақ тесттері</dt><dd>{formatNumber(totals.trial_tests)}</dd></div>
        <div className={styles.fact}><dt>Квиздер</dt><dd>{formatNumber(totals.quizzes)}</dd></div>
      </dl>
    </Card>
  </>;
}
