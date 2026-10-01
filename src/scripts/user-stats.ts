import {
  collection,
  collectionGroup,
  getAggregateFromServer,
  getDocs,
  getFirestore,
  limit,
  query,
  sum,
  where,
  type Firestore,
  type Query,
} from "firebase/firestore";
import { getFirebaseApp } from "../lib/firebase/client";
import {
  dayKeysBetween,
  isDayKey,
  shiftDayKey,
  utcDayKey,
} from "../lib/function-stats";
import {
  ACTIVE_LEARNERS_SERIES,
  AUTH_PROVIDERS,
  NEW_USERS_SERIES,
  PREMIUM_SOURCES,
  countActiveLearners,
  deriveUserTotals,
  learningDayWindow,
  summarizeUserCreatedLessons,
  type ActiveLearners,
  type LessonTotals,
  type UserStatsSnapshot,
  type UserTotals,
} from "../lib/user-stats";
import {
  breakdownRows,
  buildDailyCountChart,
  utcDayStart,
  type ChartDay,
} from "../lib/stats";
import {
  attachChartTooltip,
  renderChartTooltip,
  renderUsageChart,
} from "./admin-chart";
import {
  countOf,
  countPerDay,
  errorCode,
  labelled,
  loadFailureMessage,
  renderMessageText,
  renderBreakdownRows,
  timestampToDate,
} from "./admin-stats";

const NUMBER_FORMAT = new Intl.NumberFormat("pl-PL");
const AVERAGE_FORMAT = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
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
// Firestore's maximum query limit.
const MAX_LEARNING_DAYS = 10000;

type UserChartMetric = "new-users" | "active-learners";

function active(value: number | null): string {
  return value === null ? "—" : NUMBER_FORMAT.format(value);
}

function activeShare(share: number | null, value: number | null): string {
  if (value === null) return "Activity data unavailable";
  return share === null ? "—" : `${PERCENT_FORMAT.format(share)} of users`;
}

export function renderUserTotals(
  container: HTMLElement,
  totals: UserTotals,
): void {
  const values: Record<string, string> = {
    users: NUMBER_FORMAT.format(totals.users),
    premium: NUMBER_FORMAT.format(totals.premium),
    "premium-share":
      totals.premiumShare === null
        ? "—"
        : `${PERCENT_FORMAT.format(totals.premiumShare)} of users`,
    "active-7": active(totals.active7),
    "active-7-share": activeShare(totals.active7Share, totals.active7),
    "active-30": active(totals.active30),
    "active-30-share": activeShare(totals.active30Share, totals.active30),
    lessons: NUMBER_FORMAT.format(totals.lessons),
    flashcards: NUMBER_FORMAT.format(totals.flashcards),
    "lessons-per-user": AVERAGE_FORMAT.format(totals.lessonsPerUser),
    "flashcards-per-user": AVERAGE_FORMAT.format(totals.flashcardsPerUser),
    "flashcards-per-lesson": AVERAGE_FORMAT.format(totals.flashcardsPerLesson),
  };
  container
    .querySelectorAll<HTMLElement>("[data-user-total]")
    .forEach((node) => {
      node.textContent = values[node.dataset.userTotal || ""] || "—";
    });
}

/** Count and flashcard sum as separate queries: combining them, or a sum
 * with a filter, needs extra indexes. A missing index surfaces as
 * failed-precondition, which the caller turns into a full scan. */
async function lessonTotals(
  source: Query,
  label: string,
): Promise<LessonTotals> {
  const [lessons, flashcards] = await Promise.all([
    countOf(source, `count of ${label}`),
    labelled(
      `sum of flashcardCount over ${label}`,
      getAggregateFromServer(source, { total: sum("flashcardCount") }),
    ),
  ]);
  return { lessons, flashcards: Number(flashcards.data().total) || 0 };
}

/** Why learning activity is missing, or null when it was read. Activity
 * never stops the rest of the view from loading. */
type ActivityProblem = "rule" | "index" | "error" | null;

