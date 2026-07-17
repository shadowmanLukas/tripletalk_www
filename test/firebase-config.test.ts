import { describe, expect, it } from "vitest";
import {
  adminEmailFromEnvironment,
  firebaseConfigFromEnvironment,
} from "../src/lib/firebase/client";

const environment = {
  PUBLIC_FIREBASE_API_KEY: "web-api-key",
  PUBLIC_FIREBASE_AUTH_DOMAIN: "project.firebaseapp.com",
  PUBLIC_FIREBASE_PROJECT_ID: "lexigo-b2aee",
  PUBLIC_FIREBASE_STORAGE_BUCKET: "lexigo-b2aee.firebasestorage.app",
  PUBLIC_FIREBASE_APP_ID: "web-app-id",
  PUBLIC_ADMIN_FIREBASE_EMAIL: "admin@example.com",
};

describe("Firebase build configuration", () => {
  it("maps a complete configuration for the expected project", () => {
    expect(firebaseConfigFromEnvironment(environment)).toMatchObject({
      projectId: "lexigo-b2aee",
      storageBucket: "lexigo-b2aee.firebasestorage.app",
    });
    expect(adminEmailFromEnvironment(environment)).toBe("admin@example.com");
  });

  it("rejects missing values and another project", () => {
    expect(() => firebaseConfigFromEnvironment({})).toThrow(
      "Missing Firebase build configuration",
    );
    expect(() =>
      firebaseConfigFromEnvironment({
        ...environment,
        PUBLIC_FIREBASE_PROJECT_ID: "another-project",
      }),
    ).toThrow("must be lexigo-b2aee");
  });
});
