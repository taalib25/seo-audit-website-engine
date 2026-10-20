import { describe, expect, it } from "vitest";
import { matchRobots, parseRobots } from "../../src/extract/robots.ts";

describe("robots.txt parser and matcher", () => {
  it("joins consecutive groups for the same matching agent and honors product-token matching", () => {
    const d = parseRobots(
      "User-agent: GPTBot\nDisallow: /private\n\nUser-agent: OAI-SearchBot\nAllow: /\n\nUser-agent: GPTBot\nAllow: /public",
    );
    expect(
      matchRobots(d, "Mozilla GPTBot/1.0", "https://example.com/private/a")
        .allowed,
    ).toBe(false);
    expect(
      matchRobots(d, "GPTBot", "https://example.com/public/a").allowed,
    ).toBe(true);
    expect(
      matchRobots(d, "OAI-SearchBot", "https://example.com/private").allowed,
    ).toBe(true);
  });
  it("uses longest match, with Allow winning equal-length ties", () => {
    const d = parseRobots(
      "User-agent: *\nDisallow: /\nAllow: /public\nDisallow: /public/private\nDisallow: /tie\nAllow: /tie",
    );
    expect(
      matchRobots(d, "Googlebot", "https://example.com/public/a").allowed,
    ).toBe(true);
    expect(matchRobots(d, "Googlebot", "https://example.com/tie").allowed).toBe(
      true,
    );
    const m = matchRobots(
      d,
      "Googlebot",
      "https://example.com/public/private/a",
    );
    expect(m.allowed).toBe(false);
    expect(m.rule?.path).toBe("/public/private");
  });
  it("uses case-insensitive product tokens and merges matching groups", () => {
    const d = parseRobots(
      "User-agent: gPtBoT\nDisallow: /private\n\nUser-agent: GPTBOT\nAllow: /private/public",
    );
    expect(
      matchRobots(d, "Mozilla GPTBot/1.0", "https://example.com/private")
        .allowed,
    ).toBe(false);
    expect(
      matchRobots(d, "gptbot", "https://example.com/private/public").allowed,
    ).toBe(true);
  });
  it("supports wildcard and end-anchor patterns including query strings", () => {
    const d = parseRobots(
      "User-agent: *\nDisallow: /*?sort=*\nDisallow: /draft$",
    );
    expect(
      matchRobots(d, "Bot", "https://example.com/items?sort=price").allowed,
    ).toBe(false);
    expect(matchRobots(d, "Bot", "https://example.com/draft").allowed).toBe(
      false,
    );
    expect(
      matchRobots(d, "Bot", "https://example.com/draft/child").allowed,
    ).toBe(true);
  });
  it("collects sitemap lines and reports malformed directives", () => {
    const d = parseRobots(
      "Sitemap: https://example.com/map.xml\nAllow: /x\nUser-agent:\nUser-agent: *\nDisallow: /tmp",
    );
    expect(d.sitemaps).toEqual(["https://example.com/map.xml"]);
    expect(d.errors).toHaveLength(2);
    expect(matchRobots(d, "Crawler", "https://example.com/tmp").allowed).toBe(
      false,
    );
  });
  it("ignores invalid lines and strips a leading BOM", () => {
    const d = parseRobots(
      "\uFEFFUser-agent: *\nDisallow: /private\nnot a directive\nAllow\n",
    );
    expect(d.groups).toHaveLength(1);
    expect(d.groups[0]?.rules.map((rule) => rule.path)).toEqual(["/private"]);
    expect(d.errors).toContain("Line 3: missing colon");
    expect(
      matchRobots(d, "OtherBot", "https://example.com/private").allowed,
    ).toBe(false);
  });
  it("allows everything when there is no matching group or no matching rule", () => {
    const d = parseRobots("User-agent: Bot\nDisallow: /private");
    expect(matchRobots(d, "Other", "https://example.com/private").allowed).toBe(
      true,
    );
    expect(matchRobots(d, "Bot", "https://example.com/public").allowed).toBe(
      true,
    );
  });
});
