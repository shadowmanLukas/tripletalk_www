import * as guideEn from "../documents/guide/guide.en.md";
import * as guidePl from "../documents/guide/guide.pl.md";
import * as privacyEn from "../documents/legal/privacy.en.md";
import * as privacyPl from "../documents/legal/privacy.pl.md";
import * as termsEn from "../documents/legal/terms.en.md";
import * as termsPl from "../documents/legal/terms.pl.md";
import { companyDetails } from "./company";
import {
  faqToDetails,
  fillPlaceholders,
  guideLinkRules,
  hasPlaceholder,
  linkReferences,
  prefixAnchors,
  shiftHeadings,
  splitDocument,
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

// The guide sits under the Support page's own h1, so its headings move down one level.
export async function loadGuide(
  language: DocumentLanguage,
): Promise<SplitDocument> {
  const html = linkReferences(
    await compiled("guide", language),
    guideLinkRules[language],
  );
  const document = splitDocument(html);
  const faq = document.sections.at(-1);
  if (faq) faq.html = faqToDetails(faq.html);
  for (const section of document.sections)
    section.html = shiftHeadings(section.html, 1);
  return document;
}
