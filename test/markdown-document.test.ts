import { describe, expect, it } from "vitest";
import {
  faqToDetails,
  fillPlaceholders,
  guideLinkRules,
  hasPlaceholder,
  linkReferences,
  prefixAnchors,
  shiftHeadings,
  splitDocument,
  uiPaths,
  wrapTables,
} from "../src/lib/markdown-document";

describe("markdown document transforms", () => {
  it("detects and fills the company details placeholders", () => {
    const html =
      "<p>Operator: [UZUPEŁNIJ: pełna nazwa firmy, NIP]. Controller: [FILL IN: legal name].</p>";
    expect(hasPlaceholder(html)).toBe(true);
    expect(fillPlaceholders(html, "")).toBe(html);
    const filled = fillPlaceholders(html, "craftapp");
    expect(filled).toBe("<p>Operator: craftapp. Controller: craftapp.</p>");
    expect(hasPlaceholder(filled)).toBe(false);
  });

  it("prefixes ids and decodes percent-encoded in-page links", () => {
    const html =
      '<h2 id="7-nauka-z-powtórkami">7.</h2><a href="#7-nauka-z-powt%C3%B3rkami">x</a><a href="/terms/">t</a>';
    expect(prefixAnchors(html, "pl")).toBe(
      '<h2 id="pl-7-nauka-z-powtórkami">7.</h2><a href="#pl-7-nauka-z-powtórkami">x</a><a href="/terms/">t</a>',
    );
  });

  it("wraps tables in a scroll container and shifts heading levels", () => {
    expect(wrapTables("<table><tr><td>1</td></tr></table>")).toBe(
      '<div class="doc-table">\n<table><tr><td>1</td></tr></table>\n</div>',
    );
    expect(shiftHeadings('<h1>a</h1><h3 id="x">b</h3><hr>', 1)).toBe(
      '<h2>a</h2><h4 id="x">b</h4><hr>',
    );
  });

  it("labels cells with their column header and stacks tables with long text", () => {
    const long = "x".repeat(61);
    const html = `<table><thead><tr><th>Dane</th><th>Cel "a"</th></tr></thead><tbody><tr><td>Token</td><td>${long}</td></tr></tbody></table>`;
    expect(wrapTables(html)).toBe(
      `<div class="doc-table doc-table--stacked">\n<table><thead><tr><th>Dane</th><th>Cel "a"</th></tr></thead><tbody><tr><td data-label="Dane">Token</td><td data-label="Cel &quot;a&quot;">${long}</td></tr></tbody></table>\n</div>`,
    );
    expect(wrapTables(html.replace(long, "krótko"))).toContain(
      '<div class="doc-table">',
    );
  });

  it("splits a document into title, intro and numbered sections", () => {
    const html = [
      "<h1>Regulamin</h1>",
      "<p><em>Wersja z 7 października 2026.</em></p>",
      '<h2 id="spis">Spis treści</h2><ol><li>a</li></ol><hr>',
      '<h2 id="1-kto">1. Kto świadczy usługę</h2><p>Treść</p>',
      '<h2 id="12-zmiany">12. Zmiany</h2><p>Koniec</p>',
    ].join("\n");
    const result = splitDocument(html);
    expect(result.title).toBe("Regulamin");
    expect(result.intro).toBe("<p><em>Wersja z 7 października 2026.</em></p>");
    expect(
      result.sections.map(({ id, number, title }) => ({ id, number, title })),
    ).toEqual([
      { id: "spis", number: "", title: "Spis treści" },
      { id: "1-kto", number: "01", title: "Kto świadczy usługę" },
      { id: "12-zmiany", number: "12", title: "Zmiany" },
    ]);
    expect(result.sections[0].html).toBe("<ol><li>a</li></ol>");
  });

  it("shows inline code navigation paths as highlighted paths", () => {
    expect(
      uiPaths("<p>W <code>Więcej &gt; Dane konta</code> sprawdzisz</p>"),
    ).toBe(
      '<p>W <span class="ui-path"><span class="ui-path-step">Więcej</span><span class="ui-path-sep" aria-hidden="true">›</span><span class="sr-only"> &gt; </span><span class="ui-path-step">Dane konta</span></span> sprawdzisz</p>',
    );
    expect(uiPaths("<p><code>XXXX-XXXX</code></p>")).toBe(
      "<p><code>XXXX-XXXX</code></p>",
    );
  });

  it("turns bold-question paragraphs into details elements", () => {
    const html =
      '<p><strong>Czy TripleTalk jest darmowy?</strong>\nTak. Zobacz <a href="/terms/">regulamin</a>.</p>';
    expect(faqToDetails(html)).toBe(
      '<details class="doc-faq">\n<summary>Czy TripleTalk jest darmowy?</summary>\n<p>Tak. Zobacz <a href="/terms/">regulamin</a>.</p>\n</details>',
    );
  });

  it("links Polish references to the Terms, Privacy Policy and home page", () => {
    const html =
      '<h3>Regulamin</h3><p><strong>Regulamin i polityka prywatności.</strong> Limity są w regulaminie, dane w polityce prywatności. Napisz przez <strong>tripletalk.app</strong> lub support@tripletalk.app. <a href="#x">regulamin</a> regulaminowy</p>';
    expect(linkReferences(html, guideLinkRules.pl)).toBe(
      '<h3>Regulamin</h3><p><strong><a href="/terms/">Regulamin</a> i <a href="/privacy/">polityka prywatności</a>.</strong> Limity są w <a href="/terms/">regulaminie</a>, dane w <a href="/privacy/">polityce prywatności</a>. Napisz przez <strong><a href="/">tripletalk.app</a></strong> lub support@tripletalk.app. <a href="#x">regulamin</a> regulaminowy</p>',
    );
  });

  it("links English references", () => {
    expect(
      linkReferences(
        "<p>See the Terms of Service and Privacy Policy on tripletalk.app.</p>",
        guideLinkRules.en,
      ),
    ).toBe(
      '<p>See the <a href="/terms/">Terms of Service</a> and <a href="/privacy/">Privacy Policy</a> on <a href="/">tripletalk.app</a>.</p>',
    );
  });
});
