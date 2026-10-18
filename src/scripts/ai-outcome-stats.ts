import {
  OUTCOMES_SINCE,
  OUTCOME_COUNTERS,
  aggregateOutcomeEvents,
  buildOutcomeChart,
  clipToOutcomeData,
  codeLabel,
  compareWithPrevious,
  dailyCounter,
  detectOutcomeAlerts,
  emptyOutcomeTotals,
  mapOutcomeDay,
  mapOutcomeFunctionRow,
  parseOutcomeThresholds,
  sortCodeSummaries,
  summarizeCodes,
  summarizeOutcomeFunctions,
  usersPerDay,
  type CodeSortKey,
  type CodeSummary,
  type CounterComparison,
  type OutcomeAlert,
  type OutcomeCounter,
  type OutcomeDay,
  type OutcomeFunctionRow,
  type OutcomeKind,
  type OutcomeThresholds,
  type UsersPerDay,
} from "../lib/ai-outcome-stats";
import {
  aggregateEvents,
  dayKeysBetween,
  isDayKey,
  shiftDayKey,
  utcDayKey,
} from "../lib/function-stats";
import {
  OTHER_SERIES,
  SERIES_COUNT,
  attachChartTooltip,
  element,
  renderChartLegend,
  renderChartTooltip,
  renderUsageChart,
  seriesColor,
  type ChartDay,
  type ChartLine,
} from "./admin-chart";
import { loadFailureMessage, renderMessageText } from "./admin-stats";
import {
  MAX_LIVE_EVENTS_PER_DAY,
  clearAiUsageCache,
  loadAiUsage,
  renderAggregationFreshness,
} from "./ai-usage-data";

const NUMBER_FORMAT = new Intl.NumberFormat("pl-PL");
const DECIMAL_FORMAT = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 1,
});
const PERCENT_FORMAT = new Intl.NumberFormat("pl-PL", {
  style: "percent",
  maximumFractionDigits: 2,
});
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 180;
const THRESHOLDS_STORAGE_KEY = "tripletalk-admin-ai-outcome-thresholds";

const KIND_TITLES: Record<OutcomeKind, string> = {
  limit: "Limit refusals",
  failure: "Final failures",
  retry: "Retries",
  moderation: "Moderation rejections",
};

const COUNTER_LABELS: Record<OutcomeCounter, string> = {
  limitRefusals: "Limit refusals",
  failures: "Final failures",
  retries: "Retries",
  moderationRejections: "Moderation rejections",
};

const ALERT_LABELS: Record<OutcomeAlert["kind"], string> = {
  "moderation-failed-open": "Unchecked content",
  "failures-without-calls": "Failures without calls",
  "failure-rate": "Failure rate",
  "retry-spike": "Retry spike",
  "moderation-users": "Possible false rejections",
  "moderation-single-user": "Possible abuse",
};

function format(value: number): string {
  return NUMBER_FORMAT.format(value);
}

function codeName(kind: OutcomeKind, code: string): string {
  if (code === OTHER_SERIES) return OTHER_SERIES;
  return codeLabel(kind, code) || code;
}

/** "1–3", or one number when every day had the same count; "–" without
 * users (retries never know the user). */
export function formatUsersPerDay(users: UsersPerDay | null): string {
  if (!users) return "–";
  return users.min === users.max
    ? format(users.max)
    : `${format(users.min)}–${format(users.max)}`;
}

export function formatComparison(
  comparison: CounterComparison,
  previousDays: number,
): string {
  const period = `previous ${format(previousDays)} ${previousDays === 1 ? "day" : "days"}`;
  if (comparison.previous === null) return `No data for the ${period}`;
  const difference = comparison.value - comparison.previous;
  const sign = difference > 0 ? "+" : difference < 0 ? "−" : "±";
  const relative =
    comparison.previous > 0
      ? ` (${sign}${DECIMAL_FORMAT.format((Math.abs(difference) / comparison.previous) * 100)}%)`
      : "";
  return `${sign}${format(Math.abs(difference))}${relative} vs ${period}${comparison.previousPartial ? ", partly without data" : ""}`;
}

export function renderOutcomeSummary(
  container: HTMLElement,
  comparisons: Record<OutcomeCounter, CounterComparison>,
  previousDays: number,
): void {
  for (const field of Object.values(OUTCOME_COUNTERS)) {
    const value = container.querySelector<HTMLElement>(
      `[data-al-total="${field}"]`,
    );
    const delta = container.querySelector<HTMLElement>(
      `[data-al-delta="${field}"]`,
    );
    if (value) value.textContent = format(comparisons[field].value);
    if (delta) {
      delta.textContent = formatComparison(comparisons[field], previousDays);
    }
  }
}

