// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { AI_PRICING, type AiPricing } from "../src/lib/ai-pricing";
import {
  aggregateEvents,
  buildDailyChart,
  dayKeysBetween,
  detectUsageAlerts,
  emptyUsageTotals,
  estimateCost,
  isAggregationStale,
  isDayKey,
  mapDailyFunctionRow,
  sortFunctionSummaries,
  sumUsage,
  summarizeFunctions,
  voiceType,
  type DailyFunctionRow,
} from "../src/lib/function-stats";
import {
  chartSeries,
  formatCost,
  renderFunctionDetails,
  renderFunctionRows,
  renderUsageAlerts,
} from "../src/scripts/function-stats";
import { applyAdminTheme } from "../src/scripts/admin-theme";

const pricing: AiPricing = {
  ...AI_PRICING,
  geminiPerMillionTokens: { "gemini-2.5-flash": { input: 0.3, output: 2.5 } },
  ttsPerMillionCharacters: { Wavenet: 4, Neural2: 16 },
};

function row(
  dayKey: string,
  functionName: string,
  data: Record<string, unknown>,
): DailyFunctionRow {
  return mapDailyFunctionRow({ dayKey, functionName, ...data })!;
}

function geminiDay(
  dayKey: string,
  functionName: string,
  calls: number,
  outputTokens: number,
  operation = "flashcard_enrichment",
): DailyFunctionRow {
  const usage = {
    calls,
    promptTokens: calls * 1000,
    outputTokens,
    thinkingTokens: 0,
    totalTokens: calls * 1000 + outputTokens,
  };
  return row(dayKey, functionName, {
    geminiCalls: calls,
    promptTokens: usage.promptTokens,
    outputTokens,
    totalTokens: usage.totalTokens,
    byModel: { "gemini-2.5-flash": usage },
    byOperation: { [operation]: { api: "gemini", ...usage } },
  });
}

