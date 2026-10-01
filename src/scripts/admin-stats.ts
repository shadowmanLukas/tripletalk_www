import { getCountFromServer, type Query } from "firebase/firestore";
import type { BreakdownRow } from "../lib/stats";
import { element } from "./admin-chart";

// Firestore and table helpers shared by the admin statistics views.

const NUMBER_FORMAT = new Intl.NumberFormat("pl-PL");
const PERCENT_FORMAT = new Intl.NumberFormat("pl-PL", {
  style: "percent",
  maximumFractionDigits: 1,
});
const DAY_COUNT_BATCH = 31;

export function errorCode(error: unknown): string {
  return typeof error === "object" && error && "code" in error
    ? String(error.code)
    : "";
}

/** A failed statistics query, named so the panel can say which one failed.
 * Keeps the Firestore error `code`, so `errorCode()` still works on it. */
export class StatsQueryError extends Error {
  readonly code: string;

  constructor(
    readonly label: string,
    readonly cause: unknown,
  ) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.name = "StatsQueryError";
    this.code = errorCode(cause);
  }
}

export async function labelled<T>(label: string, work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (error) {
    throw error instanceof StatsQueryError
      ? error
      : new StatsQueryError(label, error);
  }
}

/** Message for a failed load: which query failed and the Firestore error
 * (an index error includes the link that creates the index). The full error
 * goes to the console. */
export function loadFailureMessage(subject: string, error: unknown): string {
  console.error(`[admin] Unable to load ${subject}`, error);
  if (errorCode(error) === "permission-denied") {
    return `No access to ${subject}. The admin claim and the Firestore rules from firebase-rules/ are required${error instanceof StatsQueryError ? ` (${error.label})` : ""}.`;
  }
  const where =
    error instanceof StatsQueryError ? ` ${error.label} failed` : "";
  const code = errorCode(error);
  const detail = error instanceof Error ? error.message : String(error);
  return `Unable to load ${subject}.${where}${code ? ` [${code}]` : ""}: ${detail}`;
}

const CONSOLE_LINK = /(https:\/\/console\.firebase\.google\.com\/[^\s)]+)/;

/** Sets a status text; Firebase console links (index creation) become links. */
export function renderMessageText(node: HTMLElement, text: string): void {
  node.replaceChildren(
    ...text.split(CONSOLE_LINK).map((part, index) => {
      if (index % 2 === 0) return part;
      const link = element("a", undefined, "create the index in Firebase");
      link.href = part;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      return link;
    }),
  );
}

export function timestampToDate(value: unknown): Date | null {
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const date = toDate.call(value);
      return date instanceof Date ? date : null;
    }
  }
  return null;
}

export async function countOf(source: Query, label: string): Promise<number> {
  return (await labelled(label, getCountFromServer(source))).data().count;
}

/** One count query per UTC day, in batches to keep the request burst small. */
export async function countPerDay(
  dayKeys: string[],
  queryForDay: (dayKey: string) => Query,
  label: string,
): Promise<number[]> {
  const counts: number[] = [];
  for (let offset = 0; offset < dayKeys.length; offset += DAY_COUNT_BATCH) {
    const batch = dayKeys.slice(offset, offset + DAY_COUNT_BATCH);
    counts.push(
      ...(await Promise.all(
        batch.map((dayKey) =>
          countOf(queryForDay(dayKey), `${label} on ${dayKey}`),
        ),
      )),
    );
  }
  return counts;
}

export function renderBreakdownRows(
  container: HTMLElement,
  rows: BreakdownRow[],
): void {
  container.replaceChildren(
    ...rows.map((item) => {
      const row = element("tr");
      row.append(
        element("td", undefined, item.label),
        element("td", "numeric", NUMBER_FORMAT.format(item.count)),
        element(
          "td",
          "numeric",
          item.share === null ? "—" : PERCENT_FORMAT.format(item.share),
        ),
      );
      return row;
    }),
  );
}