function alertDetail(alert: OutcomeAlert): string {
  switch (alert.kind) {
    case "moderation-failed-open":
      return `${format(alert.value)} texts passed without moderation`;
    case "failures-without-calls":
      return `${format(alert.value)} final failures and no successful API call`;
    case "failure-rate":
      return `${PERCENT_FORMAT.format(alert.value)} of calls failed, above ${PERCENT_FORMAT.format(alert.reference)}`;
    case "retry-spike":
      return `${format(alert.value)} retries vs ${DECIMAL_FORMAT.format(alert.reference)} a day on average over the previous 7 days`;
    case "moderation-users":
      return `${format(alert.value)} different users rejected in one day (threshold ${format(alert.reference)})`;
    case "moderation-single-user":
      return `${format(alert.value)} rejections from a single user in one day (threshold ${format(alert.reference)})`;
  }
}

export function renderOutcomeAlerts(
  container: HTMLElement,
  alerts: OutcomeAlert[],
): void {
  container.replaceChildren();
  container.hidden = !alerts.length;
  if (!alerts.length) return;
  const list = element("ul");
  for (const alert of alerts) {
    const item = element("li", `stats-alert stats-alert-${alert.kind}`);
    const where = [alert.dayKey, alert.functionName, alert.code]
      .filter(Boolean)
      .join(" · ");
    item.append(
      element("strong", undefined, ALERT_LABELS[alert.kind]),
      element("span", "mono", where),
      element("span", undefined, alertDetail(alert)),
    );
    list.append(item);
  }
  container.append(
    element("h2", undefined, `Alerts (${format(alerts.length)})`),
    list,
  );
}

interface CodeColumn {
  key: CodeSortKey | "functions";
  label: string;
}

function codeColumns(kind: OutcomeKind): CodeColumn[] {
  const columns: CodeColumn[] = [
    { key: "label", label: "Name" },
    { key: "code", label: "Code" },
    { key: "count", label: "Count" },
  ];
  if (kind !== "retry" && kind !== "failure") {
    columns.push({ key: "users", label: "Users per day" });
  }
  columns.push({
    key: "functions",
    label: kind === "failure" ? "Functions (share of calls)" : "Functions",
  });
  return columns;
}

export function renderCodeTableHead(
  row: HTMLElement,
  kind: OutcomeKind,
  sortKey: CodeSortKey,
  direction: "asc" | "desc",
): void {
  row.replaceChildren(
    ...codeColumns(kind).map((column) => {
      const header = element("th");
      if (column.key === "count" || column.key === "users") {
        header.className = "numeric";
      }
      if (column.key === "functions") {
        header.textContent = column.label;
        return header;
      }
      header.setAttribute(
        "aria-sort",
        column.key === sortKey
          ? direction === "asc"
            ? "ascending"
            : "descending"
          : "none",
      );
      const button = element(
        "button",
        "stats-sort",
        `${column.label}${column.key === sortKey ? (direction === "asc" ? " ↑" : " ↓") : ""}`,
      );
      button.type = "button";
      button.dataset.sort = column.key;
      header.append(button);
      return header;
    }),
  );
}

function functionButton(functionName: string): HTMLButtonElement {
  const button = element("button", "stats-function-button");
  button.type = "button";
  button.dataset.functionName = functionName;
  button.append(element("span", "mono", functionName));
  return button;
}

function functionsCell(summary: CodeSummary): HTMLTableCellElement {
  const node = element("td", "stats-function-list");
  if (!summary.functions.length) {
    node.textContent = "—";
    return node;
  }
  for (const share of summary.functions) {
    const line = element("div");
    line.append(functionButton(share.functionName));
    let detail = ` ${format(share.count)}`;
    if (summary.kind === "failure") {
      detail +=
        share.rate === null
          ? " · no calls"
          : ` · ${PERCENT_FORMAT.format(share.rate)} of ${format(share.calls)} calls`;
    }
    line.append(element("span", "stats-muted-inline", detail));
    node.append(line);
  }
  return node;
}

/** Rows of a code table. `tags` maps codes to highlight labels; every row
 * with a tag is highlighted. */
