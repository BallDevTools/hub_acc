"use client";

import { Moon, Search, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { useOpenSearch } from "@/components/search";
import { currentTheme, saveTheme, type Theme } from "@/lib/theme";

export function HeaderTools() {
  const openSearch = useOpenSearch();
  const [theme, setTheme] = useState<Theme>("light");
  useEffect(() => setTheme(currentTheme()), []);
  const toggle = () => {
    const next = theme === "dark" ? "light" : "dark";
    saveTheme(next);
    setTheme(next);
  };
  return (
    <>
      <button
        type="button"
        onClick={openSearch}
        className="btn btn-surface order-last flex-[1_1_100%] justify-start font-normal text-ink-3 sm:order-none sm:flex-[0_1_260px]"
      >
        <Search aria-hidden size={16} />
        <span className="flex-1 text-left">ค้นหาทุกอย่าง</span>
        <kbd aria-hidden className="hidden rounded-md bg-surface-2 px-1.5 py-0.5 font-sans text-xs sm:inline">
          ⌘K
        </kbd>
      </button>
      <button
        type="button"
        className="btn btn-surface btn-icon"
        onClick={toggle}
        aria-label={theme === "dark" ? "เปลี่ยนเป็นโหมดสว่าง" : "เปลี่ยนเป็นโหมดมืด"}
      >
        {theme === "dark" ? <Sun aria-hidden size={17} /> : <Moon aria-hidden size={17} />}
      </button>
    </>
  );
}
