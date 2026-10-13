export type VisitorLanguage = "pl" | "en";

const countryCacheKey = "tripletalk-visitor-country-v1";
const preferenceKey = "tripletalk-language-v1";

function isLanguage(value: string | null): value is VisitorLanguage {
  return value === "pl" || value === "en";
}

// A language picked in the header wins over the country and browser guesses.
export function setPreferredLanguage(language: VisitorLanguage) {
  try {
    localStorage.setItem(preferenceKey, language);
  } catch {
    // Storage can be blocked; the switch then only lasts for the current page.
  }
}

function preferredLanguage(): VisitorLanguage | null {
  try {
    const stored = localStorage.getItem(preferenceKey);
    return isLanguage(stored) ? stored : null;
  } catch {
    return null;
  }
}

function browserFallback(): VisitorLanguage {
  const browserLanguages =
    navigator.languages.length > 0 ? navigator.languages : [navigator.language];
  const usesPolish = browserLanguages.some(
    (language) => language.toLowerCase().split("-")[0] === "pl",
  );
  const isInPolandTimezone =
    Intl.DateTimeFormat().resolvedOptions().timeZone === "Europe/Warsaw";

  return usesPolish || isInPolandTimezone ? "pl" : "en";
}

function languageForCountry(country: string | null): VisitorLanguage | null {
  if (!country || !/^[A-Z]{2}$/.test(country)) return null;
  return country === "PL" ? "pl" : "en";
}

export async function getVisitorLanguage(): Promise<VisitorLanguage> {
  const preferred = preferredLanguage();
  if (preferred) return preferred;

  const cachedCountry = sessionStorage.getItem(countryCacheKey);
  const cachedLanguage = languageForCountry(cachedCountry);
  if (cachedLanguage) return cachedLanguage;

  try {
    const response = await fetch("/cdn-cgi/trace", {
      cache: "no-store",
      signal: AbortSignal.timeout(1500),
    });

    if (!response.ok) return browserFallback();

    const trace = await response.text();
    const country = trace.match(/^loc=([A-Z]{2})$/m)?.[1] ?? null;
    const language = languageForCountry(country);

    if (country && language) {
      sessionStorage.setItem(countryCacheKey, country);
      return language;
    }
  } catch {
    // Local development and non-Cloudflare hosting use the browser fallback.
  }

  return browserFallback();
}
