import * as cheerio from "cheerio";
import { describe, expect, it } from "vitest";
import {
  detectStructuredDataMarkup,
  extractJsonLd,
  findNodes,
  getAbsoluteUrl,
  getNumber,
  getString,
  getStringArray,
  nodeTypes,
} from "../../src/extract/jsonld.ts";

const load = (html: string) => cheerio.load(html);
const block = (json: string) => `<script type="application/ld+json">${json}</script>`;

describe("extractJsonLd", () => {
  it("flattens @graph and array types", () => {
    const $ = load(
      block(
        JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "Organization", name: "Acme" },
            { "@type": ["WebSite", "CreativeWork"], name: "Acme site" },
          ],
        }),
      ),
    );
    const doc = extractJsonLd($);
    expect(doc.blocks).toHaveLength(1);
    expect(doc.nodes).toHaveLength(2);
    expect(findNodes(doc.nodes, "Organization")).toHaveLength(1);
    expect(findNodes(doc.nodes, "CreativeWork")).toHaveLength(1);
    expect(getString(findNodes(doc.nodes, "Organization")[0]!, "name")).toBe("Acme");
  });

  it("keeps good blocks when another block is broken", () => {
    const $ = load(`${block("{ nope ")}${block(JSON.stringify({ "@type": "Product", name: "Gripper" }))}`);
    const doc = extractJsonLd($);
    expect(doc.blocks).toHaveLength(2);
    expect(doc.invalidCount).toBe(1);
    expect(doc.validCount).toBe(1);
    expect(doc.errors[0]?.index).toBe(0);
    expect(doc.nodes).toHaveLength(1);
  });

  it("decodes entities and strips comments/CDATA wrappers", () => {
    const $ = load(
      block(`<!-- ${JSON.stringify({ "@type": "Organization", name: "A &amp; B" })} -->`),
    );
    const doc = extractJsonLd($);
    expect(doc.invalidCount).toBe(0);
    expect(getString(doc.nodes[0]!, "name")).toBe("A & B");
  });

  it("reports an empty document instead of throwing", () => {
    const doc = extractJsonLd(load("<html><body>No markup</body></html>"));
    expect(doc.blocks).toHaveLength(0);
    expect(doc.nodes).toHaveLength(0);
    expect(doc.invalidCount).toBe(0);
  });
});

describe("structured data accessors", () => {
  it("reads wrapped values, arrays and numbers", () => {
    const node = {
      "@type": "Product",
      name: { "@value": "Atlas" },
      image: ["https://example.com/a.png"],
      offers: { "@type": "Offer", price: "249.00", priceCurrency: "USD" },
      sameAs: "https://example.com/profile",
    };
    expect(getString(node, "name")).toBe("Atlas");
    expect(getStringArray(node, "image")).toEqual(["https://example.com/a.png"]);
    expect(getStringArray(node, "sameAs")).toEqual(["https://example.com/profile"]);
    expect(getNumber(node, "offers")).toBeUndefined();
    expect(getString(node, "offers")).toBeUndefined();
    expect(nodeTypes(node)).toEqual(["Product"]);
  });

  it("resolves relative URLs and rejects javascript: URLs", () => {
    expect(getAbsoluteUrl("/about", "https://example.com/a/b")).toBe("https://example.com/about");
    expect(getAbsoluteUrl("javascript:void(0)", "https://example.com")).toBeUndefined();
    expect(getAbsoluteUrl(undefined, "https://example.com")).toBeUndefined();
  });
});

describe("detectStructuredDataMarkup", () => {
  it("finds Microdata and RDFa terms", () => {
    const $ = load(`
      <div itemscope itemtype="https://schema.org/Product">
        <span itemprop="name">Atlas</span>
      </div>
      <div vocab="https://schema.org/" typeof="Organization">
        <span property="name">Acme</span>
      </div>
    `);
    const markup = detectStructuredDataMarkup($);
    expect(markup.types).toContain("Product");
    expect(markup.types).toContain("Organization");
    expect(markup.microdataProperties).toContain("name");
    expect(markup.rdfaProperties).toContain("name");
  });
});
