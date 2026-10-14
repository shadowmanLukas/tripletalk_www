// Google Analytics 4 behind a cookie consent banner. gtag.js is only loaded after the visitor
// accepts, so nothing is sent to Google and no cookies are set before that (GDPR / ePrivacy).

export type AnalyticsConsent = "granted" | "denied";
type BannerLanguage = "pl" | "en";

const consentKey = "tripletalk-analytics-consent-v1";

const bannerCopy: Record<BannerLanguage, Record<string, string>> = {
  pl: {
    text: "Używamy Google Analytics, żeby sprawdzać, jak odwiedzający korzystają ze strony. Pliki cookie analityczne zapiszemy tylko za Twoją zgodą.",
    privacy: "Polityka prywatności",
    accept: "Akceptuję",
    decline: "Odrzucam",
    settings: "Ustawienia cookies",
  },
  en: {
    text: "We use Google Analytics to understand how visitors use this site. Analytics cookies are only stored if you agree.",
    privacy: "Privacy Policy",
    accept: "Accept",
    decline: "Decline",
    settings: "Cookie settings",
  },
};

export function isValidMeasurementId(
  id: string | undefined | null,
): id is string {
  return typeof id === "string" && /^G-[A-Z0-9]{4,}$/.test(id);
}

export function readConsent(): AnalyticsConsent | null {
  try {
    const stored = localStorage.getItem(consentKey);
    return stored === "granted" || stored === "denied" ? stored : null;
  } catch {
    return null;
  }
}

export function saveConsent(consent: AnalyticsConsent) {
  try {
    localStorage.setItem(consentKey, consent);
  } catch {
    // Storage can be blocked; the banner then comes back on the next page.
  }
}

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: (...args: unknown[]) => void;
  }
}

export function loadGoogleAnalytics(
  measurementId: string,
  doc: Document = document,
) {
  const win = doc.defaultView;
  if (!win || win.gtag) return;

  win.dataLayer = win.dataLayer ?? [];
  // gtag.js expects the real `arguments` object in the data layer, not an array.
  win.gtag = function gtag() {
    // eslint-disable-next-line prefer-rest-params
    win.dataLayer!.push(arguments);
  };
  win.gtag("consent", "default", {
    analytics_storage: "granted",
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
  });
  win.gtag("js", new Date());
  win.gtag("config", measurementId);

  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(measurementId)}`;
  doc.head.append(script);
}

// Removes the _ga cookies when the visitor withdraws consent.
export function clearAnalyticsCookies(doc: Document = document) {
  const host = doc.location.hostname;
  const domains = [
    "",
    host,
    `.${host}`,
    `.${host.split(".").slice(-2).join(".")}`,
  ];
  doc.cookie
    .split(";")
    .map((cookie) => cookie.split("=")[0].trim())
    .filter((name) => name === "_ga" || name.startsWith("_ga_"))
    .forEach((name) => {
      domains.forEach((domain) => {
        const domainPart = domain ? `; domain=${domain}` : "";
        doc.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/${domainPart}`;
      });
    });
}

function pageLanguage(doc: Document): BannerLanguage {
  return doc.documentElement.lang.toLowerCase().startsWith("pl") ? "pl" : "en";
}

export function translateConsentUi(root: ParentNode, language: BannerLanguage) {
  root.querySelectorAll<HTMLElement>("[data-consent-i18n]").forEach((node) => {
    const key = node.dataset.consentI18n;
    if (key && key in bannerCopy[language])
      node.textContent = bannerCopy[language][key];
  });
}

export function initAnalytics(doc: Document = document) {
  const banner = doc.querySelector<HTMLElement>("#cookie-consent");
  const measurementId = banner?.dataset.measurementId;
  if (!banner || !isValidMeasurementId(measurementId)) return;

  const settingsButton =
    doc.querySelector<HTMLButtonElement>("#cookie-settings");
  const translate = () => translateConsentUi(doc, pageLanguage(doc));

  // Public pages switch language client-side by changing <html lang>.
  translate();
  new MutationObserver(translate).observe(doc.documentElement, {
    attributes: true,
    attributeFilter: ["lang"],
  });

  const consent = readConsent();
  if (consent === "granted") loadGoogleAnalytics(measurementId, doc);
  // gtag.js can rewrite its cookies while the page unloads after a decline, so clear them again.
  if (consent === "denied") clearAnalyticsCookies(doc);
  banner.hidden = consent !== null;
  if (settingsButton) settingsButton.hidden = false;

  banner
    .querySelector("[data-consent-accept]")
    ?.addEventListener("click", () => {
      saveConsent("granted");
      banner.hidden = true;
      loadGoogleAnalytics(measurementId, doc);
    });

  banner
    .querySelector("[data-consent-decline]")
    ?.addEventListener("click", () => {
      const wasGranted = readConsent() === "granted";
      saveConsent("denied");
      banner.hidden = true;
      clearAnalyticsCookies(doc);
      // A loaded gtag.js keeps running until the page is reloaded.
      if (wasGranted && doc.defaultView?.gtag)
        doc.defaultView.location.reload();
    });

  settingsButton?.addEventListener("click", () => {
    banner.hidden = false;
  });
}

if (
  typeof document !== "undefined" &&
  document.querySelector("#cookie-consent")
) {
  initAnalytics();
}
