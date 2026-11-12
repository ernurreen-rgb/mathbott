import type {
  JourneyStepKey, StatisticsBucket, StatisticsGranularity, StatisticsKpi, StatisticsPeriod, StatisticsPeriodKey,
} from "@/types";

const MONTHS = ["қаң", "ақп", "нау", "сәу", "мам", "мау", "шіл", "там", "қыр", "қаз", "қар", "жел"];
export const WEEKDAYS_SHORT = ["Дс", "Сс", "Ср", "Бс", "Жм", "Сб", "Жс"];
export const WEEKDAYS = ["Дүйсенбі", "Сейсенбі", "Сәрсенбі", "Бейсенбі", "Жұма", "Сенбі", "Жексенбі"];

export const PERIODS: Array<{ key: StatisticsPeriodKey; label: string }> = [
  { key: "7d", label: "7 күн" },
  { key: "30d", label: "30 күн" },
  { key: "90d", label: "90 күн" },
  { key: "all", label: "Барлық уақыт" },
];

export const JOURNEY_LABELS: Record<JourneyStepKey, { label: string; hint: string }> = {
  registered: { label: "Тіркелді", hint: "Осы кезеңде тіркелген оқушылар" },
  answered: { label: "Есеп шығарып көрді", hint: "Модульдегі кемінде бір есепке жауап берді" },
  completed_mini_lesson: { label: "Мини-сабақ аяқтады", hint: "Кемінде бір мини-сабақтың барлық есебін шығарды" },
  returned: { label: "Қайта оралды", hint: "Кемінде екі түрлі күні оқыды" },
  trial_test: { label: "Сынақ тест тапсырды", hint: "Кемінде бір сынақ тестін аяқтады" },
};

export const ACTIVE_DAY_LABELS: Record<string, string> = { "1": "1 күн", "2-3": "2–3 күн", "4-7": "4–7 күн", "8+": "8 күн және одан көп" };
export const DIFFICULTY_LABELS: Record<string, string> = { A: "A — жеңіл", B: "B — орташа", C: "C — күрделі", "": "Деңгейі жоқ" };
export const questionTypeLabel = (type: string) =>
  ({ input: "Жазбаша", tf: "Шын / Жалған", mcq: "4 нұсқа", mcq6: "6 нұсқа", select: "Сәйкестендіру" })[type] || type;
export const QUIZ_STATUS_LABELS: Record<string, string> = { lobby: "Күту залы", in_progress: "Жүріп жатыр", finished: "Аяқталды" };

/**
 * Thousands separated by a non-breaking space, decimal comma. Written by hand because
 * Chromium formats "kk-KZ" numbers with English separators.
 */
export function formatNumber(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  const [whole, fraction] = String(Math.abs(value)).split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, "\u00a0");
  return `${value < 0 ? "−" : ""}${grouped}${fraction ? `,${fraction}` : ""}`;
}

