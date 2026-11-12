"use client";

import { useId, type ReactNode } from "react";
import Icon from "@/components/ui/Icon";
import styles from "../Statistics.module.css";
import { formatNumber, type Delta } from "./format";
import { VIZ } from "./palette";

/** A short definition behind an info button; opens on hover, focus and tap. */
export function Hint({ text, align }: { text: string; align?: "left" }) {
  const id = useId();
  return (
    <span className={styles.hint} data-align={align}>
      <button type="button" className={styles.hintButton} aria-label="Түсіндірме" aria-describedby={id}>
        <Icon name="info" variant="outline" size={14} />
      </button>
      <span id={id} role="tooltip" className={styles.hintBody}>{text}</span>
    </span>
  );
}

/** Direction is carried by the arrow and, for screen readers, by a word; never by colour alone. */
export function DeltaBadge({ delta }: { delta: Delta }) {
  if (delta.tone === "flat") return <span className={styles.delta} data-tone="flat">{delta.text}</span>;
  const up = delta.tone === "up";
  return (
    <span className={styles.delta} data-tone={delta.tone}>
      <span aria-hidden="true">{up ? "▲" : "▼"}</span>
      <span className="sr-only">{up ? "өсті:" : "азайды:"}</span>
      {delta.text}
    </span>
  );
}

