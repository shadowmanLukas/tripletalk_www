import {
  collection,
  getAggregateFromServer,
  getFirestore,
  query,
  sum,
  where,
  type Firestore,
} from "firebase/firestore";
import { getFirebaseApp } from "../lib/firebase/client";
import {
  dayKeysBetween,
  isDayKey,
  shiftDayKey,
  utcDayKey,
} from "../lib/function-stats";
import {
  ASSIGNMENT_STATES,
  MEMBERSHIP_STATUSES,
  SCHOOL_CHART_METRICS,
  SCHOOL_ROLES,
  deriveSchoolTotals,
  type SchoolChartMetric,
  type SchoolStatsSnapshot,
  type SchoolTotals,
} from "../lib/school-stats";
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
  labelled,
  loadFailureMessage,
  renderMessageText,
  renderBreakdownRows,
} from "./admin-stats";

const NUMBER_FORMAT = new Intl.NumberFormat("pl-PL");
const AVERAGE_FORMAT = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const UTC_DATE_TIME = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "UTC",
});
const DEFAULT_RANGE_DAYS = 30;
const MAX_RANGE_DAYS = 180;
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

export function renderSchoolTotals(
  container: HTMLElement,
  totals: SchoolTotals,
): void {
  const number = (value: number) => NUMBER_FORMAT.format(value);
  const values: Record<string, string> = {
    "school-users": number(totals.schoolUsers),
    teachers: number(totals.teachers),
    "lessons-per-teacher": `${AVERAGE_FORMAT.format(totals.lessonsPerTeacher)} lessons per teacher`,
    students: number(totals.students),
    "students-in-classes": number(totals.studentsInClasses),
    classes: number(totals.classes),
    "students-per-class": `${AVERAGE_FORMAT.format(totals.studentsPerClass)} accepted students per class`,
    lessons: number(totals.lessons),
    "published-lessons": `${number(totals.publishedLessons)} published (locked)`,
    cards: number(totals.cards),
    "cards-per-lesson": `${AVERAGE_FORMAT.format(totals.cardsPerLesson)} per lesson`,
    assignments: number(totals.assignments),
    "open-assignments": `${number(totals.openAssignments)} active or scheduled`,
    "started-assignments": number(totals.startedAssignments),
    "recent-progress": number(totals.recentProgress),
    "audio-pending": number(totals.audioPending),
    "audio-failed": number(totals.audioFailed),
  };
  container
    .querySelectorAll<HTMLElement>("[data-school-total]")
    .forEach((node) => {
      node.textContent = values[node.dataset.schoolTotal || ""] || "—";
    });
}

/** One sum per query: several sums on different fields in one aggregation
 * need a composite index, a single sum only the automatic one. */
async function sumOf(
  source: ReturnType<typeof collection>,
  fields: string[],
): Promise<Record<string, number>> {
  const sums = await Promise.all(
    fields.map(async (field) => {
      const result = await labelled(
        `sum of ${source.id}.${field}`,
        getAggregateFromServer(source, { total: sum(field) }),
      );
      return Number(result.data().total) || 0;
    }),
  );
  return Object.fromEntries(fields.map((field, index) => [field, sums[index]]));
}

async function countBy(
  source: ReturnType<typeof collection>,
  field: string,
  values: string[],
): Promise<Record<string, number>> {
  const counts = await Promise.all(
    values.map((value) =>
      countOf(
        query(source, where(field, "==", value)),
        `count of ${source.id} where ${field} == ${value}`,
      ),
    ),
  );
  return Object.fromEntries(
    values.map((value, index) => [value, counts[index]]),
  );
}

