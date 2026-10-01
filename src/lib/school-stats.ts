// Pure helpers for the School Stats view. Collections and fields are
// documented in the app repository: tripletalk/docs/school/SPEC.md. The panel
// only counts and sums them; it never reads names, codes or cards.

export interface SchoolStatsSnapshot {
  roles: Record<string, number>;
  schoolUsers: number;
  classes: number;
  memberships: Record<string, number>;
  membershipTotal: number;
  lessons: number;
  publishedLessons: number;
  /** Sum of `schoolLessons.cardCount`. */
  cards: number;
  audioPending: number;
  audioFailed: number;
  assignments: number;
  assignmentStates: Record<string, number>;
  /** Assignments whose `availableTo` has not passed (active or scheduled). */
  openAssignments: number;
  /** `schoolProgress` documents: a student started one assignment. */
  startedAssignments: number;
  /** `schoolProgress` documents updated in the last 7 days. */
  recentProgress: number;
}

export interface SchoolTotals {
  schoolUsers: number;
  teachers: number;
  students: number;
  studentsInClasses: number;
  classes: number;
  studentsPerClass: number;
  lessons: number;
  publishedLessons: number;
  cards: number;
  cardsPerLesson: number;
  lessonsPerTeacher: number;
  assignments: number;
  openAssignments: number;
  startedAssignments: number;
  recentProgress: number;
  audioPending: number;
  audioFailed: number;
}

/** `schoolUsers.role`; one role per user. */
export const SCHOOL_ROLES: Record<string, string> = {
  teacher: "Teachers",
  student: "Students",
};

/** `schoolMemberships.status`. "Expired" is a pending invitation past
 * `expiresAt`, computed by the app, so it is counted as pending here. */
export const MEMBERSHIP_STATUSES: Record<string, string> = {
  pending: "Pending invitation",
  accepted: "Accepted",
  rejected: "Rejected",
};

/** `schoolAssignments.publishState`. */
export const ASSIGNMENT_STATES: Record<string, string> = {
  ready: "Ready",
  preparing: "Preparing",
  failed: "Failed",
};

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function deriveSchoolTotals(
  snapshot: SchoolStatsSnapshot,
): SchoolTotals {
  const teachers = nonNegative(snapshot.roles.teacher || 0);
  const classes = nonNegative(snapshot.classes);
  const lessons = nonNegative(snapshot.lessons);
  const studentsInClasses = nonNegative(snapshot.memberships.accepted || 0);
  const cards = nonNegative(snapshot.cards);
  return {
    schoolUsers: nonNegative(snapshot.schoolUsers),
    teachers,
    students: nonNegative(snapshot.roles.student || 0),
    studentsInClasses,
    classes,
    studentsPerClass: classes ? studentsInClasses / classes : 0,
    lessons,
    publishedLessons: Math.min(nonNegative(snapshot.publishedLessons), lessons),
    cards,
    cardsPerLesson: lessons ? cards / lessons : 0,
    lessonsPerTeacher: teachers ? lessons / teachers : 0,
    assignments: nonNegative(snapshot.assignments),
    openAssignments: nonNegative(snapshot.openAssignments),
    startedAssignments: nonNegative(snapshot.startedAssignments),
    recentProgress: nonNegative(snapshot.recentProgress),
    audioPending: nonNegative(snapshot.audioPending),
    audioFailed: nonNegative(snapshot.audioFailed),
  };
}

export type SchoolChartMetric = "accounts" | "published" | "started";

/** Daily series of the School chart: the collection and the timestamp field
 * that marks the event. */
export const SCHOOL_CHART_METRICS: Record<
  SchoolChartMetric,
  { label: string; collection: string; field: string; note: string }
> = {
  accounts: {
    label: "New School accounts",
    collection: "schoolUsers",
    field: "createdAt",
    note: "Counted by schoolUsers.createdAt. A role reset deletes the School account, so re-created accounts count again.",
  },
  published: {
    label: "Lessons published to classes",
    collection: "schoolAssignments",
    field: "createdAt",
    note: "Counted by schoolAssignments.createdAt. Deleted assignments are not included.",
  },
  started: {
    label: "Assignments started by students",
    collection: "schoolProgress",
    field: "startedAt",
    note: "Counted by schoolProgress.startedAt (a student opened an assignment for the first time).",
  },
};
