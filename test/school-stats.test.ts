// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  MEMBERSHIP_STATUSES,
  SCHOOL_CHART_METRICS,
  deriveSchoolTotals,
  type SchoolStatsSnapshot,
} from "../src/lib/school-stats";
import { breakdownRows } from "../src/lib/stats";
import { renderSchoolTotals } from "../src/scripts/school-stats";

const snapshot: SchoolStatsSnapshot = {
  roles: { teacher: 4, student: 30 },
  schoolUsers: 35,
  classes: 5,
  memberships: { pending: 6, accepted: 22, rejected: 2 },
  membershipTotal: 31,
  lessons: 12,
  publishedLessons: 9,
  cards: 300,
  audioPending: 3,
  audioFailed: 1,
  assignments: 15,
  assignmentStates: { ready: 14, preparing: 0, failed: 1 },
  openAssignments: 7,
  startedAssignments: 80,
  recentProgress: 25,
};

describe("school statistics", () => {
  it("derives per-class and per-lesson averages", () => {
    const totals = deriveSchoolTotals(snapshot);
    expect(totals).toMatchObject({
      teachers: 4,
      students: 30,
      studentsInClasses: 22,
      studentsPerClass: 4.4,
      cardsPerLesson: 25,
      lessonsPerTeacher: 3,
    });
  });

  it("never divides by zero or reports more published than all lessons", () => {
    const totals = deriveSchoolTotals({
      ...snapshot,
      roles: {},
      classes: 0,
      lessons: 0,
      publishedLessons: 4,
    });
    expect(totals).toMatchObject({
      teachers: 0,
      studentsPerClass: 0,
      cardsPerLesson: 0,
      lessonsPerTeacher: 0,
      publishedLessons: 0,
    });
  });

  it("puts unknown statuses into a remainder row", () => {
    const rows = breakdownRows(
      snapshot.memberships,
      MEMBERSHIP_STATUSES,
      snapshot.membershipTotal,
    );
    expect(rows.at(-1)).toMatchObject({ label: "Other or not set", count: 1 });
  });

  it("charts School events by their own timestamp fields", () => {
    expect(SCHOOL_CHART_METRICS.started).toMatchObject({
      collection: "schoolProgress",
      field: "startedAt",
    });
    expect(SCHOOL_CHART_METRICS.published.collection).toBe("schoolAssignments");
  });

  it("renders totals as text", () => {
    const container = document.createElement("div");
    ["students-per-class", "published-lessons"].forEach((name) => {
      const value = document.createElement("span");
      value.dataset.schoolTotal = name;
      container.append(value);
    });
    renderSchoolTotals(container, deriveSchoolTotals(snapshot));
    expect(
      container.querySelector("[data-school-total='students-per-class']")
        ?.textContent,
    ).toBe("4,4 accepted students per class");
    expect(
      container.querySelector("[data-school-total='published-lessons']")
        ?.textContent,
    ).toBe("9 published (locked)");
  });
});
