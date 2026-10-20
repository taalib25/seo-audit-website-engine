import type { PageSnapshot } from "@aeo/core";

/** Returns framework, CMS, and hosting hints found in the raw source and response headers. */
export function detectStack(page: Pick<PageSnapshot, "rawHtml" | "headers">): string[] {
  const html = page.rawHtml.toLowerCase();
  const headers = Object.entries(page.headers).map(([key, value]) => `${key}: ${value}`.toLowerCase()).join("\n");
  const all = `${html}\n${headers}`;
  const checks: Array<[string, RegExp]> = [
    ["Next.js", /__next_data__|\/_next\//], ["Nuxt", /__nuxt__|\/_nuxt\//],
    ["Astro", /astro-island|astro\s+v\d|\/_astro\//], ["Gatsby", /___gatsby|gatsby/],
    ["Remix", /__remixcontext|__remixmanifest|remix-run/], ["SvelteKit", /__sveltekit|\/_app\/immutable/],
    ["WordPress", /wp-content\/|wp-includes\/|name=["']generator["'][^>]*wordpress/],
    ["Shopify", /cdn\.shopify\.com|shopify\.theme/], ["Wix", /wixstatic\.com|wixsite\.com/],
    ["Squarespace", /static\.squarespace\.com|squarespace\.com/], ["Webflow", /webflow\.io|data-wf-page/],
    ["Framer", /framerusercontent\.com|data-framer/], ["HubSpot", /hs-scripts\.com|hubspot/],
    ["Drupal", /drupalsettings|\/sites\/default\/files/], ["Ghost", /ghost\.io|content\/themes\/ghost/],
    ["Vercel", /server:.*vercel|x-vercel-id|x-vercel-cache/], ["Netlify", /server:.*netlify|x-nf-request-id/],
    ["Cloudflare", /server:.*cloudflare|cf-ray/],
  ];
  return checks.filter(([, pattern]) => pattern.test(all)).map(([name]) => name);
}

/** Conservative source heuristic for deciding whether browser rendering may reveal hydrated content. */
export function needsRendering(rawHtml: string): boolean {
  if (!rawHtml.trim()) return true;
  const body = /<body\b[^>]*>([\s\S]*?)<\/body\s*>/i.exec(rawHtml)?.[1] ?? rawHtml;
  const visibleText = body.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, "")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style\s*>/gi, "")
    .replace(/<!--([\s\S]*?)-->/g, "")
    .replace(/<[^>]*>/g, " ").replace(/&(?:nbsp|#160);/gi, " ").replace(/\s+/g, " ").trim();
  const rootShell = /<div\b[^>]*(?:id=["'](?:root|app|__next|__nuxt)["']|data-reactroot)[^>]*>\s*<\/div\s*>/i.test(body);
  const noscriptShell = /<noscript[^>]*>\s*(?:enable javascript|javascript is required|this app requires javascript)/i.test(body);
  const scriptCount = (body.match(/<script\b/gi) ?? []).length;
  const substantialAppShell = /<div\b[^>]*id=["'](?:root|app|__next|__nuxt)["'][^>]*>\s*(?:<[^>]+>\s*){0,2}<\/div/i.test(body);
  return rootShell || noscriptShell || (visibleText.length < 120 && scriptCount >= 3) || (substantialAppShell && visibleText.length < 250);
}
