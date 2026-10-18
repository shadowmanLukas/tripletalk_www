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
import { getFirebaseApp } from "../lib/firebase/client";
import {
  dayKeysBetween,
  isAggregationStale,
  shiftDayKey,
} from "../lib/function-stats";
import { labelled, timestampToDate } from "./admin-stats";

// Reads statistics/aiUsage for the Functions Stats and AI Limits & Errors
// views, read only, with one session cache shared by both. Layout:
// tripletalk/docs/functions/STATISTICS.md.

export const MAX_LIVE_DAYS = 3;
export const MAX_LIVE_EVENTS_PER_DAY = 5000;
/** Days before the range read for alert baselines. */
export const BASELINE_DAYS = 7;

const UTC_DATE_TIME = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});

export interface LiveEventsDay {
  dayKey: string;
  /** Raw events: API usage (no `type`) and outcomes (`type: "outcome"`). */
  events: Array<Record<string, unknown>>;
  /** More events exist than were read. */
  truncated: boolean;
}

export interface AiUsageData {
  fromDayKey: string;
  toDayKey: string;
  /** `daily` documents from `dailyFromDayKey` through `toDayKey`: the range
   * plus the previous range of the same length (at least 7 days). */
  daily: Array<Record<string, unknown>>;
  dailyFromDayKey: string;
  /** `dailyByFunction` documents from 7 days before the range. */
  dailyByFunction: Array<Record<string, unknown>>;
  /** Days of the range after the last aggregation, built from raw events
   * (only when today is included). */
  live: LiveEventsDay[];
  lastAggregatedAt: Date | null;
  lastAggregatedDayKey: string | null;
}

const cache = new Map<string, Promise<AiUsageData>>();

export function clearAiUsageCache(): void {
  cache.clear();
}

async function fetchAiUsage(
  fromDayKey: string,
  toDayKey: string,
  includeLive: boolean,
): Promise<AiUsageData> {
  const db = getFirestore(getFirebaseApp());
  const root = doc(db, "statistics", "aiUsage");
  const length = dayKeysBetween(fromDayKey, toDayKey).length;
  const dailyFromDayKey = shiftDayKey(
    fromDayKey,
    -Math.max(length, BASELINE_DAYS),
  );
  const [summarySnapshot, dailySnapshot, functionSnapshot] = await Promise.all([
    labelled("statistics/aiUsage", getDoc(root)),
    labelled(
      "statistics/aiUsage/daily",
      getDocs(
        query(
          collection(root, "daily"),
          where("dayKey", ">=", dailyFromDayKey),
          where("dayKey", "<=", toDayKey),
          orderBy("dayKey"),
        ),
      ),
    ),
    labelled(
      "statistics/aiUsage/dailyByFunction",
      getDocs(
        query(
          collection(root, "dailyByFunction"),
          where("dayKey", ">=", shiftDayKey(fromDayKey, -BASELINE_DAYS)),
          where("dayKey", "<=", toDayKey),
          orderBy("dayKey"),
        ),
      ),
    ),
  ]);
  const summary = summarySnapshot.data() || {};
  const lastAggregatedDayKey =
    typeof summary.lastAggregatedDayKey === "string"
      ? summary.lastAggregatedDayKey
      : null;
  const daily = dailySnapshot.docs.map((item) => {
    const data = item.data();
    return { ...data, dayKey: String(data.dayKey || item.id) };
  });
  const aggregatedDays = new Set(daily.map((item) => item.dayKey));

  const live: LiveEventsDay[] = [];
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
        labelled(
          `statistics/aiUsage/events on ${dayKey}`,
          getDocs(
            query(
              collection(root, "events"),
              where("dayKey", "==", dayKey),
              limit(MAX_LIVE_EVENTS_PER_DAY + 1),
            ),
          ),
        ),
      ),
    );
    candidates.forEach((dayKey, index) => {
      const documents = snapshots[index].docs;
      live.push({
        dayKey,
        events: documents
          .slice(0, MAX_LIVE_EVENTS_PER_DAY)
          .map((item) => item.data()),
        truncated: documents.length > MAX_LIVE_EVENTS_PER_DAY,
      });
    });
  }

  return {
    fromDayKey,
    toDayKey,
    daily,
    dailyFromDayKey,
    dailyByFunction: functionSnapshot.docs.map((item) => item.data()),
    live,
    lastAggregatedAt: timestampToDate(summary.lastAggregatedAt),
    lastAggregatedDayKey,
  };
}

/** Loads a range once per session; `clearAiUsageCache()` forces a reload. */
export function loadAiUsage(
  fromDayKey: string,
  toDayKey: string,
  includeLive: boolean,
): Promise<AiUsageData> {
  const key = `${fromDayKey}|${toDayKey}|${includeLive}`;
  let pending = cache.get(key);
  if (!pending) {
    pending = fetchAiUsage(fromDayKey, toDayKey, includeLive);
    cache.set(key, pending);
    pending.catch(() => {
      if (cache.get(key) === pending) cache.delete(key);
    });
  }
  return pending;
}

/** "Last aggregation" line, with a warning when it is older than 36 hours. */
export function renderAggregationFreshness(
  node: HTMLElement,
  data: Pick<AiUsageData, "lastAggregatedAt" | "lastAggregatedDayKey">,
): void {
  node.hidden = false;
  const stale = isAggregationStale(data.lastAggregatedAt);
  node.classList.toggle("is-stale", stale);
  node.textContent = data.lastAggregatedAt
    ? `Last aggregation: ${UTC_DATE_TIME.format(data.lastAggregatedAt)} UTC, day ${data.lastAggregatedDayKey || "—"}.${stale ? " Warning: older than 36 hours, the daily job may not be running." : ""}`
    : "No aggregation has run yet. Warning: the daily job may not be running.";
}
