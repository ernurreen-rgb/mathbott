"use client";

import React, { createContext, useContext, useEffect, useState, useCallback } from "react";

const STORAGE_KEY = "mathbot_desktop_nav_collapsed";
const BODY_CLASS = "desktop-nav-collapsed";

interface DesktopNavContextType {
  isCollapsed: boolean;
  toggleNav: () => void;
  setCollapsed: (collapsed: boolean) => void;
}

const defaultContextValue: DesktopNavContextType = {
  isCollapsed: false,
  toggleNav: () => {},
  setCollapsed: () => {},
};

export const DesktopNavContext = createContext<DesktopNavContextType>(defaultContextValue);

export function useDesktopNav(): DesktopNavContextType {
  return useContext(DesktopNavContext) ?? defaultContextValue;
}

export function DesktopNavProvider({ children }: { children: React.ReactNode }) {
  const [isCollapsed, setIsCollapsedState] = useState<boolean>(false);
  const [mounted, setMounted] = useState<boolean>(false);

  // Initialize from localStorage and sync body class on mount
  useEffect(() => {
    setMounted(true);
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      const shouldCollapse = saved === "true";
      setIsCollapsedState(shouldCollapse);
      if (shouldCollapse) {
        document.body.classList.add(BODY_CLASS);
      } else {
        document.body.classList.remove(BODY_CLASS);
      }
    } catch {
      // Ignore localStorage read errors in private browsing/sandboxed environments
    }
  }, []);

  const setCollapsed = useCallback((collapsed: boolean) => {
    setIsCollapsedState(collapsed);
    try {
      localStorage.setItem(STORAGE_KEY, String(collapsed));
      if (collapsed) {
        document.body.classList.add(BODY_CLASS);
      } else {
        document.body.classList.remove(BODY_CLASS);
      }
    } catch {
      // Ignore localStorage write errors
    }
  }, []);

  const toggleNav = useCallback(() => {
    setIsCollapsedState((prev) => {
      const next = !prev;
      try {
        localStorage.setItem(STORAGE_KEY, String(next));
        if (next) {
          document.body.classList.add(BODY_CLASS);
        } else {
          document.body.classList.remove(BODY_CLASS);
        }
      } catch {
        // Ignore localStorage write errors
      }
      return next;
    });
  }, []);

  // Keyboard shortcut Ctrl+B or Cmd+B to toggle navigation on desktop
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key && e.key.toLowerCase() === "b") {
        const target = e.target as HTMLElement | null;
        const tagName = target?.tagName ? target.tagName.toLowerCase() : "";
        if (
          tagName === "input" ||
          tagName === "textarea" ||
          tagName === "select" ||
          tagName.includes("math-field") ||
          Boolean(target?.isContentEditable)
        ) {
          return;
        }
        e.preventDefault();
        toggleNav();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [toggleNav]);

  return (
    <DesktopNavContext.Provider value={{ isCollapsed, toggleNav, setCollapsed }}>
      {children}
    </DesktopNavContext.Provider>
  );
}
