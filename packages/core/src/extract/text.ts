import type { CheerioAPI } from "cheerio";

const REMOVE = "nav, header, footer, aside, script, style, svg, noscript, template";

/** Extract readable main text, preferring main/article and removing repeated chrome. */
export function mainText($: CheerioAPI): string {
  const main = $("main").first();
  const article = $("article").first();
  const root = main.length ? main : article.length ? article : $("body");
  const clone = root.clone();
  clone.find(REMOVE).remove();
  return clone.text().replace(/\s+/g, " ").trim();
}

export function wordCount(text: string): number {
  const normalized = text.trim();
  return normalized ? normalized.split(/\s+/).length : 0;
}

export function sentences(text: string): string[] {
  return (text.match(/[^.!?]+[.!?]+|[^.!?]+$/g) ?? [])
    .map((sentence) => sentence.trim())
    .filter(Boolean);
}

export function normalizeText(text: string): string {
  return text
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