function activityProblem(error: unknown): ActivityProblem {
  console.error("[admin] Learning activity unavailable", error);
  const code = errorCode(error);
  if (code === "permission-denied") return "rule";
  if (code === "failed-precondition") return "index";
  return "error";
}

interface LoadedActivity {
  activeLearners: ActiveLearners | null;
  problem: ActivityProblem;
  /** More learning days than were read; distinct counts are too low. */
  truncated: boolean;
}

async function fetchActiveLearners(db: Firestore): Promise<LoadedActivity> {
  const todayKey = utcDayKey(new Date());
  const since = learningDayWindow(shiftDayKey(todayKey, -29)).start;
  try {
    // Distinct users cannot be counted server-side, so the learning days of
    // the last 30 days are read (one small document per user and day).
    const snapshot = await labelled(
      "learning days of the last 30 days",
      getDocs(
        query(
          collectionGroup(db, "learningStats"),
          where("date", ">=", since),
          limit(MAX_LEARNING_DAYS),
        ),
      ),
    );
    const days = snapshot.docs.flatMap((item) => {
      const uid = item.ref.parent.parent?.id;
      const date = timestampToDate(item.data().date);
      return uid && date ? [{ uid, date }] : [];
    });
    return {
      activeLearners: countActiveLearners(days, todayKey),
      problem: null,
      truncated: snapshot.docs.length >= MAX_LEARNING_DAYS,
    };
  } catch (error) {
    return {
      activeLearners: null,
      problem: activityProblem(error),
      truncated: false,
    };
  }
}

interface LoadedSnapshot {
  snapshot: UserStatsSnapshot;
  /** Lessons were counted by reading every lesson (index missing). */
  lessonsFromScan: boolean;
  activity: LoadedActivity;
  countedAt: Date;
}

async function fetchSnapshot(db: Firestore): Promise<LoadedSnapshot> {
  const users = collection(db, "users");
  const active = query(users, where("premiumIsActive", "==", true));
  const premiumSources = Object.keys(PREMIUM_SOURCES);
  const providers = Object.keys(AUTH_PROVIDERS);
  const [usersCount, activity, premium, premiumCounts, providerCounts] =
    await Promise.all([
      countOf(users, "count of users"),
      fetchActiveLearners(db),
      countOf(active, "count of users where premiumIsActive == true"),
      Promise.all(
        premiumSources.map((source) =>
          countOf(
            query(active, where("premiumSource", "==", source)),
            `count of active premium users where premiumSource == ${source}`,
          ),
        ),
      ),
      Promise.all(
        providers.map((provider) =>
          countOf(
            query(users, where("authProvider", "==", provider)),
            `count of users where authProvider == ${provider}`,
          ),
        ),
      ),
    ]);

  const lessons = collectionGroup(db, "lessons");
  let allLessons: LessonTotals;
  let commonLessons: LessonTotals;
  let lessonsFromScan = false;
  try {
    [allLessons, commonLessons] = await Promise.all([
      lessonTotals(lessons, "all lessons"),
      lessonTotals(
        query(lessons, where("createdFromCommonCollection", "==", true)),
        "lessons from ready-made collections",
      ),
    ]);
  } catch (error) {
    // Aggregating a collection group needs collection-group indexes (see
    // firebase-rules/admin-user-stats.indexes.patch). Until they exist, fall
    // back to reading every lesson.
    if (errorCode(error) !== "failed-precondition") throw error;
    console.warn("[admin] Counting lessons by reading every lesson", error);
    const snapshot = await labelled("all lessons", getDocs(lessons));
    const documents = snapshot.docs.map((item) => item.data());
    const userCreated = summarizeUserCreatedLessons(documents);
    allLessons = userCreated;
    commonLessons = { lessons: 0, flashcards: 0 };
    lessonsFromScan = true;
  }

  return {
    snapshot: {
      users: usersCount,
      activeLearners: activity.activeLearners,
      premium,
      premiumBySource: Object.fromEntries(
        premiumSources.map((source, index) => [source, premiumCounts[index]]),
      ),
      authProviders: Object.fromEntries(
        providers.map((provider, index) => [provider, providerCounts[index]]),
      ),
      allLessons,
      commonLessons,
    },
    lessonsFromScan,
    activity,
    countedAt: new Date(),
  };
}

