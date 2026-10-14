// Offers the other language version when the visitor seems to read the other language, e.g. an
// English user who opens /privacy/ from the app. No automatic redirect: search engines must be able
// to crawl both versions, and visitors stay where the link took them.
import {
  getVisitorLanguage,
  setPreferredLanguage,
  type VisitorLanguage,
} from "./visitor-language";

const dismissedKey = "tripletalk-language-suggestion-dismissed-v1";

export function shouldSuggest(
  pageLanguage: VisitorLanguage,
  visitorLanguage: VisitorLanguage,
  dismissed: boolean,
): boolean {
  return !dismissed && pageLanguage !== visitorLanguage;
}

function wasDismissed(): boolean {
  try {
    return sessionStorage.getItem(dismissedKey) === "1";
  } catch {
    return false;
  }
}

function rememberDismissed() {
  try {
    sessionStorage.setItem(dismissedKey, "1");
  } catch {
    // Storage can be blocked; the suggestion then comes back on the next page.
  }
}

export async function initLanguageSuggestion(doc: Document = document) {
  const banner = doc.querySelector<HTMLElement>("#language-suggestion");
  if (!banner) return;

  const pageLanguage = banner.dataset.pageLanguage as VisitorLanguage;
  const targetLanguage = banner.dataset.targetLanguage as VisitorLanguage;
  if (!shouldSuggest(pageLanguage, await getVisitorLanguage(), wasDismissed()))
    return;

  banner.hidden = false;
  banner
    .querySelector("[data-suggestion-link]")
    ?.addEventListener("click", () => {
      setPreferredLanguage(targetLanguage);
    });
  banner
    .querySelector("[data-suggestion-dismiss]")
    ?.addEventListener("click", () => {
      banner.hidden = true;
      rememberDismissed();
    });
}

if (
  typeof document !== "undefined" &&
  document.querySelector("#language-suggestion")
) {
  void initLanguageSuggestion();
}
