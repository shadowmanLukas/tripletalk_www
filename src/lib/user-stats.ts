import { shiftDayKey } from "./function-stats";
import { utcDayStart } from "./stats";

// Pure helpers for the User Stats view. Fields come from `users/{uid}`
// (written by the app and by monetization Cloud Functions in the tripletalk
// repository), `users/{uid}/lessons/{lessonId}` and
// `users/{uid}/learningStats/{localDayKey}` (one document per day on which the
// user marked at least one flashcard as known; the activity measure).

export interface LessonTotals {
  lessons: number;
  flashcards: number;
}

export interface ActiveLearners {
  /** Distinct users with a learning day in the last 7 days (incl. today). */
  last7: number;
  /** Distinct users with a learning day in the last 30 days (incl. today). */
  last30: number;
}

export interface UserStatsSnapshot {
  users: number;
  /** Null when learning activity cannot be read (rule or index missing). */
  activeLearners: ActiveLearners | null;
  premium: number;
  premiumBySource: Record<string, number>;
  authProviders: Record<string, number>;
  /** Every lesson, including ones imported from ready-made collections. */
  allLessons: LessonTotals;
  /** Lessons imported from ready-made collections. */
  commonLessons: LessonTotals;
}

export interface UserTotals {
  users: number;
  active7: number | null;
  active7Share: number | null;
  active30: number | null;
  active30Share: number | null;
  premium: number;
  premiumShare: number | null;
  lessons: number;
  flashcards: number;
  lessonsPerUser: number;
  flashcardsPerUser: number;
  flashcardsPerLesson: number;
}

/** Sign-in methods written to `users.authProvider` by the app. */
export const AUTH_PROVIDERS: Record<string, string> = {
  "google.com": "Google",
  "apple.com": "Apple",
  password: "Email and password",
};

/** Values of `users.premiumSource` while `premiumIsActive` is true. */
export const PREMIUM_SOURCES: Record<string, string> = {
  trial: "Trial",
  apple: "App Store subscription",
  google: "Google Play subscription",
};

function nonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export function summarizeUserCreatedLessons(
  lessons: Array<Record<string, unknown>>,
): LessonTotals {
  const userCreated = lessons.filter(
    (lesson) => lesson.createdFromCommonCollection !== true,
  );
  const flashcards = userCreated.reduce(
    (total, lesson) => total + nonNegative(Number(lesson.flashcardCount || 0)),
    0,
  );
  return { lessons: userCreated.length, flashcards };
}

export function deriveUserTotals(snapshot: UserStatsSnapshot): UserTotals {
  const users = nonNegative(snapshot.users);
  const active = snapshot.activeLearners;
  const active7 = active ? Math.min(nonNegative(active.last7), users) : null;
  const active30 = active ? Math.min(nonNegative(active.last30), users) : null;
  const share = (value: number | null) =>
    value === null || !users ? null : value / users;
  const lessons = nonNegative(
    snapshot.allLessons.lessons - snapshot.commonLessons.lessons,
  );
  const flashcards = nonNegative(
    snapshot.allLessons.flashcards - snapshot.commonLessons.flashcards,
  );
  const premium = nonNegative(snapshot.premium);
  return {
    users,
    active7,
    active7Share: share(active7),
    active30,
    active30Share: share(active30),
    premium,
    premiumShare: users ? premium / users : null,
    lessons,
    flashcards,
    lessonsPerUser: users ? lessons / users : 0,
    flashcardsPerUser: users ? flashcards / users : 0,
    flashcardsPerLesson: lessons ? flashcards / lessons : 0,
  };
}

export const NEW_USERS_SERIES = "New users";
export const ACTIVE_LEARNERS_SERIES = "Active learners";

const TWELVE_HOURS_MS = 12 * 60 * 60 * 1000;

/** `learningStats.date` is the user's local midnight. Local day D therefore
 * falls in [D 00:00 UTC − 12 h, D 00:00 UTC + 12 h) for time zones from
 * UTC−12 to UTC+12, which is how a day key is matched to learning days. */
export function learningDayWindow(dayKey: string): { start: Date; end: Date } {
  const midnight = utcDayStart(dayKey).getTime();
  return {
    start: new Date(midnight - TWELVE_HOURS_MS),
    end: new Date(midnight + TWELVE_HOURS_MS),
  };
}

export function countActiveLearners(
  learningDays: Array<{ uid: string; date: Date }>,
  todayKey: string,
): ActiveLearners {
  const since = (days: number) =>
    learningDayWindow(shiftDayKey(todayKey, -(days - 1))).start.getTime();
  const distinct = (days: number) =>
    new Set(
      learningDays
        .filter((day) => day.date.getTime() >= since(days))
        .map((day) => day.uid),
    ).size;
  return { last7: distinct(7), last30: distinct(30) };
}
