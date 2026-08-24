import {
  browserLocalPersistence,
  getAuth,
  getIdTokenResult,
  onAuthStateChanged,
  setPersistence,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  collection,
  collectionGroup,
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  getCountFromServer,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
  where,
  type DocumentData,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { deleteObject, getBlob, getStorage, ref } from "firebase/storage";
import {
  adminEmailFromEnvironment,
  firebaseEnvironment,
  getFirebaseApp,
} from "../lib/firebase/client";
import {
  attachmentPathsForDeletion,
  feedbackStatusUpdate,
  hasAdminClaim,
  isSafeFeedbackStoragePath,
  mapFeedback,
  type FeedbackRecord,
} from "../lib/feedback";

const PAGE_SIZE = 50;
const DATE_FORMAT = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Warsaw",
});
const NUMBER_FORMAT = new Intl.NumberFormat("pl-PL");
const AVERAGE_FORMAT = new Intl.NumberFormat("pl-PL", {
  maximumFractionDigits: 1,
  minimumFractionDigits: 1,
});
const COST_FORMAT = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 4,
  maximumFractionDigits: 4,
});
const GEMINI_INPUT_USD_PER_MILLION = 0.3;
const GEMINI_OUTPUT_USD_PER_MILLION = 2.5;
const MONTH_FORMAT = new Intl.DateTimeFormat("pl-PL", {
  month: "short",
  year: "2-digit",
  timeZone: "UTC",
});

export interface AdminStatistics {
  users: number;
  lessons: number;
  flashcards: number;
  lessonsPerUser: number;
  flashcardsPerUser: number;
  flashcardsPerLesson: number;
  activeUsers: number;
  inactiveUsers: number;
  newUsers: number;
}

export function summarizeUserCreatedLessons(
  lessons: Array<Record<string, unknown>>,
): { lessons: number; flashcards: number } {
  const userCreated = lessons.filter(
    (lesson) => lesson.createdFromCommonCollection !== true,
  );
  const flashcards = userCreated.reduce((total, lesson) => {
    const value = Number(lesson.flashcardCount || 0);
    return total + (Number.isFinite(value) && value > 0 ? value : 0);
  }, 0);
  return { lessons: userCreated.length, flashcards };
}

export interface AiCostStatistics {
  processes: number;
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  estimatedCostUsd: number;
  costPerProcessUsd: number;
  tokensPerProcess: number;
  tokensPerCall: number;
}

interface AiTokenTotals {
  apiCalls: number;
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object"
    ? (value as Record<string, unknown>)
    : {};
}

function nonNegativeNumber(value: unknown): number {
  const number = Number(value || 0);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

export function summarizeAiCosts(
  uploads: Array<Record<string, unknown>>,
): AiCostStatistics {
  const withAnalytics = uploads.flatMap((upload) => {
    const analytics = record(upload.lexiAiProcessingAnalytics);
    const totals = record(analytics.totals);
    return Object.keys(totals).length ? [totals] : [];
  });
  const totals = withAnalytics.reduce<AiTokenTotals>(
    (sum, usage) => ({
      apiCalls: sum.apiCalls + nonNegativeNumber(usage.apiCallCount),
      inputTokens: sum.inputTokens + nonNegativeNumber(usage.promptTokenCount),
      outputTokens:
        sum.outputTokens + nonNegativeNumber(usage.candidatesTokenCount),
      totalTokens: sum.totalTokens + nonNegativeNumber(usage.totalTokenCount),
    }),
    { apiCalls: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 },
  );
  const processes = withAnalytics.length;
  const estimatedCostUsd =
    (totals.inputTokens / 1_000_000) * GEMINI_INPUT_USD_PER_MILLION +
    (totals.outputTokens / 1_000_000) * GEMINI_OUTPUT_USD_PER_MILLION;
  return {
    processes,
    ...totals,
    estimatedCostUsd,
    costPerProcessUsd: processes ? estimatedCostUsd / processes : 0,
    tokensPerProcess: processes ? totals.totalTokens / processes : 0,
    tokensPerCall: totals.apiCalls ? totals.totalTokens / totals.apiCalls : 0,
  };
}

export function renderAiCosts(
  container: HTMLElement,
  statistics: AiCostStatistics,
): void {
  const values: Record<string, string> = {
    "estimated-cost": COST_FORMAT.format(statistics.estimatedCostUsd),
    "total-tokens": NUMBER_FORMAT.format(statistics.totalTokens),
    processes: NUMBER_FORMAT.format(statistics.processes),
    "input-tokens": NUMBER_FORMAT.format(statistics.inputTokens),
    "output-tokens": NUMBER_FORMAT.format(statistics.outputTokens),
    "api-calls": NUMBER_FORMAT.format(statistics.apiCalls),
    "cost-per-process": COST_FORMAT.format(statistics.costPerProcessUsd),
    "tokens-per-process": NUMBER_FORMAT.format(
      Math.round(statistics.tokensPerProcess),
    ),
    "tokens-per-call": NUMBER_FORMAT.format(
      Math.round(statistics.tokensPerCall),
    ),
  };
  container
    .querySelectorAll<HTMLElement>("[data-cost-statistic]")
    .forEach((element) => {
      element.textContent = values[element.dataset.costStatistic || ""] || "—";
    });
}

export interface MonthlyAiUsage {
  key: string;
  label: string;
  inputTokens: number;
  outputTokens: number;
  thinkingTokens: number;
  apiCalls: number;
}

function dateValue(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const converted = toDate.call(value);
      return converted instanceof Date ? converted : null;
    }
  }
  if (typeof value === "string") {
    const converted = new Date(value);
    return Number.isNaN(converted.getTime()) ? null : converted;
  }
  return null;
}

