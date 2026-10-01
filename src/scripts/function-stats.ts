import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { AI_PRICING, type AiPricing } from "../lib/ai-pricing";
import { getFirebaseApp } from "../lib/firebase/client";
import {
  SERIES_COUNT,
  attachChartTooltip,
  element,
  renderChartLegend,
  renderChartTooltip,
  renderUsageChart,
  seriesColor,
} from "./admin-chart";
import { errorCode, timestampToDate } from "./admin-stats";
import {
  FUNCTION_SORT_KEYS,
  aggregateEvents,
  buildDailyChart,
  dayKeysBetween,
  detectUsageAlerts,
  estimateCost,
  isAggregationStale,
  isDayKey,
  mapDailyFunctionRow,
  modelCost,
  shiftDayKey,
  sortFunctionSummaries,
  sumUsage,
  summarizeFunctions,
  utcDayKey,
  voiceCost,
  voiceType,
  type ChartDay,
  type ChartMetric,
  type CostEstimate,
  type DailyFunctionRow,
  type FunctionSortKey,
  type FunctionSummary,
  type UsageAlert,
  type UsageTotals,
} from "../lib/function-stats";

const NUMBER_FORMAT = new Intl.NumberFormat("pl-PL");
const PERCENT_FORMAT = new Intl.NumberFormat("pl-PL", {
  style: "percent",
  maximumFractionDigits: 1,
});
const UTC_DATE_TIME = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 180;
const MAX_LIVE_DAYS = 3;
const MAX_LIVE_EVENTS_PER_DAY = 5000;
const DEFAULT_COST_THRESHOLD_USD = 1;
const THRESHOLD_STORAGE_KEY = "tripletalk-admin-function-cost-threshold";

const METRIC_LABELS: Record<ChartMetric, string> = {
  cost: "Estimated cost",
  tokens: "Gemini tokens",
  characters: "TTS characters",
};

export function formatUsd(value: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: value > 0 && value < 1 ? 4 : 2,
    maximumFractionDigits: value > 0 && value < 1 ? 4 : 2,
  }).format(value);
}

/** Cost text that never shows a missing price as $0. */
export function formatCost(cost: CostEstimate): string {
  if (!cost.unpriced.length) return formatUsd(cost.usd);
  return cost.usd > 0 ? `${formatUsd(cost.usd)} + no price` : "No price";
}

export function formatMetric(value: number, metric: ChartMetric): string {
  return metric === "cost"
    ? formatUsd(value)
    : NUMBER_FORMAT.format(Math.round(value));
}

function formatAverage(total: number, calls: number): string {
  return calls ? NUMBER_FORMAT.format(Math.round(total / calls)) : "—";
}

function cell(text: string, className?: string): HTMLTableCellElement {
  return element("td", className, text);
}

function costCell(cost: CostEstimate): HTMLTableCellElement {
  const node = cell(formatCost(cost), "numeric");
  if (cost.unpriced.length) {
    node.classList.add("stats-unpriced");
    node.title = `No price for: ${cost.unpriced.join(", ")}`;
  }
  return node;
}

/** The functions that get their own color: highest cost first, then tokens
 * and characters, so colors stay fixed when the metric changes. */
export function chartSeries(summaries: FunctionSummary[]): string[] {
  return [...summaries]
    .sort(
      (a, b) =>
        b.cost.usd - a.cost.usd ||
        b.totals.totalTokens - a.totals.totalTokens ||
        b.totals.ttsCharacters - a.totals.ttsCharacters ||
        a.functionName.localeCompare(b.functionName),
    )
    .slice(0, SERIES_COUNT)
    .map((summary) => summary.functionName);
}

export function renderUsageSummary(
  container: HTMLElement,
  totals: UsageTotals,
  cost: CostEstimate,
): void {
  const values: Record<string, string> = {
    "gemini-calls": NUMBER_FORMAT.format(totals.geminiCalls),
    "prompt-tokens": NUMBER_FORMAT.format(totals.promptTokens),
    "output-tokens": NUMBER_FORMAT.format(totals.outputTokens),
    "thinking-tokens": NUMBER_FORMAT.format(totals.thinkingTokens),
    "tts-calls": NUMBER_FORMAT.format(totals.ttsCalls),
    "tts-characters": NUMBER_FORMAT.format(totals.ttsCharacters),
    cost: formatCost(cost),
  };
  container.querySelectorAll<HTMLElement>("[data-fs-total]").forEach((node) => {
    node.textContent = values[node.dataset.fsTotal || ""] || "—";
  });
  const unpriced = container.querySelector<HTMLElement>("[data-fs-unpriced]");
  if (unpriced) {
    unpriced.textContent = cost.unpriced.length
      ? `No price for: ${cost.unpriced.join(", ")}`
      : "Estimate, see price list below";
  }
}

