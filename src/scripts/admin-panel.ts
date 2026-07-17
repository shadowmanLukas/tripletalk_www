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
  deleteDoc,
  deleteField,
  doc,
  getDocs,
  getFirestore,
  limit,
  orderBy,
  query,
  serverTimestamp,
  startAfter,
  updateDoc,
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
  let items: FeedbackRecord[] = [];
  let cursor: QueryDocumentSnapshot<DocumentData> | null = null;
  let currentAdmin: User | null = null;

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
        await load(false);
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
