/* global process, console */
// Generates the 1200x630 link preview images in public/og/ (npm run og).
// Each image is an HTML template rendered by headless Chrome and compressed to JPEG with sharp.
// Set CHROME_PATH if Chrome is not in the default macOS location.
import { execFileSync } from "node:child_process";
import {
  mkdtempSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import sharp from "sharp";

const root = resolve(import.meta.dirname, "..");
const outDir = join(root, "public/og");
const asset = (name) => pathToFileURL(join(root, "public/assets", name)).href;
const chrome =
  process.env.CHROME_PATH ??
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

const icons = {
  shield:
    '<path d="M12 3l7 3v5c0 4.5-3 8.3-7 10-4-1.7-7-5.5-7-10V6z"/><path d="M8.5 12l2.5 2.5 4.5-5"/>',
  document:
    '<path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/><path d="M9 12h6M9 16h6"/>',
  chat: '<path d="M4 5h16v11H9l-5 4z"/><path d="M8 9.5h8M8 12.5h5"/>',
};

const styles = `
  * { box-sizing: border-box; margin: 0; }
  html, body { width: 1200px; height: 630px; overflow: hidden; }
  body {
    position: relative;
    font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
    color: #071632;
    background:
      radial-gradient(520px 420px at 100% 0%, rgba(5, 214, 190, 0.28), transparent 70%),
      radial-gradient(560px 460px at 92% 100%, rgba(124, 92, 255, 0.3), transparent 70%),
      radial-gradient(420px 320px at 0% 100%, rgba(26, 170, 245, 0.14), transparent 70%),
      #f5f8fc;
  }
  .copy { position: absolute; left: 72px; top: 64px; width: 620px; }
  .brand { display: flex; align-items: center; gap: 14px; font-size: 32px; font-weight: 800; letter-spacing: -0.02em; }
  .brand img { width: 58px; height: 58px; }
  .brand b { font-weight: inherit; }
  .brand span { color: #0aa896; }
  h1 { margin-top: 44px; font-size: 68px; line-height: 1.02; font-weight: 800; letter-spacing: -0.035em; }
  h1 em { font-style: normal; color: #0aa896; }
  .lead { margin-top: 24px; font-size: 26px; line-height: 1.38; color: #34445a; }
  .subtitle { margin-top: 12px; font-size: 34px; font-weight: 700; color: #7a8799; letter-spacing: -0.02em; }
  .pills { position: absolute; left: 72px; bottom: 60px; display: flex; gap: 12px; }
  .pill { padding: 12px 22px; border-radius: 999px; font-size: 21px; font-weight: 700; background: #fff; color: #26374c; box-shadow: 0 6px 18px rgba(7, 22, 50, 0.08); }
  .pill.dark { background: #071632; color: #fff; }
  .phone {
    position: absolute; width: 252px; height: 546px; padding: 9px; border-radius: 44px;
    background: #0b111d; box-shadow: 0 30px 60px rgba(7, 22, 50, 0.28), inset 0 0 0 2px #2a3446;
  }
  .phone img { width: 100%; height: 100%; border-radius: 36px; object-fit: cover; object-position: top; }
  .tiles { position: absolute; right: 120px; top: 150px; width: 330px; height: 330px; }
  .tile { position: absolute; inset: 0; border-radius: 64px; border: 8px solid #fff; box-shadow: 0 24px 50px rgba(7, 22, 50, 0.18); }
  .tile.back1 { background: linear-gradient(160deg, #9b7bff, #6c4ee6); transform: rotate(-18deg) translate(-40px, -6px); }
  .tile.back2 { background: linear-gradient(160deg, #22c3ff, #1488e8); transform: rotate(-8deg) translate(-16px, -2px); }
  .tile.front { background: linear-gradient(160deg, #10e3c3, #059a8a); transform: rotate(6deg); display: grid; place-items: center; }
  .tile svg { width: 170px; height: 170px; fill: none; stroke: #fff; stroke-width: 1.7; stroke-linecap: round; stroke-linejoin: round; }
`;

const brand = `<div class="brand"><img src="${asset("tripletalk-logo.png")}" alt="" /><b>Triple<span>Talk</span></b></div>`;

function homeImage({ headline, lead, pills }) {
  return `
    <div class="copy">${brand}<h1>${headline}</h1><p class="lead">${lead}</p></div>
    <div class="pills">${pills.map((pill, i) => `<span class="pill${i === 0 ? " dark" : ""}">${pill}</span>`).join("")}</div>
    <div class="phone" style="right: 236px; top: 74px; transform: rotate(-7deg)"><img src="${asset("tripletalk-word-selection.webp")}" alt="" /></div>
    <div class="phone" style="right: 52px; top: 40px; transform: rotate(5deg)"><img src="${asset("tripletalk-flashcard-details.webp")}" alt="" /></div>`;
}

function pageImage({ title, subtitle, lead, icon, screenshot }) {
  const visual = screenshot
    ? `<div class="phone" style="right: 120px; top: 52px; transform: rotate(5deg)"><img src="${asset(screenshot)}" alt="" /></div>`
    : `<div class="tiles"><div class="tile back1"></div><div class="tile back2"></div><div class="tile front"><svg viewBox="0 0 24 24">${icons[icon]}</svg></div></div>`;
  return `
    <div class="copy">${brand}<h1>${title}</h1>${subtitle ? `<p class="subtitle">${subtitle}</p>` : ""}<p class="lead">${lead}</p></div>
    <div class="pills"><span class="pill">tripletalk.app</span></div>
    ${visual}`;
}

const images = {
  "home-pl": homeImage({
    headline: "Zrób zdjęcie.<br /><em>Ucz się słówek.</em>",
    lead: "TripleTalk zamienia podręcznik, notatki albo dowolny tekst w&nbsp;fiszki z&nbsp;tłumaczeniem, przykładami i&nbsp;wymową.",
    pills: ["Za darmo na iOS i Androida", "Fiszki AI"],
  }),
  "home-en": homeImage({
    headline: "Snap a photo.<br /><em>Learn the words.</em>",
    lead: "TripleTalk turns textbooks, notes or any text into flashcards with translations, examples and pronunciation.",
    pills: ["Free on iOS and Android", "AI flashcards"],
  }),
  "guide-pl": pageImage({
    title: "Instrukcja",
    lead: "Jak zacząć, zrobić fiszki z&nbsp;AI i&nbsp;uczyć się skuteczniej – krok po kroku.",
    screenshot: "tripletalk-lesson.webp",
  }),
  "guide-en": pageImage({
    title: "User guide",
    lead: "How to get started, make AI flashcards and learn more effectively – step by step.",
    screenshot: "tripletalk-lesson.webp",
  }),
  "privacy-pl": pageImage({
    title: "Polityka prywatności",
    lead: "Jakie dane zbieramy, po co i&nbsp;jakie masz prawa – prostym językiem.",
    icon: "shield",
  }),
  "privacy-en": pageImage({
    title: "Privacy Policy",
    lead: "What data we collect, why, and what your rights are – in plain language.",
    icon: "shield",
  }),
  "terms-pl": pageImage({
    title: "Regulamin",
    lead: "Zasady korzystania z&nbsp;TripleTalk, Premium i&nbsp;fiszek AI – prostym językiem.",
    icon: "document",
  }),
  "terms-en": pageImage({
    title: "Terms of Service",
    lead: "The rules for using TripleTalk, Premium and AI flashcards – in plain language.",
    icon: "document",
  }),
  "support-pl": pageImage({
    title: "Kontakt",
    lead: "Masz pytanie o&nbsp;aplikację, konto albo płatności? Napisz do nas, chętnie pomożemy.",
    icon: "chat",
  }),
  "support-en": pageImage({
    title: "Contact",
    lead: "Questions about the app, your account or payments? Write to us, we're happy to help.",
    icon: "chat",
  }),
};

const workDir = mkdtempSync(join(tmpdir(), "tripletalk-og-"));
mkdirSync(outDir, { recursive: true });

try {
  for (const [name, body] of Object.entries(images)) {
    const htmlPath = join(workDir, `${name}.html`);
    const pngPath = join(workDir, `${name}.png`);
    writeFileSync(
      htmlPath,
      `<!doctype html><html><head><meta charset="utf-8" /><style>${styles}</style></head><body>${body}</body></html>`,
    );
    execFileSync(
      chrome,
      [
        "--headless=new",
        "--disable-gpu",
        "--hide-scrollbars",
        "--force-device-scale-factor=2",
        "--window-size=1200,630",
        "--virtual-time-budget=2000",
        `--screenshot=${pngPath}`,
        pathToFileURL(htmlPath).href,
      ],
      { stdio: "ignore" },
    );
    const outPath = join(outDir, `${name}.jpg`);
    await sharp(pngPath)
      .resize(1200, 630)
      .jpeg({ quality: 84, mozjpeg: true })
      .toFile(outPath);
    console.log(
      `public/og/${name}.jpg ${Math.round(statSync(outPath).size / 1024)} KB`,
    );
  }
} finally {
  rmSync(workDir, { recursive: true, force: true });
}
