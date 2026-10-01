// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { FeedbackRecord } from "../src/lib/feedback";
import {
  formatWarsawDate,
  renderFeedbackCards,
  renderFeedbackDetails,
  renderFeedbackRows,
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
});