export function renderPricingNote(
  container: HTMLElement,
  pricing: AiPricing,
): void {
  container.replaceChildren(
    `Cost is an estimate from Google list prices effective ${pricing.effectiveFrom} (checked ${pricing.checkedOn}): `,
  );
  pricing.sources.forEach((source, index) => {
    const link = element("a", undefined, source.label);
    link.href = source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    container.append(index ? ", " : "", link);
  });
  container.append(
    ". Free tiers and discounts are not included. Models or voices missing from the price list are shown as “no price”.",
  );
}

export function renderUsageAlerts(
  container: HTMLElement,
  alerts: UsageAlert[],
): void {
  container.replaceChildren();
  container.hidden = !alerts.length;
  if (!alerts.length) return;
  const heading = element(
    "h2",
    undefined,
    `Alerts (${NUMBER_FORMAT.format(alerts.length)})`,
  );
  const list = element("ul");
  for (const alert of alerts) {
    const item = element("li", `stats-alert stats-alert-${alert.kind}`);
    const label = element(
      "strong",
      undefined,
      alert.kind === "output-spike" ? "Output spike" : "Daily cost",
    );
    const where = element(
      "span",
      "mono",
      `${alert.dayKey} · ${alert.functionName}${alert.operation ? ` · ${alert.operation}` : ""}`,
    );
    const detail = element(
      "span",
      undefined,
      alert.kind === "output-spike"
        ? `${NUMBER_FORMAT.format(Math.round(alert.value))} output tokens per call vs ${NUMBER_FORMAT.format(Math.round(alert.reference))} average of previous 7 days`
        : `${formatUsd(alert.value)} above the ${formatUsd(alert.reference)} threshold`,
    );
    item.append(label, where, detail);
    list.append(item);
  }
  container.append(heading, list);
}

const COLUMN_LABELS: Record<FunctionSortKey, string> = {
  functionName: "Function",
  geminiCalls: "Gemini calls",
  promptTokens: "Input tokens",
  outputTokens: "Output tokens",
  totalTokens: "Total tokens",
  averageTokensPerCall: "Tokens / call",
  ttsCalls: "TTS syntheses",
  ttsCharacters: "TTS characters",
  cost: "Est. cost",
  costShare: "Cost share",
};

export function renderFunctionTableHead(
  row: HTMLElement,
  sortKey: FunctionSortKey,
  direction: "asc" | "desc",
): void {
  row.replaceChildren(
    ...FUNCTION_SORT_KEYS.map((key) => {
      const header = element("th");
      if (key !== "functionName") header.className = "numeric";
      header.setAttribute(
        "aria-sort",
        key === sortKey
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none",
      );
      const button = element(
        "button",
        "stats-sort",
        `${COLUMN_LABELS[key]}${key === sortKey ? (direction === "asc" ? " ↑" : " ↓") : ""}`,
      );
      button.type = "button";
      button.dataset.sort = key;
      header.append(button);
      return header;
    }),
  );
}

export function renderFunctionRows(
  container: HTMLElement,
  summaries: FunctionSummary[],
  series: string[],
  alertedFunctions: Set<string>,
): void {
  container.replaceChildren(
    ...summaries.map((summary) => {
      const row = element("tr");
      row.dataset.functionName = summary.functionName;
      if (alertedFunctions.has(summary.functionName)) {
        row.classList.add("has-alert");
      }
      const name = element("td");
      const button = element("button", "stats-function-button");
      button.type = "button";
      button.dataset.functionName = summary.functionName;
      const swatch = element("span", "stats-swatch");
      swatch.style.background = seriesColor(series, summary.functionName);
      button.append(swatch, element("span", "mono", summary.functionName));
      name.append(button);
      if (alertedFunctions.has(summary.functionName)) {
        name.append(element("span", "stats-tag stats-tag-alert", "Alert"));
      }
      const { totals } = summary;
      row.append(
        name,
        cell(NUMBER_FORMAT.format(totals.geminiCalls), "numeric"),
        cell(NUMBER_FORMAT.format(totals.promptTokens), "numeric"),
        cell(NUMBER_FORMAT.format(totals.outputTokens), "numeric"),
        cell(NUMBER_FORMAT.format(totals.totalTokens), "numeric"),
        cell(
          summary.averageTokensPerCall === null
            ? "—"
            : NUMBER_FORMAT.format(Math.round(summary.averageTokensPerCall)),
          "numeric",
        ),
        cell(NUMBER_FORMAT.format(totals.ttsCalls), "numeric"),
        cell(NUMBER_FORMAT.format(totals.ttsCharacters), "numeric"),
        costCell(summary.cost),
        cell(
          summary.costShare === null
            ? "—"
            : PERCENT_FORMAT.format(summary.costShare),
          "numeric",
        ),
      );
      return row;
    }),
  );
}

