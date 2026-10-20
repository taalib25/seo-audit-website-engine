import type { CheerioAPI } from "cheerio";
import { definePageCheck, fail, pass, warn } from "../../check.ts";

function imageRows($: CheerioAPI) {
  return $("img").toArray().map((element) => ({
    src: $(element).attr("src") ?? "",
    alt: $(element).attr("alt"),
    decorative: $(element).attr("role") === "presentation" || $(element).attr("aria-hidden") === "true",
    width: $(element).attr("width") ?? "",
    height: $(element).attr("height") ?? "",
    aspectRatio: $(element).css("aspect-ratio") || "",
  }));
}

export const altMissing = definePageCheck({
  id: "seo.media.alt.missing",
  title: "Informative images have alt text",
  pillar: "seo",
  category: "media",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html"],
  rationale: "Alt text supports accessibility and image understanding.",
  run: ({ raw, dom }) => {
    const images = imageRows(dom());
    const missing = images.filter((image) => image.alt === undefined && !image.decorative);
    const rawMissing = imageRows(raw()).filter((image) => image.alt === undefined && !image.decorative);
    const rate = images.length ? missing.length / images.length : 0;
    const evidence = { imageCount: images.length, missingCount: missing.length, missing: missing.slice(0, 25), rawMissing: rawMissing.slice(0, 25) };
    const fix = { summary: "Describe informative images with concise alt text and use alt=\"\" for decorative images." };
    if (rate > 0.05) return fail(`${missing.length} of ${images.length} images lack alt text.`, { evidence, fix });
    if (missing.length) return warn(`${missing.length} image(s) lack alt text.`, { evidence, fix });
    return pass("All images declare alt text or are explicitly decorative.", { evidence });
  },
});

export const imageFetchable = definePageCheck({
  id: "seo.media.image.fetchable",
  title: "Important image URLs are crawlable",
  pillar: "seo",
  category: "media",
  kind: "deterministic",
  severity: "medium",
  weight: 3,
  requires: ["raw-html", "headers", "robots"],
  rationale: "Crawlers must access images used to understand or display pages.",
  run: ({ raw, page }) => {
    const urls = raw()("img[src]").map((_, element) => raw()(element).attr("src") ?? "").get().map((source) => {
      try { return new URL(source, page.url).href; } catch { return source; }
    });
    const invalid = urls.filter((url) => !/^https?:\/\//i.test(url));
    const evidence = { imageCount: urls.length, invalidOrUnresolvable: invalid.slice(0, 30) };
    const fix = { summary: "Use absolute or valid relative HTTP(S) image URLs that crawlers can fetch." };
    return invalid.length
      ? warn(`${invalid.length} image URL(s) are invalid or unsupported.`, { evidence, fix })
      : pass("Image URLs use fetchable HTTP(S) schemes.", { evidence });
  },
});

export const imageDimensions = definePageCheck({
  id: "seo.media.image.dimensions",
  title: "Images reserve layout space",
  pillar: "seo",
  category: "media",
  kind: "deterministic",
  severity: "low",
  weight: 2,
  requires: ["raw-html"],
  rationale: "Reserved dimensions reduce layout shifts.",
  run: ({ raw, dom }) => {
    const images = imageRows(dom());
    const missing = images.filter((image) => !(Number(image.width) > 0 && Number(image.height) > 0) && !image.aspectRatio);
    const rate = images.length ? missing.length / images.length : 0;
    const evidence = { imageCount: images.length, withoutDimensions: missing.length, examples: missing.slice(0, 25), raw: imageRows(raw()).slice(0, 25) };
    const fix = { summary: "Set intrinsic width and height attributes or a CSS aspect-ratio for each image." };
    if (rate > 0.2) return fail(`${Math.round((1 - rate) * 100)}% of images reserve layout space.`, { evidence, fix });
    if (rate > 0.05) return warn(`${Math.round((1 - rate) * 100)}% of images reserve layout space.`, { evidence, fix });
    return pass("At least 95% of images reserve layout space.", { evidence });
  },
});

export const videoIndexable = definePageCheck({
  id: "seo.media.video.indexable",
  title: "Video has a crawlable landing page",
  pillar: "seo",
  category: "media",
  kind: "deterministic",
  severity: "medium",
  weight: 2,
  requires: ["raw-html", "headers"],
  rationale: "Accessible context supports discovery and understanding of video.",
  run: ({ raw, dom, page }) => {
    const videos = raw()("video, iframe[src*='youtube'], iframe[src*='vimeo']").toArray().map((element) => ({
      src: raw()(element).attr("src") ?? raw()(element).find("source").attr("src") ?? "",
      title: raw()(element).attr("title") ?? "",
    }));
    const $ = dom();
    const content = $("main,article,body").first();
    const text = content.text().replace(/\s+/g, " ").trim();
    const hasContext = text.length > 30 && content.find("h1,h2,h3,h4,h5,h6").length > 0;
    const inaccessible = videos.filter((video) => {
      if (!video.src) return false;
      try { return !/^https?:$/.test(new URL(video.src, page.url).protocol); } catch { return true; }
    });
    const evidence = { videos: videos.slice(0, 20), visibleContext: hasContext, contextExcerpt: text.slice(0, 250), inaccessible: inaccessible.slice(0, 10) };
    const fix = { summary: "Place important video on a live landing page with a visible title, description, and accessible source." };
    if (!videos.length) return pass("No embedded video detected; check does not apply.", { evidence });
    if (inaccessible.length) return fail("Video source is not fetchable over HTTP(S).", { evidence, fix });
    if (!hasContext) return fail("Video has no visible descriptive landing page context.", { evidence, fix });
    if (videos.some((video) => !video.title)) return warn("Video is embedded but one or more embeds lack a title.", { evidence, fix });
    return pass("Embedded video has fetchable source and visible context.", { evidence });
  },
});

export const mediaChecks = [altMissing, imageFetchable, imageDimensions, videoIndexable];
