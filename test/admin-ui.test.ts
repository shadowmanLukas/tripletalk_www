// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { FeedbackRecord } from "../src/lib/feedback";
import {
  buildMonthlyAiUsage,
  formatWarsawDate,
  renderAiCosts,
  renderAdminStatistics,
  renderFeedbackCards,
  renderFeedbackDetails,
  renderFeedbackRows,
  renderMonthlyAiUsage,
  summarizeAiCosts,
  summarizeUserCreatedLessons,
} from "../src/scripts/admin-panel";

const item: FeedbackRecord = {
  id: "feedback-1",
  category: "bug",
  title: "<img src=x onerror=alert(1)>",
  description: "<script>window.hacked = true</script>",
  userId: "user-1",
  createdAt: "2026-07-17T10:00:00.000Z",
  appVersion: "1.0.0+2",
  platform: "ios",
  status: "open",
  completedAt: null,
  completedBy: null,
  attachments: [
    {
      storagePath: "feedback/u/f/a.jpg",
      fileName: "screen.jpg",
      contentType: "image/jpeg",
    },
  ],
};

describe("admin UI", () => {
  it("renders the table and untrusted feedback as text, not HTML", () => {
    const table = document.createElement("tbody");
    renderFeedbackRows(table, [item]);
    expect(table.querySelectorAll("tr")).toHaveLength(1);
    expect(table.querySelector("script")).toBeNull();
    expect(table.querySelector("img")).toBeNull();
    expect(table.textContent).toContain(item.title);
  });

  it("renders details and attachment loading independently", () => {
    const container = document.createElement("div");
    renderFeedbackDetails(container, item);
    expect(container.querySelector("script")).toBeNull();
    expect(
      container.querySelector("[data-attachment-index='0']"),
    ).not.toBeNull();
    expect(container.textContent).toContain(item.description);
  });

  it("renders a responsive feedback card", () => {
    const container = document.createElement("div");
    renderFeedbackCards(container, [item]);
    expect(container.querySelectorAll("article")).toHaveLength(1);
    expect(container.querySelector("script")).toBeNull();
    expect(container.textContent).toContain("Mark as done");
  });

  it("formats dates in Europe/Warsaw", () => {
    expect(formatWarsawDate("2026-07-17T10:00:00.000Z")).toMatch(/12:00/);
  });

  it("renders Firestore statistics with localized values", () => {
    const container = document.createElement("div");
    [
      "users",
      "lessons",
      "flashcards",
      "lessons-per-user",
      "flashcards-per-user",
      "flashcards-per-lesson",
      "active-users",
      "inactive-users",
      "new-users",
    ].forEach((name) => {
      const value = document.createElement("strong");
      value.dataset.statistic = name;
      container.append(value);
    });
    renderAdminStatistics(container, {
      users: 10,
      lessons: 7,
      flashcards: 382,
      lessonsPerUser: 0.7,
      flashcardsPerUser: 38.2,
      flashcardsPerLesson: 54.57,
      activeUsers: 4,
      inactiveUsers: 6,
      newUsers: 8,
    });
    expect(
      container.querySelector("[data-statistic='flashcards']")?.textContent,
    ).toBe("382");
    expect(
      container.querySelector("[data-statistic='flashcards-per-lesson']")
        ?.textContent,
    ).toBe("54,6");
  });

  it("excludes lessons imported from ready-made collections from KPIs", () => {
    expect(
      summarizeUserCreatedLessons([
        { createdFromCommonCollection: false, flashcardCount: 52 },
        { flashcardCount: 30 },
        { createdFromCommonCollection: true, flashcardCount: 200 },
      ]),
    ).toEqual({ lessons: 2, flashcards: 82 });
  });

  it("summarizes token usage and estimates Gemini paid-tier cost", () => {
    const statistics = summarizeAiCosts([
      {
        lexiAiProcessingAnalytics: {
          totals: {
            apiCallCount: 3,
            promptTokenCount: 5762,
            candidatesTokenCount: 16825,
            totalTokenCount: 22587,
          },
        },
      },
      {},
    ]);
    expect(statistics.processes).toBe(1);
    expect(statistics.totalTokens).toBe(22587);
    expect(statistics.estimatedCostUsd).toBeCloseTo(0.0437911);

    const container = document.createElement("div");
    ["estimated-cost", "total-tokens", "tokens-per-call"].forEach((name) => {
      const value = document.createElement("strong");
      value.dataset.costStatistic = name;
      container.append(value);
    });
    renderAiCosts(container, statistics);
    expect(
      container.querySelector("[data-cost-statistic='estimated-cost']")
        ?.textContent,
    ).toBe("$0.0438");
    expect(
      container.querySelector("[data-cost-statistic='total-tokens']")
        ?.textContent,
    ).toBe("22 587");
  });

  it("builds and renders separate monthly AI usage charts", () => {
    const points = buildMonthlyAiUsage(
      [
        {
          processingCompletedAt: "2026-08-12T12:00:00.000Z",
          lexiAiProcessingAnalytics: {
            totals: {
              apiCallCount: 3,
              promptTokenCount: 100,
              candidatesTokenCount: 200,
              totalTokenCount: 350,
            },
          },
        },
      ],
      new Date("2026-08-24T12:00:00.000Z"),
      3,
    );
    expect(points.map((point) => point.inputTokens)).toEqual([0, 0, 100]);
    expect(points.at(-1)?.thinkingTokens).toBe(50);

    const container = document.createElement("div");
    ["inputTokens", "outputTokens", "thinkingTokens", "apiCalls"].forEach(
      (metric) => {
        const total = document.createElement("strong");
        total.dataset.chartTotal = metric;
        const chart = document.createElement("div");
        chart.dataset.monthlyChart = metric;
        container.append(total, chart);
      },
    );
    renderMonthlyAiUsage(container, points);
    expect(
      container.querySelectorAll(
        "[data-monthly-chart='inputTokens'] .usage-chart-column",
      ),
    ).toHaveLength(3);
    expect(
      container.querySelector("[data-chart-total='thinkingTokens']")
        ?.textContent,
    ).toBe("50");
  });
});
