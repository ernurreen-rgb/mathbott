import { test as base, expect, type Page } from "@playwright/test";
import { encode } from "next-auth/jwt";

import { E2E_NEXTAUTH_SECRET, E2E_WEB_URL } from "./env";

type Fixtures = {
  /** A page signed in as a brand-new student; the API creates the account on its first request. */
  studentPage: Page;
  studentEmail: string;
};

export const test = base.extend<Fixtures>({
  studentEmail: async ({}, use, testInfo) => {
    // One account per test and retry, so a retried test starts from an empty account too.
    const slug = testInfo.titlePath.slice(1).join("-").toLowerCase().replace(/[^a-z0-9]+/g, "-").slice(0, 40);
    await use(`e2e-${slug}-${testInfo.retry}-${Date.now()}@example.com`);
  },
  studentPage: async ({ page, context, studentEmail }, use) => {
    const sessionToken = await encode({
      token: { email: studentEmail, name: "E2E оқушы", sub: studentEmail },
      secret: E2E_NEXTAUTH_SECRET,
    });
    await context.addCookies([{ name: "next-auth.session-token", value: sessionToken, url: E2E_WEB_URL }]);
    await use(page);
  },
});

export { expect };
