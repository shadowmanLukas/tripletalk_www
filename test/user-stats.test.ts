// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  AUTH_PROVIDERS,
  countActiveLearners,
  learningDayWindow,
  deriveUserTotals,
  summarizeUserCreatedLessons,
} from "../src/lib/user-stats";
import {
  breakdownRows,
  buildDailyCountChart,
  utcDayStart,
} from "../src/lib/stats";
import {
  StatsQueryError,
  errorCode,
  labelled,
  loadFailureMessage,
  renderBreakdownRows,
  renderMessageText,
} from "../src/scripts/admin-stats";
import { renderUserTotals } from "../src/scripts/user-stats";

const snapshot = {
  users: 10,
  activeLearners: { last7: 4, last30: 6 },
  premium: 3,
  premiumBySource: { trial: 2, apple: 1, google: 0 },
  authProviders: { "google.com": 5, "apple.com": 2, password: 2 },
  allLessons: { lessons: 9, flashcards: 582 },
  commonLessons: { lessons: 2, flashcards: 200 },
};

describe("user statistics", () => {
  it("excludes lessons imported from ready-made collections", () => {
    expect(
      summarizeUserCreatedLessons([
        { createdFromCommonCollection: false, flashcardCount: 52 },
        { flashcardCount: 30 },
        { createdFromCommonCollection: true, flashcardCount: 200 },
        { flashcardCount: -4 },
      ]),
    ).toEqual({ lessons: 3, flashcards: 82 });

    const totals = deriveUserTotals(snapshot);
    expect(totals).toMatchObject({
      lessons: 7,
      flashcards: 382,
      active7: 4,
      active30: 6,
      active7Share: 0.4,
      premiumShare: 0.3,
    });
    expect(totals.flashcardsPerLesson).toBeCloseTo(54.57, 2);
  });

  it("never reports negative or impossible totals", () => {
    const totals = deriveUserTotals({
      ...snapshot,
      users: 0,
      activeLearners: { last7: 2, last30: 2 },
      commonLessons: { lessons: 20, flashcards: 9999 },
    });
    expect(totals).toMatchObject({
      users: 0,
      active7: 0,
      active7Share: null,
      lessons: 0,
      flashcards: 0,
      premiumShare: null,
      lessonsPerUser: 0,
    });
  });

  it("adds a remainder row so a breakdown adds up to the total", () => {
    const rows = breakdownRows(snapshot.authProviders, AUTH_PROVIDERS, 10);
    expect(rows.map((row) => [row.label, row.count])).toEqual([
      ["Google", 5],
      ["Apple", 2],
      ["Email and password", 2],
      ["Other or not set", 1],
    ]);
    expect(rows.reduce((sum, row) => sum + (row.share || 0), 0)).toBeCloseTo(1);
    expect(breakdownRows({}, AUTH_PROVIDERS, 0)[0].share).toBeNull();
  });

  it("marks today as an incomplete day in the new users chart", () => {
    const days = buildDailyCountChart(
      ["2026-09-30", "2026-10-01"],
      [3, 0],
      "2026-10-01",
      "New users",
    );
    expect(days[0]).toMatchObject({ total: 3, live: false });
    expect(days[0].segments).toHaveLength(1);
    expect(days[1]).toMatchObject({ total: 0, live: true, segments: [] });
    expect(utcDayStart("2026-10-01").toISOString()).toBe(
      "2026-10-01T00:00:00.000Z",
    );
  });

  it("matches learning days by the user's local date", () => {
    const window = learningDayWindow("2026-10-01");
    expect(window.start.toISOString()).toBe("2026-09-30T12:00:00.000Z");
    expect(window.end.toISOString()).toBe("2026-10-01T12:00:00.000Z");
    // Local midnight of 1 October in Warsaw (UTC+2) and New York (UTC−4).
    const warsaw = new Date("2026-09-30T22:00:00Z");
    const newYork = new Date("2026-10-01T04:00:00Z");
    for (const date of [warsaw, newYork]) {
      expect(date >= window.start && date < window.end).toBe(true);
    }
  });

  it("counts distinct active learners in the last 7 and 30 days", () => {
    const day = (dayKey: string) => new Date(`${dayKey}T00:00:00Z`);
    expect(
      countActiveLearners(
        [
          { uid: "a", date: day("2026-10-01") },
          { uid: "a", date: day("2026-09-30") },
          { uid: "b", date: day("2026-09-25") },
          { uid: "c", date: day("2026-09-24") },
          { uid: "d", date: day("2026-09-02") },
          { uid: "e", date: day("2026-09-01") },
        ],
        "2026-10-01",
      ),
    ).toEqual({ last7: 2, last30: 4 });
  });

  it("shows activity as unavailable without learning data", () => {
    const container = document.createElement("div");
    const value = document.createElement("span");
    value.dataset.userTotal = "active-7-share";
    container.append(value);
    renderUserTotals(
      container,
      deriveUserTotals({ ...snapshot, activeLearners: null }),
    );
    expect(value.textContent).toBe("Activity data unavailable");
  });

  it("renders totals and breakdown rows as text", () => {
    const container = document.createElement("div");
    ["flashcards", "flashcards-per-lesson", "premium-share"].forEach((name) => {
      const value = document.createElement("strong");
      value.dataset.userTotal = name;
      container.append(value);
    });
    renderUserTotals(container, deriveUserTotals(snapshot));
    expect(
      container.querySelector("[data-user-total='flashcards']")?.textContent,
    ).toBe("382");
    expect(
      container.querySelector("[data-user-total='flashcards-per-lesson']")
        ?.textContent,
    ).toBe("54,6");
    expect(
      container.querySelector("[data-user-total='premium-share']")?.textContent,
    ).toBe("30% of users");

    const body = document.createElement("tbody");
    renderBreakdownRows(body, [
      { key: "x", label: "<img src=x onerror=alert(1)>", count: 1, share: 1 },
    ]);
    expect(body.querySelector("img")).toBeNull();
    expect(body.textContent).toContain("<img");
  });
});

describe("statistics load errors", () => {
  it("names the failed query and keeps the Firestore code", async () => {
    const failure = Object.assign(new Error("The query requires an index."), {
      code: "failed-precondition",
    });
    const error = await labelled(
      "count of users",
      Promise.reject(failure),
    ).catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(StatsQueryError);
    expect(errorCode(error)).toBe("failed-precondition");
    const original = console.error;
    console.error = () => {};
    try {
      expect(loadFailureMessage("user statistics", error)).toBe(
        "Unable to load user statistics. count of users failed [failed-precondition]: The query requires an index.",
      );
      expect(
        loadFailureMessage(
          "School statistics",
          new StatsQueryError(
            "count of schoolUsers",
            Object.assign(new Error("denied"), { code: "permission-denied" }),
          ),
        ),
      ).toContain("No access to School statistics");
    } finally {
      console.error = original;
    }
  });

  it("turns Firebase console links into links and keeps other text as text", () => {
    const node = document.createElement("p");
    renderMessageText(
      node,
      "Failed: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc <img src=x>",
    );
    expect(node.querySelector("a")?.href).toContain(
      "https://console.firebase.google.com/v1/r/project/x/firestore/indexes",
    );
    expect(node.querySelector("img")).toBeNull();
    expect(node.textContent).toContain("<img src=x>");
  });
});
