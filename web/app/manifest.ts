import type { MetadataRoute } from "next";
import { getRequestLocale } from "@/lib/i18n/server";
import { translate } from "@/lib/i18n/translate";

// Served at /manifest.webmanifest; Next adds the <link rel="manifest"> tag. The browser sends the
// language cookie with this same-origin request, so the installed app is described in that language.
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const locale = await getRequestLocale();
  return {
    id: "/",
    name: "QazMath",
    short_name: "QazMath",
    description: translate(locale, "meta.manifestDescription"),
    lang: locale,
    start_url: "/modules",
    scope: "/",
    display: "standalone",
    // A manifest has one colour per field, not one per colour scheme. Once a page is open, the
    // theme-color metas of the root layout (light, dark and the student's own choice) win over
    // theme_color; only the launch splash keeps these light values.
    background_color: "#f8fafc",
    theme_color: "#7c3aed",
    categories: ["education"],
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