function table(headers: string[], rows: HTMLTableRowElement[]): HTMLElement {
  const wrap = element("div", "stats-table-wrap");
  const node = element("table", "admin-table stats-table");
  const head = element("thead");
  const headRow = element("tr");
  headers.forEach((header, index) =>
    headRow.append(element("th", index ? "numeric" : undefined, header)),
  );
  head.append(headRow);
  const body = element("tbody");
  body.append(...rows);
  node.append(head, body);
  wrap.append(node);
  return wrap;
}

function row(cells: HTMLTableCellElement[]): HTMLTableRowElement {
  const node = element("tr");
  node.append(...cells);
  return node;
}

function priceCell(value: number | null): HTMLTableCellElement {
  if (value !== null) return cell(formatUsd(value), "numeric");
  const node = cell("No price", "numeric stats-unpriced");
  return node;
}

export function renderFunctionDetails(
  container: HTMLElement,
  options: {
    functionName: string;
    rows: DailyFunctionRow[];
    dayKeys: string[];
    aggregatedDays: Set<string>;
    series: string[];
    metric: ChartMetric;
    pricing: AiPricing;
  },
): void {
  const { functionName, dayKeys, aggregatedDays, series, metric, pricing } =
    options;
  const rows = options.rows.filter(
    (item) => item.functionName === functionName,
  );
  const totals = sumUsage(rows);
  const cost = estimateCost(totals, pricing);

  const summary = element("dl", "details-grid");
  const detail = (label: string, value: string) => {
    const item = element("div", "detail-item");
    item.append(
      element("dt", undefined, label),
      element("dd", undefined, value),
    );
    summary.append(item);
  };
  detail("Gemini calls", NUMBER_FORMAT.format(totals.geminiCalls));
  detail("Gemini tokens", NUMBER_FORMAT.format(totals.totalTokens));
  detail(
    "Average input / output per call",
    `${formatAverage(totals.promptTokens, totals.geminiCalls)} / ${formatAverage(totals.outputTokens, totals.geminiCalls)}`,
  );
  detail("TTS syntheses", NUMBER_FORMAT.format(totals.ttsCalls));
  detail("TTS characters", NUMBER_FORMAT.format(totals.ttsCharacters));
  detail("Estimated cost", formatCost(cost));

  const chartCard = element("section", "stats-chart-card stats-details-chart");
  const chartHeading = element(
    "h3",
    undefined,
    `${METRIC_LABELS[metric]} per day (UTC)`,
  );
  const chartBody = element("div", "stats-chart-body");
  const chartMax = element("span", "stats-chart-max");
  chartMax.dataset.chartMax = "";
  const chart = element("div", "stats-chart");
  chartBody.append(chartMax, chart);
  chartCard.append(chartHeading, chartBody);
  const chartSeriesNames = series.includes(functionName)
    ? series
    : [...series.slice(0, SERIES_COUNT - 1), functionName];
  renderUsageChart(
    chart,
    buildDailyChart(
      rows,
      dayKeys,
      [functionName],
      metric,
      pricing,
      aggregatedDays,
    ).map((day) => ({
      ...day,
      segments: day.segments.map((segment) => ({
        ...segment,
        series: functionName,
      })),
    })),
    chartSeriesNames,
    (value) => formatMetric(value, metric),
  );

  const dailyRows = [...rows]
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    .map((item) =>
      row([
        cell(`${item.dayKey}${item.live ? " (live)" : ""}`, "mono"),
        cell(NUMBER_FORMAT.format(item.totals.geminiCalls), "numeric"),
        cell(
          formatAverage(item.totals.promptTokens, item.totals.geminiCalls),
          "numeric",
        ),
        cell(
          formatAverage(item.totals.outputTokens, item.totals.geminiCalls),
          "numeric",
        ),
        cell(
          formatAverage(item.totals.thinkingTokens, item.totals.geminiCalls),
          "numeric",
        ),
        cell(NUMBER_FORMAT.format(item.totals.ttsCalls), "numeric"),
        cell(NUMBER_FORMAT.format(item.totals.ttsCharacters), "numeric"),
        costCell(estimateCost(item.totals, pricing)),
      ]),
    );

  const operations = Object.entries(totals.byOperation)
    .sort((a, b) => b[1].calls - a[1].calls)
    .map(([operation, usage]) =>
      row([
        cell(operation, "mono"),
        cell(usage.api),
        cell(NUMBER_FORMAT.format(usage.calls), "numeric"),
        cell(NUMBER_FORMAT.format(usage.promptTokens), "numeric"),
        cell(NUMBER_FORMAT.format(usage.outputTokens), "numeric"),
        cell(formatAverage(usage.outputTokens, usage.calls), "numeric"),
        cell(NUMBER_FORMAT.format(usage.characters), "numeric"),
      ]),
    );
  const models = Object.entries(totals.byModel)
    .sort((a, b) => b[1].totalTokens - a[1].totalTokens)
    .map(([model, usage]) =>
      row([
        cell(model, "mono"),
        cell(NUMBER_FORMAT.format(usage.calls), "numeric"),
        cell(NUMBER_FORMAT.format(usage.promptTokens), "numeric"),
        cell(NUMBER_FORMAT.format(usage.outputTokens), "numeric"),
        cell(NUMBER_FORMAT.format(usage.thinkingTokens), "numeric"),
        priceCell(modelCost(model, usage, pricing)),
      ]),
    );
  const voices = Object.entries(totals.byVoice)
    .sort((a, b) => b[1].characters - a[1].characters)
    .map(([voice, usage]) =>
      row([
        cell(voice, "mono"),
        cell(voiceType(voice) || "unknown"),
        cell(NUMBER_FORMAT.format(usage.calls), "numeric"),
        cell(NUMBER_FORMAT.format(usage.characters), "numeric"),
        priceCell(voiceCost(voice, usage, pricing)),
      ]),
    );

  const section = (title: string, content: HTMLElement | null) => {
    const node = element("section", "stats-details-section");
    node.append(element("h3", undefined, title));
    node.append(content || element("p", "stats-muted", "No usage."));
    return node;
  };
  container.replaceChildren(
    summary,
    chartCard,
    section(
      "Daily trend (UTC)",
      dailyRows.length
        ? table(
            [
              "Day",
              "Gemini calls",
              "Avg input / call",
              "Avg output / call",
              "Avg thinking / call",
              "TTS syntheses",
              "TTS characters",
              "Est. cost",
            ],
            dailyRows,
          )
        : null,
    ),
    section(
      "Operations",
      operations.length
        ? table(
            [
              "Operation",
              "API",
              "Calls",
              "Input tokens",
              "Output tokens",
              "Avg output / call",
              "TTS characters",
            ],
            operations,
          )
        : null,
    ),
    section(
      "Models",
      models.length
        ? table(
            [
              "Model",
              "Calls",
              "Input tokens",
              "Output tokens",
              "Thinking tokens",
              "Est. cost",
            ],
            models,
          )
        : null,
    ),
    section(
      "Voices",
      voices.length
        ? table(
            ["Voice", "Type", "Syntheses", "Characters", "Est. cost"],
            voices,
          )
        : null,
    ),
  );
}

