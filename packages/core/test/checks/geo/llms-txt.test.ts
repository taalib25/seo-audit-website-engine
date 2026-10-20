import { describe, expect, it } from "vitest";
import { llmsTxtAvailable, llmsTxtFormat } from "../../../src/checks/geo/index.ts";
import { fixture, page, runSite, site } from "../../helpers.ts";

const withLlms = (status: number, body: string) =>
  site([page("<html><body><h1>Acme</h1></body></html>")], {
    llmsTxt: { url: "https://example.com/llms.txt", status, body },
  });

describe("geo.llms-txt.available", () => {
  it("passes when published", async () => {
    const r = await runSite(llmsTxtAvailable, withLlms(200, fixture("geo/llms-valid.txt")));
    expect(r.status).toBe("pass");
  });

  it("warns when absent", async () => {
    const r = await runSite(
      llmsTxtAvailable,
      site([page("<html><body><h1>Acme</h1></body></html>")]),
    );
    expect(r.status).toBe("warn");
    expect(r.fix?.snippetLang).toBe("markdown");
  });

  it("fails on a non-2xx response", async () => {
    const r = await runSite(llmsTxtAvailable, withLlms(404, ""));
    expect(r.status).toBe("fail");
  });

  it("fails on an empty body", async () => {
    const r = await runSite(llmsTxtAvailable, withLlms(200, "   \n"));
    expect(r.status).toBe("fail");
  });
});

describe("geo.llms-txt.format", () => {
  it("passes a conventional file", async () => {
    const r = await runSite(llmsTxtFormat, withLlms(200, fixture("geo/llms-valid.txt")));
    expect(r.status).toBe("pass");
  });

  it("fails without an H1", async () => {
    const r = await runSite(llmsTxtFormat, withLlms(200, fixture("geo/llms-invalid.txt")));
    expect(r.status).toBe("fail");
  });

  it("warns on relative links", async () => {
    const r = await runSite(llmsTxtFormat, withLlms(200, fixture("geo/llms-warn.txt")));
    expect(r.status).toBe("warn");
  });

  it("skips when llms.txt is absent", async () => {
    const r = await runSite(
      llmsTxtFormat,
      site([page("<html><body><h1>Acme</h1></body></html>")]),
    );
    expect(r.status).toBe("skip");
  });
});
