// Build-time transforms for the Terms, Privacy and user guide pages. The input is the HTML that Astro
// compiles from the Markdown files in src/documents, which are copied verbatim from the app repo.

export type DocumentLanguage = "pl" | "en";

export interface DocumentSection {
  id: string;
  number: string;
  title: string;
  html: string;
}

export interface SplitDocument {
  title: string;
  intro: string;
  sections: DocumentSection[];
}

export interface LinkRule {
  pattern: RegExp;
  href: string;
}

const placeholderPattern = /\[(?:UZUPEŁNIJ|FILL IN):[^\]]*\]/g;

export function hasPlaceholder(html: string): boolean {
  return new RegExp(placeholderPattern.source).test(html);
}

export function fillPlaceholders(html: string, replacement: string): string {
  return replacement ? html.replace(placeholderPattern, replacement) : html;
}

// PL and EN versions share one page and some headings ("6. TripleTalk AI"), so ids and in-page links get a language prefix.
export function prefixAnchors(html: string, prefix: string): string {
  return html
    .replace(/ id="([^"]+)"/g, ` id="${prefix}-$1"`)
    .replace(
      / href="#([^"]+)"/g,
      (_, fragment: string) =>
        ` href="#${prefix}-${decodeURIComponent(fragment)}"`,
    );
}

// Tables with long cell text are shown as stacked cards on narrow screens, so every cell carries
// its column header as a label.
const stackedCellLength = 60;

const plainText = (html: string) => html.replace(/<[^>]+>/g, "").trim();

export function wrapTables(html: string): string {
  return html.replace(/<table>([\s\S]*?)<\/table>/g, (_, body: string) => {
    const headers = [...body.matchAll(/<th[^>]*>([\s\S]*?)<\/th>/g)].map(
      (match) => plainText(match[1]).replace(/"/g, "&quot;"),
    );
    const labelled = body.replace(/<tr>([\s\S]*?)<\/tr>/g, (row: string) => {
      let column = 0;
      return row.replace(/<td([^>]*)>/g, (_cell, attributes: string) => {
        const label = headers[column++] ?? "";
        return label
          ? `<td${attributes} data-label="${label}">`
          : `<td${attributes}>`;
      });
    });
    const cells = [...body.matchAll(/<td[^>]*>([\s\S]*?)<\/td>/g)];
    const stacked = cells.some(
      (cell) => plainText(cell[1]).length > stackedCellLength,
    );
    const className = stacked ? "doc-table doc-table--stacked" : "doc-table";
    return `<div class="${className}">\n<table>${labelled}</table>\n</div>`;
  });
}

export function shiftHeadings(html: string, by: number): string {
  return html.replace(
    /<(\/?)h([1-6])([\s>])/g,
    (_, slash: string, level: string, rest: string) => {
      return `<${slash}h${Math.min(Number(level) + by, 6)}${rest}`;
    },
  );
}

const headingPattern = /<h2 id="([^"]+)">([\s\S]*?)<\/h2>/g;

export function splitDocument(html: string): SplitDocument {
  const titleMatch = /<h1[^>]*>([\s\S]*?)<\/h1>/.exec(html);
  const afterTitle = titleMatch
    ? html.slice(titleMatch.index + titleMatch[0].length)
    : html;
  const headings = [...afterTitle.matchAll(headingPattern)];
  const intro = afterTitle.slice(0, headings[0]?.index ?? afterTitle.length);

  const sections = headings.map((heading, index) => {
    const start = heading.index + heading[0].length;
    const end = headings[index + 1]?.index ?? afterTitle.length;
    const numbered = /^(\d+)\.\s+([\s\S]*)$/.exec(heading[2].trim());
    return {
      id: heading[1],
      number: numbered ? numbered[1].padStart(2, "0") : "",
      title: numbered ? numbered[2] : heading[2].trim(),
      html: stripSeparators(afterTitle.slice(start, end)),
    };
  });

  return {
    title: titleMatch?.[1].trim() ?? "",
    intro: stripSeparators(intro),
    sections,
  };
}

// Section borders replace the `---` rules between sections in the source.
function stripSeparators(html: string): string {
  return html.replace(/<hr\s*\/?>/g, "").trim();
}

// App navigation paths are written as inline code ("More > Account data") and shown as a
// highlighted path with a chevron between the steps.
export function uiPaths(html: string): string {
  return html.replace(/<code>([^<]*?)<\/code>/g, (match, text: string) => {
    const steps = text.split(/\s*(?:&gt;|>)\s*/);
    if (steps.length < 2) return match;
    const separator =
      '<span class="ui-path-sep" aria-hidden="true">›</span><span class="sr-only"> &gt; </span>';
    return `<span class="ui-path">${steps
      .map((step) => `<span class="ui-path-step">${step}</span>`)
      .join(separator)}</span>`;
  });
}

// FAQ entries are written as a bold question followed by the answer in the same paragraph.
export function faqToDetails(html: string): string {
  return html.replace(
    /<p><strong>((?:(?!<\/strong>)[\s\S])*)<\/strong>\s*(?:<br\s*\/?>)?\s*([\s\S]*?)<\/p>/g,
    (_, question: string, answer: string) =>
      `<details class="doc-faq">\n<summary>${question}</summary>\n<p>${answer.trim()}</p>\n</details>`,
  );
}

// Links plain-text mentions, skipping text that is already inside a link or a heading.
export function linkReferences(html: string, rules: LinkRule[]): string {
  const combined = new RegExp(
    rules.map((rule) => `(${rule.pattern.source})`).join("|"),
    "giu",
  );
  let linkDepth = 0;
  let headingDepth = 0;

  return html
    .split(/(<[^>]+>)/)
    .map((part) => {
      if (part.startsWith("<")) {
        if (/^<a[\s>]/.test(part)) linkDepth += 1;
        else if (part === "</a>") linkDepth -= 1;
        else if (/^<h[1-6][\s>]/.test(part)) headingDepth += 1;
        else if (/^<\/h[1-6]>/.test(part)) headingDepth -= 1;
        return part;
      }
      if (linkDepth > 0 || headingDepth > 0) return part;
      return part.replace(combined, (match: string, ...groups: unknown[]) => {
        const ruleIndex = groups
          .slice(0, rules.length)
          .findIndex((group) => group !== undefined);
        return `<a href="${rules[ruleIndex].href}">${match}</a>`;
      });
    })
    .join("");
}

const letter = "\\p{L}";

export const guideLinkRules: Record<DocumentLanguage, LinkRule[]> = {
  pl: [
    {
      pattern: new RegExp(
        `(?<!${letter})regulamin(?:ie|u|em)?(?!${letter})`,
        "u",
      ),
      href: "/terms/",
    },
    {
      pattern: new RegExp(
        `(?<!${letter})polity(?:ka|kę|ki|ką|ce) prywatności(?!${letter})`,
        "u",
      ),
      href: "/privacy/",
    },
    {
      pattern: /(?<![\p{L}\p{N}@.])tripletalk\.app(?![\p{L}\p{N}/])/u,
      href: "/",
    },
  ],
  en: [
    { pattern: /Terms of Service/u, href: "/terms/" },
    { pattern: /Privacy Policy/u, href: "/privacy/" },
    {
      pattern: /(?<![\p{L}\p{N}@.])tripletalk\.app(?![\p{L}\p{N}/])/u,
      href: "/",
    },
  ],
};