async function fetchSnapshot(db: Firestore): Promise<SchoolStatsSnapshot> {
  const users = collection(db, "schoolUsers");
  const classes = collection(db, "schoolClasses");
  const memberships = collection(db, "schoolMemberships");
  const lessons = collection(db, "schoolLessons");
  const assignments = collection(db, "schoolAssignments");
  const progress = collection(db, "schoolProgress");
  const now = new Date();
  const [
    schoolUsers,
    roles,
    classCount,
    membershipTotal,
    membershipCounts,
    lessonCount,
    publishedLessons,
    lessonSums,
    assignmentCount,
    assignmentStates,
    openAssignments,
    startedAssignments,
    recentProgress,
  ] = await Promise.all([
    countOf(users, `count of ${users.id}`),
    countBy(users, "role", Object.keys(SCHOOL_ROLES)),
    countOf(classes, `count of ${classes.id}`),
    countOf(memberships, `count of ${memberships.id}`),
    countBy(memberships, "status", Object.keys(MEMBERSHIP_STATUSES)),
    countOf(lessons, `count of ${lessons.id}`),
    countOf(
      query(lessons, where("published", "==", true)),
      "count of schoolLessons where published == true",
    ),
    sumOf(lessons, ["cardCount", "audioPendingCount", "audioFailedCount"]),
    countOf(assignments, `count of ${assignments.id}`),
    countBy(assignments, "publishState", Object.keys(ASSIGNMENT_STATES)),
    countOf(
      query(assignments, where("availableTo", ">=", now)),
      "count of schoolAssignments where availableTo >= now",
    ),
    countOf(progress, `count of ${progress.id}`),
    countOf(
      query(
        progress,
        where("updatedAt", ">=", new Date(now.getTime() - SEVEN_DAYS_MS)),
      ),
      "count of schoolProgress updated in the last 7 days",
    ),
  ]);
  return {
    roles,
    schoolUsers,
    classes: classCount,
    memberships: membershipCounts,
    membershipTotal,
    lessons: lessonCount,
    publishedLessons,
    cards: lessonSums.cardCount,
    audioPending: lessonSums.audioPendingCount,
    audioFailed: lessonSums.audioFailedCount,
    assignments: assignmentCount,
    assignmentStates,
    openAssignments,
    startedAssignments,
    recentProgress,
  };
}

function fetchDailyCounts(
  db: Firestore,
  dayKeys: string[],
  metric: SchoolChartMetric,
): Promise<number[]> {
  const { collection: name, field } = SCHOOL_CHART_METRICS[metric];
  const source = collection(db, name);
  return countPerDay(
    dayKeys,
    (dayKey) =>
      query(
        source,
        where(field, ">=", utcDayStart(dayKey)),
        where(field, "<", utcDayStart(shiftDayKey(dayKey, 1))),
      ),
    `count of ${name} by ${field}`,
  );
}

export interface SchoolStatsView {
  load(force?: boolean): Promise<void>;
  reset(): void;
}

