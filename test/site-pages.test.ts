import { describe, expect, it } from "vitest";
import { pagePath, pageUrl, subPageMeta } from "../src/lib/site-pages";
import { shouldSuggest } from "../src/scripts/language-suggestion";

describe("site pages", () => {
  it("builds Polish URLs without a prefix and English URLs under /en/", () => {
    expect(pagePath("home", "pl")).toBe("/");
    expect(pagePath("home", "en")).toBe("/en/");
    expect(pagePath("guide", "pl")).toBe("/guide/");
    expect(pagePath("privacy", "en")).toBe("/en/privacy/");
    expect(pageUrl("terms", "en")).toBe("https://tripletalk.app/en/terms/");
  });

  it("keeps meta descriptions short enough for search results", () => {
    for (const page of Object.values(subPageMeta)) {
      for (const meta of Object.values(page)) {
        expect(meta.description.length).toBeLessThanOrEqual(160);
        expect(meta.title.length).toBeLessThanOrEqual(65);
      }
    }
  });
});

describe("language suggestion", () => {
  it("offers the other version only when the visitor reads the other language", () => {
    expect(shouldSuggest("pl", "en", false)).toBe(true);
    expect(shouldSuggest("en", "pl", false)).toBe(true);
    expect(shouldSuggest("pl", "pl", false)).toBe(false);
    expect(shouldSuggest("pl", "en", true)).toBe(false);
  });
});
