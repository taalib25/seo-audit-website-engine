import { describe, expect, it } from "vitest";
import { computeAgentView } from "../src/index.ts";
import { geoAgentViewCoverage } from "../src/checks/geo/index.ts";
import type { PageSnapshot } from "../src/snapshot.ts";
import { page, runSite, site } from "./helpers.ts";

const FULL_HTML = `<!doctype html><html lang="en"><head><title>Server rendered</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"WebPage","name":"Server rendered"}</script></head><body><main><h1>Server rendered page</h1><p>This paragraph is present in the served HTML so every crawler can read it.</p><h2>Pricing</h2><p>Plans start at nine dollars per month and include email support.</p><a href="/pricing">Pricing</a></main></body></html>`;

const SHELL_HTML = `<!doctype html><html><head><title>App</title></head><body><div id="app"></div></body></html>`;

const allowAll = { url: "https://example.com/robots.txt", status: 200, body: "User-agent: *\nAllow: /" };

function ssrPage(over: Partial<PageSnapshot> = {}): PageSnapshot {
  return page(FULL_HTML, over);
}

function shellPage(): PageSnapshot {
  return page(SHELL_HTML, { renderedHtml: FULL_HTML });
}

describe("computeAgentView", () => {
  it("sees the full server-rendered page as every agent", () => {
    const view = computeAgentView(site([ssrPage()], { robotsTxt: allowAll }));
    expect(view.agents).toHaveLength(13);
    expect(view.estimated).toBe(true);
    expect(view.pages).toHaveLength(13);
    for (const row of view.pages) {
      expect(row.allowedByRobots).toBe(true);
      expect(row.coverage).toBe(1);
      expect(row.wordsTotal).toBeGreaterThan(0);
      expect(row.excerpt.length).toBeLessThanOrEqual(400);
    }
    expect(view.pages.every((row) => row.jsonLdSeen)).toBe(true);
    expect(view.agents.find((agent) => agent.agent === "Googlebot")?.executesJs).toBe(true);
  });

  it("shows the raw-HTML gap for a client-rendered shell", () => {
    const view = computeAgentView(site([shellPage()], { robotsTxt: allowAll }));
    expect(view.estimated).toBe(false);
    const search = view.pages.find((row) => row.agent === "OAI-SearchBot");
    const browser = view.pages.find((row) => row.agent === "browser");
    expect(search?.coverage).toBe(0);
    expect(search?.wordsSeen).toBe(0);
    expect(search?.excerpt).toBe("");
    expect(search?.missing).toContain("Server rendered page");
    expect(browser?.coverage).toBe(1);
    expect(browser?.wordsSeen).toBe(search?.wordsTotal);
    expect(view.agents.find((agent) => agent.agent === "OAI-SearchBot")?.coverage).toBe(0);
  });

  it("marks a robots-blocked agent as seeing nothing", () => {
    const view = computeAgentView(
      site([ssrPage()], {
        robotsTxt: { url: "https://example.com/robots.txt", status: 200, body: "User-agent: GPTBot\nDisallow: /" },
      }),
    );
    const gptBot = view.pages.find((row) => row.agent === "GPTBot");
    const oai = view.pages.find((row) => row.agent === "OAI-SearchBot");
    expect(gptBot?.allowedByRobots).toBe(false);
    expect(gptBot?.coverage).toBe(0);
    expect(gptBot?.wordsSeen).toBe(0);
    expect(oai?.allowedByRobots).toBe(true);
    expect(oai?.coverage).toBe(1);
    expect(view.agents.find((agent) => agent.agent === "GPTBot")).toMatchObject({
      coverage: 0,
      pagesBlocked: 1,
    });
  });
});

describe("geo.agent-view.coverage", () => {
  it("passes a fully server-rendered page", async () => {
    const result = await runSite(
      geoAgentViewCoverage,
      site([ssrPage()], { robotsTxt: allowAll }),
    );
    expect(result.status).toBe("pass");
    expect(result.score).toBe(1);
  });

  it("fails a JS shell and names the missing content", async () => {
    const result = await runSite(
      geoAgentViewCoverage,
      site([shellPage()], { robotsTxt: allowAll }),
    );
    expect(result.status).toBe("fail");
    expect(result.message).toContain("0%");
    expect(result.evidence?.agents).toBeInstanceOf(Array);
    expect(result.fix?.summary).toContain("Server rendered page");
  });

  it("fails when a retrieval bot is blocked", async () => {
    const result = await runSite(
      geoAgentViewCoverage,
      site([ssrPage()], {
        robotsTxt: { url: "https://example.com/robots.txt", status: 200, body: "User-agent: OAI-SearchBot\nDisallow: /" },
      }),
    );
    expect(result.status).toBe("fail");
    expect(result.fix?.summary).toContain("OAI-SearchBot");
  });

  it("skips without robots.txt", async () => {
    const result = await runSite(geoAgentViewCoverage, site([ssrPage()]));
    expect(result.status).toBe("skip");
  });
});
