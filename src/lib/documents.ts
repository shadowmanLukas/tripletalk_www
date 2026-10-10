import * as guideEn from "../documents/guide/guide.en.md";
import * as guidePl from "../documents/guide/guide.pl.md";
import * as privacyEn from "../documents/legal/privacy.en.md";
import * as privacyPl from "../documents/legal/privacy.pl.md";
import * as termsEn from "../documents/legal/terms.en.md";
import * as termsPl from "../documents/legal/terms.pl.md";
import { companyDetails } from "./company";
import {
  callouts,
  faqToDetails,
  fillPlaceholders,
  guideCallouts,
  guideLinkRules,
  hasPlaceholder,
  linkReferences,
  prefixAnchors,
  splitDocument,
  uiPaths,
  wrapTables,
  type DocumentLanguage,
  type SplitDocument,
} from "./markdown-document";

type CompiledMarkdown = { compiledContent: () => string | Promise<string> };

const sources = {
  terms: { pl: termsPl, en: termsEn },
  privacy: { pl: privacyPl, en: privacyEn },
  guide: { pl: guidePl, en: guideEn },
} satisfies Record<string, Record<DocumentLanguage, CompiledMarkdown>>;

async function compiled(
  kind: keyof typeof sources,
  language: DocumentLanguage,
): Promise<string> {
  const html = fillPlaceholders(
    await sources[kind][language].compiledContent(),
    companyDetails[language],
  );
  if (import.meta.env.PROD && hasPlaceholder(html)) {
    throw new Error(
      `${kind}.${language}.md still has a company details placeholder; fill src/lib/company.ts`,
    );
  }
  return wrapTables(prefixAnchors(html, language));
}

export async function loadLegalDocument(
  kind: "terms" | "privacy",
  language: DocumentLanguage,
): Promise<SplitDocument> {
  return splitDocument(await compiled(kind, language));
}

// The unnumbered section is the table of contents, shown as a grid of links; numbered lists in
// the other sections are steps.
export async function loadGuide(
  language: DocumentLanguage,
): Promise<SplitDocument> {
  const html = uiPaths(
    linkReferences(await compiled("guide", language), guideLinkRules[language]),
  );
  const document = splitDocument(html);
  for (const section of document.sections) {
    section.html = section.number
      ? callouts(
          section.html.replaceAll("<ol>", '<ol class="doc-steps">'),
          guideCallouts[language],
        )
      : section.html.replace("<ol>", '<ol class="doc-toc">');
  }
  const faq = document.sections.at(-1);
  if (faq) faq.html = faqToDetails(faq.html);
  return document;
}
