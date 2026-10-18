import { OTHER_SERIES, type ChartDay } from "./stats";
import { shiftDayKey } from "./function-stats";

// Pure helpers for the AI Limits & Errors view: limit refusals, final
// failures, trigger retries and moderation rejections recorded by the
// backend since 2026-10-18. Data layout: tripletalk/docs/functions/STATISTICS.md
// ("Limity, błędy i ponowienia"). Day keys are UTC dates (YYYY-MM-DD).
//
// `count` is the number of items (one user can produce many). `users` is the
// number of distinct users on one day and is never added up across days.

/** First UTC day with outcome data; earlier days have no outcome fields. */
export const OUTCOMES_SINCE = "2026-10-18";

export const OUTCOME_KINDS = [
  "limit",
  "failure",
  "retry",
  "moderation",
] as const;
export type OutcomeKind = (typeof OUTCOME_KINDS)[number];

export type OutcomeCounter =
  "limitRefusals" | "failures" | "retries" | "moderationRejections";

export const OUTCOME_COUNTERS: Record<OutcomeKind, OutcomeCounter> = {
  limit: "limitRefusals",
  failure: "failures",
  retry: "retries",
  moderation: "moderationRejections",
};

export interface CodeCount {
  count: number;
  users: number;
}

export type ByOutcome = Record<OutcomeKind, Record<string, CodeCount>>;

export type OutcomeCounters = Record<OutcomeCounter, number>;

export interface OutcomeTotals extends OutcomeCounters {
  byOutcome: ByOutcome;
}

export interface OutcomeDay {
  dayKey: string;
  /** Built in the browser from raw events (day not aggregated yet). */
  live: boolean;
  /** False for days aggregated before outcomes were recorded ("No data"). */
  hasData: boolean;
  totals: OutcomeTotals;
}

export interface OutcomeFunctionRow extends OutcomeDay {
  functionName: string;
  /** Gemini responses plus TTS syntheses of the function on that day. */
  calls: number;
}

// Readable names. Codes missing here are shown raw.
const LIMIT_LABELS: Record<string, string> = {
  tts_daily_limit: "Daily limit of new recording characters per user",
  text_too_long: "Text to record too long",
  input_too_long: "Flashcard too large for AI enrichment",
  daily_failure_limit: "Too many failed enrichments in one day",
  insufficient_ai_credits: "No AI credits left",
  lexiai_daily_analysis: "Daily TripleTalk AI photo analysis limit",
  lesson_flashcard_limit: "Lesson full (adding flashcards from a photo)",
};

const FAILURE_LABELS: Record<string, string> = {
  generation_failed: "AI did not enrich the flashcard",
  lexiai_analysis_failed: "Photo analysis failed",
  audio_tts_failed: "School flashcard recording failed",
  audio_text_missing: "School flashcard has no text to record",
  retry_window_exceeded: "Retried for an hour without success",
  moderation_failed_open: "Moderation failed, content passed unchecked",
};

const RETRY_LABELS: Record<string, string> = {
  resource_exhausted: "Google API quota (e.g. TTS per minute)",
  aborted: "Write conflict, many flashcards at once",
  unavailable: "Service temporarily unavailable",
};

const MODERATION_LABELS: Record<string, string> = {
  display_name: "Student name or teacher display name",
  class_name: "Class name",
  lesson_name: "Lesson title",
  card_word: "Flashcard word typed by hand",
  card_example: "Example sentence when editing a flashcard",
  photo_word: "Words from a photo skipped when creating flashcards",
};

const GRPC_CODES = new Set([
  "cancelled",
  "unknown",
  "invalid_argument",
  "deadline_exceeded",
  "not_found",
  "already_exists",
  "permission_denied",
  "resource_exhausted",
  "failed_precondition",
  "aborted",
  "out_of_range",
  "unimplemented",
  "internal",
  "unavailable",
  "data_loss",
  "unauthenticated",
  "error",
]);

function isGrpcCode(code: string): boolean {
  return GRPC_CODES.has(code) || /^grpc_\d+$/.test(code);
}

