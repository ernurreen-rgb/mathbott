"use client";

import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
  type BarShapeProps, type TooltipContentProps,
} from "recharts";
import type { HeatmapCell } from "@/types";
import styles from "../Statistics.module.css";
import { formatNumber, WEEKDAYS, WEEKDAYS_SHORT } from "./format";
import { heatColor, VIZ } from "./palette";
import { Empty, Legend } from "./primitives";

export type ChartSeries = { key: string; name: string; color: string };
/** One x position: an axis label, a longer tooltip title and a number per series key. */
export type ChartRow = { label: string; title: string; note?: string | null } & Record<string, number | string | null | undefined>;

type BucketChartProps = {
  /** Names the chart for assistive technology and heads its table view. */
  title: string;
  subtitle?: string;
  rows: ChartRow[];
  series: ChartSeries[];
  kind: "columns" | "line";
  height?: number;
  format?: (value: number) => string;
  /** Heading of the first table column, e.g. "Күні". */
  axisName?: string;
  emptyText?: string;
};

const AXIS_TICK = { fill: VIZ.muted, fontSize: 11 };

/** Stacked segments keep a 2px gap and only the top one is rounded, so the stack reads as one bar. */
function segmentShape(keys: string[], position: number) {
  return function Segment({ x, y, width, height, fill, payload }: BarShapeProps) {
    const left = Number(x), top = Number(y), wide = Number(width), tall = Number(height);
    if (!(wide > 0) || !(tall > 0)) return <g />;
    const covered = keys.slice(position + 1).some((key) => Number(payload?.[key]) > 0);
    if (covered) {
      const gap = tall > 3 ? 2 : 0;
      return <rect x={left} y={top + gap} width={wide} height={tall - gap} fill={fill} />;
    }
    const radius = Math.min(4, wide / 2, tall);
    const right = left + wide, bottom = top + tall;
    return (
      <path fill={fill} d={`M${left} ${bottom}V${top + radius}Q${left} ${top} ${left + radius} ${top}H${right - radius}Q${right} ${top} ${right} ${top + radius}V${bottom}Z`} />
    );
  };
}

function ChartTooltip({ active, payload, series, format }: TooltipContentProps<number, string> & {
  series: ChartSeries[];
  format: (value: number) => string;
}) {
  const row = payload?.[0]?.payload as ChartRow | undefined;
  if (!active || !row) return null;
  return (
    <div className={styles.tooltip}>
      <div className={styles.tooltipTitle}>{row.title}</div>
      {series.map((item) => (
        <div key={item.key} className={styles.tooltipRow}>
          <span><i className={styles.swatchLine} style={{ background: item.color }} />{item.name}</span>
          <strong>{format(Number(row[item.key] ?? 0))}</strong>
        </div>
      ))}
      {row.note && <div className={styles.tooltipNote}>{row.note}</div>}
    </div>
  );
}

