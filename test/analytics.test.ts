// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest";
import {
  initAnalytics,
  isValidMeasurementId,
  readConsent,
} from "../src/scripts/analytics";

function render(lang = "en") {
  document.documentElement.lang = lang;
  document.head.innerHTML = "";
  document.body.innerHTML = `
    <button id="cookie-settings" data-consent-i18n="settings" hidden>Cookie settings</button>
    <div id="cookie-consent" data-measurement-id="G-TEST1234" hidden>
      <span data-consent-i18n="text"></span>
      <button data-consent-decline data-consent-i18n="decline">Decline</button>
      <button data-consent-accept data-consent-i18n="accept">Accept</button>
    </div>`;
}

const banner = () => document.querySelector<HTMLElement>("#cookie-consent")!;
const gtagScript = () =>
  document.head.querySelector("script[src*='googletagmanager']");

describe("analytics consent", () => {
  beforeEach(() => {
    localStorage.clear();
    delete window.gtag;
    delete window.dataLayer;
  });

  it("validates GA4 measurement IDs", () => {
    expect(isValidMeasurementId("G-ABC123XYZ9")).toBe(true);
    expect(isValidMeasurementId("UA-1234-1")).toBe(false);
    expect(isValidMeasurementId("")).toBe(false);
    expect(isValidMeasurementId(undefined)).toBe(false);
  });

  it("shows the banner and loads nothing before consent", () => {
    render();
    initAnalytics();
    expect(banner().hidden).toBe(false);
    expect(gtagScript()).toBeNull();
    expect(window.gtag).toBeUndefined();
  });

  it("loads gtag.js after accepting and remembers the choice", () => {
    render();
    initAnalytics();
    banner().querySelector<HTMLElement>("[data-consent-accept]")!.click();
    expect(banner().hidden).toBe(true);
    expect(readConsent()).toBe("granted");
    expect(gtagScript()?.getAttribute("src")).toBe(
      "https://www.googletagmanager.com/gtag/js?id=G-TEST1234",
    );

    render();
    delete window.gtag;
    initAnalytics();
    expect(banner().hidden).toBe(true);
    expect(gtagScript()).not.toBeNull();
  });

  it("does not load gtag.js after declining", () => {
    render();
    initAnalytics();
    banner().querySelector<HTMLElement>("[data-consent-decline]")!.click();
    expect(readConsent()).toBe("denied");
    expect(banner().hidden).toBe(true);
    expect(gtagScript()).toBeNull();
  });

  it("reopens the banner from the footer button", () => {
    localStorage.setItem("tripletalk-analytics-consent-v1", "denied");
    render();
    initAnalytics();
    const settings = document.querySelector<HTMLElement>("#cookie-settings")!;
    expect(settings.hidden).toBe(false);
    settings.click();
    expect(banner().hidden).toBe(false);
  });

  it("follows the page language", async () => {
    render("pl");
    initAnalytics();
    expect(banner().querySelector("[data-consent-accept]")!.textContent).toBe(
      "Akceptuję",
    );
    document.documentElement.lang = "en";
    await Promise.resolve();
    expect(banner().querySelector("[data-consent-accept]")!.textContent).toBe(
      "Accept",
    );
  });
});