interface LoadedStatistics {
  fromDayKey: string;
  toDayKey: string;
  dayKeys: string[];
  rows: DailyFunctionRow[];
  aggregatedDays: Set<string>;
  liveDays: string[];
  truncatedDays: string[];
  lastAggregatedAt: Date | null;
  lastAggregatedDayKey: string | null;
}

function readThreshold(): number {
  try {
    const stored = window.localStorage.getItem(THRESHOLD_STORAGE_KEY);
    const value = stored === null ? NaN : Number(stored);
    return Number.isFinite(value) && value >= 0
      ? value
      : DEFAULT_COST_THRESHOLD_USD;
  } catch {
    return DEFAULT_COST_THRESHOLD_USD;
  }
}

function storeThreshold(value: number): void {
  try {
    window.localStorage.setItem(THRESHOLD_STORAGE_KEY, String(value));
  } catch {
    // Storage may be blocked; the threshold then lasts for this page only.
  }
}

async function fetchStatistics(
  fromDayKey: string,
  toDayKey: string,
  includeLive: boolean,
): Promise<LoadedStatistics> {
  const db = getFirestore(getFirebaseApp());
  const root = doc(db, "statistics", "aiUsage");
  const [summarySnapshot, dailySnapshot, functionSnapshot] = await Promise.all([
    getDoc(root),
    getDocs(
      query(
        collection(root, "daily"),
        where("dayKey", ">=", fromDayKey),
        where("dayKey", "<=", toDayKey),
        orderBy("dayKey"),
      ),
    ),
    // Seven extra days give the first days of the range an alert baseline.
    getDocs(
      query(
        collection(root, "dailyByFunction"),
        where("dayKey", ">=", shiftDayKey(fromDayKey, -7)),
        where("dayKey", "<=", toDayKey),
        orderBy("dayKey"),
      ),
    ),
  ]);
  const summary = summarySnapshot.data() || {};
  const lastAggregatedDayKey =
    typeof summary.lastAggregatedDayKey === "string"
      ? summary.lastAggregatedDayKey
      : null;
  const aggregatedDays = new Set(
    dailySnapshot.docs.map((item) => String(item.data().dayKey || item.id)),
  );
  const rows = functionSnapshot.docs.flatMap((item) => {
    const mapped = mapDailyFunctionRow(item.data());
    return mapped ? [mapped] : [];
  });

  const liveDays: string[] = [];
  const truncatedDays: string[] = [];
  if (includeLive) {
    // Days after the last aggregation are built from raw events. Only the
    // most recent few: older raw events are not needed once aggregated.
    const candidates = dayKeysBetween(fromDayKey, toDayKey)
      .filter(
        (dayKey) =>
          !aggregatedDays.has(dayKey) &&
          (!lastAggregatedDayKey || dayKey > lastAggregatedDayKey),
      )
      .slice(-MAX_LIVE_DAYS);
    const snapshots = await Promise.all(
      candidates.map((dayKey) =>
        getDocs(
          query(
            collection(root, "events"),
            where("dayKey", "==", dayKey),
            limit(MAX_LIVE_EVENTS_PER_DAY + 1),
          ),
        ),
      ),
    );
    candidates.forEach((dayKey, index) => {
      const documents = snapshots[index].docs.slice(0, MAX_LIVE_EVENTS_PER_DAY);
      if (snapshots[index].docs.length > MAX_LIVE_EVENTS_PER_DAY) {
        truncatedDays.push(dayKey);
      }
      liveDays.push(dayKey);
      for (const [functionName, totals] of Object.entries(
        aggregateEvents(documents.map((item) => item.data())),
      )) {
        rows.push({ dayKey, functionName, live: true, totals });
      }
    });
  }

  return {
    fromDayKey,
    toDayKey,
    dayKeys: dayKeysBetween(fromDayKey, toDayKey),
    rows,
    aggregatedDays,
    liveDays,
    truncatedDays,
    lastAggregatedAt: timestampToDate(summary.lastAggregatedAt),
    lastAggregatedDayKey,
  };
}

