import axios from "axios";
import * as cheerio from "cheerio";
import type { MetricsObject } from "@/types/audit";

const CTA_KEYWORDS = [
  "buy now",
  "sign up",
  "get started",
  "subscribe",
  "download",
  "contact us",
  "learn more",
  "try free",
  "start free trial",
  "request demo",
  "book a call",
  "join now",
  "register",
  "order now",
  "shop now",
  "add to cart",
  "checkout",
];

export async function scrapeUrl(url: string): Promise<MetricsObject> {
  // Fetch HTML
  const { data: html } = await axios.get(url, {
    timeout: 10000,
    headers: {
      "User-Agent":
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
    },
  });

  const $ = cheerio.load(html);

  // Extract meta tags
  const title = $("title").text().trim() || "";
  const description = $('meta[name="description"]').attr("content") || "";
  const keywords = $('meta[name="keywords"]').attr("content") || "";
  const ogTags: Record<string, string> = {};

  $('meta[property^="og:"]').each((_, el) => {
    const prop = $(el).attr("property") || "";
    const content = $(el).attr("content") || "";
    if (prop && content) {
      ogTags[prop.replace("og:", "")] = content;
    }
  });

  // Extract headings
  const headings = {
    h1: $("h1").length,
    h2: $("h2").length,
    h3: $("h3").length,
    h4: $("h4").length,
    h5: $("h5").length,
    h6: $("h6").length,
  };

  // Extract body text and count words
  $("script, style, noscript, iframe").remove();
  const bodyText = $("body").text().trim();
  const wordCount = bodyText
    .split(/\s+/)
    .filter((w) => w.length > 0)
    .length;

  // Extract CTAs
  const ctaKeywords: string[] = [];
  const lowerBody = bodyText.toLowerCase();
  for (const keyword of CTA_KEYWORDS) {
    if (lowerBody.includes(keyword)) {
      ctaKeywords.push(keyword);
    }
  }

  // Also check buttons and links for CTA text
  $("a, button").each((_, el) => {
    const text = $(el).text().trim().toLowerCase();
    for (const keyword of CTA_KEYWORDS) {
      if (text.includes(keyword) && !ctaKeywords.includes(keyword)) {
        ctaKeywords.push(keyword);
      }
    }
  });

  // Extract links
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
    } else {
      externalLinks++;
    }
  });

  // Extract images
  const totalImages = $("img").length;
  let imagesWithAlt = 0;

  $("img").each((_, el) => {
    if ($(el).attr("alt") !== undefined && $(el).attr("alt") !== "") {
      imagesWithAlt++;
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
    wordCount,
    bodyText: bodyText.slice(0, 5000), // Limit for API payload
    ctaCount: ctaKeywords.length,
    ctaKeywords,
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
    },
  };
}