export function createSchoolStatsView(
  section: HTMLElement,
  isSignedIn: () => boolean,
): SchoolStatsView {
  const find = <T extends HTMLElement>(selector: string) =>
    section.querySelector<T>(selector)!;
  const form = find<HTMLFormElement>("#ss-controls");
  const fromInput = find<HTMLInputElement>("#ss-from");
  const toInput = find<HTMLInputElement>("#ss-to");
  const refresh = find<HTMLButtonElement>("#ss-refresh-button");
  const message = find<HTMLElement>("#ss-message");
  const content = find<HTMLElement>("#ss-content");
  const freshness = find<HTMLElement>("#ss-freshness");
  const totals = find<HTMLElement>("#ss-totals");
  const chart = find<HTMLElement>("#ss-chart");
  const chartTitle = find<HTMLElement>("#ss-chart-title");
  const chartSummary = find<HTMLElement>("#ss-chart-summary");
  const chartNote = find<HTMLElement>("#ss-chart-note");
  const tooltip = find<HTMLElement>("#ss-tooltip");
  const roleRows = find<HTMLElement>("#ss-role-rows");
  const membershipRows = find<HTMLElement>("#ss-membership-rows");
  const assignmentRows = find<HTMLElement>("#ss-assignment-rows");
  const metricButtons = Array.from(
    section.querySelectorAll<HTMLButtonElement>("[data-ss-metric]"),
  );

  let snapshot: { data: SchoolStatsSnapshot; countedAt: Date } | null = null;
  const ranges = new Map<string, number[]>();
  let metric: SchoolChartMetric = "accounts";
  let chartDays: ChartDay[] = [];
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

  const renderSnapshot = () => {
    if (!snapshot) return;
    const { data, countedAt } = snapshot;
    renderSchoolTotals(totals, deriveSchoolTotals(data));
    renderBreakdownRows(
      roleRows,
      breakdownRows(data.roles, SCHOOL_ROLES, data.schoolUsers),
    );
    renderBreakdownRows(
      membershipRows,
      breakdownRows(
        data.memberships,
        MEMBERSHIP_STATUSES,
        data.membershipTotal,
      ),
    );
    renderBreakdownRows(
      assignmentRows,
      breakdownRows(data.assignmentStates, ASSIGNMENT_STATES, data.assignments),
    );
    freshness.hidden = false;
    freshness.textContent = `Totals counted ${UTC_DATE_TIME.format(countedAt)} UTC. Daily chart ${fromInput.value} – ${toInput.value} (UTC).`;
  };

  const renderChart = (dayKeys: string[], counts: number[]) => {
    const { label, note } = SCHOOL_CHART_METRICS[metric];
    metricButtons.forEach((button) =>
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.ssMetric === metric),
      ),
    );
    chartTitle.textContent = `${label} per day (UTC)`;
    chartNote.textContent = note;
    chartDays = buildDailyCountChart(dayKeys, counts, today(), label);
    renderUsageChart(chart, chartDays, [label], (value) =>
      NUMBER_FORMAT.format(value),
    );
    const total = counts.reduce((sumOfDays, value) => sumOfDays + value, 0);
    chartSummary.textContent = `${NUMBER_FORMAT.format(total)} in range · ${AVERAGE_FORMAT.format(total / Math.max(dayKeys.length, 1))} per day`;
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
    const key = `${metric}|${fromDayKey}|${toDayKey}`;
    const cached = ranges.get(key);
    if (snapshot && cached) {
      renderSnapshot();
      renderChart(dayKeys, cached);
      return;
    }
    loading = true;
    refresh.disabled = true;
    if (!snapshot) {
      content.hidden = true;
      showMessage("Loading School statistics…");
    }
    try {
      const db = getFirestore(getFirebaseApp());
      snapshot ||= { data: await fetchSnapshot(db), countedAt: new Date() };
      const counts = cached || (await fetchDailyCounts(db, dayKeys, metric));
      // Today's count keeps growing, so it is never reused from the cache.
      if (!dayKeys.includes(today())) ranges.set(key, counts);
      renderSnapshot();
      renderChart(dayKeys, counts);
      message.hidden = true;
      content.hidden = false;
    } catch (error) {
      content.hidden = true;
      showMessage(loadFailureMessage("School statistics", error), "error");
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
      const next = button.dataset.ssMetric as SchoolChartMetric;
      if (loading || !(next in SCHOOL_CHART_METRICS) || next === metric) {
        return;
      }
      metric = next;
      void load();
    }),
  );
  attachChartTooltip(chart, tooltip, (dayKey) => {
    const day = chartDays.find((item) => item.dayKey === dayKey);
    if (day) {
      const { label } = SCHOOL_CHART_METRICS[metric];
      renderChartTooltip(tooltip, day, [label], (value) =>
        NUMBER_FORMAT.format(value),
      );
    }
    return Boolean(day);
  });

  return {
    load,
    reset() {
      snapshot = null;
      ranges.clear();
      content.hidden = true;
      freshness.hidden = true;
      showMessage("Loading School statistics…");
    },
  };
}
