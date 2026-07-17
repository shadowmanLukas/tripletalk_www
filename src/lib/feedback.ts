export interface FeedbackAttachment {
  storagePath: string;
  fileName: string;
  contentType: string;
}

export interface FeedbackRecord {
  id: string;
  category: string;
  title: string;
  description: string;
  userId: string;
  createdAt: string | null;
  appVersion: string;
  platform: string;
  status: "open" | "done";
  completedAt: string | null;
  completedBy: string | null;
  attachments: FeedbackAttachment[];
}

type TimestampLike =
  { toDate?: () => Date } | Date | string | number | null | undefined;

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function isoDate(value: TimestampLike): string | null {
  try {
    const date =
      value instanceof Date
        ? value
        : value && typeof value === "object" && value.toDate
          ? value.toDate()
          : new Date(value as string | number);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
  } catch {
    return null;
  }
}

function mapAttachment(value: unknown): FeedbackAttachment | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Record<string, unknown>;
  const storagePath = text(item.storagePath);
  if (!storagePath) return null;
  return {
    storagePath,
    fileName: text(item.fileName) || "attachment",
    contentType: text(item.contentType) || "application/octet-stream",
  };
}

export function mapAttachments(
  data: Record<string, unknown>,
): FeedbackAttachment[] {
  const values = Array.isArray(data.attachments) ? [...data.attachments] : [];
  if (data.attachment) values.push(data.attachment);
  const seen = new Set<string>();
  return values.flatMap((value) => {
    const item = mapAttachment(value);
    if (!item || seen.has(item.storagePath)) return [];
    seen.add(item.storagePath);
    return [item];
  });
}

export function mapFeedback(
  id: string,
  data: Record<string, unknown>,
): FeedbackRecord {
  return {
    id,
    category: text(data.category) || "other",
    title: text(data.title),
    description: text(data.description),
    userId: text(data.userId),
    createdAt: isoDate(data.createdAt as TimestampLike),
    appVersion: text(data.appVersion),
    platform: text(data.platform),
    status: data.status === "done" ? "done" : "open",
    completedAt: isoDate(data.completedAt as TimestampLike),
    completedBy: text(data.completedBy) || null,
    attachments: mapAttachments(data),
  };
}

export function hasAdminClaim(claims: Record<string, unknown>): boolean {
  return claims.admin === true;
}

export function isSafeFeedbackStoragePath(path: string): boolean {
  return (
    path.startsWith("feedback/") &&
    !path.includes("..") &&
    !path.startsWith("/")
  );
}

export function feedbackStatusUpdate(
  status: "open" | "done",
  adminUid: string,
  serverTimestampValue: unknown,
  deleteFieldValue: unknown,
) {
  return status === "done"
    ? {
        status: "done" as const,
        completedAt: serverTimestampValue,
        completedBy: adminUid,
      }
    : {
        status: "open" as const,
        completedAt: deleteFieldValue,
        completedBy: deleteFieldValue,
      };
}

export function attachmentPathsForDeletion(item: FeedbackRecord): string[] {
  const paths = item.attachments.map((attachment) => attachment.storagePath);
  if (paths.some((path) => !isSafeFeedbackStoragePath(path))) {
    throw new Error("INVALID_ATTACHMENT_PATH");
  }
  return paths;
}
