// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  breakdownLabels,
  buildAppCheckChart,
  functionLabel,
  mapAppCheckDay,
  summarizeAppCheck,
  versionKeys,
} from "../src/lib/app-check-stats";
import { mapPremiumSummary } from "../src/lib/user-stats";
import {
  renderAppCheckDays,
  renderAppCheckTotals,
} from "../src/scripts/app-check-stats";

const toDate = (value: unknown) =>
  typeof value === "string" ? new Date(value) : null;

const nov12 = mapAppCheckDay(
  "2026-11-12",
  {
    rejections: 24,
    bursts: 1,
    byFunction: { initializeusermonetization: 15, registerdevice: 9 },
    byPlatform: { android: 24 },
    byAppVersion: { unknown: 24 },
    firstAt: "2026-11-12T16:03:59Z",
    lastAt: "2026-11-12T16:13:51Z",
    countedAt: "2026-11-15T04:00:00Z",
  },
  toDate,
);
const nov14 = mapAppCheckDay(
  "2026-11-14",
  {
    rejections: 30,
    bursts: 3,
    byFunction: {
      initializeusermonetization: 21,
      registerdevice: 7,
      schoolsetrole: 1,
      "<img src=x>": 1,
    },
    byPlatform: { android: 21, ios: 9 },
    byAppVersion: { unknown: 21, "1.0.4": 8, "1.0.3": 1 },
    firstAt: "2026-11-14T16:12:23Z",
    lastAt: "2026-11-14T19:09:00Z",
    countedAt: "2026-11-15T05:00:00Z",
  },
  toDate,
);
const nov13 = mapAppCheckDay(
  "2026-11-13",
  { rejections: 0, bursts: 0, countedAt: "2026-11-15T04:00:00Z" },
  toDate,
);

describe("App Check statistics", () => {
  it("ignores invalid counts in a day document", () => {
    const day = mapAppCheckDay(
      "2026-11-01",
      { rejections: -2, bursts: "x", byFunction: { a: 2, b: -1 } },
      toDate,
    );
    expect(day).toMatchObject({
      rejections: 0,
      bursts: 0,
      byFunction: { a: 2 },
    });
  });

  it("sums the days by function, platform and version", () => {
    const summary = summarizeAppCheck([nov12, nov13, nov14]);
    expect(summary).toMatchObject({
      rejections: 54,
      bursts: 4,
      daysWithRejections: 2,
      countedDays: 3,
      byPlatform: { android: 45, ios: 9 },
      byAppVersion: { unknown: 45, "1.0.4": 8, "1.0.3": 1 },
    });
    expect(summary.byFunction.initializeusermonetization).toBe(36);
    expect(summary.lastRejectionAt?.toISOString()).toBe(
      "2026-11-14T19:09:00.000Z",
    );
    expect(summary.countedAt?.toISOString()).toBe("2026-11-15T05:00:00.000Z");
  });

  it("labels functions by their exported name, largest first", () => {
    expect(functionLabel("initializeusermonetization")).toBe(
      "initializeUserMonetization",
    );
    expect(functionLabel("somethingnew")).toBe("somethingnew");
    expect(
      Object.keys(breakdownLabels({ b: 1, a: 1, c: 5 }, (key) => key)),
    ).toEqual(["c", "a", "b"]);
  });

  it("orders app versions newest first, unknown last", () => {
    expect(
      versionKeys({
        unknown: 45,
        "1.0.1": 2,
        "1.0.10": 1,
        "1.0.4": 8,
        "1.0.3": 1,
      }),
    ).toEqual(["1.0.10", "1.0.4", "1.0.3", "1.0.1", "unknown"]);
  });

  it("stacks chart days by function and marks uncounted days", () => {
    const days = buildAppCheckChart(
      ["2026-11-11", "2026-11-12", "2026-11-14", "2026-11-15"],
      [nov12, nov14],
      ["initializeusermonetization", "registerdevice"],
      "2026-11-15",
      "Other",
    );
    expect(days[0]).toMatchObject({ aggregated: false, total: 0 });
    expect(days[2].segments).toEqual([
      { series: "initializeusermonetization", value: 21 },
      { series: "registerdevice", value: 7 },
      { series: "Other", value: 2 },
    ]);
    expect(days[3]).toMatchObject({ live: true, aggregated: false });
  });

  it("renders totals and days as text only", () => {
    const totals = document.createElement("div");
    totals.innerHTML =
      '<strong data-ac-total="rejections"></strong><span data-ac-total="days-note"></span>';
    renderAppCheckTotals(totals, summarizeAppCheck([nov12, nov13, nov14]), 7);
    expect(totals.querySelector("strong")?.textContent).toBe("54");
    expect(totals.querySelector("span")?.textContent).toBe(
      "of 7 days (3 counted)",
    );

    const rows = document.createElement("tbody");
    renderAppCheckDays(rows, [nov12, nov13, nov14]);
    expect(rows.querySelectorAll("tr")).toHaveLength(2);
    expect(rows.querySelector("td")?.textContent).toBe("2026-11-14");
    expect(rows.querySelector("img")).toBeNull();
    expect(rows.textContent).toContain("<img src=x> 1");

    renderAppCheckDays(rows, [nov13]);
    expect(rows.textContent).toBe("No rejections in this range.");
  });
});

describe("active premium summary", () => {
  it("maps statistics/premium", () => {
    const countedAt = new Date("2026-11-15T04:53:00Z");
    expect(
      mapPremiumSummary(
        { active: 12, bySource: { trial: 9, apple: 2, google: 1, other: 0 } },
        countedAt,
      ),
    ).toEqual({
      premium: 12,
      premiumBySource: { trial: 9, apple: 2, google: 1, other: 0 },
      rewardBanked: 0,
      countedAt,
    });
  });

  it("gives zero counts when the function has not run yet", () => {
    expect(mapPremiumSummary(undefined, null)).toEqual({
      premium: 0,
      premiumBySource: {},
      rewardBanked: 0,
      countedAt: null,
    });
  });
});
