// Shared helpers of the admin statistics views: the daily bar chart data,
// breakdown tables and UTC day boundaries.

export interface ChartDay {
  dayKey: string;
  /** Incomplete day (still being counted). */
  live: boolean;
  /** Whether the day has data at all; false days are shown as "No data". */
  aggregated: boolean;
  total: number;
  /** Part of the total could not be priced (cost charts only). */
  unpriced: boolean;
  segments: Array<{ series: string; value: number }>;
}

export const OTHER_SERIES = "Other";

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export interface BreakdownRow {
  key: string;
  label: string;
  count: number;
  /** Share of `total`, 0–1; null when the total is 0. */
  share: number | null;
}

/** Rows for known values plus a remainder row ("Other or not set") so the
 * table always adds up to `total`. */
export function breakdownRows(
  counts: Record<string, number>,
  labels: Record<string, string>,
  total: number,
  remainderLabel = "Other or not set",
): BreakdownRow[] {
  const rows = Object.entries(labels).map(([key, label]) => ({
    key,
    label,
    count: nonNegative(counts[key] || 0),
  }));
  const known = rows.reduce((sum, item) => sum + item.count, 0);
  const remainder = nonNegative(total - known);
  if (remainder) {
    rows.push({ key: "other", label: remainderLabel, count: remainder });
  }
  return rows.map((item) => ({
    ...item,
    share: total > 0 ? item.count / total : null,
  }));
}

/** One single-series chart day per day key; today is marked incomplete. */
export function buildDailyCountChart(
  dayKeys: string[],
  counts: number[],
  todayKey: string,
  series: string,
): ChartDay[] {
  return dayKeys.map((dayKey, index) => {
    const total = nonNegative(counts[index] || 0);
    return {
      dayKey,
      live: dayKey === todayKey,
      aggregated: true,
      unpriced: false,
      total,
      segments: total ? [{ series, value: total }] : [],
    };
  });
}

export function utcDayStart(dayKey: string): Date {
  return new Date(`${dayKey}T00:00:00.000Z`);
}