export function renderCodeRows(
  container: HTMLElement,
  kind: OutcomeKind,
  summaries: CodeSummary[],
  tags: Map<string, string[]>,
): void {
  if (!summaries.length) {
    const empty = element("td", "stats-muted-cell", "None in this range.");
    empty.colSpan = codeColumns(kind).length;
    const row = element("tr");
    row.append(empty);
    container.replaceChildren(row);
    return;
  }
  container.replaceChildren(
    ...summaries.map((summary) => {
      const row = element("tr");
      const name = element("td");
      const swatch = element("span", "stats-swatch");
      name.append(swatch, " ", summary.label || summary.code);
      const codeTags = tags.get(summary.code) || [];
      if (codeTags.length) row.classList.add("has-alert");
      for (const tag of codeTags) {
        name.append(element("span", "stats-tag stats-tag-alert", tag));
      }
      row.append(
        name,
        element("td", "mono", summary.code),
        element("td", "numeric", format(summary.count)),
      );
      if (kind !== "retry" && kind !== "failure") {
        const users = element(
          "td",
          "numeric",
          formatUsersPerDay(summary.users),
        );
        if (summary.users) {
          users.title = `On ${format(summary.users.days)} days, ${DECIMAL_FORMAT.format(summary.users.average)} users a day on average`;
        }
        row.append(users);
      }
      row.append(functionsCell(summary));
      row.dataset.code = summary.code;
      return row;
    }),
  );
}