describe("function statistics", () => {
  it("estimates cost per model and voice, thinking billed as output", () => {
    const totals = mapDailyFunctionRow({
      dayKey: "2026-10-01",
      functionName: "enrichFlashcardWithAi",
      geminiCalls: 2,
      ttsCalls: 3,
      byModel: {
        "gemini-2.5-flash": {
          calls: 2,
          promptTokens: 1_000_000,
          outputTokens: 200_000,
          thinkingTokens: 200_000,
          totalTokens: 1_400_000,
        },
      },
      byVoice: {
        "pl-PL-Wavenet-B": { calls: 1, characters: 500_000 },
        "en-US-Neural2-F": { calls: 2, characters: 250_000 },
      },
    })!.totals;
    const cost = estimateCost(totals, pricing);
    // 0.30 + 0.4 × 2.50 + 0.5 × 4 + 0.25 × 16
    expect(cost.usd).toBeCloseTo(7.3);
    expect(cost.unpriced).toEqual([]);
  });

  it("reports models and voices without a price instead of counting them as 0", () => {
    const totals = row("2026-10-01", "fn", {
      geminiCalls: 1,
      ttsCalls: 1,
      byModel: {
        "gemini-9-ultra": { calls: 1, promptTokens: 10, totalTokens: 10 },
      },
      byVoice: { "en-US-Chirp-HD-F": { calls: 1, characters: 10 } },
    }).totals;
    const cost = estimateCost(totals, pricing);
    expect(cost.unpriced).toEqual([
      "model gemini-9-ultra",
      "voice en-US-Chirp-HD-F",
    ]);
    expect(formatCost(cost)).toBe("No price");
    expect(formatCost({ usd: 0.5, unpriced: ["model x"] })).toBe(
      "$0.5000 + no price",
    );
  });

  it("reads voice types from Cloud TTS voice names", () => {
    expect(voiceType("pl-PL-Wavenet-B")).toBe("Wavenet");
    expect(voiceType("en-US-Chirp3-HD-Achernar")).toBe("Chirp3-HD");
    expect(voiceType("en-US-Neural2-F")).toBe("Neural2");
    expect(voiceType("custom")).toBeNull();
  });

  it("sums a date range and ranks functions by cost", () => {
    const rows = [
      geminiDay("2026-10-01", "enrichFlashcardWithAi", 10, 5000),
      geminiDay("2026-10-02", "enrichFlashcardWithAi", 5, 2500),
      geminiDay("2026-10-02", "selectLessonIconWithAi", 1, 7, "lesson_icon"),
    ];
    const totals = sumUsage(rows);
    expect(totals.geminiCalls).toBe(16);
    expect(totals.byModel["gemini-2.5-flash"].calls).toBe(16);
    expect(totals.byOperation.flashcard_enrichment.outputTokens).toBe(7500);

    const summaries = summarizeFunctions(rows, pricing);
    expect(summaries.map((item) => item.functionName)).toEqual([
      "enrichFlashcardWithAi",
      "selectLessonIconWithAi",
    ]);
    expect(summaries[0].averageTokensPerCall).toBe(1500);
    expect(
      summaries.reduce((sum, item) => sum + (item.costShare || 0), 0),
    ).toBeCloseTo(1);
    expect(
      sortFunctionSummaries(summaries, "functionName", "desc")[0].functionName,
    ).toBe("selectLessonIconWithAi");
  });

  it("aggregates raw events like the backend job", () => {
    const totals = aggregateEvents([
      {
        api: "gemini",
        functionName: "schoolAddCard",
        operation: "school_moderation",
        model: "gemini-2.5-flash",
        promptTokens: 90,
        outputTokens: 6,
        thinkingTokens: 0,
        totalTokens: 96,
      },
      {
        api: "tts",
        functionName: "processSchoolCardAudio",
        operation: "pronunciation",
        voiceName: "pl-PL-Wavenet-B",
        characters: 26,
      },
      { api: "tts", functionName: "processSchoolCardAudio", characters: -5 },
    ]);
    expect(totals.schoolAddCard.byOperation.school_moderation).toMatchObject({
      api: "gemini",
      calls: 1,
      outputTokens: 6,
    });
    expect(totals.processSchoolCardAudio.ttsCalls).toBe(2);
    expect(totals.processSchoolCardAudio.ttsCharacters).toBe(26);
    expect(totals.processSchoolCardAudio.byVoice.unknown.characters).toBe(0);
  });

  it("flags an output spike against the previous 7 days and a cost threshold", () => {
    const rows = [
      geminiDay("2026-09-28", "schoolAddCard", 10, 60, "school_moderation"),
      geminiDay("2026-09-30", "schoolAddCard", 10, 60, "school_moderation"),
      geminiDay("2026-10-01", "schoolAddCard", 1, 1190, "school_moderation"),
      geminiDay("2026-10-01", "enrichFlashcardWithAi", 2000, 1_000_000),
    ];
    const alerts = detectUsageAlerts(rows, {
      fromDayKey: "2026-10-01",
      toDayKey: "2026-10-01",
      costThresholdUsd: 1,
      pricing,
    });
    expect(alerts).toEqual([
      expect.objectContaining({
        kind: "daily-cost",
        functionName: "enrichFlashcardWithAi",
      }),
      expect.objectContaining({
        kind: "output-spike",
        functionName: "schoolAddCard",
        operation: "school_moderation",
        value: 1190,
        reference: 6,
      }),
    ]);
    // No baseline, no spike alert; no threshold, no cost alert.
    expect(
      detectUsageAlerts([rows[2], rows[3]], {
        fromDayKey: "2026-10-01",
        toDayKey: "2026-10-01",
        costThresholdUsd: null,
        pricing,
      }),
    ).toEqual([]);
  });

  it("builds stacked chart days and folds extra functions into Other", () => {
    const rows = [
      geminiDay("2026-10-01", "a", 1, 100),
      geminiDay("2026-10-01", "b", 1, 50),
      { ...geminiDay("2026-10-02", "c", 1, 10), live: true },
    ];
    const days = buildDailyChart(
      rows,
      dayKeysBetween("2026-10-01", "2026-10-03"),
      ["a"],
      "tokens",
      pricing,
      new Set(["2026-10-01"]),
    );
    expect(days.map((day) => day.dayKey)).toEqual([
      "2026-10-01",
      "2026-10-02",
      "2026-10-03",
    ]);
    expect(days[0].segments).toEqual([
      { series: "a", value: 1100 },
      { series: "Other", value: 1050 },
    ]);
    expect(days[1]).toMatchObject({ live: true, aggregated: false });
    expect(days[2].total).toBe(0);
  });

  it("keeps series colors by cost, not by the chart metric", () => {
    const summaries = summarizeFunctions(
      [
        geminiDay("2026-10-01", "cheap", 1, 1),
        geminiDay("2026-10-01", "expensive", 100, 100_000),
      ],
      pricing,
    );
    expect(chartSeries(summaries)).toEqual(["expensive", "cheap"]);
  });

  it("validates UTC day keys and data freshness", () => {
    expect(isDayKey("2026-10-01")).toBe(true);
    expect(isDayKey("2026-02-30")).toBe(false);
    expect(dayKeysBetween("2026-09-30", "2026-10-02")).toHaveLength(3);
    const now = new Date("2026-10-02T12:00:00Z");
    expect(isAggregationStale(new Date("2026-10-02T01:30:00Z"), now)).toBe(
      false,
    );
    expect(isAggregationStale(new Date("2026-09-30T23:00:00Z"), now)).toBe(
      true,
    );
    expect(isAggregationStale(null, now)).toBe(true);
  });

  it("renders function names from data as text only", () => {
    const hostile = "<img src=x onerror=alert(1)>";
    const rows = [geminiDay("2026-10-01", hostile, 1, 10, hostile)];
    const summaries = summarizeFunctions(rows, pricing);

    const body = document.createElement("tbody");
    renderFunctionRows(body, summaries, [hostile], new Set([hostile]));
    expect(body.querySelector("img")).toBeNull();
    expect(body.textContent).toContain(hostile);
    expect(body.querySelector("tr")?.dataset.functionName).toBe(hostile);

    const alerts = document.createElement("section");
    renderUsageAlerts(alerts, [
      {
        kind: "output-spike",
        dayKey: "2026-10-01",
        functionName: hostile,
        operation: hostile,
        value: 10,
        reference: 1,
      },
    ]);
    expect(alerts.querySelector("img")).toBeNull();
    expect(alerts.hidden).toBe(false);

    const details = document.createElement("div");
    renderFunctionDetails(details, {
      functionName: hostile,
      rows,
      dayKeys: ["2026-10-01"],
      aggregatedDays: new Set(["2026-10-01"]),
      series: [hostile],
      metric: "cost",
      pricing,
    });
    expect(details.querySelector("img")).toBeNull();
    expect(details.textContent).toContain(hostile);
  });

  it("returns empty totals for an empty range", () => {
    expect(sumUsage([])).toEqual(emptyUsageTotals());
  });

  it("applies and clears an explicit admin theme", () => {
    applyAdminTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyAdminTheme(null);
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