interface RangeCounts {
  newUsers: number[];
  /** Null when learning activity cannot be read. */
  activeLearners: number[] | null;
}

async function fetchRangeCounts(
  db: Firestore,
  dayKeys: string[],
  withActivity: boolean,
): Promise<RangeCounts> {
  const users = collection(db, "users");
  const learningDays = collectionGroup(db, "learningStats");
  const [newUsers, activeLearners] = await Promise.all([
    countPerDay(
      dayKeys,
      (dayKey) =>
        query(
          users,
          where("createdAt", ">=", utcDayStart(dayKey)),
          where("createdAt", "<", utcDayStart(shiftDayKey(dayKey, 1))),
        ),
      "count of new users",
    ),
    withActivity
      ? countPerDay(
          dayKeys,
          (dayKey) => {
            const window = learningDayWindow(dayKey);
            return query(
              learningDays,
              where("date", ">=", window.start),
              where("date", "<", window.end),
            );
          },
          "count of learning days",
        ).catch((error: unknown) => {
          activityProblem(error);
          return null;
        })
      : Promise.resolve(null),
  ]);
  return { newUsers, activeLearners };
}

export interface UserStatsView {
  load(force?: boolean): Promise<void>;
  reset(): void;
}

export function createUserStatsView(
  section: HTMLElement,
  isSignedIn: () => boolean,
): UserStatsView {
  const find = <T extends HTMLElement>(selector: string) =>
    section.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>("#us-controls");
  const fromInput = find<HTMLInputElement>("#us-from");
  const toInput = find<HTMLInputElement>("#us-to");
  const refresh = find<HTMLButtonElement>("#us-refresh-button");
  const message = find<HTMLElement>("#us-message");
  const content = find<HTMLElement>("#us-content");
  const freshness = find<HTMLElement>("#us-freshness");
  const scanNote = find<HTMLElement>("#us-scan-note");
  const totals = find<HTMLElement>("#us-totals");
  const chart = find<HTMLElement>("#us-chart");
  const chartSummary = find<HTMLElement>("#us-chart-summary");
  const tooltip = find<HTMLElement>("#us-tooltip");
  const chartTitle = find<HTMLElement>("#us-chart-title");
  const chartNote = find<HTMLElement>("#us-chart-note");
  const activityNote = find<HTMLElement>("#us-activity-note");
  const metricButtons = Array.from(
    section.querySelectorAll<HTMLButtonElement>("[data-us-metric]"),
  );
  const providerRows = find<HTMLElement>("#us-provider-rows");
  const premiumRows = find<HTMLElement>("#us-premium-rows");

  let snapshot: LoadedSnapshot | null = null;
  const ranges = new Map<string, RangeCounts>();
  let chartDays: ChartDay[] = [];
  let metric: UserChartMetric = "new-users";
  let shown: { dayKeys: string[]; counts: RangeCounts } | null = null;
  let loading = false;

  const today = () => utcDayKey(new Date());
  fromInput.max = today();
  toInput.max = today();
  toInput.value = today();
  fromInput.value = shiftDayKey(today(), -(DEFAULT_RANGE_DAYS - 1));

  const showMessage = (text: string, kind = "") => {
    message.hidden = false;
    renderMessageText(message, text);
    message.dataset.kind = kind;
  };

  const chartSeriesName = () =>
    metric === "new-users" ? NEW_USERS_SERIES : ACTIVE_LEARNERS_SERIES;

  const renderChart = () => {
    if (!shown) return;
    const { dayKeys, counts } = shown;
    const values =
      metric === "new-users" ? counts.newUsers : counts.activeLearners;
    metricButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.usMetric === metric),
      ),
    );
    chartTitle.textContent = `${chartSeriesName()} per day (UTC)`;
    chartNote.textContent =
      metric === "new-users"
        ? "Counted by the account's createdAt. Accounts without createdAt are not included."
        : "Users who marked at least one flashcard as known that day, by the user's local date.";
    chartDays = buildDailyCountChart(
      dayKeys,
      values || [],
      today(),
      chartSeriesName(),
    );
    renderUsageChart(chart, chartDays, [chartSeriesName()], (value) =>
      NUMBER_FORMAT.format(value),
    );
    if (!values) {
      chartSummary.textContent = "Activity data unavailable";
      return;
    }
    const total = values.reduce((sumOfDays, value) => sumOfDays + value, 0);
    chartSummary.textContent =
      metric === "new-users"
        ? `${NUMBER_FORMAT.format(total)} in range · ${AVERAGE_FORMAT.format(total / Math.max(dayKeys.length, 1))} per day`
        : `${AVERAGE_FORMAT.format(total / Math.max(dayKeys.length, 1))} per day on average`;
  };

  const render = (dayKeys: string[], counts: RangeCounts) => {
    if (!snapshot) return;
    const derived = deriveUserTotals(snapshot.snapshot);
    renderUserTotals(totals, derived);
    renderBreakdownRows(
      providerRows,
      breakdownRows(
        snapshot.snapshot.authProviders,
        AUTH_PROVIDERS,
        derived.users,
      ),
    );
    renderBreakdownRows(
      premiumRows,
      breakdownRows(
        snapshot.snapshot.premiumBySource,
        PREMIUM_SOURCES,
        derived.premium,
      ),
    );
    shown = { dayKeys, counts };
    renderChart();
    freshness.hidden = false;
    freshness.textContent = `Totals counted ${UTC_DATE_TIME.format(snapshot.countedAt)} UTC. Daily chart ${dayKeys[0]} – ${dayKeys.at(-1)} (UTC).`;
    scanNote.hidden = !snapshot.lessonsFromScan;
    const { problem, truncated } = snapshot.activity;
    activityNote.hidden = !problem && !truncated;
    activityNote.textContent =
      problem === "rule"
        ? "Learning activity is not readable yet: apply and deploy firebase-rules/admin-learning-activity.rules.patch."
        : problem === "index"
          ? "Learning activity needs the collection-group index on learningStats.date: apply and deploy firebase-rules/admin-user-stats.indexes.patch."
          : problem === "error"
            ? "Learning activity could not be read; see the browser console for the Firestore error."
            : truncated
              ? `At least ${NUMBER_FORMAT.format(MAX_LEARNING_DAYS)} learning days in the last 30 days were read (the query limit); active learner counts may be lower than actual.`
              : "";
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
    if (force) {
      snapshot = null;
      ranges.clear();
    }
    const key = `${fromDayKey}|${toDayKey}`;
    const cached = ranges.get(key);
    if (snapshot && cached) {
      render(dayKeys, cached);
      return;
    }
    loading = true;
    refresh.disabled = true;
    content.hidden = true;
    showMessage("Loading user statistics…");
    try {
      const db = getFirestore(getFirebaseApp());
      snapshot ||= await fetchSnapshot(db);
      const counts =
        cached ||
        (await fetchRangeCounts(
          db,
          dayKeys,
          snapshot.activity.problem === null,
        ));
      // Today's count keeps growing, so it is never reused from the cache.
      if (!dayKeys.includes(today())) ranges.set(key, counts);
      render(dayKeys, counts);
    } catch (error) {
      content.hidden = true;
      showMessage(loadFailureMessage("user statistics", error), "error");
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
  metricButtons.forEach((button) =>
    button.addEventListener("click", () => {
      metric =
        button.dataset.usMetric === "active-learners"
          ? "active-learners"
          : "new-users";
      renderChart();
    }),
  );
  attachChartTooltip(chart, tooltip, (dayKey) => {
    const day = chartDays.find((item) => item.dayKey === dayKey);
    if (day) {
      renderChartTooltip(tooltip, day, [chartSeriesName()], (value) =>
        NUMBER_FORMAT.format(value),
      );
    }
    return Boolean(day);
  });

  return {
    load,
    reset() {
      snapshot = null;
      shown = null;
      ranges.clear();
      content.hidden = true;
      freshness.hidden = true;
      showMessage("Loading user statistics…");
    },
  };
}
