// Every public page exists in Polish (no prefix) and English (/en/), linked with hreflang.

export type SiteLanguage = "pl" | "en";
export type SitePage = "home" | "guide" | "privacy" | "terms" | "support";
export type SubPage = Exclude<SitePage, "home">;

export const siteOrigin = "https://tripletalk.app";
export const siteLanguages: SiteLanguage[] = ["pl", "en"];

export function pagePath(page: SitePage, language: SiteLanguage): string {
  const prefix = language === "en" ? "/en" : "";
  return page === "home" ? `${prefix}/` : `${prefix}/${page}/`;
}

export function pageUrl(page: SitePage, language: SiteLanguage): string {
  return new URL(pagePath(page, language), siteOrigin).href;
}

export interface SubPageMeta {
  // <title> and search result title.
  title: string;
  // Meta description, kept under ~155 characters for search results.
  description: string;
  // Title shown in link previews.
  shareTitle: string;
  imageAlt: string;
}

export const subPageMeta: Record<SubPage, Record<SiteLanguage, SubPageMeta>> = {
  guide: {
    pl: {
      title: "Instrukcja TripleTalk – jak robić i powtarzać fiszki AI",
      description:
        "Jak zacząć, zrobić fiszki ze zdjęcia lub tekstu, uczyć się z powtórkami i lekcjami audio oraz korzystać ze Szkoły. Krok po kroku.",
      shareTitle: "Instrukcja TripleTalk – krok po kroku",
      imageAlt: "Instrukcja TripleTalk z ekranem lekcji w aplikacji",
    },
    en: {
      title: "TripleTalk user guide – create and review AI flashcards",
      description:
        "How to get started, make flashcards from a photo or text, learn with spaced reviews and audio lessons, and use School. Step by step.",
      shareTitle: "TripleTalk user guide – step by step",
      imageAlt: "TripleTalk user guide with a lesson screen from the app",
    },
  },
  privacy: {
    pl: {
      title: "Polityka prywatności | TripleTalk",
      description:
        "Jakie dane zbiera aplikacja i strona TripleTalk, po co, jak długo je przechowujemy i jakie masz prawa. Prostym językiem.",
      shareTitle: "Polityka prywatności TripleTalk",
      imageAlt: "Polityka prywatności TripleTalk",
    },
    en: {
      title: "Privacy Policy | TripleTalk",
      description:
        "What data the TripleTalk app and website collect, why, how long we keep it and what your rights are. In plain language.",
      shareTitle: "TripleTalk Privacy Policy",
      imageAlt: "TripleTalk Privacy Policy",
    },
  },
  terms: {
    pl: {
      title: "Regulamin | TripleTalk",
      description:
        "Zasady korzystania z TripleTalk: konto, Premium, fiszki TripleTalk AI, Szkoła, płatności i reklamacje. Prostym językiem.",
      shareTitle: "Regulamin TripleTalk",
      imageAlt: "Regulamin TripleTalk",
    },
    en: {
      title: "Terms of Service | TripleTalk",
      description:
        "The rules for using TripleTalk: your account, Premium, TripleTalk AI flashcards, School, payments and complaints. In plain language.",
      shareTitle: "TripleTalk Terms of Service",
      imageAlt: "TripleTalk Terms of Service",
    },
  },
  support: {
    pl: {
      title: "Kontakt | TripleTalk",
      description:
        "Masz pytanie o aplikację TripleTalk, konto albo płatności? Napisz do nas, zajrzyj do instrukcji albo zgłoś problem w aplikacji.",
      shareTitle: "Kontakt z TripleTalk",
      imageAlt: "Kontakt z TripleTalk",
    },
    en: {
      title: "Contact | TripleTalk",
      description:
        "Questions about the TripleTalk app, your account or payments? Email us, check the user guide or report a problem from the app.",
      shareTitle: "Contact TripleTalk",
      imageAlt: "Contact TripleTalk",
    },
  },
};
