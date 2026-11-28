import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { createElement, type ComponentProps, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";

// The settings page took the streak reminder, language, theme and sign-out over from the profile.
// The pages render on the server here, with the session, router, theme and push state stubbed.

const stub = vi.hoisted(() => ({
  pathname: "/settings",
  status: "authenticated" as "authenticated" | "loading" | "unauthenticated",
  reminder: "off" as string | null,
}));

vi.mock("next-auth/react", () => ({
  useSession: () => ({
    status: stub.status,
    data: stub.status === "authenticated" ? { user: { email: "student@example.com" }, expires: "2099-01-01" } : null,
  }),
  signOut: vi.fn(),
}));
vi.mock("next/navigation", () => ({
  usePathname: () => stub.pathname,
  useRouter: () => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("@/lib/use-is-admin", () => ({ useIsAdmin: () => false }));
vi.mock("@/lib/theme/provider", () => ({
  useTheme: () => ({ preference: "system", theme: "light", setPreference: vi.fn() }),
}));
vi.mock("@/lib/use-streak-reminder", () => ({
  useStreakReminder: () => ({ state: stub.reminder, busy: false, error: null, enable: vi.fn(), disable: vi.fn() }),
}));

import SettingsPage from "@/app/settings/page";
import ProfileHeader from "@/app/profile/_components/ProfileHeader";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { LocaleOverride } from "@/lib/i18n/provider";

const render = (element: ReactElement) => renderToStaticMarkup(element);
const inRussian = (element: ReactElement) =>
  createElement(LocaleOverride, { locale: "ru" } as ComponentProps<typeof LocaleOverride>, element);

/** The attributes of every <a> in the markup. */
function links(markup: string): Record<string, string>[] {
  return [...markup.matchAll(/<a\s([^>]*)>/g)].map(([, attributes]) =>
    Object.fromEntries([...attributes.matchAll(/([\w-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])),
  );
}

/** Positions of the four settings blocks, top to bottom. */
function blockPositions(markup: string) {
  return [
    markup.indexOf('id="streak-reminder-title"'),
    markup.indexOf('role="radiogroup" aria-label="Тіл"'),
    markup.indexOf('role="radiogroup" aria-label="Көрініс"'),
    markup.indexOf("Аккаунттан шығу"),
  ];
}

const profileSource = readFileSync(fileURLToPath(new URL("../app/profile/page.tsx", import.meta.url)), "utf8");

afterEach(() => {
  stub.pathname = "/settings";
  stub.status = "authenticated";
  stub.reminder = "off";
});

describe("the settings page", () => {
  it("shows the streak reminder, language, theme and sign-out, in that order", () => {
    const markup = render(createElement(SettingsPage));
    const positions = blockPositions(markup);
    expect(positions.every((position) => position >= 0), positions.join()).toBe(true);
    expect([...positions].sort((a, b) => a - b)).toEqual(positions);
    expect(markup).toContain("Күнделікті еске салу");
    expect(markup).toContain('role="switch"');
    expect(markup).toContain(">Тіл</h2>");
    expect(markup).toContain(">Көрініс</h2>");
  });

  it("is titled «Баптаулар» and links back to the profile", () => {
    const markup = render(createElement(SettingsPage));
    expect(markup).toMatch(/<h1[^>]*>Баптаулар<\/h1>/);
    const back = links(markup).filter((link) => link.href === "/profile" && !link["aria-current"]);
    expect(back).toHaveLength(1);
    expect(markup).toContain("Профильге оралу");
  });

  it("is translated into Russian", () => {
    const markup = render(inRussian(createElement(SettingsPage)));
    expect(markup).toMatch(/<h1[^>]*>Настройки<\/h1>/);
    expect(markup).toContain("Вернуться в профиль");
    expect(markup).toContain("Ежедневное напоминание");
    expect(markup).toContain('role="radiogroup" aria-label="Язык"');
    expect(markup).toContain('role="radiogroup" aria-label="Оформление"');
    expect(markup).toContain("Выйти из аккаунта");
  });

  it("highlights Profile in both navs and adds no nav item of its own", () => {
    const markup = render(createElement(SettingsPage));
    const current = links(markup).filter((link) => link["aria-current"] === "page");
    expect(current.map((link) => link.href)).toEqual(["/profile", "/profile"]);
    expect(links(markup).some((link) => link.href === "/settings")).toBe(false);
  });

  it("leaves out the reminder where the browser has no Web Push, keeping the rest", () => {
    stub.reminder = "unsupported";
    const markup = render(createElement(SettingsPage));
    expect(markup).not.toContain("streak-reminder-title");
    expect(blockPositions(markup).slice(1).every((position) => position >= 0)).toBe(true);
  });

  it("shows a skeleton while the session loads and nothing but the redirect when signed out", () => {
    stub.status = "loading";
    const loading = render(createElement(SettingsPage));
    expect(loading).toContain("animate-pulse");
    expect(blockPositions(loading)).toEqual([-1, -1, -1, -1]);

    stub.status = "unauthenticated";
    const signedOut = render(createElement(SettingsPage));
    expect(signedOut).toContain("Кіру бетіне бағытталуда...");
    expect(blockPositions(signedOut)).toEqual([-1, -1, -1, -1]);
  });
});

describe("the navs on /settings", () => {
  it("mark Profile as the current page, as on /profile", () => {
    for (const pathname of ["/settings", "/profile"]) {
      stub.pathname = pathname;
      for (const nav of [DesktopNav, MobileNav]) {
        const current = links(render(createElement(nav))).filter((link) => link["aria-current"] === "page");
        expect({ pathname, nav: nav.name, current: current.map((link) => link.href) }).toEqual({
          pathname,
          nav: nav.name,
          current: ["/profile"],
        });
      }
    }
  });

  it("do not mark Profile elsewhere", () => {
    stub.pathname = "/modules";
    for (const nav of [DesktopNav, MobileNav]) {
      const current = links(render(createElement(nav))).filter((link) => link["aria-current"] === "page");
      expect(current.map((link) => link.href)).toEqual(["/modules"]);
    }
  });
});

describe("the profile", () => {
  const header = (props: Partial<Parameters<typeof ProfileHeader>[0]> = {}) =>
    createElement(ProfileHeader, {
      userData: { id: 1, email: "student@example.com", nickname: "Айгерім", total_solved: 3 },
      isEditingNickname: false,
      handleSaveNickname: async () => {},
      nickname: "Айгерім",
      setNickname: () => {},
      saving: false,
      setIsEditingNickname: () => {},
      setMessage: () => {},
      message: null,
      ...props,
    });

  it("has a gear button in the header that opens /settings", () => {
    for (const isEditingNickname of [false, true]) {
      const gear = links(render(header({ isEditingNickname }))).filter((link) => link.href === "/settings");
      expect(gear).toHaveLength(1);
      expect(gear[0]["aria-label"]).toBe("Баптаулар");
    }
    expect(render(header())).toMatch(/<a[^>]*href="\/settings"[^>]*>.*?data-icon="gear"/);
    expect(links(render(inRussian(header()))).find((link) => link.href === "/settings")?.["aria-label"]).toBe("Настройки");
  });

  it("links to /settings with a card next to the achievements card", () => {
    expect(profileSource).toMatch(/<ProfileLinkCard\s+href="\/achievements"/);
    expect(profileSource).toMatch(/<ProfileLinkCard\s+href="\/settings"\s+icon="gear"[\s\S]*?title=\{t\("settings\.title"\)\}\s+hint=\{t\("settings\.hint"\)\}/);
  });

  it("no longer has the reminder, language or theme blocks", () => {
    for (const moved of ["StreakReminderCard", "LanguageSwitcher", "ThemeSwitcher", "language.title", "theme.title", "profile.reminder"]) {
      expect(profileSource, moved).not.toContain(moved);
    }
  });

  it("keeps sign-out only where the profile failed to load", () => {
    const signOuts = [...profileSource.matchAll(/signOut\(\{ callbackUrl: "\/" \}\)/g)];
    expect(signOuts).toHaveLength(1);
    const failureState = profileSource.indexOf('t("profile.reload")');
    expect(failureState).toBeGreaterThan(0);
    expect(signOuts[0].index).toBeGreaterThan(failureState);
  });
});
