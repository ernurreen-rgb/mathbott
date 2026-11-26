import colors from "tailwindcss/colors";
import { describe, expect, it } from "vitest";

import {
  HUES,
  NEUTRALS,
  SEMANTIC_TOKENS,
  contrast,
  darkAliasColor,
  hexToRgb,
  themeVariables,
  type SemanticToken,
} from "@/lib/theme/palette";
import {
  THEME_COLOR,
  THEME_COLOR_META_ID,
  THEME_STORAGE_KEY,
  applyTheme,
  effectivePreference,
  hasSessionCookie,
  parseThemePreference,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  themeInitScript,
} from "@/lib/theme/preference";

type FakeNode = { id: string; name: string; content: string; remove: () => void };

/** Just enough of `document` for the theme code: <html> attributes and <head> children. */
function fakeDocument() {
  const attributes = new Map<string, string>();
  const head: FakeNode[] = [];
  const doc = {
    documentElement: {
      getAttribute: (name: string) => attributes.get(name) ?? null,
      setAttribute: (name: string, value: string) => void attributes.set(name, value),
    },
    head: {
      get firstChild() {
        return head[0] ?? null;
      },
      insertBefore(node: FakeNode, before: FakeNode | null) {
        head.splice(before ? head.indexOf(before) : head.length, 0, node);
      },
    },
    createElement: (): FakeNode => {
      const node: FakeNode = { id: "", name: "", content: "", remove: () => void head.splice(head.indexOf(node), 1) };
      return node;
    },
    getElementById: (id: string) => head.find((node) => node.id === id) ?? null,
  };
  return { doc, attributes, head };
}

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  };
}

const blockedStorage = {
  getItem: () => {
    throw new Error("blocked");
  },
  setItem: () => {
    throw new Error("blocked");
  },
  removeItem: () => {
    throw new Error("blocked");
  },
};

/** Runs the inline script the way a browser would, before React. */
function runInitScript(options: { signedIn: boolean; saved?: string; systemDark: boolean; storage?: unknown }) {
  const { doc, attributes, head } = fakeDocument();
  const storage = options.storage ?? memoryStorage(options.saved ? { [THEME_STORAGE_KEY]: options.saved } : {});
  const window = { matchMedia: (query: string) => ({ matches: options.systemDark && query === "(prefers-color-scheme: dark)" }) };
  new Function("window", "document", "localStorage", themeInitScript(options.signedIn))(window, doc, storage);
  return { theme: attributes.get("data-theme"), head };
}

