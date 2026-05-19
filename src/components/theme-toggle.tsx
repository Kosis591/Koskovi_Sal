"use client";

import { Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";

const storageKey = "koskovi-theme";
const themeChangeEvent = "koskovi-theme-change";

export function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribeTheme,
    getThemeSnapshot,
    () => false,
  );

  function toggleTheme() {
    const nextIsDark = !isDark;

    applyTheme(nextIsDark);
    window.localStorage.setItem(storageKey, nextIsDark ? "dark" : "light");
    window.dispatchEvent(new Event(themeChangeEvent));
  }

  return (
    <button
      aria-label={isDark ? "Přepnout na světlý režim" : "Přepnout na tmavý režim"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[#003758] bg-[#003758] text-white shadow-sm transition hover:bg-[#0b4d76]"
      onClick={toggleTheme}
      title={isDark ? "Světlý režim" : "Tmavý režim"}
      type="button"
    >
      {isDark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}

function applyTheme(isDark: boolean) {
  document.documentElement.classList.toggle("dark", isDark);
  document.documentElement.dataset.theme = isDark ? "dark" : "light";
}

function getInitialTheme() {
  const savedTheme = window.localStorage.getItem(storageKey);
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

  return savedTheme ? savedTheme === "dark" : prefersDark;
}

function getThemeSnapshot() {
  if (typeof window === "undefined") {
    return false;
  }

  return getInitialTheme();
}

function subscribeTheme(onStoreChange: () => void) {
  function handleThemeChange() {
    applyTheme(getInitialTheme());
    onStoreChange();
  }

  window.addEventListener("storage", handleThemeChange);
  window.addEventListener(themeChangeEvent, onStoreChange);

  return () => {
    window.removeEventListener("storage", handleThemeChange);
    window.removeEventListener(themeChangeEvent, onStoreChange);
  };
}