function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}

export function buildMonthlyAiUsage(
  uploads: Array<Record<string, unknown>>,
  now = new Date(),
  monthCount = 6,
): MonthlyAiUsage[] {
  const points = Array.from({ length: monthCount }, (_, index) => {
    const offset = monthCount - index - 1;
    const date = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1),
    );
    return {
      key: monthKey(date),
      label: MONTH_FORMAT.format(date),
      inputTokens: 0,
      outputTokens: 0,
      thinkingTokens: 0,
      apiCalls: 0,
    };
  });
  const byMonth = new Map(points.map((point) => [point.key, point]));
  for (const upload of uploads) {
    const completedAt =
      dateValue(upload.processingCompletedAt) || dateValue(upload.createdAt);
    if (!completedAt) continue;
    const point = byMonth.get(monthKey(completedAt));
    if (!point) continue;
    const totals = record(record(upload.lexiAiProcessingAnalytics).totals);
    const input = nonNegativeNumber(totals.promptTokenCount);
    const output = nonNegativeNumber(totals.candidatesTokenCount);
    const total = nonNegativeNumber(totals.totalTokenCount);
    point.inputTokens += input;
    point.outputTokens += output;
    point.thinkingTokens += Math.max(0, total - input - output);
    point.apiCalls += nonNegativeNumber(totals.apiCallCount);
  }
  return points;
}

export function renderMonthlyAiUsage(
  container: HTMLElement,
  points: MonthlyAiUsage[],
): void {
  const metrics: Array<keyof Omit<MonthlyAiUsage, "key" | "label">> = [
    "inputTokens",
    "outputTokens",
    "thinkingTokens",
    "apiCalls",
  ];
  for (const metric of metrics) {
    const chart = container.querySelector<HTMLElement>(
      `[data-monthly-chart="${metric}"]`,
    );
    const total = points.reduce((sum, point) => sum + point[metric], 0);
    const totalElement = container.querySelector<HTMLElement>(
      `[data-chart-total="${metric}"]`,
    );
    if (totalElement) totalElement.textContent = NUMBER_FORMAT.format(total);
    if (!chart) continue;
    const maximum = Math.max(...points.map((point) => point[metric]), 0);
    chart.replaceChildren(
      ...points.map((point) => {
        const column = document.createElement("div");
        column.className = "usage-chart-column";
        const track = document.createElement("div");
        track.className = "usage-chart-track";
        const wrapper = document.createElement("div");
        const value = document.createElement("span");
        value.className = "usage-chart-value";
        value.textContent = NUMBER_FORMAT.format(point[metric]);
        const bar = document.createElement("div");
        bar.className = "usage-chart-bar";
        bar.style.height = maximum
          ? `${(point[metric] / maximum) * 100}%`
          : "0";
        bar.setAttribute(
          "aria-label",
          `${point.label}: ${NUMBER_FORMAT.format(point[metric])}`,
        );
        const label = document.createElement("span");
        label.className = "usage-chart-label";
        label.textContent = point.label;
        wrapper.append(value, bar);
        track.append(wrapper);
        column.append(track, label);
        return column;
      }),
    );
  }
}