/** A 0..1 share as a percentage; one decimal only when asked for. */
export function formatPercent(value: number | null | undefined, digits = 0): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${(value * 100).toFixed(digits).replace(".", ",")}%`;
}

function parseDay(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

export function formatDay(value: string, withYear = false): string {
  const day = parseDay(value);
  return `${day.getDate()} ${MONTHS[day.getMonth()]}${withYear ? ` ${day.getFullYear()}` : ""}`;
}

export function formatDayRange(start: string, end: string): string {
  const first = parseDay(start);
  const last = parseDay(end);
  const sameYear = first.getFullYear() === last.getFullYear();
  if (start === end) return formatDay(start, true);
  if (sameYear && first.getMonth() === last.getMonth()) return `${first.getDate()}–${formatDay(end, true)}`;
  return `${formatDay(start, !sameYear)} – ${formatDay(end, true)}`;
}

/** Axis label of a series bucket; the tooltip shows the full range. */
export function bucketLabel(bucket: StatisticsBucket, granularity: StatisticsGranularity): string {
  if (granularity === "month") {
    const day = parseDay(bucket.start);
    return `${MONTHS[day.getMonth()]} ${day.getFullYear()}`;
  }
  return formatDay(bucket.start);
}

export function bucketTitle(bucket: StatisticsBucket, granularity: StatisticsGranularity): string {
  if (granularity === "day") {
    const day = parseDay(bucket.start);
    return `${formatDay(bucket.start, true)}, ${WEEKDAYS[(day.getDay() + 6) % 7].toLowerCase()}`;
  }
  return formatDayRange(bucket.start, bucket.end);
}

/** What one bar or point of a series stands for, and the heading of that column in a table view. */
export const BUCKET_NAMES: Record<StatisticsGranularity, { noun: string; column: string }> = {
  day: { noun: "күн", column: "Күні" },
  week: { noun: "апта", column: "Апта" },
  month: { noun: "ай", column: "Ай" },
};

export function describePeriod(period: StatisticsPeriod): string {
  if (!period.start) return `Барлық уақыт, ${formatDay(period.end, true)} күніне дейін`;
  return formatDayRange(period.start, period.end);
}

export function previousPeriodLabel(period: StatisticsPeriod): string | null {
  return period.days ? `алдыңғы ${period.days} күн` : null;
}

export type DeltaTone = "up" | "down" | "flat";
/** `text` is the size of the change without a sign; the tone says which way it went. */
export type Delta = { text: string; tone: DeltaTone };

/** Change against the previous period: percent for counts, percentage points for shares. */
export function describeDelta(kpi: StatisticsKpi<number | null>, kind: "count" | "share"): Delta | null {
  const { value, previous } = kpi;
  if (previous === null || previous === undefined || value === null || value === undefined) return null;
  const difference = value - previous;
  if (kind === "share") {
    const points = Math.round(difference * 1000) / 10;
    if (points === 0) return { text: "өзгеріссіз", tone: "flat" };
    return { text: `${Math.abs(points).toFixed(1).replace(".", ",")} п.п.`, tone: points > 0 ? "up" : "down" };
  }
  if (difference === 0) return { text: "өзгеріссіз", tone: "flat" };
  if (previous === 0) return { text: formatNumber(Math.abs(difference)), tone: "up" };
  const percent = Math.abs(difference / previous) * 100;
  const shown = percent >= 1000 ? `${(percent / 100 + 1).toFixed(1).replace(".", ",")}×` : `${Math.round(percent)}%`;
  return { text: shown, tone: difference > 0 ? "up" : "down" };
}

export const formatClock = (date: Date): string =>
  `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}, ${formatClock(date)}`;
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
}

/** "5 мин бұрын", "кеше", then a date: how long ago a student was last seen. */
export function formatAgo(value: string | null | undefined, now: number = Date.now()): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  const minutes = Math.floor((now - date.getTime()) / 60000);
  if (minutes < 2) return "қазір";
  if (minutes < 60) return `${minutes} мин бұрын`;
  const today = new Date(now);
  const dayDifference = Math.round(
    (new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      - new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()) / 86400000,
  );
  if (dayDifference === 0) return `${Math.floor(minutes / 60)} сағ бұрын`;
  if (dayDifference === 1) return "кеше";
  if (dayDifference < 31) return `${dayDifference} күн бұрын`;
  return formatDate(value);
}

/** Opens a CSV in Excel with Cyrillic intact (UTF-8 BOM, semicolon-free quoting). */
export function downloadCsv(filename: string, header: string[], rows: Array<Array<string | number | null | undefined>>): void {
  const cell = (value: string | number | null | undefined) => {
    const text = value === null || value === undefined ? "" : String(value);
    // A leading formula character would be executed by spreadsheet apps.
    const safe = /^[=+\-@\t\r]/.test(text) && typeof value === "string" ? `'${text}` : text;
    return /[",\n\r]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const content = [header, ...rows].map((row) => row.map(cell).join(",")).join("\r\n");
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type: "text/csv;charset=utf-8" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
