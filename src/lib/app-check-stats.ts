import type { ChartDay } from "./stats";

// Pure helpers for the App Check view. Data: `statistics/appCheck/daily/
// {dayKey}`, one document per UTC day, written hourly by the
// countAppCheckRejections Cloud Function from Cloud Logging (see
// ../tripletalk/docs/functions/STATISTICS.md). Cloud Logging keeps 30 days,
// so older days exist only if they were counted while still in the logs.

export const MAX_FUNCTION_SERIES = 7;

export interface AppCheckDay {
  dayKey: string;
  rejections: number;
  bursts: number;
  byFunction: Record<string, number>;
  byPlatform: Record<string, number>;
  byAppVersion: Record<string, number>;
  firstAt: Date | null;
  lastAt: Date | null;
  countedAt: Date | null;
}

/** Cloud Run service names are lower case; known callables get their
 * exported name back. */
const FUNCTION_NAMES: Record<string, string> = {
  initializeusermonetization: "initializeUserMonetization",
  registerdevice: "registerDevice",
  signoutdevice: "signOutDevice",
  importcommonflashcardcollection: "importCommonFlashcardCollection",
  schoolsetrole: "schoolSetRole",
};

export const PLATFORMS: Record<string, string> = {
  android: "Android",
  ios: "iOS",
};

export function functionLabel(serviceName: string): string {
  return FUNCTION_NAMES[serviceName] || serviceName;
}

function count(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function countMap(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .map(([key, item]) => [key, count(item)] as const)
      .filter(([, item]) => item > 0),
  );
}

export function mapAppCheckDay(
  dayKey: string,
  data: Record<string, unknown>,
  toDate: (value: unknown) => Date | null,
): AppCheckDay {
  return {
    dayKey,
    rejections: count(data.rejections),
    bursts: count(data.bursts),
    byFunction: countMap(data.byFunction),
    byPlatform: countMap(data.byPlatform),
    byAppVersion: countMap(data.byAppVersion),
    firstAt: toDate(data.firstAt),
    lastAt: toDate(data.lastAt),
    countedAt: toDate(data.countedAt),
  };
}

function addCounts(
  target: Record<string, number>,
  source: Record<string, number>,
): void {
  for (const [key, value] of Object.entries(source)) {
    target[key] = (target[key] || 0) + value;
  }
}

export interface AppCheckSummary {
  rejections: number;
  bursts: number;
  daysWithRejections: number;
  /** Days of the range the function has counted. */
  countedDays: number;
  byFunction: Record<string, number>;
  byPlatform: Record<string, number>;
  byAppVersion: Record<string, number>;
  lastRejectionAt: Date | null;
  /** Latest count of any day: how fresh the data is. */
  countedAt: Date | null;
}

export function summarizeAppCheck(days: AppCheckDay[]): AppCheckSummary {
  const summary: AppCheckSummary = {
    rejections: 0,
    bursts: 0,
    daysWithRejections: 0,
    countedDays: days.length,
    byFunction: {},
    byPlatform: {},
    byAppVersion: {},
    lastRejectionAt: null,
    countedAt: null,
  };
  const later = (a: Date | null, b: Date | null) =>
    !a || (b && b.getTime() > a.getTime()) ? b : a;
  for (const day of days) {
    summary.rejections += day.rejections;
    summary.bursts += day.bursts;
    if (day.rejections) summary.daysWithRejections += 1;
    addCounts(summary.byFunction, day.byFunction);
    addCounts(summary.byPlatform, day.byPlatform);
    addCounts(summary.byAppVersion, day.byAppVersion);
    summary.lastRejectionAt = later(summary.lastRejectionAt, day.lastAt);
    summary.countedAt = later(summary.countedAt, day.countedAt);
  }
  return summary;
}

/** Keys by count, largest first (ties by name), so table and chart agree. */
export function rankedKeys(counts: Record<string, number>): string[] {
  return Object.keys(counts).sort(
    (a, b) => counts[b] - counts[a] || a.localeCompare(b),
  );
}

/** App versions newest first, compared part by part as numbers (1.0.10
 * after 1.0.9); versions that are not numbers ("unknown") go last. */
export function versionKeys(counts: Record<string, number>): string[] {
  const parts = (version: string) =>
    /^\d+(\.\d+)*$/.test(version) ? version.split(".").map(Number) : null;
  return Object.keys(counts).sort((a, b) => {
    const left = parts(a);
    const right = parts(b);
    if (!left || !right) {
      return left ? -1 : right ? 1 : a.localeCompare(b);
    }
    for (let index = 0; index < Math.max(left.length, right.length); index++) {
      const difference = (right[index] || 0) - (left[index] || 0);
      if (difference) return difference;
    }
    return 0;
  });
}

/** Labels for a breakdown table: every key that occurs, in `order` (by
 * default largest first). */
export function breakdownLabels(
  counts: Record<string, number>,
  label: (key: string) => string,
  order: (counts: Record<string, number>) => string[] = rankedKeys,
): Record<string, string> {
  return Object.fromEntries(order(counts).map((key) => [key, label(key)]));
}

/** Chart days stacked by function (the most frequent ones; the rest as
 * Other). Days the function has not counted yet are shown as "No data". */
export function buildAppCheckChart(
  dayKeys: string[],
  days: AppCheckDay[],
  series: string[],
  todayKey: string,
  otherSeries: string,
): ChartDay[] {
  const byKey = new Map(days.map((day) => [day.dayKey, day]));
  return dayKeys.map((dayKey) => {
    const day = byKey.get(dayKey);
    const segments = new Map<string, number>();
    for (const [name, value] of Object.entries(day?.byFunction || {})) {
      const key = series.includes(name) ? name : otherSeries;
      segments.set(key, (segments.get(key) || 0) + value);
    }
    return {
      dayKey,
      live: dayKey === todayKey,
      aggregated: Boolean(day),
      unpriced: false,
      total: day?.rejections || 0,
      segments: [...series, otherSeries]
        .filter((name) => segments.get(name))
        .map((name) => ({ series: name, value: segments.get(name) || 0 })),
    };
  });
}