export function renderAdminStatistics(
  container: HTMLElement,
  statistics: AdminStatistics,
): void {
  const values: Record<string, string> = {
    users: NUMBER_FORMAT.format(statistics.users),
    lessons: NUMBER_FORMAT.format(statistics.lessons),
    flashcards: NUMBER_FORMAT.format(statistics.flashcards),
    "lessons-per-user": AVERAGE_FORMAT.format(statistics.lessonsPerUser),
    "flashcards-per-user": AVERAGE_FORMAT.format(statistics.flashcardsPerUser),
    "flashcards-per-lesson": AVERAGE_FORMAT.format(
      statistics.flashcardsPerLesson,
    ),
    "active-users": NUMBER_FORMAT.format(statistics.activeUsers),
    "inactive-users": NUMBER_FORMAT.format(statistics.inactiveUsers),
    "new-users": NUMBER_FORMAT.format(statistics.newUsers),
  };
  container
    .querySelectorAll<HTMLElement>("[data-statistic]")
    .forEach((element) => {
      element.textContent = values[element.dataset.statistic || ""] || "—";
    });
}

export function formatWarsawDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "—" : DATE_FORMAT.format(date);
}

function cell(text: string, className?: string): HTMLTableCellElement {
  const element = document.createElement("td");
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function actionButton(
  label: string,
  action: string,
  id: string,
  className = "secondary",
): HTMLButtonElement {
  const element = document.createElement("button");
  element.type = "button";
  element.className = `admin-button small ${className}`;
  element.dataset.action = action;
  element.dataset.id = id;
  element.textContent = label;
  return element;
}

function appendActions(container: HTMLElement, item: FeedbackRecord): void {
  container.append(
    actionButton("View", "details", item.id),
    actionButton(
      item.status === "done" ? "Reopen" : "Mark as done",
      "status",
      item.id,
      "primary",
    ),
    actionButton("Delete", "delete", item.id, "danger"),
  );
}

export function renderFeedbackRows(
  container: HTMLElement,
  items: FeedbackRecord[],
): void {
  container.replaceChildren();
  for (const item of items) {
    const row = document.createElement("tr");
    row.dataset.id = item.id;
    row.append(
      cell(item.status, `status-cell status-${item.status}`),
      cell(formatWarsawDate(item.createdAt)),
      cell(item.category),
      cell(item.title || "Untitled"),
      cell(item.platform || "—"),
      cell(item.appVersion || "—"),
      cell(item.userId || "—", "mono"),
    );
    const actions = document.createElement("td");
    actions.className = "row-actions";
    appendActions(actions, item);
    row.append(actions);
    container.append(row);
  }
}

function cardField(label: string, value: string): HTMLDivElement {
  const element = document.createElement("div");
  const term = document.createElement("span");
  term.textContent = label;
  const description = document.createElement("strong");
  description.textContent = value || "—";
  element.append(term, description);
  return element;
}

export function renderFeedbackCards(
  container: HTMLElement,
  items: FeedbackRecord[],
): void {
  container.replaceChildren();
  for (const item of items) {
    const card = document.createElement("article");
    card.className = `feedback-card feedback-card-${item.status}`;
    card.dataset.id = item.id;
    const heading = document.createElement("h2");
    heading.textContent = item.title || "Untitled";
    const fields = document.createElement("div");
    fields.className = "feedback-card-fields";
    fields.append(
      cardField("Status", item.status),
      cardField("Date", formatWarsawDate(item.createdAt)),
      cardField("Category", item.category),
      cardField("Platform", item.platform),
      cardField("Version", item.appVersion),
      cardField("User ID", item.userId),
    );
    const actions = document.createElement("div");
    actions.className = "row-actions";
    appendActions(actions, item);
    card.append(heading, fields, actions);
    container.append(card);
  }
}

function detail(label: string, value: string): HTMLDivElement {
  const wrapper = document.createElement("div");
  wrapper.className = "detail-item";
  const term = document.createElement("dt");
  term.textContent = label;
  const description = document.createElement("dd");
  description.textContent = value || "—";
  wrapper.append(term, description);
  return wrapper;
}

export function renderFeedbackDetails(
  container: HTMLElement,
  item: FeedbackRecord,
): void {
  container.replaceChildren();
  const metadata = document.createElement("dl");
  metadata.className = "details-grid";
  metadata.append(
    detail("Feedback ID", item.id),
    detail("Status", item.status),
    detail("Received", formatWarsawDate(item.createdAt)),
    detail("Category", item.category),
    detail("User ID", item.userId),
    detail("Platform", item.platform),
    detail("App version", item.appVersion),
  );
  const title = document.createElement("h3");
  title.textContent = item.title || "Untitled";
  const description = document.createElement("p");
  description.className = "full-description";
  description.textContent = item.description;
  const attachmentHeading = document.createElement("h3");
  attachmentHeading.textContent = `Attachments (${item.attachments.length})`;
  container.append(metadata, title, description, attachmentHeading);

  if (!item.attachments.length) {
    const empty = document.createElement("p");
    empty.textContent = "No attachments.";
    container.append(empty);
    return;
  }

  const gallery = document.createElement("div");
  gallery.className = "attachment-grid";
  item.attachments.forEach((attachment, index) => {
    const card = document.createElement("article");
    card.className = "attachment-card";
    card.dataset.attachmentIndex = String(index);
    const preview = document.createElement("div");
    preview.className = "attachment-preview";
    preview.textContent = "Loading attachment…";
    const name = document.createElement("span");
    name.textContent = attachment.fileName;
    card.append(preview, name);
    gallery.append(card);
  });
  container.append(gallery);
}

async function hydrateAttachments(
  container: HTMLElement,
  item: FeedbackRecord,
): Promise<void> {
  const storage = getStorage(getFirebaseApp());
  await Promise.all(
    item.attachments.map(async (attachment, index) => {
      const card = container.querySelector<HTMLElement>(
        `[data-attachment-index="${index}"]`,
      );
      const preview = card?.querySelector<HTMLElement>(".attachment-preview");
      if (!card || !preview) return;
      if (!isSafeFeedbackStoragePath(attachment.storagePath)) {
        preview.textContent = "Invalid attachment path.";
        preview.classList.add("attachment-error");
        return;
      }
      try {
        const blob = await getBlob(ref(storage, attachment.storagePath));
        const objectUrl = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = objectUrl;
        link.target = "_blank";
        link.rel = "noopener";
        link.addEventListener(
          "click",
          () => window.setTimeout(() => URL.revokeObjectURL(objectUrl), 60_000),
          {
            once: true,
          },
        );
        if (attachment.contentType.startsWith("image/")) {
          const image = document.createElement("img");
          image.src = objectUrl;
          image.alt = attachment.fileName;
          link.append(image);
        } else {
          link.textContent = "Open attachment";
        }
        preview.replaceChildren(link);
      } catch {
        preview.textContent = "Unable to load this attachment.";
        preview.classList.add("attachment-error");
      }
    }),
  );
}

function friendlyAuthError(error: unknown): string {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  if (
    code.includes("invalid-credential") ||
    code.includes("wrong-password") ||
    code.includes("user-not-found")
  ) {
    return "Invalid login or password.";
  }
  if (code.includes("too-many-requests"))
    return "Too many attempts. Try again later.";
  if (error instanceof Error && error.message === "ADMIN_CLAIM_REQUIRED") {
    return "This account does not have administrator access.";
  }
  return "Sign in is temporarily unavailable.";
}

async function verifyAdministrator(user: User): Promise<boolean> {
  const token = await getIdTokenResult(user, true);
  return hasAdminClaim(token.claims);
}

function initializePanel(): void {
  const authLoading = document.querySelector<HTMLElement>("#auth-loading")!;
  const loginView = document.querySelector<HTMLElement>("#login-view")!;
  const panelView = document.querySelector<HTMLElement>("#panel-view")!;
  const loginForm =
    document.querySelector<HTMLFormElement>("#admin-login-form")!;
  const loginError = document.querySelector<HTMLElement>("#login-error")!;
  const rows = document.querySelector<HTMLElement>("#feedback-rows")!;
  const cards = document.querySelector<HTMLElement>("#feedback-cards")!;
  const message = document.querySelector<HTMLElement>("#feedback-message")!;
  const table = document.querySelector<HTMLElement>("#feedback-table-wrap")!;
  const loadMore =
    document.querySelector<HTMLButtonElement>("#load-more-button")!;
  const dialog = document.querySelector<HTMLDialogElement>("#details-dialog")!;
  const details = document.querySelector<HTMLElement>("#details-content")!;
  const toast = document.querySelector<HTMLElement>("#admin-toast")!;
  const statisticsMessage = document.querySelector<HTMLElement>(
    "#statistics-message",
  )!;
  const statisticsGrid =
    document.querySelector<HTMLElement>("#statistics-grid")!;
  const statisticsUpdated = document.querySelector<HTMLElement>(
    "#statistics-updated",
  )!;
  const statisticsRefresh = document.querySelector<HTMLButtonElement>(
    "#statistics-refresh-button",
  )!;
  const costsMessage = document.querySelector<HTMLElement>("#costs-message")!;
  const costsGrid = document.querySelector<HTMLElement>("#costs-grid")!;
  const costsFootnote = document.querySelector<HTMLElement>("#costs-footnote")!;
  const costsUpdated = document.querySelector<HTMLElement>("#costs-updated")!;
  const costsRefresh = document.querySelector<HTMLButtonElement>(
    "#costs-refresh-button",
  )!;
  const costsCharts = document.querySelector<HTMLElement>("#costs-charts")!;
  let items: FeedbackRecord[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  let currentAdmin: User | null = null;

  const navigationItems = Array.from(
    document.querySelectorAll<HTMLAnchorElement>("[data-admin-view]"),
  );
  const sections = Array.from(
    document.querySelectorAll<HTMLElement>("[data-admin-section]"),
  );
  const showSection = (requestedView: string): string => {
    const view = sections.some(
      (section) => section.dataset.adminSection === requestedView,
    )
      ? requestedView
      : "app-feedback";
    for (const section of sections) {
      section.hidden = section.dataset.adminSection !== view;
    }
    for (const item of navigationItems) {
      if (item.dataset.adminView === view) {
        item.setAttribute("aria-current", "page");
      } else {
        item.removeAttribute("aria-current");
      }
    }
    return view;
  };
  navigationItems.forEach((item) => {
    item.addEventListener("click", () => {
      const view = showSection(item.dataset.adminView || "app-feedback");
      if (view === "statistics") void loadStatistics();
      if (view === "costs") void loadCosts();
    });
  });
  window.addEventListener("hashchange", () => {
    const view = showSection(window.location.hash.slice(1));
    if (view === "statistics") void loadStatistics();
    if (view === "costs") void loadCosts();
  });
  showSection(window.location.hash.slice(1));

  const showLogin = (error?: string) => {
    authLoading.hidden = true;
    panelView.hidden = true;
    loginView.hidden = false;
    loginError.textContent = error || "";
    loginError.hidden = !error;
  };
  const showPanel = () => {
    authLoading.hidden = true;
    loginView.hidden = true;
    panelView.hidden = false;
  };
  const showToast = (text: string) => {
    toast.textContent = text;
    toast.hidden = false;
    window.setTimeout(() => {
      toast.hidden = true;
    }, 3500);
  };
  const render = () => {
    renderFeedbackRows(rows, items);
    renderFeedbackCards(cards, items);
    const hasItems = items.length > 0;
    table.hidden = !hasItems;
    cards.hidden = !hasItems;
    message.hidden = hasItems;
    message.textContent = "No feedback yet.";
    loadMore.hidden = !cursor;
  };
  const load = async (append = false) => {
    if (!currentAdmin) return;
    message.hidden = false;
    message.textContent = "Loading feedback…";
    loadMore.disabled = true;
    try {
      const db = getFirestore(getFirebaseApp());
      const base = query(
        collection(db, "feedback"),
        orderBy("createdAt", "desc"),
        limit(PAGE_SIZE + 1),
      );
      const pageQuery =
        append && cursor ? query(base, startAfter(cursor)) : base;
      const snapshot = await getDocs(pageQuery);
      const pageDocuments = snapshot.docs.slice(0, PAGE_SIZE);
      const pageItems = pageDocuments.map((document) =>
        mapFeedback(document.id, document.data()),
      );
      items = append ? [...items, ...pageItems] : pageItems;
      cursor =
        snapshot.docs.length > PAGE_SIZE ? pageDocuments.at(-1) || null : null;
      render();
    } catch {
      table.hidden = true;
      cards.hidden = true;
      message.hidden = false;
      message.textContent =
        "Unable to load feedback. Check administrator permissions and try again.";
    } finally {
      loadMore.disabled = false;
    }
  };

  async function loadStatistics(): Promise<void> {
    if (!currentAdmin || statisticsRefresh.disabled) return;
    statisticsMessage.hidden = false;
    statisticsMessage.textContent = "Loading statistics…";
    statisticsGrid.hidden = true;
    statisticsUpdated.hidden = true;
    statisticsRefresh.disabled = true;
    try {
      const db = getFirestore(getFirebaseApp());
      const users = collection(db, "users");
      const now = Date.now();
      const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000);
      const thirtyDaysAgo = new Date(now - 30 * 24 * 60 * 60 * 1000);
      const [usersCount, activeCount, newUsersCount, lessonsSnapshot] =
        await Promise.all([
          getCountFromServer(users),
          getCountFromServer(
            query(users, where("lastSignInAt", ">=", sevenDaysAgo)),
          ),
          getCountFromServer(
            query(users, where("createdAt", ">=", thirtyDaysAgo)),
          ),
          getDocs(collectionGroup(db, "lessons")),
        ]);
      const totalUsers = usersCount.data().count;
      const activeUsers = activeCount.data().count;
      const userCreated = summarizeUserCreatedLessons(
        lessonsSnapshot.docs.map((document) => document.data()),
      );
      const { lessons, flashcards } = userCreated;
      renderAdminStatistics(statisticsGrid, {
        users: totalUsers,
        lessons,
        flashcards,
        lessonsPerUser: totalUsers ? lessons / totalUsers : 0,
        flashcardsPerUser: totalUsers ? flashcards / totalUsers : 0,
        flashcardsPerLesson: lessons ? flashcards / lessons : 0,
        activeUsers,
        inactiveUsers: Math.max(0, totalUsers - activeUsers),
        newUsers: newUsersCount.data().count,
      });
      statisticsMessage.hidden = true;
      statisticsGrid.hidden = false;
      statisticsUpdated.textContent = `Updated ${DATE_FORMAT.format(new Date())}`;
      statisticsUpdated.hidden = false;
    } catch {
      statisticsMessage.hidden = false;
      statisticsMessage.textContent =
        "Unable to load statistics. Administrator read permissions are required.";
    } finally {
      statisticsRefresh.disabled = false;
    }
  }

  async function loadCosts(): Promise<void> {
    if (!currentAdmin || costsRefresh.disabled) return;
    costsMessage.hidden = false;
    costsMessage.textContent = "Loading AI usage…";
    costsGrid.hidden = true;
    costsCharts.hidden = true;
    costsFootnote.hidden = true;
    costsRefresh.disabled = true;
    try {
      const db = getFirestore(getFirebaseApp());
      const uploadsSnapshot = await getDocs(
        collectionGroup(db, "lexiAiUploads"),
      );
      const uploads = uploadsSnapshot.docs.map((document) => document.data());
      const statistics = summarizeAiCosts(uploads);
      renderAiCosts(costsGrid, statistics);
      renderMonthlyAiUsage(costsCharts, buildMonthlyAiUsage(uploads));
      costsMessage.hidden = true;
      costsGrid.hidden = false;
      costsCharts.hidden = false;
      costsUpdated.textContent = `Updated ${DATE_FORMAT.format(new Date())}`;
      costsFootnote.hidden = false;
    } catch {
      costsMessage.hidden = false;
      costsMessage.textContent =
        "Unable to load AI usage. Administrator read permissions are required.";
    } finally {
      costsRefresh.disabled = false;
    }
  }

  const handleAction = async (target: HTMLButtonElement) => {
    const item = items.find((candidate) => candidate.id === target.dataset.id);
    if (!item || !currentAdmin) return;
    target.disabled = true;
    try {
      if (target.dataset.action === "details") {
        renderFeedbackDetails(details, item);
        dialog.showModal();
        await hydrateAttachments(details, item);
      } else if (target.dataset.action === "status") {
        const nextStatus = item.status === "done" ? "open" : "done";
        if (
          !window.confirm(
            nextStatus === "done"
              ? "Mark this feedback as done?"
              : "Reopen this feedback?",
          )
        )
          return;
        const reference = doc(
          getFirestore(getFirebaseApp()),
          "feedback",
          item.id,
        );
        await updateDoc(
          reference,
          feedbackStatusUpdate(
            nextStatus,
            currentAdmin.uid,
            serverTimestamp(),
            deleteField(),
          ),
        );
        item.status = nextStatus;
        render();
        showToast(
          nextStatus === "done"
            ? "Feedback marked as done."
            : "Feedback reopened.",
        );
      } else if (
        target.dataset.action === "delete" &&
        window.confirm("Permanently delete this feedback and all attachments?")
      ) {
        const storage = getStorage(getFirebaseApp());
        for (const storagePath of attachmentPathsForDeletion(item)) {
          await deleteObject(ref(storage, storagePath));
        }
        await deleteDoc(
          doc(getFirestore(getFirebaseApp()), "feedback", item.id),
        );
        items = items.filter((candidate) => candidate.id !== item.id);
        render();
        showToast("Feedback and attachments deleted.");
      }
    } catch {
      showToast("The action failed. No successful deletion is being reported.");
    } finally {
      target.disabled = false;
    }
  };

  rows.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-action]",
    );
    if (target) void handleAction(target);
  });
  cards.addEventListener("click", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLButtonElement>(
      "button[data-action]",
    );
    if (target) void handleAction(target);
  });
  loadMore.addEventListener("click", () => void load(true));
  document
    .querySelector("#refresh-button")
    ?.addEventListener("click", () => void load(false));
  statisticsRefresh.addEventListener("click", () => void loadStatistics());
  costsRefresh.addEventListener("click", () => void loadCosts());
  document
    .querySelector("#close-details-button")
    ?.addEventListener("click", () => dialog.close());

  try {
    const app = getFirebaseApp();
    const auth = getAuth(app);
    void setPersistence(auth, browserLocalPersistence);

    loginForm.addEventListener("submit", async (event) => {
      event.preventDefault();
      const submit = loginForm.querySelector<HTMLButtonElement>(
        "button[type=submit]",
      )!;
      const form = new FormData(loginForm);
      const login = String(form.get("login") || "").trim();
      const password = String(form.get("password") || "");
      loginError.hidden = true;
      if (login !== "admin") {
        showLogin("Invalid login or password.");
        return;
      }
      submit.disabled = true;
      submit.textContent = "Signing in…";
      try {
        const email = adminEmailFromEnvironment(firebaseEnvironment);
        const credential = await signInWithEmailAndPassword(
          auth,
          email,
          password,
        );
        if (!(await verifyAdministrator(credential.user))) {
          await signOut(auth);
          throw new Error("ADMIN_CLAIM_REQUIRED");
        }
      } catch (error) {
        showLogin(friendlyAuthError(error));
      } finally {
        submit.disabled = false;
        submit.textContent = "Sign in";
      }
    });

    document
      .querySelector("#logout-button")
      ?.addEventListener("click", async () => {
        await signOut(auth);
      });

    onAuthStateChanged(auth, async (user) => {
      if (!user) {
        currentAdmin = null;
        items = [];
        cursor = null;
        showLogin();
        return;
      }
      try {
        if (!(await verifyAdministrator(user))) {
          await signOut(auth);
          showLogin("This account does not have administrator access.");
          return;
        }
        currentAdmin = user;
        showPanel();
        const view = showSection(window.location.hash.slice(1));
        if (view === "statistics") {
          await loadStatistics();
        } else if (view === "costs") {
          await loadCosts();
        } else {
          await load(false);
        }
      } catch {
        await signOut(auth);
        showLogin("Unable to verify administrator access.");
      }
    });
  } catch {
    showLogin(
      "Firebase configuration is missing. Contact the site administrator.",
    );
    loginForm.querySelector<HTMLButtonElement>(
      "button[type=submit]",
    )!.disabled = true;
  }
}

if (
  typeof document !== "undefined" &&
  document.querySelector("#admin-login-form")
)
  initializePanel();