describe("theme choice", () => {
  it("defaults to the system and ignores unknown values", () => {
    expect(parseThemePreference(null)).toBe("system");
    expect(parseThemePreference("blue")).toBe("system");
    expect(parseThemePreference("dark")).toBe("dark");
    expect(readThemePreference(memoryStorage())).toBe("system");
    expect(readThemePreference(blockedStorage)).toBe("system");
    expect(readThemePreference(null)).toBe("system");
  });

  it("saves light and dark, and forgets the key for the system", () => {
    const storage = memoryStorage();
    saveThemePreference("dark", storage);
    expect(storage.data.get(THEME_STORAGE_KEY)).toBe("dark");
    expect(readThemePreference(storage)).toBe("dark");
    saveThemePreference("system", storage);
    expect(storage.data.has(THEME_STORAGE_KEY)).toBe(false);
    expect(() => saveThemePreference("light", blockedStorage)).not.toThrow();
  });

  it("resolves the system choice with the device setting", () => {
    expect(resolveTheme("system", true)).toBe("dark");
    expect(resolveTheme("system", false)).toBe("light");
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("applies a saved choice only while signed in", () => {
    expect(effectivePreference("dark", true)).toBe("dark");
    expect(effectivePreference("dark", false)).toBe("system");
  });

  it("recognises the NextAuth session cookie, also on HTTPS and in chunks", () => {
    expect(hasSessionCookie(["qazmath_locale", "next-auth.session-token"])).toBe(true);
    expect(hasSessionCookie(["__Secure-next-auth.session-token.0"])).toBe(true);
    expect(hasSessionCookie(["next-auth.csrf-token", "next-auth.callback-url"])).toBe(false);
    expect(hasSessionCookie([])).toBe(false);
  });
});

describe("applying the theme", () => {
  it("sets data-theme and adds a theme-color meta only for an explicit choice", () => {
    const { doc, attributes, head } = fakeDocument();
    applyTheme(doc as unknown as Document, "dark", "dark");
    expect(attributes.get("data-theme")).toBe("dark");
    expect(head).toHaveLength(1);
    expect(head[0]).toMatchObject({ id: THEME_COLOR_META_ID, name: "theme-color", content: THEME_COLOR.dark });

    applyTheme(doc as unknown as Document, "light", "light");
    expect(head).toHaveLength(1);
    expect(head[0].content).toBe(THEME_COLOR.light);

    // Following the system again hands the browser UI colour back to the media-specific metas.
    applyTheme(doc as unknown as Document, "dark", "system");
    expect(attributes.get("data-theme")).toBe("dark");
    expect(head).toHaveLength(0);
  });
});

describe("the inline script before the first paint", () => {
  it("follows the system by default", () => {
    expect(runInitScript({ signedIn: true, systemDark: true }).theme).toBe("dark");
    expect(runInitScript({ signedIn: true, systemDark: false }).theme).toBe("light");
    expect(runInitScript({ signedIn: true, systemDark: true }).head).toHaveLength(0);
  });

  it("applies a saved choice over the system for a signed-in student", () => {
    const dark = runInitScript({ signedIn: true, saved: "dark", systemDark: false });
    expect(dark.theme).toBe("dark");
    expect(dark.head[0]).toMatchObject({ id: THEME_COLOR_META_ID, content: THEME_COLOR.dark });
    expect(runInitScript({ signedIn: true, saved: "light", systemDark: true }).theme).toBe("light");
  });

  it("ignores the saved choice for a signed-out visitor", () => {
    expect(runInitScript({ signedIn: false, saved: "dark", systemDark: false }).theme).toBe("light");
    expect(runInitScript({ signedIn: false, saved: "light", systemDark: true }).theme).toBe("dark");
  });

  it("agrees with resolveTheme for every combination", () => {
    for (const saved of ["light", "dark", "system", "junk"]) {
      for (const signedIn of [true, false]) {
        for (const systemDark of [true, false]) {
          const expected = resolveTheme(effectivePreference(parseThemePreference(saved), signedIn), systemDark);
          expect(runInitScript({ signedIn, saved, systemDark }).theme).toBe(expected);
        }
      }
    }
  });

  it("survives blocked storage and a browser without matchMedia", () => {
    expect(runInitScript({ signedIn: true, systemDark: true, storage: blockedStorage }).theme).toBe("dark");
    const { doc, attributes } = fakeDocument();
    expect(() => new Function("window", "document", "localStorage", themeInitScript(true))({}, doc, null)).not.toThrow();
    expect(attributes.get("data-theme")).toBe("light");
  });
});

const palette = colors as unknown as Record<string, Record<string, string>>;
const rgbText = (hex: string) => hexToRgb(hex).join(" ");
const token = (name: SemanticToken, theme: 0 | 1) => SEMANTIC_TOKENS[name][theme];

describe("theme palette", () => {
  it("keeps every light value equal to the Tailwind colour the class had before", () => {
    const light = themeVariables("light");
    let checked = 0;
    for (const [name, value] of Object.entries(light)) {
      const match = /^--qm-(bg|fg|line)-([a-z]+)-(\d+)$/.exec(name);
      if (!match) continue;
      expect(value, name).toBe(rgbText(palette[match[2]][match[3]]));
      checked += 1;
    }
    expect(checked).toBeGreaterThan(200);
    expect(light["--qm-bg-white"]).toBe("255 255 255");
    expect(light["--qm-line-white"]).toBe("255 255 255");
  });

  it("defines every variable in both themes, and dark references point at real tokens", () => {
    const light = themeVariables("light");
    const dark = themeVariables("dark");
    expect(Object.keys(dark).sort()).toEqual(Object.keys(light).sort());
    for (const [name, value] of Object.entries(dark)) {
      const reference = /^var\((--qm-[a-z-]+)\)$/.exec(value);
      if (reference) expect(light, `${name} -> ${reference[1]}`).toHaveProperty([reference[1]]);
      else expect(value, name).toMatch(/^\d{1,3} \d{1,3} \d{1,3}$/);
    }
  });

  it("uses the dark page colour for the browser UI", () => {
    expect(THEME_COLOR.dark).toBe(token("page-from", 1));
    expect(THEME_COLOR.light).toBe("#7c3aed");
  });

  it("meets WCAG AA for text on the surfaces of both themes", () => {
    const surfaces: SemanticToken[] = ["surface", "surface-sunken", "page", "page-from", "page-to"];
    for (const theme of [0, 1] as const) {
      for (const text of ["fg", "fg-secondary", "fg-muted", "fg-subtle"] as const) {
        for (const surface of surfaces) {
          // Light gray-500 on the bottom of the page gradient is 4.4:1, as it was before the themes.
          if (theme === 0 && text === "fg-subtle" && surface === "page-to") continue;
          expect(contrast(token(text, theme), token(surface, theme)), `${text} on ${surface} (${theme})`).toBeGreaterThanOrEqual(4.5);
        }
      }
      expect(contrast(token("fg-muted", theme), token("surface-muted", theme))).toBeGreaterThanOrEqual(4.5);
    }
    // Placeholders and hints are readable in the dark theme (gray-400 on white never was).
    expect(contrast(token("fg-faint", 1), token("surface", 1))).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps state colours readable and distinct in the dark theme", () => {
    for (const state of ["success", "danger", "warning", "info", "brand"] as const) {
      for (const theme of [0, 1] as const) {
        const background = state === "brand" ? token("brand-soft", theme) : token(`${state}-soft`, theme);
        expect(contrast(token(state, theme), background), `${state} (${theme})`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(token(state, theme), token("surface", theme)), `${state} on surface (${theme})`).toBeGreaterThanOrEqual(4.5);
      }
    }
    // Right and wrong never look alike: the green and red tints stay far apart.
    expect(contrast(token("success", 1), token("danger", 1))).toBeGreaterThan(1.3);
    expect(token("success-soft", 1)).not.toBe(token("danger-soft", 1));
  });

  it("keeps tinted text readable on its own tinted background in the dark theme", () => {
    for (const hue of HUES) {
      for (const text of ["600", "700", "800", "900"]) {
        for (const background of ["50", "100"]) {
          const ratio = contrast(darkAliasColor("fg", hue, text)!, darkAliasColor("bg", hue, background)!);
          expect(ratio, `text-${hue}-${text} on bg-${hue}-${background}`).toBeGreaterThanOrEqual(4.5);
        }
      }
    }
    for (const neutral of NEUTRALS) {
      expect(contrast(darkAliasColor("fg", neutral, "500")!, darkAliasColor("bg", neutral, "100")!)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps controls visible: white on the brand button, input borders and the focus ring", () => {
    expect(contrast("#ffffff", token("brand-solid", 0))).toBeGreaterThanOrEqual(4.5);
    expect(contrast("#ffffff", token("brand-solid", 1))).toBeGreaterThanOrEqual(4.5);
    expect(contrast(token("line-strong", 1), token("surface", 1))).toBeGreaterThanOrEqual(3);
    for (const theme of [0, 1] as const) {
      expect(contrast(token("focus", theme), token("surface", theme))).toBeGreaterThanOrEqual(3);
    }
    expect(contrast(darkAliasColor("line", "purple", "300")!, token("surface", 1))).toBeGreaterThanOrEqual(1.5);
  });
});