/** Swatch colors of a code table, matching the chart of the same kind. */
function colorCodeRows(container: HTMLElement, series: string[]): void {
  container.querySelectorAll<HTMLElement>("tr[data-code]").forEach((row) => {
    const swatch = row.querySelector<HTMLElement>(".stats-swatch");
    if (swatch)
      swatch.style.background = seriesColor(series, row.dataset.code!);
  });
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

function rateText(failures: number, calls: number): string {
  return calls ? PERCENT_FORMAT.format(failures / calls) : "—";
}

export function renderOutcomeFunctionRows(
  container: HTMLElement,
  rows: OutcomeFunctionRow[],
  alertedFunctions: Set<string>,
): void {
  const summaries = summarizeOutcomeFunctions(rows);
  if (!summaries.length) {
    const empty = element("td", "stats-muted-cell", "None in this range.");
    empty.colSpan = 7;
    const row = element("tr");
    row.append(empty);
    container.replaceChildren(row);
    return;
  }
  container.replaceChildren(
    ...summaries.map((summary) => {
      const row = element("tr");
      row.dataset.functionName = summary.functionName;
      const name = element("td");
      name.append(functionButton(summary.functionName));
      if (alertedFunctions.has(summary.functionName)) {
        row.classList.add("has-alert");
        name.append(element("span", "stats-tag stats-tag-alert", "Alert"));
      }
      row.append(
        name,
        element("td", "numeric", format(summary.limitRefusals)),
        element("td", "numeric", format(summary.failures)),
        element("td", "numeric", rateText(summary.failures, summary.calls)),
        element("td", "numeric", format(summary.retries)),
        element("td", "numeric", format(summary.moderationRejections)),
        element("td", "numeric", format(summary.calls)),
      );
      return row;
    }),
  );
}

const STACKED_COUNTERS: OutcomeCounter[] = [
  "limitRefusals",
  "failures",
  "moderationRejections",
];

/** Daily trend of one function: limits, failures and moderation stacked,
 * retries as a line. Days without data stay "No data". */
function functionChartDays(
  rows: OutcomeFunctionRow[],
  dayKeys: string[],
  dataDays: Set<string>,
): { days: ChartDay[]; retries: Array<number | null> } {
  const byDay = new Map(rows.map((row) => [row.dayKey, row]));
  const days = dayKeys.map((dayKey) => {
    const row = byDay.get(dayKey);
    const aggregated = dataDays.has(dayKey);
    const segments = aggregated
      ? STACKED_COUNTERS.map((field) => ({
          series: field,
          value: row?.hasData ? row.totals[field] : 0,
        })).filter((segment) => segment.value > 0)
      : [];
    return {
      dayKey,
      live: Boolean(row?.live),
      aggregated,
      unpriced: false,
      total: segments.reduce((sum, segment) => sum + segment.value, 0),
      segments,
    };
  });
  return {
    days,
    retries: dayKeys.map((dayKey) =>
      dataDays.has(dayKey) ? (byDay.get(dayKey)?.totals.retries ?? 0) : null,
    ),
  };
}

function chartCard(
  title: string,
  extraClass = "",
): {
  card: HTMLElement;
  legend: HTMLElement;
  chart: HTMLElement;
  tooltip: HTMLElement;
  note: HTMLElement;
} {
  const card = element("section", `stats-chart-card ${extraClass}`.trim());
  const header = element("div", "stats-chart-header");
  header.append(element("h2", undefined, title));
  const legend = element("ul", "stats-legend");
  const body = element("div", "stats-chart-body");
  const max = element("span", "stats-chart-max");
  max.dataset.chartMax = "";
  const chart = element("div", "stats-chart");
  body.append(max, chart);
  const tooltip = element("div", "stats-tooltip");
  tooltip.hidden = true;
  const note = element("p", "stats-muted stats-chart-note");
  note.hidden = true;
  card.append(header, legend, body, tooltip, note);
  return { card, legend, chart, tooltip, note };
}

function appendLineLegend(legend: HTMLElement, label: string): void {
  const item = element("li");
  item.append(
    element("span", "stats-swatch stats-swatch-line"),
    element("span", undefined, label),
  );
  legend.append(item);
}

export function renderOutcomeFunctionDetails(
  container: HTMLElement,
  options: {
    functionName: string;
    rows: OutcomeFunctionRow[];
    dayKeys: string[];
    dataDays: Set<string>;
  },
): void {
  const { functionName, dayKeys, dataDays } = options;
  const rows = options.rows
    .filter((row) => row.functionName === functionName)
    .sort((a, b) => a.dayKey.localeCompare(b.dayKey));
  const totals = summarizeOutcomeFunctions(rows)[0] || {
    ...emptyOutcomeTotals(),
    calls: rows.reduce((sum, row) => sum + row.calls, 0),
  };

  const summary = element("dl", "details-grid");
  const detail = (label: string, value: string) => {
    const item = element("div", "detail-item");
    item.append(
      element("dt", undefined, label),
      element("dd", undefined, value),
    );
    summary.append(item);
  };
  for (const field of Object.values(OUTCOME_COUNTERS)) {
    detail(COUNTER_LABELS[field], format(totals[field]));
  }
  detail("API calls (Gemini + TTS)", format(totals.calls));
  detail("Failure rate", rateText(totals.failures, totals.calls));

  const { card, legend, chart } = chartCard(
    "Daily trend (UTC)",
    "stats-details-chart",
  );
  renderChartLegend(
    legend,
    STACKED_COUNTERS,
    false,
    (name) => COUNTER_LABELS[name as OutcomeCounter],
  );
  appendLineLegend(legend, "Retries");
  const trend = functionChartDays(rows, dayKeys, dataDays);
  renderUsageChart(chart, trend.days, STACKED_COUNTERS, format, {
    label: "retries",
    values: trend.retries,
  });

  const dailyRows = dayKeys
    .slice()
    .reverse()
    .map((dayKey) => {
      const row = rows.find((item) => item.dayKey === dayKey);
      const node = element("tr");
      node.append(
        element("td", "mono", `${dayKey}${row?.live ? " (incomplete)" : ""}`),
      );
      if (!dataDays.has(dayKey)) {
        const empty = element("td", "stats-muted-cell", "No data");
        empty.colSpan = 6;
        node.append(empty);
        return node;
      }
      const value = (field: OutcomeCounter) =>
        format(row?.hasData ? row.totals[field] : 0);
      node.append(
        element("td", "numeric", value("limitRefusals")),
        element("td", "numeric", value("failures")),
        element("td", "numeric", value("retries")),
        element("td", "numeric", value("moderationRejections")),
        element("td", "numeric", format(row?.calls || 0)),
        element(
          "td",
          "numeric",
          rateText(row?.totals.failures || 0, row?.calls || 0),
        ),
      );
      return node;
    });

  const section = (title: string, content: HTMLElement | null) => {
    const node = element("section", "stats-details-section");
    node.append(element("h3", undefined, title));
    node.append(content || element("p", "stats-muted", "None in this range."));
    return node;
  };
  const kindSections = (
    ["limit", "failure", "retry", "moderation"] as const
  ).map((kind) => {
    const codes = summarizeCodes(rows, rows, kind);
    return section(
      KIND_TITLES[kind],
      codes.length
        ? table(
            ["Name", "Code", "Count", "Users per day"],
            codes.map((item) => {
              const node = element("tr");
              node.append(
                element("td", undefined, item.label || item.code),
                element("td", "mono", item.code),
                element("td", "numeric", format(item.count)),
                element(
                  "td",
                  "numeric",
                  formatUsersPerDay(usersPerDay(rows, kind, item.code)),
                ),
              );
              return node;
            }),
          )
        : null,
    );
  });

  container.replaceChildren(
    summary,
    card,
    section(
      "Per day (UTC)",
      table(
        [
          "Day",
          "Limit refusals",
          "Final failures",
          "Retries",
          "Moderation",
          "API calls",
          "Failure rate",
        ],
        dailyRows,
      ),
    ),
    ...kindSections,
  );
}

function readThresholds(): OutcomeThresholds {
  try {
    const stored = window.localStorage.getItem(THRESHOLDS_STORAGE_KEY);
    return parseOutcomeThresholds(stored ? JSON.parse(stored) : null);
  } catch {
    return parseOutcomeThresholds(null);
  }
}

function storeThresholds(thresholds: OutcomeThresholds): void {
  try {
    window.localStorage.setItem(
      THRESHOLDS_STORAGE_KEY,
      JSON.stringify(thresholds),
    );
  } catch {
    // Storage may be blocked; the thresholds then last for this page only.
  }
}

interface LoadedOutcomes {
  fromDayKey: string;
  toDayKey: string;
  dayKeys: string[];
  previousDayKeys: string[];
  /** Days of the range and before it (previous range, alert baseline). */
  days: OutcomeDay[];
  rows: OutcomeFunctionRow[];
  /** Days with outcome data (aggregated with the new fields, or live). */
  dataDays: Set<string>;
  liveDays: string[];
  truncatedDays: string[];
  lastAggregatedAt: Date | null;
  lastAggregatedDayKey: string | null;
}

async function fetchOutcomes(
  fromDayKey: string,
  toDayKey: string,
  includeLive: boolean,
): Promise<LoadedOutcomes> {
  const data = await loadAiUsage(fromDayKey, toDayKey, includeLive);
  const days = data.daily.map(mapOutcomeDay);
  const rows = data.dailyByFunction.map(mapOutcomeFunctionRow);
  for (const { dayKey, events } of data.live) {
    const outcomes = aggregateOutcomeEvents(events);
    days.push({ dayKey, live: true, hasData: true, totals: outcomes.totals });
    const usage = aggregateEvents(events);
    const functions = new Set([
      ...Object.keys(outcomes.byFunction),
      ...Object.keys(usage),
    ]);
    for (const functionName of functions) {
      rows.push({
        dayKey,
        functionName,
        live: true,
        hasData: true,
        calls: usage[functionName]
          ? usage[functionName].geminiCalls + usage[functionName].ttsCalls
          : 0,
        totals: outcomes.byFunction[functionName] || emptyOutcomeTotals(),
      });
    }
  }
  const length = dayKeysBetween(fromDayKey, toDayKey).length;
  return {
    fromDayKey,
    toDayKey,
    dayKeys: dayKeysBetween(fromDayKey, toDayKey),
    previousDayKeys: dayKeysBetween(
      shiftDayKey(fromDayKey, -length),
      shiftDayKey(fromDayKey, -1),
    ),
    days,
    rows,
    dataDays: new Set(
      days.filter((day) => day.hasData).map((day) => day.dayKey),
    ),
    liveDays: data.live.map((day) => day.dayKey),
    truncatedDays: data.live
      .filter((day) => day.truncated)
      .map((day) => day.dayKey),
    lastAggregatedAt: data.lastAggregatedAt,
    lastAggregatedDayKey: data.lastAggregatedDayKey,
  };
}

interface KindView {
  kind: OutcomeKind;
  chart?: ReturnType<typeof chartCard>;
  head: HTMLElement;
  body: HTMLElement;
  sortKey: CodeSortKey;
  sortDirection: "asc" | "desc";
  series: string[];
  chartDays: ChartDay[];
  line?: ChartLine;
}

export interface AiOutcomeStatsView {
  load(force?: boolean): Promise<void>;
  reset(): void;
}

export function createAiOutcomeStatsView(
  section: HTMLElement,
  isSignedIn: () => boolean,
): AiOutcomeStatsView {
  const find = <T extends HTMLElement>(selector: string) =>
    section.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>("#al-controls");
  const fromInput = find<HTMLInputElement>("#al-from");
  const toInput = find<HTMLInputElement>("#al-to");
  const liveInput = find<HTMLInputElement>("#al-live");
  const refresh = find<HTMLButtonElement>("#al-refresh-button");
  const thresholdInputs = Array.from(
    section.querySelectorAll<HTMLInputElement>("[data-al-threshold]"),
  );
  const message = find<HTMLElement>("#al-message");
  const content = find<HTMLElement>("#al-content");
  const freshness = find<HTMLElement>("#al-freshness");
  const rangeNote = find<HTMLElement>("#al-range-note");
  const liveNote = find<HTMLElement>("#al-live-note");
  const summary = find<HTMLElement>("#al-summary");
  const alertsBox = find<HTMLElement>("#al-alerts");
  const charts = find<HTMLElement>("#al-charts");
  const tables = find<HTMLElement>("#al-tables");
  const functionRows = find<HTMLElement>("#al-function-rows");
  const dialog =
    document.querySelector<HTMLDialogElement>("#al-details-dialog")!;
  const dialogTitle = document.querySelector<HTMLElement>("#al-details-title")!;
  const dialogContent = document.querySelector<HTMLElement>(
    "#al-details-content",
  )!;

  const chartTitles: Partial<Record<OutcomeKind, string>> = {
    limit: "Limit refusals per day and code (UTC)",
    failure: "Final failures per day and code, retries as a line (UTC)",
    moderation: "Moderation rejections per day and code (UTC)",
  };
  const tableTitles: Record<OutcomeKind, string> = {
    limit: "Limits",
    failure: "Final failures",
    retry: "Retries",
    moderation: "Moderation",
  };
  const tableNotes: Record<OutcomeKind, string> = {
    limit:
      "Count is the number of refused items: one user can produce many (each flashcard of an import after the limit). Users are distinct users per day, never added up across days.",
    failure:
      "AI work that ended without a result for the user. Share of calls: failures of the code in a function divided by its Gemini responses and TTS syntheses in the range.",
    retry:
      "Transient errors after which a trigger is retried. Triggers do not know the user, so there is no user count.",
    moderation:
      "All in the School module. The rejected content itself is not stored, only counts.",
  };
  const views = (["limit", "failure", "moderation", "retry"] as const).map(
    (kind): KindView => {
      const view: KindView = {
        kind,
        head: element("tr"),
        body: element("tbody"),
        sortKey: "count",
        sortDirection: "desc",
        series: [],
        chartDays: [],
      };
      if (chartTitles[kind]) {
        view.chart = chartCard(chartTitles[kind]!);
        charts.append(view.chart.card);
      }
      const block = element("section", "stats-functions");
      block.append(
        element("h2", undefined, tableTitles[kind]),
        element("p", "stats-muted", tableNotes[kind]),
      );
      const wrap = element("div", "stats-table-wrap");
      const node = element("table", "admin-table stats-table");
      const head = element("thead");
      head.append(view.head);
      node.append(head, view.body);
      wrap.append(node);
      block.append(wrap);
      tables.append(block);
      return view;
    },
  );

  let current: LoadedOutcomes | null = null;
  let showEarlier = false;
  let thresholds = readThresholds();
  let loading = false;

  const today = () => utcDayKey(new Date());
  const resetRange = () => {
    const yesterday = shiftDayKey(today(), -1);
    fromInput.value = shiftDayKey(yesterday, -(DEFAULT_RANGE_DAYS - 1));
    toInput.value = yesterday;
    liveInput.checked = false;
    showEarlier = false;
  };
  const syncRangeInputs = () => {
    const now = today();
    fromInput.max = now;
    toInput.max = liveInput.checked ? now : shiftDayKey(now, -1);
    if (liveInput.checked) toInput.value = now;
    toInput.disabled = liveInput.checked;
  };
  const syncThresholdInputs = () => {
    for (const input of thresholdInputs) {
      input.value = String(
        thresholds[input.dataset.alThreshold as keyof OutcomeThresholds],
      );
    }
  };
  resetRange();
  syncRangeInputs();
  syncThresholdInputs();

  const showMessage = (text: string, kind = "") => {
    message.hidden = false;
    renderMessageText(message, text);
    message.dataset.kind = kind;
  };

  const renderRangeNote = (clippedFrom: string | null) => {
    rangeNote.replaceChildren();
    rangeNote.hidden = !clippedFrom && !showEarlier;
    if (clippedFrom) {
      rangeNote.append(
        `Outcomes are recorded since ${OUTCOMES_SINCE} (UTC), so the range starts on ${clippedFrom} instead of ${fromInput.value}. `,
      );
      const button = element(
        "button",
        "stats-link-button",
        "Show earlier days as “No data”",
      );
      button.type = "button";
      button.addEventListener("click", () => {
        showEarlier = true;
        void load();
      });
      rangeNote.append(button);
    } else if (showEarlier) {
      rangeNote.append(
        `Days before ${OUTCOMES_SINCE} (UTC) have no outcome data. `,
      );
      const button = element(
        "button",
        "stats-link-button",
        `Start the range on ${OUTCOMES_SINCE}`,
      );
      button.type = "button";
      button.addEventListener("click", () => {
        showEarlier = false;
        void load();
      });
      rangeNote.append(button);
    }
  };

  const renderLiveNote = (data: LoadedOutcomes) => {
    const notes: string[] = [];
    if (data.liveDays.length) {
      notes.push(
        `Live from raw events (incomplete day): ${data.liveDays.join(", ")}.`,
      );
    }
    if (data.truncatedDays.length) {
      notes.push(
        `Only the first ${format(MAX_LIVE_EVENTS_PER_DAY)} events were read for ${data.truncatedDays.join(", ")}; live counts are lower than actual.`,
      );
    }
    const missing = data.dayKeys.filter((dayKey) => !data.dataDays.has(dayKey));
    if (missing.length) {
      notes.push(
        `No data for ${format(missing.length)} ${missing.length === 1 ? "day" : "days"} of the range${missing.length <= 5 ? ` (${missing.join(", ")})` : ""}: not aggregated yet or aggregated before outcomes were recorded. They are shown as “No data”, not 0.`,
      );
    }
    liveNote.hidden = !notes.length;
    liveNote.textContent = notes.join(" ");
  };

  const openFunction = (functionName: string) => {
    if (!current) return;
    const data = current;
    dialogTitle.textContent = functionName;
    renderOutcomeFunctionDetails(dialogContent, {
      functionName,
      rows: data.rows.filter(
        (row) => row.dayKey >= data.fromDayKey && row.dayKey <= data.toDayKey,
      ),
      dayKeys: data.dayKeys,
      dataDays: data.dataDays,
    });
    dialog.showModal();
  };

  const renderKind = (
    view: KindView,
    days: OutcomeDay[],
    rows: OutcomeFunctionRow[],
    dayKeys: string[],
    tags: Map<string, string[]>,
  ) => {
    const summaries = summarizeCodes(days, rows, view.kind);
    view.series = summaries
      .filter((item) => item.count > 0)
      .slice(0, SERIES_COUNT)
      .map((item) => item.code);
    renderCodeTableHead(view.head, view.kind, view.sortKey, view.sortDirection);
    renderCodeRows(
      view.body,
      view.kind,
      sortCodeSummaries(summaries, view.sortKey, view.sortDirection),
      tags,
    );
    colorCodeRows(view.body, view.series);
    if (!view.chart) return;
    view.chartDays = buildOutcomeChart(days, dayKeys, view.kind, view.series);
    view.line =
      view.kind === "failure"
        ? { label: "retries", values: dailyCounter(days, dayKeys, "retries") }
        : undefined;
    const label = (name: string) => codeName(view.kind, name);
    renderChartLegend(
      view.chart.legend,
      view.series,
      summaries.filter((item) => item.count > 0).length > view.series.length,
      label,
    );
    if (view.line) appendLineLegend(view.chart.legend, "Retries");
    renderUsageChart(
      view.chart.chart,
      view.chartDays,
      view.series,
      format,
      view.line,
    );
    const empty = view.chartDays.every((day) => !day.total);
    view.chart.note.hidden = !empty;
    view.chart.note.textContent = empty ? "None in this range." : "";
  };

  const render = () => {
    if (!current) return;
    const data = current;
    renderAggregationFreshness(freshness, data);
    renderLiveNote(data);
    const inRange = <T extends OutcomeDay>(item: T) =>
      item.dayKey >= data.fromDayKey && item.dayKey <= data.toDayKey;
    const days = data.days.filter(inRange);
    const rows = data.rows.filter(inRange);
    if (!days.some((day) => day.hasData)) {
      content.hidden = true;
      showMessage(
        `No outcome data in this range. Days aggregated before ${OUTCOMES_SINCE} (UTC) have no outcome fields, and the last ${data.lastAggregatedDayKey ? `aggregated day is ${data.lastAggregatedDayKey}` : "aggregation has not run yet"}.${liveInput.checked ? "" : " Turn on “Include today” to count today from raw events."}`,
        "empty",
      );
      return;
    }
    message.hidden = true;
    content.hidden = false;

    renderOutcomeSummary(
      summary,
      compareWithPrevious(days, data.days, data.previousDayKeys),
      data.previousDayKeys.length,
    );
    const alerts = detectOutcomeAlerts(data.days, data.rows, {
      fromDayKey: data.fromDayKey,
      toDayKey: data.toDayKey,
      thresholds,
    });
    renderOutcomeAlerts(alertsBox, alerts);

    const tags = new Map<OutcomeKind, Map<string, string[]>>();
    const tag = (kind: OutcomeKind, code: string, label: string) => {
      const byCode = tags.get(kind) || new Map<string, string[]>();
      const list = byCode.get(code) || [];
      if (!list.includes(label)) list.push(label);
      byCode.set(code, list);
      tags.set(kind, byCode);
    };
    for (const alert of alerts) {
      if (alert.kind === "moderation-users" && alert.code) {
        tag("moderation", alert.code, ALERT_LABELS[alert.kind]);
      } else if (alert.kind === "moderation-single-user" && alert.code) {
        tag("moderation", alert.code, ALERT_LABELS[alert.kind]);
      }
    }
    const failedOpen = days.some(
      (day) =>
        day.hasData &&
        day.totals.byOutcome.failure.moderation_failed_open?.count,
    );
    if (failedOpen) {
      tag(
        "failure",
        "moderation_failed_open",
        ALERT_LABELS["moderation-failed-open"],
      );
    }
    for (const view of views) {
      renderKind(
        view,
        days,
        rows,
        data.dayKeys,
        tags.get(view.kind) || new Map(),
      );
    }
    renderOutcomeFunctionRows(
      functionRows,
      rows,
      new Set(
        alerts.flatMap((alert) =>
          alert.functionName ? [alert.functionName] : [],
        ),
      ),
    );
  };

  const load = async (force = false) => {
    if (!isSignedIn() || loading) return;
    syncRangeInputs();
    const requestedFrom = fromInput.value;
    const toDayKey = liveInput.checked ? today() : toInput.value;
    if (
      !isDayKey(requestedFrom) ||
      !isDayKey(toDayKey) ||
      requestedFrom > toDayKey
    ) {
      content.hidden = true;
      rangeNote.hidden = true;
      showMessage("Choose a valid date range.", "error");
      return;
    }
    const clip = showEarlier
      ? { fromDayKey: requestedFrom, clipped: false }
      : clipToOutcomeData(requestedFrom);
    const fromDayKey = clip.fromDayKey;
    renderRangeNote(clip.clipped ? fromDayKey : null);
    if (fromDayKey > toDayKey) {
      content.hidden = true;
      freshness.hidden = true;
      liveNote.hidden = true;
      showMessage(
        `No outcome data in this range: recording started on ${OUTCOMES_SINCE} (UTC).${liveInput.checked ? "" : " Turn on “Include today” or choose later days."}`,
        "empty",
      );
      return;
    }
    if (dayKeysBetween(fromDayKey, toDayKey).length > MAX_RANGE_DAYS) {
      content.hidden = true;
      showMessage(`Choose a range of at most ${MAX_RANGE_DAYS} days.`, "error");
      return;
    }
    if (force) clearAiUsageCache();
    loading = true;
    refresh.disabled = true;
    content.hidden = true;
    showMessage("Loading AI limits and errors…");
    try {
      current = await fetchOutcomes(fromDayKey, toDayKey, liveInput.checked);
      render();
    } catch (error) {
      content.hidden = true;
      showMessage(loadFailureMessage("AI limits and errors", error), "error");
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
  refresh.addEventListener("click", () => void load(true));
  for (const input of thresholdInputs) {
    input.addEventListener("change", () => {
      thresholds = parseOutcomeThresholds({
        ...thresholds,
        [input.dataset.alThreshold || ""]: Number(input.value),
      });
      storeThresholds(thresholds);
      syncThresholdInputs();
      render();
    });
  }
  find<HTMLButtonElement>("#al-thresholds-reset").addEventListener(
    "click",
    () => {
      thresholds = parseOutcomeThresholds(null);
      storeThresholds(thresholds);
      syncThresholdInputs();
      render();
    },
  );
  for (const view of views) {
    view.head.addEventListener("click", (event) => {
      const button = (event.target as HTMLElement).closest<HTMLButtonElement>(
        "button[data-sort]",
      );
      if (!button) return;
      const key = button.dataset.sort as CodeSortKey;
      if (key === view.sortKey) {
        view.sortDirection = view.sortDirection === "asc" ? "desc" : "asc";
      } else {
        view.sortKey = key;
        view.sortDirection = key === "label" || key === "code" ? "asc" : "desc";
      }
      render();
    });
    if (view.chart) {
      const { chart, tooltip } = view.chart;
      attachChartTooltip(chart, tooltip, (dayKey) => {
        const index = view.chartDays.findIndex(
          (item) => item.dayKey === dayKey,
        );
        const day = view.chartDays[index];
        if (!day) return false;
        const lineValue = view.line?.values[index];
        renderChartTooltip(
          tooltip,
          day,
          view.series,
          format,
          (name) => codeName(view.kind, name),
          lineValue === null || lineValue === undefined
            ? undefined
            : `Retries: ${format(lineValue)}`,
        );
        return true;
      });
    }
  }
  section.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(
      "[data-function-name]",
    );
    const functionName = target?.dataset.functionName;
    if (functionName) openFunction(functionName);
  });
  document
    .querySelector("#al-close-details-button")
    ?.addEventListener("click", () => dialog.close());

  return {
    load,
    reset() {
      clearAiUsageCache();
      current = null;
      content.hidden = true;
      freshness.hidden = true;
      liveNote.hidden = true;
      rangeNote.hidden = true;
      showMessage("Loading AI limits and errors…");
    },
  };
}
