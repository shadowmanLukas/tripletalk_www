// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  DEFAULT_OUTCOME_THRESHOLDS,
  aggregateOutcomeEvents,
  buildOutcomeChart,
  clipToOutcomeData,
  codeLabel,
  compareWithPrevious,
  detectOutcomeAlerts,
  mapOutcomeDay,
  mapOutcomeFunctionRow,
  parseOutcomeThresholds,
  sortCodeSummaries,
  sumOutcomeCounters,
  summarizeCodes,
  usersPerDay,
  type OutcomeDay,
  type OutcomeFunctionRow,
} from "../src/lib/ai-outcome-stats";
import { aggregateEvents, dayKeysBetween } from "../src/lib/function-stats";
import {
  formatComparison,
  formatUsersPerDay,
  renderCodeRows,
  renderOutcomeAlerts,
  renderOutcomeFunctionDetails,
  renderOutcomeFunctionRows,
} from "../src/scripts/ai-outcome-stats";

function day(dayKey: string, data: Record<string, unknown> = {}): OutcomeDay {
  return mapOutcomeDay({ dayKey, ...data });
}

function fnRow(
  dayKey: string,
  functionName: string,
  data: Record<string, unknown>,
): OutcomeFunctionRow {
  return mapOutcomeFunctionRow({ dayKey, functionName, ...data });
}

const thresholds = DEFAULT_OUTCOME_THRESHOLDS;

