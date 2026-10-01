// Light/dark theme for the admin panel. Without a stored choice the panel
// follows the system setting (CSS `prefers-color-scheme`); the toggle stores
// an explicit choice in this browser only.

export type AdminTheme = "light" | "dark";

const STORAGE_KEY = "tripletalk-admin-theme";

export function storedAdminTheme(): AdminTheme | null {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

function systemTheme(): AdminTheme {
  return window.matchMedia?.("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

export function applyAdminTheme(theme: AdminTheme | null): AdminTheme {
  if (theme) document.documentElement.dataset.theme = theme;
  else delete document.documentElement.dataset.theme;
  return theme || systemTheme();
}

export function initializeAdminTheme(button: HTMLButtonElement | null): void {
  let active = applyAdminTheme(storedAdminTheme());
  const sync = () => {
    if (!button) return;
    button.textContent = active === "dark" ? "Light mode" : "Dark mode";
  };
  sync();
  button?.addEventListener("click", () => {
    const next: AdminTheme = active === "dark" ? "light" : "dark";
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Storage may be blocked; the choice then lasts for this page only.
    }
    active = applyAdminTheme(next);
    sync();
  });
  window
    .matchMedia?.("(prefers-color-scheme: dark)")
    .addEventListener?.("change", () => {
      if (storedAdminTheme()) return;
      active = applyAdminTheme(null);
      sync();
    });
}
