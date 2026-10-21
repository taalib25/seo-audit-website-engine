import { describe, expect, it } from "vitest";
import {
  schemaArticle,
  schemaBreadcrumb,
  schemaGoogleSupportedType,
  schemaLocalBusiness,
  schemaOrganization,
  schemaProductOffer,
  schemaSyntax,
  schemaTypeValid,
} from "../../../src/checks/schema/index.ts";
import { fixture, page, runPage, runSite, site } from "../../helpers.ts";

const ld = (json: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(json)}</script>`;

const orgPage = (name: string, url = "https://example.com/") =>
  page(
    `<html><head><title>${name}</title><meta property="og:site_name" content="${name}" />${ld({
      "@context": "https://schema.org",
      "@type": "Organization",
      name,
      url: "https://example.com",
      logo: "https://example.com/logo.png",
      sameAs: ["https://www.linkedin.com/company/acme"],
    })}</head><body><h1>${name}</h1></body></html>`,
    { url },
  );

describe("seo.schema.syntax", () => {
  it("passes valid JSON-LD", async () => {
    const r = await runPage(schemaSyntax, page(fixture("schema/organization.html")));
    expect(r.status).toBe("pass");
  });

  it("fails when every block is invalid", async () => {
    const r = await runPage(schemaSyntax, page(fixture("schema/invalid.html")));
    expect(r.status).toBe("fail");
    expect(r.evidence).toMatchObject({ invalidBlocks: 1 });
  });

  it("skips pages without structured data", async () => {
    const r = await runPage(schemaSyntax, page("<html><body><h1>Hi</h1></body></html>"));
    expect(r.status).toBe("skip");
  });
});

describe("seo.schema.type-valid", () => {
  it("fails on a misspelled type", async () => {
    const html = `<html><head>${ld({ "@type": "Organisation", name: "Acme" })}</head><body></body></html>`;
    const r = await runPage(schemaTypeValid, page(html));
    expect(r.status).toBe("fail");
    expect(r.message).toMatch(/Organisation/);
  });

  it("passes the organization fixture", async () => {
    const r = await runPage(schemaTypeValid, page(fixture("schema/organization.html")));
    expect(r.status).toBe("pass");
  });
});

describe("seo.schema.organization", () => {
  it("passes a consistent organization", async () => {
    const r = await runSite(schemaOrganization, site([page(fixture("schema/organization.html"))]));
    expect(r.status).toBe("pass");
  });

  it("fails when the name changes between pages", async () => {
    const r = await runSite(
      schemaOrganization,
      site([orgPage("Acme Robotics"), orgPage("Globex Robotics", "https://example.com/about")]),
    );
    expect(r.status).toBe("fail");
    expect(r.message).toMatch(/conflict/i);
  });

  it("warns when logo and sameAs are missing", async () => {
    const html = `<html><head>${ld({
      "@type": "Organization",
      name: "Acme",
      url: "https://example.com",
    })}</head><body><h1>Acme</h1></body></html>`;
    const r = await runSite(schemaOrganization, site([page(html)]));
    expect(r.status).toBe("warn");
    expect(r.message).toMatch(/logo/);
  });
});

describe("seo.schema.local-business", () => {
  it("passes when markup matches visible facts", async () => {
    const r = await runSite(
      schemaLocalBusiness,
      site([page(fixture("schema/local-business.html"))]),
    );
    expect(r.status).toBe("pass");
  });

  it("fails when the phone is not visible", async () => {
    const html = `<html><head>${ld({
      "@type": "LocalBusiness",
      name: "Acme",
      telephone: "+1 555 999 8888",
      address: { "@type": "PostalAddress", streetAddress: "1 Main St", addressLocality: "Springfield" },
    })}</head><body><h1>Acme</h1><p>1 Main St, Springfield</p></body></html>`;
    const r = await runSite(schemaLocalBusiness, site([page(html)]));
    expect(r.status).toBe("fail");
  });

  it("skips pages without LocalBusiness", async () => {
    const r = await runSite(
      schemaLocalBusiness,
      site([page("<html><body><h1>Acme</h1></body></html>")]),
    );
    expect(r.status).toBe("skip");
  });
});

describe("seo.schema.product-offer", () => {
  it("passes a complete product offer", async () => {
    const r = await runPage(schemaProductOffer, page(fixture("schema/product.html")));
    expect(r.status).toBe("pass");
  });

  it("fails when the offer has no price", async () => {
    const html = `<html><head>${ld({
      "@type": "Product",
      name: "Atlas Gripper",
      image: "https://example.com/a.png",
      description: "Gripper",
      sku: "AG-1",
      offers: { "@type": "Offer", priceCurrency: "USD" },
    })}</head><body><h1>Atlas Gripper</h1></body></html>`;
    const r = await runPage(schemaProductOffer, page(html));
    expect(r.status).toBe("fail");
    expect(r.message).toMatch(/price/i);
  });

  it("skips pages without Product", async () => {
    const r = await runPage(schemaProductOffer, page("<html><body></body></html>"));
    expect(r.status).toBe("skip");
  });
});

describe("seo.schema.breadcrumb", () => {
  it("passes when markup matches the visible trail", async () => {
    const r = await runPage(schemaBreadcrumb, page(fixture("schema/breadcrumb.html")));
    expect(r.status).toBe("pass");
  });

  it("fails on duplicated positions", async () => {
    const html = `<html><head>${ld({
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Home", item: "https://example.com/" },
        { "@type": "ListItem", position: 1, name: "Products", item: "https://example.com/products" },
      ],
    })}</head><body></body></html>`;
    const r = await runPage(schemaBreadcrumb, page(html));
    expect(r.status).toBe("fail");
  });

  it("warns when no breadcrumb markup exists", async () => {
    const r = await runPage(schemaBreadcrumb, page("<html><body></body></html>"));
    expect(r.status).toBe("warn");
  });
});

describe("seo.schema.article", () => {
  it("passes a coherent article", async () => {
    const r = await runPage(schemaArticle, page(fixture("schema/article.html")));
    expect(r.status).toBe("pass");
  });

  it("fails when dateModified precedes datePublished", async () => {
    const html = `<html><head>${ld({
      "@type": "Article",
      headline: "Grippers",
      author: { "@type": "Person", name: "Jane Doe" },
      image: "https://example.com/a.png",
      datePublished: "2026-02-01",
      dateModified: "2026-01-01",
      publisher: { "@type": "Organization", name: "Acme" },
    })}</head><body><h1>Grippers</h1></body></html>`;
    const r = await runPage(schemaArticle, page(html));
    expect(r.status).toBe("fail");
  });

  it("skips pages without Article", async () => {
    const r = await runPage(schemaArticle, page("<html><body></body></html>"));
    expect(r.status).toBe("skip");
  });
});

describe("seo.schema.google-supported-type", () => {
  it("passes a supported Product type", async () => {
    const r = await runPage(schemaGoogleSupportedType, page(fixture("schema/product.html")));
    expect(r.status).toBe("pass");
  });

  it("warns for FAQPage outside authoritative sites", async () => {
    const html = `<html><head>${ld({
      "@type": "FAQPage",
      mainEntity: [{ "@type": "Question", name: "Q", acceptedAnswer: { "@type": "Answer", text: "A" } }],
    })}</head><body></body></html>`;
    const r = await runPage(schemaGoogleSupportedType, page(html));
    expect(r.status).toBe("warn");
    expect(r.message).toMatch(/FAQ/);
  });
});
