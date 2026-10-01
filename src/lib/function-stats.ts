import type { AiPricing } from "./ai-pricing";
import { OTHER_SERIES, type ChartDay } from "./stats";

export { OTHER_SERIES, type ChartDay };

// Pure helpers for the Functions Stats view. Data layout is documented in the
// app repository: tripletalk/docs/functions/STATISTICS.md. Day keys are UTC
// dates (YYYY-MM-DD).

export interface GeminiUsage {
  calls: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
}

export interface TtsUsage {
  calls: number;
  characters: number;
}

export interface OperationUsage extends GeminiUsage {
  api: string;
  characters: number;
}

export interface UsageTotals {
  geminiCalls: number;
  promptTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  totalTokens: number;
  ttsCalls: number;
  ttsCharacters: number;
  byModel: Record<string, GeminiUsage>;
  byVoice: Record<string, TtsUsage>;
  byOperation: Record<string, OperationUsage>;
}

export interface DailyFunctionRow {
  dayKey: string;
  functionName: string;
  /** Built in the browser from raw events (day not aggregated yet). */
  live: boolean;
  totals: UsageTotals;
}

export interface CostEstimate {
  usd: number;
  /** Models or voices that had usage but no price in the price list. */
  unpriced: string[];
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

function count(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? Math.round(number) : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function dictionary<T>(): Record<string, T> {
  return Object.create(null) as Record<string, T>;
}

function bucket<T>(target: Record<string, T>, key: string, create: () => T): T {
  if (!Object.hasOwn(target, key)) target[key] = create();
  return target[key];
}

function emptyGemini(): GeminiUsage {
  return {
    calls: 0,
    promptTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
  };
}

function emptyOperation(api: string): OperationUsage {
  return { api, ...emptyGemini(), characters: 0 };
}

export function emptyUsageTotals(): UsageTotals {
  return {
    geminiCalls: 0,
    promptTokens: 0,
    outputTokens: 0,
    thinkingTokens: 0,
    totalTokens: 0,
    ttsCalls: 0,
    ttsCharacters: 0,
    byModel: dictionary(),
    byVoice: dictionary(),
    byOperation: dictionary(),
  };
}

function mapGemini(value: unknown): GeminiUsage {
  const data = record(value);
  return {
    calls: count(data.calls),
    promptTokens: count(data.promptTokens),
    outputTokens: count(data.outputTokens),
    thinkingTokens: count(data.thinkingTokens),
    totalTokens: count(data.totalTokens),
  };
}

/** Reads a `daily` or `dailyByFunction` document defensively. */
export function mapUsageTotals(data: Record<string, unknown>): UsageTotals {
  const totals = emptyUsageTotals();
  totals.geminiCalls = count(data.geminiCalls);
  totals.promptTokens = count(data.promptTokens);
  totals.outputTokens = count(data.outputTokens);
  totals.thinkingTokens = count(data.thinkingTokens);
  totals.totalTokens = count(data.totalTokens);
  totals.ttsCalls = count(data.ttsCalls);
  totals.ttsCharacters = count(data.ttsCharacters);
  for (const [model, usage] of Object.entries(record(data.byModel))) {
    totals.byModel[model] = mapGemini(usage);
  }
  for (const [voice, usage] of Object.entries(record(data.byVoice))) {
    const voiceUsage = record(usage);
    totals.byVoice[voice] = {
      calls: count(voiceUsage.calls),
      characters: count(voiceUsage.characters),
    };
  }
  for (const [operation, usage] of Object.entries(record(data.byOperation))) {
    const operationUsage = record(usage);
    totals.byOperation[operation] = {
      api: String(operationUsage.api || "unknown"),
      ...mapGemini(operationUsage),
      characters: count(operationUsage.characters),
    };
  }
  return totals;
}

export function mapDailyFunctionRow(
  data: Record<string, unknown>,
): DailyFunctionRow | null {
  const dayKey = String(data.dayKey || "");
  if (!DAY_KEY.test(dayKey)) return null;
  return {
    dayKey,
    functionName: String(data.functionName || "unknown"),
    live: false,
    totals: mapUsageTotals(data),
  };
}

function addGemini(target: GeminiUsage, usage: GeminiUsage): void {
  target.calls += usage.calls;
  target.promptTokens += usage.promptTokens;
  target.outputTokens += usage.outputTokens;
  target.thinkingTokens += usage.thinkingTokens;
  target.totalTokens += usage.totalTokens;
}

/** Adds `usage` into `target` (mutates and returns `target`). */
export function addUsageTotals(
  target: UsageTotals,
  usage: UsageTotals,
): UsageTotals {
  target.geminiCalls += usage.geminiCalls;
  target.promptTokens += usage.promptTokens;
  target.outputTokens += usage.outputTokens;
  target.thinkingTokens += usage.thinkingTokens;
  target.totalTokens += usage.totalTokens;
  target.ttsCalls += usage.ttsCalls;
  target.ttsCharacters += usage.ttsCharacters;
  for (const [model, value] of Object.entries(usage.byModel)) {
    addGemini(bucket(target.byModel, model, emptyGemini), value);
  }
  for (const [voice, value] of Object.entries(usage.byVoice)) {
    const voiceUsage = bucket(target.byVoice, voice, () => ({
      calls: 0,
      characters: 0,
    }));
    voiceUsage.calls += value.calls;
    voiceUsage.characters += value.characters;
  }
  for (const [operation, value] of Object.entries(usage.byOperation)) {
    const operationUsage = bucket(target.byOperation, operation, () =>
      emptyOperation(value.api),
    );
    addGemini(operationUsage, value);
    operationUsage.characters += value.characters;
  }
  return target;
}

export function sumUsage(rows: DailyFunctionRow[]): UsageTotals {
  return rows.reduce(
    (sum, row) => addUsageTotals(sum, row.totals),
    emptyUsageTotals(),
  );
}

/** Aggregates raw `events` documents per function, the same way the
 * backend `aggregateAiUsageStatistics` job does. */
export function aggregateEvents(
  events: Array<Record<string, unknown>>,
): Record<string, UsageTotals> {
  const byFunction = dictionary<UsageTotals>();
  for (const event of events) {
    const totals = bucket(
      byFunction,
      String(event.functionName || "unknown"),
      emptyUsageTotals,
    );
    const operation = String(event.operation || "unknown");
    if (event.api === "gemini") {
      const usage: GeminiUsage = {
        calls: 1,
        promptTokens: count(event.promptTokens),
        outputTokens: count(event.outputTokens),
        thinkingTokens: count(event.thinkingTokens),
        totalTokens: count(event.totalTokens),
      };
      totals.geminiCalls += 1;
      totals.promptTokens += usage.promptTokens;
      totals.outputTokens += usage.outputTokens;
      totals.thinkingTokens += usage.thinkingTokens;
      totals.totalTokens += usage.totalTokens;
      addGemini(
        bucket(totals.byModel, String(event.model || "unknown"), emptyGemini),
        usage,
      );
      addGemini(
        bucket(totals.byOperation, operation, () => emptyOperation("gemini")),
        usage,
      );
    } else if (event.api === "tts") {
      const characters = count(event.characters);
      totals.ttsCalls += 1;
      totals.ttsCharacters += characters;
      const voice = bucket(
        totals.byVoice,
        String(event.voiceName || "unknown"),
        () => ({ calls: 0, characters: 0 }),
      );
      voice.calls += 1;
      voice.characters += characters;
      const operationUsage = bucket(totals.byOperation, operation, () =>
        emptyOperation("tts"),
      );
      operationUsage.calls += 1;
      operationUsage.characters += characters;
    }
  }
  return byFunction;
}

const VOICE_TYPES = [
  "Chirp3-HD",
  "Chirp-HD",
  "Neural2",
  "Wavenet",
  "Standard",
  "Studio",
  "Polyglot",
  "News",
  "Journey",
];

/** Voice type from a Cloud TTS voice name, e.g. `pl-PL-Wavenet-B` → `Wavenet`. */
export function voiceType(voiceName: string): string | null {
  const name = voiceName.replace(/^[a-z]{2,3}-[A-Z]{2}-/, "");
  return VOICE_TYPES.find((type) => name.startsWith(type)) || null;
}

/** USD for one model's usage; null when the model has no price. */
export function modelCost(
  model: string,
  usage: GeminiUsage,
  pricing: AiPricing,
): number | null {
  if (!Object.hasOwn(pricing.geminiPerMillionTokens, model)) return null;
  const price = pricing.geminiPerMillionTokens[model];
  return (
    (usage.promptTokens / 1_000_000) * price.input +
    ((usage.outputTokens + usage.thinkingTokens) / 1_000_000) * price.output
  );
}

/** USD for one voice's usage; null when its voice type has no price. */
export function voiceCost(
  voiceName: string,
  usage: TtsUsage,
  pricing: AiPricing,
): number | null {
  const type = voiceType(voiceName);
  if (!type || !Object.hasOwn(pricing.ttsPerMillionCharacters, type)) {
    return null;
  }
  return (usage.characters / 1_000_000) * pricing.ttsPerMillionCharacters[type];
}

export function estimateCost(
  totals: UsageTotals,
  pricing: AiPricing,
): CostEstimate {
  let usd = 0;
  const unpriced = new Set<string>();
  const models = Object.entries(totals.byModel);
  for (const [model, usage] of models) {
    if (!usage.calls && !usage.totalTokens) continue;
    const cost = modelCost(model, usage, pricing);
    if (cost === null) unpriced.add(`model ${model}`);
    else usd += cost;
  }
  if (totals.geminiCalls && !models.length) unpriced.add("model unknown");

  const voices = Object.entries(totals.byVoice);
  for (const [voice, usage] of voices) {
    if (!usage.calls && !usage.characters) continue;
    const cost = voiceCost(voice, usage, pricing);
    if (cost === null) unpriced.add(`voice ${voice}`);
    else usd += cost;
  }
  if (totals.ttsCalls && !voices.length) unpriced.add("voice unknown");
  return { usd, unpriced: [...unpriced].sort() };
}

export interface FunctionSummary {
  functionName: string;
  totals: UsageTotals;
  cost: CostEstimate;
  /** Share of the estimated cost of the range, 0–1; null without any cost. */
  costShare: number | null;
  /** Total Gemini tokens per Gemini call; null without calls. */
  averageTokensPerCall: number | null;
}

export function summarizeFunctions(
  rows: DailyFunctionRow[],
  pricing: AiPricing,
): FunctionSummary[] {
  const byFunction = new Map<string, DailyFunctionRow[]>();
  for (const row of rows) {
    const list = byFunction.get(row.functionName) || [];
    list.push(row);
    byFunction.set(row.functionName, list);
  }
  const summaries = [...byFunction].map(([functionName, functionRows]) => {
    const totals = sumUsage(functionRows);
    return {
      functionName,
      totals,
      cost: estimateCost(totals, pricing),
      costShare: null as number | null,
      averageTokensPerCall: totals.geminiCalls
        ? totals.totalTokens / totals.geminiCalls
        : null,
    };
  });
  const totalUsd = summaries.reduce((sum, item) => sum + item.cost.usd, 0);
  for (const summary of summaries) {
    summary.costShare = totalUsd > 0 ? summary.cost.usd / totalUsd : null;
  }
  return sortFunctionSummaries(summaries, "cost", "desc");
}

export type FunctionSortKey =
  | "functionName"
  | "geminiCalls"
  | "promptTokens"
  | "outputTokens"
  | "totalTokens"
  | "averageTokensPerCall"
  | "ttsCalls"
  | "ttsCharacters"
  | "cost"
  | "costShare";

export const FUNCTION_SORT_KEYS: FunctionSortKey[] = [
  "functionName",
  "geminiCalls",
  "promptTokens",
  "outputTokens",
  "totalTokens",
  "averageTokensPerCall",
  "ttsCalls",
  "ttsCharacters",
  "cost",
  "costShare",
];

function sortValue(item: FunctionSummary, key: FunctionSortKey): number {
  switch (key) {
    case "cost":
      return item.cost.usd;
    case "costShare":
      return item.costShare ?? -1;
    case "averageTokensPerCall":
      return item.averageTokensPerCall ?? -1;
    case "functionName":
      return 0;
    default:
      return item.totals[key];
  }
}

export function sortFunctionSummaries(
  items: FunctionSummary[],
  key: FunctionSortKey,
  direction: "asc" | "desc",
): FunctionSummary[] {
  const factor = direction === "asc" ? 1 : -1;
  return [...items].sort((a, b) => {
    const difference =
      key === "functionName"
        ? a.functionName.localeCompare(b.functionName)
        : sortValue(a, key) - sortValue(b, key);
    return difference * factor || a.functionName.localeCompare(b.functionName);
  });
}

export type ChartMetric = "cost" | "tokens" | "characters";

export function metricValue(
  totals: UsageTotals,
  metric: ChartMetric,
  pricing: AiPricing,
): number {
  if (metric === "tokens") return totals.totalTokens;
  if (metric === "characters") return totals.ttsCharacters;
  return estimateCost(totals, pricing).usd;
}

/** Stacked daily values per function. `series` lists the functions that get
 * their own segment (in color order); everything else is folded into Other. */
export function buildDailyChart(
  rows: DailyFunctionRow[],
  dayKeys: string[],
  series: string[],
  metric: ChartMetric,
  pricing: AiPricing,
  aggregatedDays: Set<string>,
): ChartDay[] {
  const named = new Set(series);
  return dayKeys.map((dayKey) => {
    const values = new Map<string, number>();
    let live = false;
    let unpriced = false;
    for (const row of rows) {
      if (row.dayKey !== dayKey) continue;
      live ||= row.live;
      if (metric === "cost") {
        unpriced ||= estimateCost(row.totals, pricing).unpriced.length > 0;
      }
      const name = named.has(row.functionName)
        ? row.functionName
        : OTHER_SERIES;
      values.set(
        name,
        (values.get(name) || 0) + metricValue(row.totals, metric, pricing),
      );
    }
    const segments = [...series, OTHER_SERIES]
      .map((name) => ({ series: name, value: values.get(name) || 0 }))
      .filter((segment) => segment.value > 0);
    return {
      dayKey,
      live,
      aggregated: aggregatedDays.has(dayKey),
      unpriced,
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };
  });
}

export interface UsageAlert {
  kind: "output-spike" | "daily-cost";
  dayKey: string;
  functionName: string;
  operation?: string;
  value: number;
  /** Average output tokens per call over the previous 7 days, or the cost threshold. */
  reference: number;
}

/** Flags (a) a Gemini operation whose average output tokens per call is more
 * than twice its average over the previous 7 days, and (b) a function whose
 * estimated cost in one day is above the threshold. `rows` should also cover
 * the 7 days before `fromDayKey` so the first days have a baseline. */
export function detectUsageAlerts(
  rows: DailyFunctionRow[],
  options: {
    fromDayKey: string;
    toDayKey: string;
    costThresholdUsd: number | null;
    pricing: AiPricing;
  },
): UsageAlert[] {
  const { fromDayKey, toDayKey, costThresholdUsd, pricing } = options;
  const alerts: UsageAlert[] = [];
  for (const row of rows) {
    if (row.dayKey < fromDayKey || row.dayKey > toDayKey) continue;
    const baselineFrom = shiftDayKey(row.dayKey, -7);
    const previous = rows.filter(
      (candidate) =>
        candidate.functionName === row.functionName &&
        candidate.dayKey >= baselineFrom &&
        candidate.dayKey < row.dayKey,
    );
    for (const [operation, usage] of Object.entries(row.totals.byOperation)) {
      if (usage.api !== "gemini" || !usage.calls) continue;
      let calls = 0;
      let outputTokens = 0;
      for (const candidate of previous) {
        const earlier = Object.hasOwn(candidate.totals.byOperation, operation)
          ? candidate.totals.byOperation[operation]
          : null;
        if (!earlier || earlier.api !== "gemini") continue;
        calls += earlier.calls;
        outputTokens += earlier.outputTokens;
      }
      if (!calls) continue;
      const baseline = outputTokens / calls;
      const average = usage.outputTokens / usage.calls;
      if (baseline > 0 && average > 2 * baseline) {
        alerts.push({
          kind: "output-spike",
          dayKey: row.dayKey,
          functionName: row.functionName,
          operation,
          value: average,
          reference: baseline,
        });
      }
    }
    if (costThresholdUsd !== null && costThresholdUsd > 0) {
      const cost = estimateCost(row.totals, pricing).usd;
      if (cost > costThresholdUsd) {
        alerts.push({
          kind: "daily-cost",
          dayKey: row.dayKey,
          functionName: row.functionName,
          value: cost,
          reference: costThresholdUsd,
        });
      }
    }
  }
  return alerts.sort(
    (a, b) =>
      b.dayKey.localeCompare(a.dayKey) ||
      a.functionName.localeCompare(b.functionName),
  );
}

export function isDayKey(value: string): boolean {
  if (!DAY_KEY.test(value)) return false;
  return utcDayKey(new Date(`${value}T00:00:00Z`)) === value;
}

export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function shiftDayKey(dayKey: string, days: number): string {
  return utcDayKey(new Date(Date.parse(`${dayKey}T00:00:00Z`) + days * DAY_MS));
}

export function dayKeysBetween(fromDayKey: string, toDayKey: string): string[] {
  const keys: string[] = [];
  for (let key = fromDayKey; key <= toDayKey; key = shiftDayKey(key, 1)) {
    keys.push(key);
  }
  return keys;
}

export function isAggregationStale(
  lastAggregatedAt: Date | null,
  now = new Date(),
  maxAgeHours = 36,
): boolean {
  return (
    !lastAggregatedAt ||
    now.getTime() - lastAggregatedAt.getTime() > maxAgeHours * 60 * 60 * 1000
  );
}
