import {
  collection,
  documentId,
  getDocs,
  getFirestore,
  query,
  where,
} from "firebase/firestore";
import { getFirebaseApp } from "../lib/firebase/client";
import {
  MAX_FUNCTION_SERIES,
  PLATFORMS,
  breakdownLabels,
  buildAppCheckChart,
  functionLabel,
  mapAppCheckDay,
  rankedKeys,
  summarizeAppCheck,
  versionKeys,
  type AppCheckDay,
  type AppCheckSummary,
} from "../lib/app-check-stats";
import {
  dayKeysBetween,
  isDayKey,
  utcDayKey,
  weekStartDayKey,
} from "../lib/function-stats";
import { breakdownRows, type ChartDay } from "../lib/stats";
import {
  OTHER_SERIES,
  attachChartTooltip,
  element,
  renderChartLegend,
  renderChartTooltip,
  renderUsageChart,
} from "./admin-chart";
import {
  labelled,
  loadFailureMessage,
  renderBreakdownRows,
  renderMessageText,
  timestampToDate,
} from "./admin-stats";

const NUMBER_FORMAT = new Intl.NumberFormat("pl-PL");
const UTC_DATE_TIME = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const UTC_TIME = new Intl.DateTimeFormat("pl-PL", {
  timeStyle: "short",
  timeZone: "UTC",
});

const MAX_RANGE_DAYS = 180;

const format = (value: number) => NUMBER_FORMAT.format(value);
const platformLabel = (key: string) =>
  PLATFORMS[key] || (key === "unknown" ? "Unknown (no request log)" : key);
const versionLabel = (key: string) =>
  key === "unknown" ? "Not sent (Android)" : key;

/** `rangeDays` is the length of the chosen range; `summary.countedDays` the
 * days of it the function has counted (Cloud Logging keeps 30 days). */
export function renderAppCheckTotals(
  container: HTMLElement,
  summary: AppCheckSummary,
  rangeDays: number,
): void {
  const counted =
    summary.countedDays < rangeDays
      ? ` (${format(summary.countedDays)} counted)`
      : "";
  const values: Record<string, string> = {
    rejections: format(summary.rejections),
    bursts: format(summary.bursts),
    days: format(summary.daysWithRejections),
    "days-note": `of ${format(rangeDays)} days${counted}`,
    last: summary.lastRejectionAt
      ? `${UTC_DATE_TIME.format(summary.lastRejectionAt)}`
      : "—",
  };
  container.querySelectorAll<HTMLElement>("[data-ac-total]").forEach((node) => {
    node.textContent = values[node.dataset.acTotal || ""] ?? "—";
  });
}

/** Days with rejections, newest first. */
export function renderAppCheckDays(
  container: HTMLElement,
  days: AppCheckDay[],
): void {
  const rows = days
    .filter((day) => day.rejections)
    .sort((a, b) => b.dayKey.localeCompare(a.dayKey))
    .map((day) => {
      const row = element("tr");
      const functions = rankedKeys(day.byFunction)
        .map((name) => `${functionLabel(name)} ${day.byFunction[name]}`)
        .join(", ");
      const window =
        day.firstAt && day.lastAt
          ? `${UTC_TIME.format(day.firstAt)} – ${UTC_TIME.format(day.lastAt)}`
          : "—";
      row.append(
        element("td", "mono", day.dayKey),
        element("td", "numeric", format(day.rejections)),
        element("td", "numeric", format(day.bursts)),
        element("td", "stats-wrap-cell", functions),
        element("td", undefined, window),
      );
      return row;
    });
  if (!rows.length) {
    const row = element("tr");
    const cell = element("td", "stats-muted", "No rejections in this range.");
    cell.colSpan = 5;
    row.append(cell);
    rows.push(row);
  }
  container.replaceChildren(...rows);
}

export interface AppCheckStatsView {
  load(force?: boolean): Promise<void>;
  reset(): void;
}