/** Trend of one figure across the period; the title of the tile says what it is. */
export function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) return <div className={styles.spark} aria-hidden="true" />;
  const max = Math.max(...values, 0);
  const x = (index: number) => (index / (values.length - 1)) * 100;
  const y = (value: number) => (max > 0 ? 30 - (value / max) * 28 : 30);
  const line = values.map((value, index) => `${index ? "L" : "M"}${x(index).toFixed(2)} ${y(value).toFixed(2)}`).join(" ");
  return (
    <svg className={styles.spark} viewBox="0 0 100 32" preserveAspectRatio="none" aria-hidden="true">
      <path d={`${line} L100 32 L0 32 Z`} fill={VIZ.primary} fillOpacity={0.1} />
      <path d={line} fill="none" stroke={VIZ.primary} strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

type StatTileProps = {
  label: string;
  hint?: string;
  value: ReactNode;
  unit?: string;
  delta?: Delta | null;
  /** What the delta compares with, e.g. "алдыңғы 30 күн". */
  comparedWith?: string | null;
  note?: ReactNode;
  /** A trend across the period, for counts. */
  spark?: number[];
  /** A 0..1 share drawn as a meter, for figures that are a ratio. */
  meter?: number | null;
};

export function StatTile({ label, hint, value, unit, delta, comparedWith, note, spark, meter }: StatTileProps) {
  return (
    <div className={styles.tile}>
      <div className={styles.tileLabel}><span>{label}</span>{hint && <Hint text={hint} />}</div>
      <div className={styles.tileValue}>{value}{unit && <small>{unit}</small>}</div>
      <div className={styles.tileMeta}>
        {delta && <DeltaBadge delta={delta} />}
        {delta && comparedWith && <span>{comparedWith}</span>}
        {note}
      </div>
      {/* Always a fourth row, so label, value and footer line up across the tiles of a row. */}
      <div className={styles.tileFoot}>
        {spark ? <Sparkline values={spark} /> : meter !== undefined ? (
          <div className={styles.meterTrack} aria-hidden="true">
            <i className={styles.meterFill} style={{ width: `${Math.max(0, Math.min(1, meter ?? 0)) * 100}%`, background: VIZ.primary }} />
          </div>
        ) : null}
      </div>
    </div>
  );
}

type CardProps = { title: string; hint?: ReactNode; actions?: ReactNode; className?: string; children: ReactNode };

export function Card({ title, hint, actions, className = "", children }: CardProps) {
  return (
    <section className={`${styles.card} ${className}`}>
      <header className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>{title}</h2>
          {hint && <p className={styles.cardHint}>{hint}</p>}
        </div>
        {actions && <div className={styles.cardActions}>{actions}</div>}
      </header>
      {children}
    </section>
  );
}

export type LegendEntry = { name: string; color: string; line?: boolean };

export function Legend({ items }: { items: LegendEntry[] }) {
  return (
    <div className={styles.legend}>
      {items.map((item) => (
        <span key={item.name} className={styles.legendItem}>
          <i className={item.line ? styles.swatchLine : styles.swatch} style={{ background: item.color }} />
          {item.name}
        </span>
      ))}
    </div>
  );
}

type MeterProps = { name: ReactNode; sub?: ReactNode; share: number | null; figure: ReactNode; note?: ReactNode; color?: string };

/** One row of a meter list: a name, a bar against the shared limit and its figure. */
export function Meter({ name, sub, share, figure, note, color = VIZ.primary }: MeterProps) {
  const width = share === null ? 0 : Math.max(0, Math.min(1, share)) * 100;
  return (
    <div className={styles.meter}>
      <div className={styles.meterName}>{name}{sub && <small>{sub}</small>}</div>
      <div className={styles.meterTrack} aria-hidden="true">
        <i className={styles.meterFill} style={{ width: `${width}%`, background: color, minWidth: width > 0 ? 3 : 0 }} />
      </div>
      <div className={styles.meterFigure}>{figure}{note && <small>{note}</small>}</div>
    </div>
  );
}

export function Empty({ children }: { children: ReactNode }) {
  return <p className={styles.empty}>{children}</p>;
}

export type SortState<Key extends string> = { key: Key; descending: boolean };

type SortHeaderProps<Key extends string> = {
  label: string;
  column: Key;
  sort: SortState<Key>;
  onSort: (next: SortState<Key>) => void;
  numeric?: boolean;
  hint?: string;
};

export function SortHeader<Key extends string>({ label, column, sort, onSort, numeric, hint }: SortHeaderProps<Key>) {
  const active = sort.key === column;
  return (
    <th className={numeric ? styles.num : undefined} aria-sort={active ? (sort.descending ? "descending" : "ascending") : undefined} title={hint}>
      <button type="button" className={styles.sort} data-active={active}
        onClick={() => onSort({ key: column, descending: active ? !sort.descending : true })}>
        {label}
        <Icon name={active && !sort.descending ? "chevronUp" : "chevronDown"} variant="outline" size={11} style={{ opacity: active ? 1 : 0.35 }} />
      </button>
    </th>
  );
}

/** Sorts by a number or text; missing values always go last. */
export function sortRows<Row>(rows: Row[], value: (row: Row) => number | string | null | undefined, descending: boolean): Row[] {
  return [...rows].sort((a, b) => {
    const left = value(a);
    const right = value(b);
    const leftMissing = left === null || left === undefined || left === "";
    const rightMissing = right === null || right === undefined || right === "";
    if (leftMissing || rightMissing) return leftMissing === rightMissing ? 0 : leftMissing ? 1 : -1;
    const order = typeof left === "number" && typeof right === "number"
      ? left - right
      : String(left).localeCompare(String(right), "kk");
    return descending ? -order : order;
  });
}

/** Keeps the page inside the list after a filter or a new period shortens it. */
export const clampPage = (page: number, total: number, pageSize: number): number =>
  Math.max(0, Math.min(page, Math.ceil(total / pageSize) - 1));

type PagerProps = { page: number; pageSize: number; total: number; onPage: (page: number) => void };

export function Pager({ page, pageSize, total, onPage }: PagerProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total <= pageSize) return null;
  const first = page * pageSize + 1;
  const last = Math.min(total, (page + 1) * pageSize);
  return (
    <div className={styles.pager}>
      <span>{formatNumber(first)}–{formatNumber(last)} / {formatNumber(total)}</span>
      <div className={styles.pagerButtons}>
        <button type="button" className={`${styles.button} ${styles.buttonSmall}`} disabled={page === 0} onClick={() => onPage(page - 1)}>
          <Icon name="chevronLeft" variant="outline" size={12} /> Алдыңғы
        </button>
        <span>{page + 1} / {pages}</span>
        <button type="button" className={`${styles.button} ${styles.buttonSmall}`} disabled={page >= pages - 1} onClick={() => onPage(page + 1)}>
          Келесі <Icon name="chevronRight" variant="outline" size={12} />
        </button>
      </div>
    </div>
  );
}

/** A share as a small bar with its percentage, for table cells. */
export function ShareBar({ share, label, color = VIZ.primary }: { share: number | null; label: string; color?: string }) {
  return (
    <span className={styles.bar}>
      <span>{label}</span>
      <span className={styles.barTrack} aria-hidden="true">
        {share !== null && <i className={styles.barFill} style={{ width: `${Math.max(0, Math.min(1, share)) * 100}%`, background: color }} />}
      </span>
    </span>
  );
}