export interface FunctionStatsView {
  load(force?: boolean): Promise<void>;
  reset(): void;
}

export function createFunctionStatsView(
  section: HTMLElement,
  isSignedIn: () => boolean,
): FunctionStatsView {
  const find = <T extends HTMLElement>(selector: string) =>
    section.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>("#fs-controls");
  const fromInput = find<HTMLInputElement>("#fs-from");
  const toInput = find<HTMLInputElement>("#fs-to");
  const liveInput = find<HTMLInputElement>("#fs-live");
  const thresholdInput = find<HTMLInputElement>("#fs-cost-threshold");
  const refresh = find<HTMLButtonElement>("#fs-refresh-button");
  const message = find<HTMLElement>("#fs-message");
  const content = find<HTMLElement>("#fs-content");
  const freshness = find<HTMLElement>("#fs-freshness");
  const liveNote = find<HTMLElement>("#fs-live-note");
  const summary = find<HTMLElement>("#fs-summary");
  const pricingNote = find<HTMLElement>("#fs-pricing-note");
  const alertsBox = find<HTMLElement>("#fs-alerts");
  const metricButtons = Array.from(
    section.querySelectorAll<HTMLButtonElement>("[data-fs-metric]"),
  );
  const chartTitle = find<HTMLElement>("#fs-chart-title");
  const legend = find<HTMLElement>("#fs-legend");
  const chart = find<HTMLElement>("#fs-chart");
  const tooltip = find<HTMLElement>("#fs-tooltip");
  const tableHead = find<HTMLElement>("#fs-function-head");
  const tableRows = find<HTMLElement>("#fs-function-rows");
  const dialog =
    document.querySelector<HTMLDialogElement>("#fs-details-dialog")!;
  const dialogTitle = document.querySelector<HTMLElement>("#fs-details-title")!;
  const dialogContent = document.querySelector<HTMLElement>(
    "#fs-details-content",
  )!;

  const cache = new Map<string, LoadedStatistics>();
  let current: LoadedStatistics | null = null;
  let metric: ChartMetric = "cost";
  let sortKey: FunctionSortKey = "cost";
  let sortDirection: "asc" | "desc" = "desc";
  let chartDays: ChartDay[] = [];
  let series: string[] = [];
  let loading = false;

  const today = () => utcDayKey(new Date());
  const resetRange = () => {
    const yesterday = shiftDayKey(today(), -1);
    fromInput.value = shiftDayKey(yesterday, -(DEFAULT_RANGE_DAYS - 1));
    toInput.value = yesterday;
    liveInput.checked = false;
  };
  const syncRangeInputs = () => {
    const now = today();
    fromInput.max = now;
    toInput.max = liveInput.checked ? now : shiftDayKey(now, -1);
    if (liveInput.checked) toInput.value = now;
    toInput.disabled = liveInput.checked;
  };
  resetRange();
  syncRangeInputs();
  thresholdInput.value = String(readThreshold());
  renderPricingNote(pricingNote, AI_PRICING);

  const showMessage = (text: string, kind = "") => {
    message.hidden = false;
    message.textContent = text;
    message.dataset.kind = kind;
  };

  const threshold = () => {
    const value = Number(thresholdInput.value);
    return Number.isFinite(value) && value > 0 ? value : null;
  };

  const renderFreshness = (data: LoadedStatistics) => {
    freshness.hidden = false;
    const stale = isAggregationStale(data.lastAggregatedAt);
    freshness.classList.toggle("is-stale", stale);
    freshness.textContent = data.lastAggregatedAt
      ? `Last aggregation: ${UTC_DATE_TIME.format(data.lastAggregatedAt)} UTC, day ${data.lastAggregatedDayKey || "—"}.${stale ? " Warning: older than 36 hours, the daily job may not be running." : ""}`
      : "No aggregation has run yet. Warning: the daily job may not be running.";
    const notes: string[] = [];
    if (data.liveDays.length) {
      notes.push(
        `Live from raw events (incomplete): ${data.liveDays.join(", ")}.`,
      );
    }
    if (data.truncatedDays.length) {
      notes.push(
        `Only the first ${NUMBER_FORMAT.format(MAX_LIVE_EVENTS_PER_DAY)} events were read for ${data.truncatedDays.join(", ")}; live totals are lower than actual.`,
      );
    }
    liveNote.hidden = !notes.length;
    liveNote.textContent = notes.join(" ");
  };

  const renderTable = (summaries: FunctionSummary[], alerts: UsageAlert[]) => {
    renderFunctionTableHead(tableHead, sortKey, sortDirection);
    renderFunctionRows(
      tableRows,
      sortFunctionSummaries(summaries, sortKey, sortDirection),
      series,
      new Set(alerts.map((alert) => alert.functionName)),
    );
  };

  const render = () => {
    if (!current) return;
    const data = current;
    renderFreshness(data);
    const rangeRows = data.rows.filter(
      (item) => item.dayKey >= data.fromDayKey && item.dayKey <= data.toDayKey,
    );
    if (!rangeRows.length) {
      content.hidden = true;
      showMessage(
        "No AI or TTS usage recorded in this range.",
        data.aggregatedDays.size ? "" : "empty",
      );
      return;
    }
    message.hidden = true;
    content.hidden = false;
    const totals = sumUsage(rangeRows);
    renderUsageSummary(summary, totals, estimateCost(totals, AI_PRICING));
    const summaries = summarizeFunctions(rangeRows, AI_PRICING);
    series = chartSeries(summaries);
    const alerts = detectUsageAlerts(data.rows, {
      fromDayKey: data.fromDayKey,
      toDayKey: data.toDayKey,
      costThresholdUsd: threshold(),
      pricing: AI_PRICING,
    });
    renderUsageAlerts(alertsBox, alerts);
    chartDays = buildDailyChart(
      rangeRows,
      data.dayKeys,
      series,
      metric,
      AI_PRICING,
      data.aggregatedDays,
    );
    chartTitle.textContent = `${METRIC_LABELS[metric]} per day and function (UTC)`;
    metricButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.fsMetric === metric),
      ),
    );
    renderChartLegend(legend, series, summaries.length > series.length);
    renderUsageChart(chart, chartDays, series, (value) =>
      formatMetric(value, metric),
    );
    renderTable(summaries, alerts);
  };

  const load = async (force = false) => {
    if (!isSignedIn() || loading) return;
    syncRangeInputs();
    const fromDayKey = fromInput.value;
    const toDayKey = liveInput.checked ? today() : toInput.value;
    if (!isDayKey(fromDayKey) || !isDayKey(toDayKey) || fromDayKey > toDayKey) {
      content.hidden = true;
      showMessage("Choose a valid date range.", "error");
      return;
    }
    if (dayKeysBetween(fromDayKey, toDayKey).length > MAX_RANGE_DAYS) {
      content.hidden = true;
      showMessage(`Choose a range of at most ${MAX_RANGE_DAYS} days.`, "error");
      return;
    }
    const key = `${fromDayKey}|${toDayKey}|${liveInput.checked}`;
    if (force) cache.clear();
    const cached = cache.get(key);
    if (cached) {
      current = cached;
      render();
      return;
    }
    loading = true;
    refresh.disabled = true;
    content.hidden = true;
    showMessage("Loading function statistics…");
    try {
      const data = await fetchStatistics(
        fromDayKey,
        toDayKey,
        liveInput.checked,
      );
      cache.set(key, data);
      current = data;
      render();
    } catch (error) {
      content.hidden = true;
      showMessage(
        errorCode(error) === "permission-denied"
          ? "No access. Reading statistics requires the admin claim and the Firestore rule for statistics/**."
          : "Unable to load function statistics. Try again later.",
        "error",
      );
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void load();
  });
  liveInput.addEventListener("change", () => {
    if (!liveInput.checked) toInput.value = shiftDayKey(today(), -1);
    syncRangeInputs();
    void load();
  });
  thresholdInput.addEventListener("change", () => {
    const value = Number(thresholdInput.value);
    if (Number.isFinite(value) && value >= 0) storeThreshold(value);
    render();
  });
  refresh.addEventListener("click", () => void load(true));
  metricButtons.forEach((button) =>
    button.addEventListener("click", () => {
      metric = (button.dataset.fsMetric as ChartMetric) || "cost";
      render();
    }),
  );
  tableHead.addEventListener("click", (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-sort]",
    );
    if (!button) return;
    const key = button.dataset.sort as FunctionSortKey;
    if (key === sortKey) {
      sortDirection = sortDirection === "asc" ? "desc" : "asc";
    } else {
      sortKey = key;
      sortDirection = key === "functionName" ? "asc" : "desc";
    }
    render();
  });
  tableRows.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "tr[data-function-name]",
    );
    const functionName = target?.dataset.functionName;
    if (!functionName || !current) return;
    const data = current;
    dialogTitle.textContent = functionName;
    renderFunctionDetails(dialogContent, {
      functionName,
      rows: data.rows.filter(
        (item) =>
          item.dayKey >= data.fromDayKey && item.dayKey <= data.toDayKey,
      ),
      dayKeys: data.dayKeys,
      aggregatedDays: data.aggregatedDays,
      series,
      metric,
      pricing: AI_PRICING,
    });
    dialog.showModal();
  });
  document
    .querySelector("#fs-close-details-button")
    ?.addEventListener("click", () => dialog.close());

  attachChartTooltip(chart, tooltip, (dayKey) => {
    const day = chartDays.find((item) => item.dayKey === dayKey);
    if (day) {
      renderChartTooltip(tooltip, day, series, (value) =>
        formatMetric(value, metric),
      );
    }
    return Boolean(day);
  });

  return {
    load,
    reset() {
      cache.clear();
      current = null;
      content.hidden = true;
      freshness.hidden = true;
      liveNote.hidden = true;
      showMessage("Loading function statistics…");
    },
  };
}
