"use client";

import MathRender from "@/components/ui/MathRender";
import type { StatisticsConstructor } from "@/types";
import styles from "../Statistics.module.css";
import { BucketChart, type ChartRow } from "./charts";
import {
  BUCKET_NAMES, bucketLabel, bucketTitle, describeDelta, DIFFICULTY_LABELS, formatAgo, formatDateTime, formatNumber, formatPercent,
  previousPeriodLabel,
} from "./format";
import { VIZ } from "./palette";
import { Card, Empty, Meter, ShareBar, StatTile } from "./primitives";

/** The task constructor (/task-builder): who builds collections, what they put in them and how often they download them. */
export default function TaskBuilderTab({ data }: { data: StatisticsConstructor }) {
  const { summary, series, period } = data;
  const comparedWith = previousPeriodLabel(period);
  const bucket = BUCKET_NAMES[series.granularity];
  const downloadRows: ChartRow[] = series.points.map((point) => ({
    label: bucketLabel(point, series.granularity),
    title: bucketTitle(point, series.granularity),
    pdf: point.pdf_downloads,
    pptx: point.pptx_downloads,
    note: point.collections_created || point.active_authors
      ? `Жаңа жинақ: ${formatNumber(point.collections_created)} · Белсенді авторлар: ${formatNumber(point.active_authors)}`
      : null,
  }));
  const coverage = summary.bank_tasks_total ? summary.unique_bank_tasks / summary.bank_tasks_total : null;
  const fontMax = Math.max(1, ...data.by_font.map((row) => row.collections));
  const topicMax = Math.max(1, ...data.by_topic.map((row) => row.collections));

  return <>
    <div className={styles.tiles}>
      <StatTile label="Жаңа жинақтар" value={formatNumber(summary.collections_created.value)}
        hint="Осы кезеңде құрастырғышта жасалған жинақтар."
        delta={describeDelta(summary.collections_created, "count")} comparedWith={comparedWith}
        note={<span>Барлығы сақталған: {formatNumber(summary.collections_total)}</span>} />
      <StatTile label="Белсенді авторлар" value={formatNumber(summary.active_authors.value)}
        hint="Осы кезеңде жинақ жасаған, өзгерткен немесе жүктеп алған пайдаланушылар."
        delta={describeDelta(summary.active_authors, "count")} comparedWith={comparedWith}
        note={<span>Барлық уақытта: {formatNumber(summary.authors_total)}</span>} />
      <StatTile label="Жүктеулер" value={formatNumber(summary.downloads.value)}
        hint="Осы кезеңде жүктелген PDF және PowerPoint файлдары."
        delta={describeDelta(summary.downloads, "count")} comparedWith={comparedWith}
        note={<span>PDF: {formatNumber(summary.pdf_downloads)} · PowerPoint: {formatNumber(summary.pptx_downloads)}</span>} />
      <StatTile label="Жауаптарымен" value={formatPercent(summary.with_answers_share)}
        hint="Жауаптар беті қосылған жүктеулердің үлесі."
        meter={summary.with_answers_share}
        note={<span>{formatNumber(summary.downloads_with_answers)} / {formatNumber(summary.downloads.value)} жүктеу</span>} />
      <StatTile label="Жинақтағы есептер" value={formatNumber(summary.tasks_in_collections)}
        hint="Сақталған жинақтардағы барлық есеп (өшірілген есептер есептелмейді)."
        note={<span>Орташа: {summary.avg_tasks_per_collection === null ? "—" : String(summary.avg_tasks_per_collection).replace(".", ",")} есеп
          · бос жинақ: {formatNumber(summary.empty_collections)}</span>} />
      <StatTile label="Банктің қамтылуы" value={formatPercent(coverage, 1)}
        hint="Кемінде бір жинаққа алынған банк есептерінің үлесі."
        meter={coverage}
        note={<span>{formatNumber(summary.unique_bank_tasks)} / {formatNumber(summary.bank_tasks_total)} есеп</span>} />
    </div>

    {!data.download_tracking_enabled && (
      <p className={styles.note}>Жүктеулер әлі есепке алынбайды: дерекқорға 0024 миграциясы қолданылмаған.</p>
    )}

    <div className={`${styles.row} ${styles.rowWide}`}>
      <Card title="Жүктеулер динамикасы"
        hint={`Әр баған — бір ${bucket.noun}: сол кезде неше PDF және PowerPoint файлы жүктелді.`}>
        <BucketChart title="Жүктеулер" kind="columns" rows={downloadRows} height={230} axisName={bucket.column}
          series={[{ key: "pdf", name: "PDF", color: VIZ.primary }, { key: "pptx", name: "PowerPoint", color: VIZ.secondary }]}
          emptyText="Бұл кезеңде файл жүктелмеген." />
      </Card>
      <Card title="Безендіру" hint="Сақталған жинақтарда өз безендіруі бар ма: PDF жазуы, PowerPoint фондары мен шрифті.">
        <div className={styles.list}>
          <Meter name="Өз безендіруі бар" share={summary.branded_share} figure={formatPercent(summary.branded_share)}
            note={`${formatNumber(summary.branded_count)} / ${formatNumber(summary.collections_total)} жинақ`} />
          <Meter name="PDF жоғарғы жазуы" share={summary.collections_total ? summary.custom_header_count / summary.collections_total : null}
            figure={formatNumber(summary.custom_header_count)} color={VIZ.tertiary} />
          <Meter name="Титул суреті" share={summary.collections_total ? summary.custom_title_image_count / summary.collections_total : null}
            figure={formatNumber(summary.custom_title_image_count)} color={VIZ.tertiary} />
          <Meter name="Слайд фоны" share={summary.collections_total ? summary.custom_background_image_count / summary.collections_total : null}
            figure={formatNumber(summary.custom_background_image_count)} color={VIZ.tertiary} />
        </div>
        <div style={{ fontWeight: 600, margin: "14px 0 6px" }}>PowerPoint шрифті</div>
        {!data.by_font.length ? <Empty>Әзірге жинақ жоқ.</Empty> : (
          <div className={styles.list}>
            {data.by_font.map((row) => (
              <Meter key={row.font} name={row.font} share={row.collections / fontMax}
                figure={formatNumber(row.collections)} note={formatPercent(row.share)} color={VIZ.secondary} />
            ))}
          </div>
        )}
      </Card>
    </div>

    <div className={`${styles.row} ${styles.rowHalf}`}>
      <Card title="Белсенді авторлар" hint="Кім жинақ жасайды және жүктейді. Жүктеулер мен жинақтар осы кезеңдегі, «барлығы» — барлық уақыттағы.">
        {!data.authors.length ? <Empty>Әзірге ешкім жинақ жасамаған.</Empty> : (
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead><tr>
                <th>Автор</th><th className={styles.num}>Жинақ</th><th className={styles.num}>Есеп</th>
                <th className={styles.num}>Жүктеу</th><th className={styles.num}>Соңғы рет</th>
              </tr></thead>
              <tbody>
                {data.authors.slice(0, 50).map((author) => (
                  <tr key={author.user_id}>
                    <td>
                      <div className={styles.cellMain}>
                        {author.nickname || `#${author.user_id}`}
                        {author.is_admin && <span className={styles.badge} style={{ marginLeft: 6 }}>Әкімші</span>}
                      </div>
                      {data.emails_visible && author.email && <div className={styles.cellSub}>{author.email}</div>}
                    </td>
                    <td className={styles.num} title={`Кезеңде өзгерген: ${formatNumber(author.collections_in_period)}`}>
                      {formatNumber(author.collections)}
                    </td>
                    <td className={styles.num}>{formatNumber(author.total_tasks)}</td>
                    <td className={styles.num} title={`PDF: ${formatNumber(author.pdf_downloads)} · PowerPoint: ${formatNumber(author.pptx_downloads)}`}>
                      {author.downloads ? formatNumber(author.downloads) : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.num} title={formatDateTime(author.last_activity_at)}>{formatAgo(author.last_activity_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      <Card title="Тақырыптар" hint="Қай тақырыптың есептері жинақтарға жиі алынады: тақырыбы бар есеп кездесетін жинақтар саны.">
        {!data.by_topic.length ? <Empty>Жинақтарда әзірге есеп жоқ.</Empty> : (
          <div className={styles.list}>
            {data.by_topic.map((row) => (
              <Meter key={row.topic || "none"} name={row.topic || "Тақырыпсыз"} share={row.collections / topicMax}
                figure={`${formatNumber(row.collections)} жинақ`} note={`${formatNumber(row.tasks)} есеп · ${formatPercent(row.share)}`} />
            ))}
          </div>
        )}
      </Card>
    </div>

    <Card title="Жиі алынатын есептер" hint="Ең көп жинаққа алынған банк есептері (алғашқы 100).">
      {!data.popular_tasks.length ? <Empty>Жинақтарда әзірге есеп жоқ.</Empty> : (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 720 }}>
            <thead><tr>
              <th>Есеп</th><th>Деңгей</th><th className={styles.num}>Жинақ</th><th className={styles.num}>Автор</th>
            </tr></thead>
            <tbody>
              {data.popular_tasks.slice(0, 30).map((task) => (
                <tr key={task.bank_task_id}>
                  <td>
                    <div className={styles.cellMain}>
                      {task.text_preview ? <MathRender latex={task.text_preview} /> : `Есеп №${task.bank_task_id}`}
                    </div>
                    <div className={styles.cellSub}>
                      #{task.bank_task_id}{task.topics.length ? ` · ${task.topics.join(", ")}` : ""}
                      {task.sources.length ? ` · ${task.sources.join(", ")}` : ""}
                    </div>
                  </td>
                  <td>{DIFFICULTY_LABELS[task.difficulty ?? ""] ?? task.difficulty}</td>
                  <td className={styles.num}>
                    <ShareBar share={summary.non_empty_collections ? task.collections_count / summary.non_empty_collections : null}
                      label={formatNumber(task.collections_count)} />
                  </td>
                  <td className={styles.num}>{formatNumber(task.authors_count)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>

    <Card title="Соңғы жинақтар" hint="Осы кезеңде жасалған, өзгерген немесе жүктелген жинақтар.">
      {!data.recent_collections.length ? <Empty>Бұл кезеңде жинақпен ешкім жұмыс істемеген.</Empty> : (
        <div className={styles.tableWrap}>
          <table className={styles.table} style={{ minWidth: 820 }}>
            <thead><tr>
              <th>Жинақ</th><th>Автор</th><th className={styles.num}>Есеп</th><th>Безендіру</th>
              <th className={styles.num}>Жүктеу</th><th className={styles.num}>Өзгертілді</th>
            </tr></thead>
            <tbody>
              {data.recent_collections.slice(0, 50).map((collection) => {
                const design = [
                  collection.header_text ? "PDF жазуы" : null,
                  collection.has_title_image ? "титул" : null,
                  collection.has_background_image ? "фон" : null,
                ].filter(Boolean).join(", ");
                return (
                  <tr key={collection.collection_id}>
                    <td>
                      <div className={styles.cellMain}>{collection.title}</div>
                      {collection.header_text && <div className={styles.cellSub}>{collection.header_text}</div>}
                    </td>
                    <td>
                      {collection.nickname || `#${collection.user_id}`}
                      {data.emails_visible && collection.email && <div className={styles.cellSub}>{collection.email}</div>}
                    </td>
                    <td className={styles.num}>{formatNumber(collection.task_count)}</td>
                    <td>
                      <div>{collection.pptx_font}</div>
                      <div className={styles.cellSub}>{design || "өз суреті жоқ"}</div>
                    </td>
                    <td className={styles.num} title={`Барлық уақытта: ${formatNumber(collection.total_downloads)}`}>
                      {collection.downloads ? formatNumber(collection.downloads) : <span className={styles.muted}>—</span>}
                    </td>
                    <td className={styles.num} title={formatDateTime(collection.updated_at)}>{formatAgo(collection.updated_at)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  </>;
}
