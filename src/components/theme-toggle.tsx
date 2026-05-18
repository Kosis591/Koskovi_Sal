"use client";

import { Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";

const storageKey = "koskovi-theme";

export function ThemeToggle() {
  const [isDark, setIsDark] = useState(() => {
    if (typeof window === "undefined") {
      return false;
    }

    return getInitialTheme();
  });

  useEffect(() => {
    applyTheme(isDark);
  }, [isDark]);

  function toggleTheme() {
    const nextIsDark = !isDark;

    setIsDark(nextIsDark);
    applyTheme(nextIsDark);
    window.localStorage.setItem(storageKey, nextIsDark ? "dark" : "light");
  }

  return (
    <button
      aria-label={isDark ? "Prepnout na svetly rezim" : "Prepnout na tmavy rezim"}
      className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-[#003758] bg-[#003758] text-white shadow-sm transition hover:bg-[#0b4d76]"
      onClick={toggleTheme}
      title={isDark ? "Svetly rezim" : "Tmavy rezim"}
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
