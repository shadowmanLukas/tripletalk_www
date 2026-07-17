import { describe, expect, it } from "vitest";
import {
  attachmentPathsForDeletion,
  feedbackStatusUpdate,
  hasAdminClaim,
  mapAttachments,
  mapFeedback,
} from "../src/lib/feedback";

describe("feedback mapping and authorization helpers", () => {
  it("maps a Firestore document and treats a missing status as open", () => {
    const result = mapFeedback("feedback-1", {
      category: "bug",
      title: "Broken audio",
      description: "No sound",
      userId: "u1",
      createdAt: { toDate: () => new Date("2026-07-17T10:00:00.000Z") },
      appVersion: "1.0.0+2",
      platform: "ios",
    });
    expect(result).toMatchObject({
      id: "feedback-1",
      status: "open",
      category: "bug",
      createdAt: "2026-07-17T10:00:00.000Z",
    });
  });

  it("supports 1–3 attachments and the legacy attachment field without duplicates", () => {
    const modern = {
      storagePath: "feedback/u/f/a.jpg",
      fileName: "a.jpg",
      contentType: "image/jpeg",
    };
    const legacy = {
      storagePath: "feedback/u/f/b.jpg",
      fileName: "b.jpg",
      contentType: "image/jpeg",
    };
    expect(
      mapAttachments({ attachments: [modern], attachment: legacy }),
    ).toEqual([modern, legacy]);
    expect(
      mapAttachments({ attachments: [modern], attachment: modern }),
    ).toEqual([modern]);
  });

  it("accepts only the exact boolean admin claim", () => {
    expect(hasAdminClaim({ admin: true })).toBe(true);
    expect(hasAdminClaim({ admin: false })).toBe(false);
    expect(hasAdminClaim({ admin: "true" })).toBe(false);
  });

  it("builds done and reopen updates", () => {
    const timestamp = Symbol("timestamp");
    const deleted = Symbol("deleted");
    expect(
      feedbackStatusUpdate("done", "admin-uid", timestamp, deleted),
    ).toEqual({
      status: "done",
      completedAt: timestamp,
      completedBy: "admin-uid",
    });
    expect(
      feedbackStatusUpdate("open", "admin-uid", timestamp, deleted),
    ).toEqual({
      status: "open",
      completedAt: deleted,
      completedBy: deleted,
    });
  });

  it("collects all deletion paths and rejects unsafe paths before deletion", () => {
    const record = mapFeedback("feedback-1", {
      attachments: [
        { storagePath: "feedback/u/f/1.jpg" },
        { storagePath: "feedback/u/f/2.jpg" },
        { storagePath: "feedback/u/f/3.jpg" },
      ],
    });
    expect(attachmentPathsForDeletion(record)).toEqual([
      "feedback/u/f/1.jpg",
      "feedback/u/f/2.jpg",
      "feedback/u/f/3.jpg",
    ]);
    record.attachments[2].storagePath = "users/another/private.jpg";
    expect(() => attachmentPathsForDeletion(record)).toThrow(
      "INVALID_ATTACHMENT_PATH",
    );
  });
});