export function createAppCheckStatsView(
  section: HTMLElement,
  isSignedIn: () => boolean,
): AppCheckStatsView {
  const find = <T extends HTMLElement>(selector: string) =>
    section.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>("#ac-controls");
  const fromInput = find<HTMLInputElement>("#ac-from");
  const toInput = find<HTMLInputElement>("#ac-to");
  const refresh = find<HTMLButtonElement>("#ac-refresh-button");
  const message = find<HTMLElement>("#ac-message");
  const content = find<HTMLElement>("#ac-content");
  const freshness = find<HTMLElement>("#ac-freshness");
  const totals = find<HTMLElement>("#ac-summary");
  const legend = find<HTMLElement>("#ac-legend");
  const chart = find<HTMLElement>("#ac-chart");
  const tooltip = find<HTMLElement>("#ac-tooltip");
  const functionRows = find<HTMLElement>("#ac-function-rows");
  const platformRows = find<HTMLElement>("#ac-platform-rows");
  const versionRows = find<HTMLElement>("#ac-version-rows");
  const dayRows = find<HTMLElement>("#ac-day-rows");

  /** Day documents by range ("from|to"); a range with today is not kept. */
  const ranges = new Map<string, AppCheckDay[]>();
  let shown: AppCheckDay[] = [];
  let chartDays: ChartDay[] = [];
  let series: string[] = [];
  let loading = false;

  const today = () => utcDayKey(new Date());
  fromInput.max = today();
  toInput.max = today();
  toInput.value = today();
  // Default: the current UTC week, Monday through today.
  fromInput.value = weekStartDayKey(today());

  const showMessage = (text: string, kind = "") => {
    message.hidden = false;
    renderMessageText(message, text);
    message.dataset.kind = kind;
  };

  const render = (dayKeys: string[], inRange: AppCheckDay[]) => {
    shown = inRange;
    const summary = summarizeAppCheck(inRange);
    renderAppCheckTotals(totals, summary, dayKeys.length);
    series = rankedKeys(summary.byFunction).slice(0, MAX_FUNCTION_SERIES);
    chartDays = buildAppCheckChart(
      dayKeys,
      inRange,
      series,
      today(),
      OTHER_SERIES,
    );
    renderChartLegend(
      legend,
      series,
      chartDays.some((day) =>
        day.segments.some((segment) => segment.series === OTHER_SERIES),
      ),
      (name) => (name === OTHER_SERIES ? name : functionLabel(name)),
    );
    renderUsageChart(chart, chartDays, series, format);
    renderBreakdownRows(
      functionRows,
      breakdownRows(
        summary.byFunction,
        breakdownLabels(summary.byFunction, functionLabel),
        summary.rejections,
      ),
    );
    renderBreakdownRows(
      platformRows,
      breakdownRows(
        summary.byPlatform,
        breakdownLabels(summary.byPlatform, platformLabel),
        summary.rejections,
      ),
    );
    renderBreakdownRows(
      versionRows,
      breakdownRows(
        summary.byAppVersion,
        breakdownLabels(summary.byAppVersion, versionLabel, versionKeys),
        summary.rejections,
      ),
    );
    renderAppCheckDays(dayRows, inRange);
    freshness.hidden = false;
    const range = `${dayKeys[0]} – ${dayKeys.at(-1)} (UTC).`;
    const missing =
      summary.countedDays < dayKeys.length
        ? " Days without data were not counted (Cloud Logging keeps 30 days; counting started 2026-11-15)."
        : "";
    freshness.textContent = summary.countedAt
      ? `${range} Counted hourly from Cloud Logging; last count ${UTC_DATE_TIME.format(summary.countedAt)} UTC.${missing}`
      : `${range} No counted days in this range.${missing}`;
    message.hidden = true;
    content.hidden = false;
  };

  const load = async (force = false) => {
    if (!isSignedIn() || loading) return;
    const fromDayKey = fromInput.value;
    const toDayKey = toInput.value;
    if (!isDayKey(fromDayKey) || !isDayKey(toDayKey) || fromDayKey > toDayKey) {
      content.hidden = true;
      showMessage("Choose a valid date range.", "error");
      return;
    }
    const dayKeys = dayKeysBetween(fromDayKey, toDayKey);
    if (dayKeys.length > MAX_RANGE_DAYS) {
      content.hidden = true;
      showMessage(`Choose a range of at most ${MAX_RANGE_DAYS} days.`, "error");
      return;
    }
    if (force) ranges.clear();
    const key = `${fromDayKey}|${toDayKey}`;
    const cached = ranges.get(key);
    if (cached) {
      render(dayKeys, cached);
      return;
    }
    loading = true;
    refresh.disabled = true;
    content.hidden = true;
    showMessage("Loading App Check rejections…");
    try {
      const db = getFirestore(getFirebaseApp());
      const snapshot = await labelled(
        "statistics/appCheck/daily",
        getDocs(
          query(
            collection(db, "statistics", "appCheck", "daily"),
            where(documentId(), ">=", fromDayKey),
            where(documentId(), "<=", toDayKey),
          ),
        ),
      );
      const days = snapshot.docs.map((item) =>
        mapAppCheckDay(item.id, item.data(), timestampToDate),
      );
      // Today keeps changing, so a range that includes it is not cached.
      if (!dayKeys.includes(today())) ranges.set(key, days);
      render(dayKeys, days);
    } catch (error) {
      content.hidden = true;
      showMessage(loadFailureMessage("App Check statistics", error), "error");
    } finally {
      loading = false;
      refresh.disabled = false;
    }
  };

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void load();
  });
  refresh.addEventListener("click", () => void load(true));
  attachChartTooltip(chart, tooltip, (dayKey) => {
    const day = chartDays.find((item) => item.dayKey === dayKey);
    if (!day) return false;
    const counted = shown.find((item) => item.dayKey === dayKey);
    renderChartTooltip(
      tooltip,
      day,
      series,
      format,
      (name) => (name === OTHER_SERIES ? name : functionLabel(name)),
      counted?.rejections
        ? `${format(counted.bursts)} ${counted.bursts === 1 ? "burst" : "bursts"}`
        : undefined,
    );
    return true;
  });

  return {
    load,
    reset() {
      ranges.clear();
      shown = [];
      content.hidden = true;
      freshness.hidden = true;
      showMessage("Loading App Check rejections…");
    },
  };
}
