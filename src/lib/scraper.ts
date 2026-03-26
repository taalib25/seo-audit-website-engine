import axios from "axios";
import * as cheerio from "cheerio";
import type { MetricsObject } from "@/types/audit";

const CTA_KEYWORDS = [
  // Purchase intent
  "buy now", "order now", "shop now", "add to cart", "checkout",
  // Lead generation
  "get started", "sign up", "subscribe", "register", "join now",
  "request demo", "request a demo", "book a demo", "schedule a demo",
  "book a call", "schedule a call", "start free trial", "try free",
  // Contact / engagement
  "contact us", "get in touch", "let's talk", "talk to us",
  "reach out", "send message", "submit",
  // Content / navigation CTAs
  "learn more", "read more", "view more", "see more",
  "download", "watch video", "watch now", "view all",
  "see our work", "view case study", "start a project",
  // B2B specific
  "get a quote", "request quote", "free consultation",
];

/** Replace <br> tags with spaces before extracting text */
function textWithSpaces($: cheerio.CheerioAPI, selector: string, index: number): string {
  const $el = $(selector).eq(index);
  // Replace <br> with a space marker before getting text
  $el.find("br").replaceWith(" ");
  return $el.text().replace(/\s+/g, " ").trim();
}

export async function scrapeUrl(url: string): Promise<MetricsObject> {
  // Measure TTFB (time to first byte)
  const fetchStart = Date.now();
  const response = await axios.get(url, {
    timeout: 10000,
    maxRedirects: 10,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });
  const ttfbMs = Date.now() - fetchStart;
  const html = response.data;
  const finalUrl = response.request?.res?.responseUrl || url;
  const redirected = finalUrl !== url;

  const $ = cheerio.load(html);

  // --- SEO Technical Extractions ---
  const canonical = $('link[rel="canonical"]').attr("href") || undefined;
  const robotsMeta = $('meta[name="robots"]').attr("content") || undefined;
  const viewport = $('meta[name="viewport"]').attr("content") || undefined;
  const lang = $("html").attr("lang") || undefined;
  const charset = $('meta[charset]').attr("charset") || $('meta[http-equiv="Content-Type"]').attr("content") || undefined;
  const favicon = $('link[rel="icon"], link[rel="shortcut icon"]').attr("href") || undefined;

  // Schema.org structured data
  const schemaOrgTypes: string[] = [];
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const data = JSON.parse($(el).html() || "");
      if (data["@type"]) schemaOrgTypes.push(data["@type"]);
      if (Array.isArray(data["@graph"])) {
        for (const item of data["@graph"]) {
          if (item["@type"]) schemaOrgTypes.push(item["@type"]);
        }
      }
    } catch { /* skip malformed JSON-LD */ }
  });

  // Twitter card meta
  const twitterCard: Record<string, string> = {};
  $('meta[name^="twitter:"]').each((_, el) => {
    const name = $(el).attr("name") || "";
    const content = $(el).attr("content") || "";
    if (name && content) twitterCard[name.replace("twitter:", "")] = content;
  });

  // Resource counts + render-blocking analysis
  const scriptCount = $("script[src]").length;
  const stylesheetCount = $('link[rel="stylesheet"]').length + $("style").length;

  // Render-blocking: scripts in <head> without async or defer
  let renderBlockingScripts = 0;
  $("head script[src]").each((_, el) => {
    const hasAsync = $(el).attr("async") !== undefined;
    const hasDefer = $(el).attr("defer") !== undefined;
    if (!hasAsync && !hasDefer) renderBlockingScripts++;
  });

  // --- Dynamic content detection ---
  const hasReactRoot = $('div[id="root"], div[data-reactroot], [data-reactid]').length > 0;
  const hasVueApp = $('div[id="app"], [data-v-]').length > 0;
  const hasAngularRoot = $("app-root, [ng-version]").length > 0;
  const hasEmptyBody = $("body").text().trim().length < 100;
  const hasFrameworkScripts = $("script").length > 10;

  const dynamicContentSuspected =
    ((hasReactRoot || hasVueApp || hasAngularRoot) && hasEmptyBody) ||
    (hasFrameworkScripts && hasEmptyBody);

  // --- Meta tags ---
  const title = $("title").text().trim() || "";
  const description = $('meta[name="description"]').attr("content") || "";
  const keywords = $('meta[name="keywords"]').attr("content") || "";
  const ogTags: Record<string, string> = {};

  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property") || "";
    const content = $(el).attr("content") || "";
    if (prop && content) ogTags[prop.replace("og:", "")] = content;
  });

  // --- Headings (counts + text with <br> handling) ---
  const headings = {
    h1: $("h1").length,
    h2: $("h2").length,
    h3: $("h3").length,
    h4: $("h4").length,
    h5: $("h5").length,
    h6: $("h6").length,
  };

  const h1Texts: string[] = [];
  $("h1").each((i) => {
    const t = textWithSpaces($, "h1", i);
    if (t.length > 0) h1Texts.push(t);
  });
  const h2Texts: string[] = [];
  $("h2").each((i) => {
    const t = textWithSpaces($, "h2", i);
    if (t.length > 0) h2Texts.push(t);
  });
  const headingTexts = {
    h1: h1Texts.slice(0, 5),
    h2: h2Texts.slice(0, 5),
  };

  // --- Body text + word count ---
  $("script, style, noscript, iframe").remove();
  const bodyText = $("body").text().trim();
  const wordCount = bodyText
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .length;

  // --- CTAs (count actual clickable elements, not body text matches) ---
  let ctaCount = 0;
  const ctaKeywords: string[] = [];

  $("a, button").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (!text || text.length > 80) return; // skip empty or nav-paragraph elements

    for (const keyword of CTA_KEYWORDS) {
      if (text.includes(keyword)) {
        ctaCount++;
        if (!ctaKeywords.includes(keyword)) {
          ctaKeywords.push(keyword);
        }
        break; // count each element only once
      }
    }
  });

  // Also count elements with CTA-like classes that weren't caught by text
  $('a[class*="btn"], a[class*="cta"], a[class*="button"], a[role="button"]').each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    if (!text) return;
    const alreadyCounted = CTA_KEYWORDS.some(kw => text.includes(kw));
    if (!alreadyCounted) {
      ctaCount++;
    }
  });

  // Button count (all button elements — for AI context)
  const buttonCount = $("button").length;

  // --- Forms (conversion paths) ---
  const formCount = $("form").length;

  // --- Links ---
  let internalLinks = 0;
  let externalLinks = 0;
  const baseUrl = new URL(url);

  $("a[href]").each((_, el) => {
    const href = $(el).attr("href") || "";
    if (href.startsWith("http")) {
      if (href.includes(baseUrl.hostname)) {
        internalLinks++;
      } else {
        externalLinks++;
      }
    } else if (href.startsWith("/")) {
      internalLinks++;
    } else if (!href.startsWith("#") && !href.startsWith("mailto:") && !href.startsWith("tel:") && !href.startsWith("javascript:")) {
      // Relative paths (about.html, ./page) are internal
      internalLinks++;
    }
  });

  // --- Images ---
  const totalImages = $("img").length;
  let imagesWithAlt = 0;
  let imagesWithLazyLoading = 0;
  let imagesWithDimensions = 0;

  $("img").each((_, el) => {
    if ($(el).attr("alt") !== undefined && $(el).attr("alt") !== "") {
      imagesWithAlt++;
    }
    if ($(el).attr("loading") === "lazy") {
      imagesWithLazyLoading++;
    }
    if ($(el).attr("width") && $(el).attr("height")) {
      imagesWithDimensions++;
    }
  });

  const imagesMissingAlt = totalImages - imagesWithAlt;
  const missingAltPercent =
    totalImages > 0 ? (imagesMissingAlt / totalImages) * 100 : 0;

  return {
    url,
    meta: {
      title,
      titleLength: title.length,
      description,
      descriptionLength: description.length,
      keywords,
      ogTags,
    },
    headings,
    headingTexts,
    wordCount,
    bodyText: bodyText.slice(0, 5000),
    ctaCount,
    ctaKeywords,
    buttonCount,
    formCount,
    links: {
      internal: internalLinks,
      external: externalLinks,
      total: internalLinks + externalLinks,
    },
    images: {
      total: totalImages,
      withAlt: imagesWithAlt,
      missingAlt: imagesMissingAlt,
      missingAltPercent: Math.round(missingAltPercent * 100) / 100,
      withLazyLoading: imagesWithLazyLoading,
      withDimensions: imagesWithDimensions,
    },
    seo: {
      canonical,
      robotsMeta,
      viewport,
      lang,
      charset,
      favicon: !!favicon,
      schemaOrgTypes,
      twitterCard,
      scriptCount,
      stylesheetCount,
      renderBlockingScripts,
    },
    performance: {
      ttfbMs,
      redirected,
      finalUrl: redirected ? finalUrl : undefined,
      htmlSize: Buffer.byteLength(html, "utf8"),
    },
    dynamicContentSuspected,
  };
}
