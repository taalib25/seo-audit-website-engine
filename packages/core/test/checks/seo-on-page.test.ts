import { describe, expect, it } from "vitest";
import { titleLength } from "../../src/checks/seo/on-page.ts";
import { page, runPage } from "../helpers.ts";

const html = (title: string) => `<html><head><title>${title}</title></head><body></body></html>`;

describe("seo.title.length", () => {
  it("fails when missing", async () => {
    expect((await runPage(titleLength, page("<html><head></head></html>"))).status).toBe("fail");
  });
  it("warns when too short", async () => {
    expect((await runPage(titleLength, page(html("Home")))).status).toBe("warn");
  });
  it("passes in range", async () => {
    const r = await runPage(titleLength, page(html("Acme Widgets — Industrial Fasteners Since 1990")));
    expect(r.status).toBe("pass");
    expect(r.evidence).toMatchObject({ length: 46 });
  });
  it("ignores <title> inside inline SVG", async () => {
    const r = await runPage(
      titleLength,
      page(`<html><head><title>Acme Widgets — Industrial Fasteners Since 1990</title></head><body><svg><title>logo</title></svg></body></html>`),
    );
    expect(r.evidence).toMatchObject({ count: 1 });
  });
});