/** Columns (stacked when there are several series) or a line over the buckets of the period. */
export function BucketChart({ title, subtitle, rows, series, kind, height = 220, format = formatNumber, axisName = "Кезең", emptyText }: BucketChartProps) {
  const [asTable, setAsTable] = useState(false);
  const keys = series.map((item) => item.key);
  const hasData = rows.some((row) => keys.some((key) => Number(row[key]) > 0));
  const tooltip = (props: TooltipContentProps<number, string>) => <ChartTooltip {...props} series={series} format={format} />;
  const axes = <>
    <CartesianGrid vertical={false} stroke={VIZ.grid} />
    <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: VIZ.axis }} tick={AXIS_TICK} tickMargin={7}
      interval="preserveStartEnd" minTickGap={26} />
    <YAxis width={38} tickLine={false} axisLine={false} tick={AXIS_TICK} allowDecimals={false} tickCount={4}
      tickFormatter={(value: number) => formatNumber(value)} />
  </>;
  return (
    <figure className={styles.chart}>
      <figcaption className={styles.cardHeader} style={{ marginBottom: 8 }}>
        <div className={styles.chartCaption} style={{ margin: 0 }}>{title}{subtitle && <span>{subtitle}</span>}</div>
        <div className={styles.cardActions}>
          {series.length > 1 && <Legend items={series.map((item) => ({ name: item.name, color: item.color, line: kind === "line" }))} />}
          {hasData && <button type="button" className={`${styles.button} ${styles.buttonSmall}`} aria-pressed={asTable}
            onClick={() => setAsTable((current) => !current)}>{asTable ? "График" : "Кесте"}</button>}
        </div>
      </figcaption>
      {!hasData ? <Empty>{emptyText || "Бұл кезеңде дерек жоқ."}</Empty> : asTable ? (
        <div className={styles.tableWrap} style={{ maxHeight: height + 60, overflowY: "auto" }}>
          <table className={styles.table}>
            <thead><tr><th>{axisName}</th>{series.map((item) => <th key={item.key} className={styles.num}>{item.name}</th>)}</tr></thead>
            <tbody>{rows.map((row) => (
              <tr key={row.title}><td>{row.title}</td>{series.map((item) => <td key={item.key} className={styles.num}>{format(Number(row[item.key] ?? 0))}</td>)}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : (
        <div role="group" aria-label={title}>
          <ResponsiveContainer width="100%" height={height}>
            {kind === "columns" ? (
              <BarChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} barCategoryGap="22%">
                {axes}
                <Tooltip content={tooltip} cursor={{ fill: VIZ.primary, fillOpacity: 0.06 }} isAnimationActive={false} />
                {series.map((item, position) => (
                  <Bar key={item.key} dataKey={item.key} name={item.name} stackId="stack" fill={item.color} maxBarSize={24}
                    isAnimationActive={false} shape={segmentShape(keys, position)} />
                ))}
              </BarChart>
            ) : (
              <AreaChart data={rows} margin={{ top: 8, right: 4, bottom: 0, left: 0 }}>
                {axes}
                <Tooltip content={tooltip} cursor={{ stroke: VIZ.axis, strokeWidth: 1 }} isAnimationActive={false} />
                {series.map((item) => (
                  <Area key={item.key} type="linear" dataKey={item.key} name={item.name} stroke={item.color} strokeWidth={2}
                    strokeLinejoin="round" strokeLinecap="round" fill={item.color} fillOpacity={series.length === 1 ? 0.1 : 0}
                    dot={false} activeDot={{ r: 4, stroke: "#ffffff", strokeWidth: 2 }} isAnimationActive={false} />
                ))}
              </AreaChart>
            )}
          </ResponsiveContainer>
        </div>
      )}
    </figure>
  );
}

const HOURS = Array.from({ length: 24 }, (_, hour) => hour);
const hourRange = (hour: number) => `${String(hour).padStart(2, "0")}:00–${String((hour + 1) % 24).padStart(2, "0")}:00`;

type HeatmapProps = { cells: HeatmapCell[]; unit: string };

/** Answers by weekday and hour in the viewer's time zone; darker means more. */
export function Heatmap({ cells, unit }: HeatmapProps) {
  const [asTable, setAsTable] = useState(false);
  const counts = new Map(cells.map((cell) => [`${cell.weekday}:${cell.hour}`, cell.count]));
  const max = Math.max(0, ...cells.map((cell) => cell.count));
  const peak = cells.reduce<HeatmapCell | null>((best, cell) => (!best || cell.count > best.count ? cell : best), null);
  if (!max || !peak) return <Empty>Бұл кезеңде жауап берілмеген.</Empty>;
  return (
    <div>
      <div className={styles.cardHeader} style={{ marginBottom: 10 }}>
        <p className={styles.note}>
          Ең белсенді уақыт: <strong style={{ color: VIZ.ink }}>{WEEKDAYS[peak.weekday].toLowerCase()}, {hourRange(peak.hour)}</strong> — {formatNumber(peak.count)} {unit}
        </p>
        <button type="button" className={`${styles.button} ${styles.buttonSmall}`} aria-pressed={asTable}
          onClick={() => setAsTable((current) => !current)}>{asTable ? "Карта" : "Кесте"}</button>
      </div>
      {asTable ? (
        <div className={styles.tableWrap} style={{ maxHeight: 320, overflowY: "auto" }}>
          <table className={styles.table}>
            <thead><tr><th>Сағат</th>{WEEKDAYS_SHORT.map((day, index) => <th key={day} className={styles.num} title={WEEKDAYS[index]}>{day}</th>)}</tr></thead>
            <tbody>{HOURS.map((hour) => (
              <tr key={hour}><td>{hourRange(hour)}</td>{WEEKDAYS_SHORT.map((day, weekday) => (
                <td key={day} className={styles.num}>{formatNumber(counts.get(`${weekday}:${hour}`) ?? 0)}</td>
              ))}</tr>
            ))}</tbody>
          </table>
        </div>
      ) : <>
        <div className={styles.heatmap} role="img" aria-label={`Апта күні мен сағат бойынша ${unit}. Толық сандар кесте көрінісінде.`}>
          <span />
          {HOURS.map((hour) => <span key={hour} className={styles.heatHour}>{hour % 3 === 0 ? hour : ""}</span>)}
          {WEEKDAYS_SHORT.map((day, weekday) => [
            <span key={day} className={styles.heatLabel} title={WEEKDAYS[weekday]}>{day}</span>,
            ...HOURS.map((hour) => {
              const count = counts.get(`${weekday}:${hour}`) ?? 0;
              return (
                <div key={`${weekday}:${hour}`} className={styles.heatCell} style={{ background: heatColor(count, max) }}>
                  <span>{WEEKDAYS[weekday]}, {hourRange(hour)}<br /><strong>{formatNumber(count)}</strong> {unit}</span>
                </div>
              );
            }),
          ])}
        </div>
        <div className={styles.heatScale} aria-hidden="true">
          аз{VIZ.heat.map((color) => <i key={color} style={{ background: color }} />)}көп
        </div>
      </>}
    </div>
  );
}