describe("AI outcome statistics", () => {
  it("treats days without outcome fields as no data, not 0", () => {
    const old = day("2026-10-10", { geminiCalls: 50, ttsCalls: 3 });
    const fresh = day("2026-10-18", {
      limitRefusals: 0,
      failures: 0,
      retries: 0,
      moderationRejections: 0,
      byOutcome: {},
    });
    expect(old.hasData).toBe(false);
    expect(fresh.hasData).toBe(true);

    const chart = buildOutcomeChart(
      [old, fresh],
      ["2026-10-10", "2026-10-18", "2026-10-19"],
      "limit",
      [],
    );
    expect(chart.map((item) => item.aggregated)).toEqual([false, true, false]);

    const comparison = compareWithPrevious(
      [fresh],
      [old],
      ["2026-10-10"],
    ).limitRefusals;
    expect(comparison.previous).toBeNull();
    expect(formatComparison(comparison, 1)).toBe(
      "No data for the previous 1 day",
    );
  });

  it("clips a range to the first day with outcome data", () => {
    expect(clipToOutcomeData("2026-09-19")).toEqual({
      fromDayKey: "2026-10-18",
      clipped: true,
    });
    expect(clipToOutcomeData("2026-10-20").clipped).toBe(false);
  });

  it("sums count over the range, not events or users", () => {
    const days = [
      day("2026-10-18", {
        limitRefusals: 412,
        byOutcome: {
          limit: { tts_daily_limit: { count: 412, users: 3 } },
        },
      }),
      day("2026-10-19", {
        limitRefusals: 10,
        byOutcome: {
          limit: {
            tts_daily_limit: { count: 8, users: 2 },
            insufficient_ai_credits: { count: 2, users: 2 },
          },
        },
      }),
    ];
    expect(sumOutcomeCounters(days).limitRefusals).toBe(422);
    const [tts, credits] = summarizeCodes(days, [], "limit");
    expect(tts).toMatchObject({ code: "tts_daily_limit", count: 420 });
    expect(credits.count).toBe(2);
  });

  it("derives counters from byOutcome when the counter field is missing", () => {
    expect(
      day("2026-10-18", {
        byOutcome: { moderation: { photo_word: { count: 5, users: 2 } } },
      }).totals.moderationRejections,
    ).toBe(5);
  });

  it("never adds users up across days", () => {
    const days = [
      day("2026-10-18", {
        byOutcome: { limit: { tts_daily_limit: { count: 4, users: 3 } } },
      }),
      day("2026-10-19", {
        byOutcome: { limit: { tts_daily_limit: { count: 9, users: 1 } } },
      }),
      // The code did not occur: not a 0-user day for it.
      day("2026-10-20", { limitRefusals: 0, byOutcome: {} }),
    ];
    const users = usersPerDay(days, "limit", "tts_daily_limit");
    expect(users).toEqual({ min: 1, max: 3, average: 2, days: 2 });
    expect(formatUsersPerDay(users)).toBe("1–3");
    expect(summarizeCodes(days, [], "limit")[0].users?.max).toBe(3);
  });

  it("shows no user count for retries", () => {
    const days = [
      day("2026-10-18", {
        byOutcome: { retry: { aborted: { count: 7, users: 0 } } },
      }),
    ];
    expect(usersPerDay(days, "retry", "aborted")).toBeNull();
    expect(formatUsersPerDay(null)).toBe("–");
  });

  it("aggregates only outcome events and sums their count", () => {
    const events = [
      {
        type: "outcome",
        outcome: "moderation",
        code: "photo_word",
        count: 4,
        functionName: "schoolCreateCardsFromCandidates",
        userHash: "a",
      },
      {
        type: "outcome",
        outcome: "moderation",
        code: "photo_word",
        count: 2,
        functionName: "schoolCreateCardsFromCandidates",
        userHash: "a",
      },
      {
        type: "outcome",
        outcome: "limit",
        code: "tts_daily_limit",
        functionName: "generateFlashcardAudioPronunciations",
        userHash: "b",
      },
      {
        type: "outcome",
        outcome: "retry",
        code: "aborted",
        functionName: "generateFlashcardAudioPronunciations",
        userHash: null,
      },
      // API usage events have no type and are not outcomes.
      {
        api: "tts",
        functionName: "generateFlashcardAudioPronunciations",
        characters: 26,
      },
    ];
    const { totals, byFunction } = aggregateOutcomeEvents(events);
    expect(totals.moderationRejections).toBe(6);
    expect(totals.byOutcome.moderation.photo_word).toEqual({
      count: 6,
      users: 1,
    });
    expect(totals.limitRefusals).toBe(1);
    expect(totals.retries).toBe(1);
    expect(totals.byOutcome.retry.aborted.users).toBe(0);
    expect(Object.keys(byFunction).sort()).toEqual([
      "generateFlashcardAudioPronunciations",
      "schoolCreateCardsFromCandidates",
    ]);
    // No user hash in the result.
    expect(JSON.stringify(totals)).not.toMatch(/"a"|"b"/);

    // Usage aggregation skips outcome events.
    const usage = aggregateEvents(events);
    expect(usage.generateFlashcardAudioPronunciations.ttsCalls).toBe(1);
    expect(usage.schoolCreateCardsFromCandidates).toBeUndefined();
  });

  it("names known codes and leaves unknown codes raw", () => {
    expect(codeLabel("limit", "tts_daily_limit")).toMatch(/recording/);
    expect(codeLabel("failure", "resource_exhausted")).toBe(
      "Regular flashcard recording failed",
    );
    expect(codeLabel("failure", "grpc_42")).toBe(
      "Regular flashcard recording failed",
    );
    expect(codeLabel("retry", "deadline_exceeded")).toBe("Unexpected error");
    expect(codeLabel("limit", "new_limit")).toBeNull();
    expect(codeLabel("moderation", "constructor")).toBeNull();
  });

  it("lists functions with their share of calls for failures", () => {
    const rows = [
      fnRow("2026-10-18", "enrichFlashcardWithAi", {
        geminiCalls: 100,
        failures: 3,
        byOutcome: { failure: { generation_failed: { count: 3, users: 2 } } },
      }),
      fnRow("2026-10-19", "enrichFlashcardWithAi", {
        geminiCalls: 100,
        failures: 0,
      }),
    ];
    const [summary] = summarizeCodes(
      [
        day("2026-10-18", {
          byOutcome: {
            failure: { generation_failed: { count: 3, users: 2 } },
          },
        }),
      ],
      rows,
      "failure",
    );
    expect(summary.functions).toEqual([
      {
        functionName: "enrichFlashcardWithAi",
        count: 3,
        calls: 200,
        rate: 0.015,
      },
    ]);
  });

  it("sorts code tables by column", () => {
    const summaries = summarizeCodes(
      [
        day("2026-10-18", {
          byOutcome: {
            limit: {
              text_too_long: { count: 1, users: 1 },
              tts_daily_limit: { count: 9, users: 1 },
            },
          },
        }),
      ],
      [],
      "limit",
    );
    expect(summaries.map((item) => item.code)).toEqual([
      "tts_daily_limit",
      "text_too_long",
    ]);
    expect(
      sortCodeSummaries(summaries, "code", "asc").map((item) => item.code),
    ).toEqual(["text_too_long", "tts_daily_limit"]);
  });

  it("flags failure rates above the threshold and failures without calls", () => {
    const rows = [
      fnRow("2026-10-19", "enrichFlashcardWithAi", {
        geminiCalls: 100,
        failures: 3,
      }),
      fnRow("2026-10-19", "selectLessonIconWithAi", {
        geminiCalls: 100,
        failures: 2,
      }),
      fnRow("2026-10-19", "processSchoolCardAudio", {
        failures: 4,
        ttsCalls: 0,
      }),
    ];
    const alerts = detectOutcomeAlerts([], rows, {
      fromDayKey: "2026-10-19",
      toDayKey: "2026-10-19",
      thresholds,
    });
    expect(alerts.map((alert) => [alert.kind, alert.functionName])).toEqual([
      ["failures-without-calls", "processSchoolCardAudio"],
      ["failure-rate", "enrichFlashcardWithAi"],
    ]);
    expect(
      detectOutcomeAlerts([], rows, {
        fromDayKey: "2026-10-19",
        toDayKey: "2026-10-19",
        thresholds: { ...thresholds, failureRatePercent: 5 },
      }).map((alert) => alert.kind),
    ).toEqual(["failures-without-calls"]);
  });

  it("flags retries above 3 × the previous 7 days, with a baseline only", () => {
    const fn = "generateFlashcardAudioPronunciations";
    const days = dayKeysBetween("2026-10-18", "2026-10-25").map((dayKey) =>
      day(dayKey, { retries: 0, byOutcome: {} }),
    );
    const rows = [
      fnRow("2026-10-18", fn, { retries: 4 }),
      fnRow("2026-10-19", fn, { retries: 2 }),
      fnRow("2026-10-24", fn, { retries: 2 }),
      fnRow("2026-10-25", fn, { retries: 9 }),
    ];
    const alerts = detectOutcomeAlerts(days, rows, {
      fromDayKey: "2026-10-18",
      toDayKey: "2026-10-25",
      thresholds,
    });
    // 10-18 has no earlier day with data. 10-19: 2 vs 4. 10-24: 2 vs (4+2)/6
    // = 1 → floor 1 → limit 3. 10-25: 9 vs 8/7 ≈ 1.14 → limit 3.43.
    expect(alerts).toEqual([
      expect.objectContaining({
        kind: "retry-spike",
        dayKey: "2026-10-25",
        value: 9,
      }),
    ]);
    expect(alerts[0].reference).toBeCloseTo(8 / 7);
  });

  it("flags moderation codes by user thresholds and failed-open moderation", () => {
    const days = [
      day("2026-10-18", {
        byOutcome: {
          moderation: {
            card_word: { count: 6, users: 5 },
            display_name: { count: 12, users: 1 },
            photo_word: { count: 9, users: 1 },
            class_name: { count: 4, users: 4 },
          },
        },
      }),
    ];
    const rows = [
      fnRow("2026-10-18", "schoolAddCard", {
        geminiCalls: 1000,
        failures: 1,
        byOutcome: {
          failure: { moderation_failed_open: { count: 1, users: 1 } },
        },
      }),
    ];
    const alerts = detectOutcomeAlerts(days, rows, {
      fromDayKey: "2026-10-18",
      toDayKey: "2026-10-18",
      thresholds,
    });
    expect(
      alerts.map((alert) => [alert.kind, alert.code || alert.functionName]),
    ).toEqual([
      ["moderation-failed-open", "moderation_failed_open"],
      ["moderation-single-user", "display_name"],
      ["moderation-users", "card_word"],
    ]);
    // Thresholds from the panel change the result.
    expect(
      detectOutcomeAlerts(days, [], {
        fromDayKey: "2026-10-18",
        toDayKey: "2026-10-18",
        thresholds: parseOutcomeThresholds({
          moderationUsersPerDay: 4,
          moderationSingleUserCount: 9,
        }),
      }).map((alert) => alert.code),
    ).toEqual(["display_name", "photo_word", "card_word", "class_name"]);
  });

  it("keeps valid stored thresholds and drops invalid ones", () => {
    expect(
      parseOutcomeThresholds({
        failureRatePercent: 5,
        retrySpikeFactor: -1,
        moderationUsersPerDay: "x",
      }),
    ).toEqual({ ...DEFAULT_OUTCOME_THRESHOLDS, failureRatePercent: 5 });
    expect(parseOutcomeThresholds(null)).toEqual(DEFAULT_OUTCOME_THRESHOLDS);
  });

  it("renders codes and function names from data as text only", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const days = [
      day("2026-10-18", {
        byOutcome: { moderation: { [hostile]: { count: 1, users: 1 } } },
      }),
    ];
    const rows = [
      fnRow("2026-10-18", hostile, {
        geminiCalls: 1,
        moderationRejections: 1,
        byOutcome: { moderation: { [hostile]: { count: 1, users: 1 } } },
      }),
    ];
    const body = document.createElement("tbody");
    renderCodeRows(
      body,
      "moderation",
      summarizeCodes(days, rows, "moderation"),
      new Map([[hostile, ["Possible abuse"]]]),
    );
    expect(body.querySelector("img")).toBeNull();
    expect(body.textContent).toContain(hostile);
    expect(body.querySelector("tr")?.classList.contains("has-alert")).toBe(
      true,
    );

    const functions = document.createElement("tbody");
    renderOutcomeFunctionRows(functions, rows, new Set([hostile]));
    expect(functions.querySelector("img")).toBeNull();
    expect(functions.querySelector("tr")?.dataset.functionName).toBe(hostile);

    const alerts = document.createElement("section");
    renderOutcomeAlerts(alerts, [
      {
        kind: "moderation-single-user",
        dayKey: "2026-10-18",
        code: hostile,
        value: 12,
        reference: 10,
      },
    ]);
    expect(alerts.querySelector("img")).toBeNull();
    expect(alerts.hidden).toBe(false);

    const details = document.createElement("div");
    renderOutcomeFunctionDetails(details, {
      functionName: hostile,
      rows,
      dayKeys: ["2026-10-17", "2026-10-18"],
      dataDays: new Set(["2026-10-18"]),
    });
    expect(details.querySelector("img")).toBeNull();
    expect(details.textContent).toContain(hostile);
    expect(details.textContent).toContain("No data");
  });
});