/** Readable name of a code, or null for an unknown code (shown raw). */
export function codeLabel(kind: OutcomeKind, code: string): string | null {
  const labels = {
    limit: LIMIT_LABELS,
    failure: FAILURE_LABELS,
    retry: RETRY_LABELS,
    moderation: MODERATION_LABELS,
  }[kind];
  if (Object.hasOwn(labels, code)) return labels[code];
  if (kind === "failure" && isGrpcCode(code)) {
    return "Regular flashcard recording failed";
  }
  if (kind === "retry") return "Unexpected error";
  return null;
}

function toCount(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function emptyByOutcome(): ByOutcome {
  return {
    limit: Object.create(null),
    failure: Object.create(null),
    retry: Object.create(null),
    moderation: Object.create(null),
  };
}

export function emptyOutcomeTotals(): OutcomeTotals {
  return {
    limitRefusals: 0,
    failures: 0,
    retries: 0,
    moderationRejections: 0,
    byOutcome: emptyByOutcome(),
  };
}

/** Whether a `daily` or `dailyByFunction` document has outcome fields. */
export function hasOutcomeFields(data: Record<string, unknown>): boolean {
  return (
    Object.values(OUTCOME_COUNTERS).some(
      (field) => typeof data[field] === "number",
    ) || Object.keys(record(data.byOutcome)).length > 0
  );
}

/** Reads the outcome fields of a `daily` or `dailyByFunction` document. */
export function mapOutcomeTotals(data: Record<string, unknown>): OutcomeTotals {
  const totals = emptyOutcomeTotals();
  const byOutcome = record(data.byOutcome);
  for (const kind of OUTCOME_KINDS) {
    let sum = 0;
    for (const [code, value] of Object.entries(record(byOutcome[kind]))) {
      const entry = record(value);
      const item = { count: toCount(entry.count), users: toCount(entry.users) };
      totals.byOutcome[kind][code] = item;
      sum += item.count;
    }
    const field = OUTCOME_COUNTERS[kind];
    totals[field] =
      typeof data[field] === "number" ? toCount(data[field]) : sum;
  }
  return totals;
}

export function mapOutcomeDay(data: Record<string, unknown>): OutcomeDay {
  return {
    dayKey: String(data.dayKey || ""),
    live: false,
    hasData: hasOutcomeFields(data),
    totals: mapOutcomeTotals(data),
  };
}

export function mapOutcomeFunctionRow(
  data: Record<string, unknown>,
): OutcomeFunctionRow {
  return {
    ...mapOutcomeDay(data),
    functionName: String(data.functionName || "unknown"),
    calls: toCount(data.geminiCalls) + toCount(data.ttsCalls),
  };
}

export function isOutcomeEvent(event: Record<string, unknown>): boolean {
  return event.type === "outcome";
}

/** Aggregates today's raw `events` like the backend job: sums `count` (at
 * least 1 per event) and counts distinct `userHash` values per code. The
 * hashes are only counted here and never leave this function. */
export function aggregateOutcomeEvents(
  events: Array<Record<string, unknown>>,
): {
  totals: OutcomeTotals;
  byFunction: Record<string, OutcomeTotals>;
} {
  const totals = emptyOutcomeTotals();
  const byFunction: Record<string, OutcomeTotals> = Object.create(null);
  const users = new Map<string, { entry: CodeCount; hashes: Set<string> }>();
  const add = (
    target: OutcomeTotals,
    key: string,
    kind: OutcomeKind,
    code: string,
    items: number,
    hash: string,
  ) => {
    target[OUTCOME_COUNTERS[kind]] += items;
    const byCode = target.byOutcome[kind];
    if (!Object.hasOwn(byCode, code)) byCode[code] = { count: 0, users: 0 };
    byCode[code].count += items;
    if (!hash) return;
    const tracked = users.get(key) || {
      entry: byCode[code],
      hashes: new Set(),
    };
    tracked.hashes.add(hash);
    users.set(key, tracked);
  };
  for (const event of events) {
    if (!isOutcomeEvent(event)) continue;
    const kind = String(event.outcome || "") as OutcomeKind;
    if (!OUTCOME_KINDS.includes(kind)) continue;
    const code = String(event.code || "unknown");
    const functionName = String(event.functionName || "unknown");
    const items = Math.max(1, toCount(event.count));
    const hash = typeof event.userHash === "string" ? event.userHash : "";
    if (!Object.hasOwn(byFunction, functionName)) {
      byFunction[functionName] = emptyOutcomeTotals();
    }
    add(totals, `day/${kind}/${code}`, kind, code, items, hash);
    add(
      byFunction[functionName],
      `fn/${functionName}/${kind}/${code}`,
      kind,
      code,
      items,
      hash,
    );
  }
  for (const { entry, hashes } of users.values()) entry.users = hashes.size;
  return { totals, byFunction };
}

/** Sums the four counters over days that have data. */
export function sumOutcomeCounters(days: OutcomeDay[]): OutcomeCounters {
  const sum: OutcomeCounters = {
    limitRefusals: 0,
    failures: 0,
    retries: 0,
    moderationRejections: 0,
  };
  for (const day of days) {
    if (!day.hasData) continue;
    for (const field of Object.values(OUTCOME_COUNTERS)) {
      sum[field] += day.totals[field];
    }
  }
  return sum;
}

export interface CounterComparison {
  value: number;
  /** Sum of the previous range; null when none of its days has data. */
  previous: number | null;
  /** Some days of the previous range have no data. */
  previousPartial: boolean;
}

/** The four counters for the range and the previous range of the same
 * length (`previousDayKeys`). */
export function compareWithPrevious(
  days: OutcomeDay[],
  previousDays: OutcomeDay[],
  previousDayKeys: string[],
): Record<OutcomeCounter, CounterComparison> {
  const current = sumOutcomeCounters(days);
  const withData = previousDays.filter(
    (day) => day.hasData && previousDayKeys.includes(day.dayKey),
  );
  const previous = sumOutcomeCounters(withData);
  const result = {} as Record<OutcomeCounter, CounterComparison>;
  for (const field of Object.values(OUTCOME_COUNTERS)) {
    result[field] = {
      value: current[field],
      previous: withData.length ? previous[field] : null,
      previousPartial:
        withData.length > 0 && withData.length < previousDayKeys.length,
    };
  }
  return result;
}

export interface UsersPerDay {
  min: number;
  max: number;
  average: number;
  /** Days on which the code occurred. */
  days: number;
}

/** Distinct users per day on the days the code occurred, never summed across
 * days. Null for retries (triggers do not know the user) or when no day has
 * a user. */
export function usersPerDay(
  days: OutcomeDay[],
  kind: OutcomeKind,
  code: string,
): UsersPerDay | null {
  if (kind === "retry") return null;
  const values: number[] = [];
  for (const day of days) {
    if (!day.hasData) continue;
    const entry = day.totals.byOutcome[kind][code];
    if (entry && entry.count > 0) values.push(entry.users);
  }
  if (!values.length || Math.max(...values) === 0) return null;
  return {
    min: Math.min(...values),
    max: Math.max(...values),
    average: values.reduce((sum, value) => sum + value, 0) / values.length,
    days: values.length,
  };
}

export interface FunctionShare {
  functionName: string;
  count: number;
  /** Gemini responses plus TTS syntheses of the function in the range. */
  calls: number;
  /** count / calls; null when the function had no calls. */
  rate: number | null;
}

export interface CodeSummary {
  kind: OutcomeKind;
  code: string;
  label: string | null;
  count: number;
  users: UsersPerDay | null;
  functions: FunctionShare[];
}

function callsByFunction(rows: OutcomeFunctionRow[]): Map<string, number> {
  const calls = new Map<string, number>();
  for (const row of rows) {
    calls.set(row.functionName, (calls.get(row.functionName) || 0) + row.calls);
  }
  return calls;
}

/** One row per code of `kind` in the range (`days` and `rows` already
 * limited to it), by count descending. */
export function summarizeCodes(
  days: OutcomeDay[],
  rows: OutcomeFunctionRow[],
  kind: OutcomeKind,
): CodeSummary[] {
  const counts = new Map<string, number>();
  for (const day of days) {
    if (!day.hasData) continue;
    for (const [code, entry] of Object.entries(day.totals.byOutcome[kind])) {
      counts.set(code, (counts.get(code) || 0) + entry.count);
    }
  }
  const calls = callsByFunction(rows);
  const perFunction = new Map<string, Map<string, number>>();
  for (const row of rows) {
    if (!row.hasData) continue;
    for (const [code, entry] of Object.entries(row.totals.byOutcome[kind])) {
      if (!entry.count) continue;
      const functions = perFunction.get(code) || new Map<string, number>();
      functions.set(
        row.functionName,
        (functions.get(row.functionName) || 0) + entry.count,
      );
      perFunction.set(code, functions);
      if (!counts.has(code)) counts.set(code, 0);
    }
  }
  const summaries = [...counts]
    .filter(([code, count]) => count > 0 || perFunction.has(code))
    .map(([code, count]) => ({
      kind,
      code,
      label: codeLabel(kind, code),
      count,
      users: usersPerDay(days, kind, code),
      functions: [...(perFunction.get(code) || new Map<string, number>())]
        .map(([functionName, functionCount]) => {
          const functionCalls = calls.get(functionName) || 0;
          return {
            functionName,
            count: functionCount,
            calls: functionCalls,
            rate: functionCalls ? functionCount / functionCalls : null,
          };
        })
        .sort(
          (a, b) =>
            b.count - a.count || a.functionName.localeCompare(b.functionName),
        ),
    }));
  return sortCodeSummaries(summaries, "count", "desc");
}

export type CodeSortKey = "label" | "code" | "count" | "users";

export function sortCodeSummaries(
  items: CodeSummary[],
  key: CodeSortKey,
  direction: "asc" | "desc",
): CodeSummary[] {
  const factor = direction === "asc" ? 1 : -1;
  const text = (item: CodeSummary) =>
    key === "label" ? item.label || item.code : item.code;
  const number = (item: CodeSummary) =>
    key === "count" ? item.count : (item.users?.average ?? -1);
  return [...items].sort((a, b) => {
    const difference =
      key === "label" || key === "code"
        ? text(a).localeCompare(text(b))
        : number(a) - number(b);
    return difference * factor || a.code.localeCompare(b.code);
  });
}

export interface OutcomeFunctionSummary extends OutcomeCounters {
  functionName: string;
  calls: number;
  /** failures / calls; null when the function had no calls. */
  failureRate: number | null;
}

export function summarizeOutcomeFunctions(
  rows: OutcomeFunctionRow[],
): OutcomeFunctionSummary[] {
  const byFunction = new Map<string, OutcomeFunctionSummary>();
  for (const row of rows) {
    const summary = byFunction.get(row.functionName) || {
      functionName: row.functionName,
      calls: 0,
      failureRate: null,
      limitRefusals: 0,
      failures: 0,
      retries: 0,
      moderationRejections: 0,
    };
    summary.calls += row.calls;
    if (row.hasData) {
      for (const field of Object.values(OUTCOME_COUNTERS)) {
        summary[field] += row.totals[field];
      }
    }
    byFunction.set(row.functionName, summary);
  }
  return [...byFunction.values()]
    .map((summary) => ({
      ...summary,
      failureRate: summary.calls ? summary.failures / summary.calls : null,
    }))
    .filter((summary) =>
      Object.values(OUTCOME_COUNTERS).some((field) => summary[field] > 0),
    )
    .sort(
      (a, b) =>
        b.failures +
          b.limitRefusals +
          b.retries +
          b.moderationRejections -
          (a.failures + a.limitRefusals + a.retries + a.moderationRejections) ||
        a.functionName.localeCompare(b.functionName),
    );
}

/** Stacked daily counts per code of `kind`. `series` lists the codes that
 * get their own segment; the rest is folded into Other. Days without data
 * are marked so the chart shows "No data", not 0. */
export function buildOutcomeChart(
  days: OutcomeDay[],
  dayKeys: string[],
  kind: OutcomeKind,
  series: string[],
): ChartDay[] {
  const named = new Set(series);
  const byDay = new Map(days.map((day) => [day.dayKey, day]));
  return dayKeys.map((dayKey) => {
    const day = byDay.get(dayKey);
    const values = new Map<string, number>();
    if (day?.hasData) {
      for (const [code, entry] of Object.entries(day.totals.byOutcome[kind])) {
        const name = named.has(code) ? code : OTHER_SERIES;
        values.set(name, (values.get(name) || 0) + entry.count);
      }
    }
    const segments = [...series, OTHER_SERIES]
      .map((name) => ({ series: name, value: values.get(name) || 0 }))
      .filter((segment) => segment.value > 0);
    return {
      dayKey,
      live: Boolean(day?.live),
      aggregated: Boolean(day?.hasData),
      unpriced: false,
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };
  });
}

/** One counter per day; null for days without data. */
export function dailyCounter(
  days: OutcomeDay[],
  dayKeys: string[],
  field: OutcomeCounter,
): Array<number | null> {
  const byDay = new Map(days.map((day) => [day.dayKey, day]));
  return dayKeys.map((dayKey) => {
    const day = byDay.get(dayKey);
    return day?.hasData ? day.totals[field] : null;
  });
}

export interface OutcomeThresholds {
  /** Final failures above this share of calls (percent) on one day. */
  failureRatePercent: number;
  /** Retries above this multiple of the previous 7 days' average. */
  retrySpikeFactor: number;
  /** Moderation rejections of one code by at least this many users a day. */
  moderationUsersPerDay: number;
  /** At least this many rejections of one code on a day with one user. */
  moderationSingleUserCount: number;
}

export const DEFAULT_OUTCOME_THRESHOLDS: OutcomeThresholds = {
  failureRatePercent: 2,
  retrySpikeFactor: 3,
  moderationUsersPerDay: 5,
  moderationSingleUserCount: 10,
};

/** Stored thresholds merged over the defaults; invalid values are dropped. */
export function parseOutcomeThresholds(value: unknown): OutcomeThresholds {
  const data = record(value);
  const thresholds = { ...DEFAULT_OUTCOME_THRESHOLDS };
  for (const key of Object.keys(thresholds) as Array<keyof OutcomeThresholds>) {
    const number = Number(data[key]);
    if (data[key] !== undefined && Number.isFinite(number) && number > 0) {
      thresholds[key] = number;
    }
  }
  return thresholds;
}

export type OutcomeAlertKind =
  | "moderation-failed-open"
  | "failure-rate"
  | "failures-without-calls"
  | "retry-spike"
  | "moderation-users"
  | "moderation-single-user";

export interface OutcomeAlert {
  kind: OutcomeAlertKind;
  dayKey: string;
  functionName?: string;
  code?: string;
  value: number;
  /** Threshold, baseline average or the users of the day, by kind. */
  reference: number;
}

const ALERT_ORDER: OutcomeAlertKind[] = [
  "moderation-failed-open",
  "failures-without-calls",
  "failure-rate",
  "retry-spike",
  "moderation-single-user",
  "moderation-users",
];

/** Flags, for days in [fromDayKey, toDayKey]:
 * - any `moderation_failed_open` (content passed without moderation),
 * - a function whose final failures exceed the threshold share of its calls
 *   (or that failed without any call),
 * - a function whose retries exceed the factor × its average over the
 *   previous 7 days with data (the average counts as at least 1, so the
 *   first retries flag only above the factor),
 * - a moderation code rejected for many distinct users on one day (possible
 *   false rejections), or many times on a day with a single user (possible
 *   abuse).
 * `days` and `rows` should also cover the 7 days before `fromDayKey`. */
export function detectOutcomeAlerts(
  days: OutcomeDay[],
  rows: OutcomeFunctionRow[],
  options: {
    fromDayKey: string;
    toDayKey: string;
    thresholds: OutcomeThresholds;
  },
): OutcomeAlert[] {
  const { fromDayKey, toDayKey, thresholds } = options;
  const inRange = (dayKey: string) =>
    dayKey >= fromDayKey && dayKey <= toDayKey;
  const dataDays = new Set<string>();
  for (const item of [...days, ...rows]) {
    if (item.hasData) dataDays.add(item.dayKey);
  }
  const retriesByFunctionDay = new Map<string, number>();
  for (const row of rows) {
    if (row.hasData) {
      retriesByFunctionDay.set(
        `${row.functionName}|${row.dayKey}`,
        row.totals.retries,
      );
    }
  }
  const alerts: OutcomeAlert[] = [];
  for (const row of rows) {
    if (!row.hasData || !inRange(row.dayKey)) continue;
    const base = { dayKey: row.dayKey, functionName: row.functionName };
    const failedOpen = row.totals.byOutcome.failure.moderation_failed_open;
    if (failedOpen?.count) {
      alerts.push({
        ...base,
        kind: "moderation-failed-open",
        code: "moderation_failed_open",
        value: failedOpen.count,
        reference: 0,
      });
    }
    if (row.totals.failures > 0) {
      if (!row.calls) {
        alerts.push({
          ...base,
          kind: "failures-without-calls",
          value: row.totals.failures,
          reference: 0,
        });
      } else if (
        (row.totals.failures / row.calls) * 100 >
        thresholds.failureRatePercent
      ) {
        alerts.push({
          ...base,
          kind: "failure-rate",
          value: row.totals.failures / row.calls,
          reference: thresholds.failureRatePercent / 100,
        });
      }
    }
    if (row.totals.retries > 0) {
      const baseline: number[] = [];
      for (let offset = 1; offset <= 7; offset += 1) {
        const dayKey = shiftDayKey(row.dayKey, -offset);
        if (!dataDays.has(dayKey)) continue;
        baseline.push(
          retriesByFunctionDay.get(`${row.functionName}|${dayKey}`) || 0,
        );
      }
      if (baseline.length) {
        const average =
          baseline.reduce((sum, value) => sum + value, 0) / baseline.length;
        if (
          row.totals.retries >
          thresholds.retrySpikeFactor * Math.max(average, 1)
        ) {
          alerts.push({
            ...base,
            kind: "retry-spike",
            value: row.totals.retries,
            reference: average,
          });
        }
      }
    }
  }
  for (const day of days) {
    if (!day.hasData || !inRange(day.dayKey)) continue;
    for (const [code, entry] of Object.entries(
      day.totals.byOutcome.moderation,
    )) {
      if (entry.users >= thresholds.moderationUsersPerDay) {
        alerts.push({
          kind: "moderation-users",
          dayKey: day.dayKey,
          code,
          value: entry.users,
          reference: thresholds.moderationUsersPerDay,
        });
      }
      if (
        entry.users === 1 &&
        entry.count >= thresholds.moderationSingleUserCount
      ) {
        alerts.push({
          kind: "moderation-single-user",
          dayKey: day.dayKey,
          code,
          value: entry.count,
          reference: thresholds.moderationSingleUserCount,
        });
      }
    }
  }
  return alerts.sort(
    (a, b) =>
      ALERT_ORDER.indexOf(a.kind) - ALERT_ORDER.indexOf(b.kind) ||
      b.dayKey.localeCompare(a.dayKey) ||
      (a.functionName || a.code || "").localeCompare(
        b.functionName || b.code || "",
      ),
  );
}

/** Moves a range start to the first day with outcome data. */
export function clipToOutcomeData(fromDayKey: string): {
  fromDayKey: string;
  clipped: boolean;
} {
  return fromDayKey < OUTCOMES_SINCE
    ? { fromDayKey: OUTCOMES_SINCE, clipped: true }
    : { fromDayKey, clipped: false };
}
