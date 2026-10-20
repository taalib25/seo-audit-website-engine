import { describe, expect, it } from "vitest";
import {
  entityAboutContact,
  entityAuthorIdentification,
  entityContactConsistency,
  entityNameConsistency,
  entitySameAs,
} from "../../../src/checks/geo/index.ts";
import { fixture, page, runPage, runSite, site } from "../../helpers.ts";

const ld = (json: unknown) =>
  `<script type="application/ld+json">${JSON.stringify(json)}</script>`;

const orgPage = (name: string, url = "https://example.com/") =>
  page(
    `<html><head><title>${name}</title><meta property="og:site_name" content="${name}" />${ld({
      "@type": "Organization",
      name,
      url: "https://example.com",
      sameAs: ["https://www.linkedin.com/company/acme"],
    })}</head><body><h1>${name}</h1></body></html>`,
    { url },
  );

const contactPage = (phone: string, email: string, url = "https://example.com/") =>
  page(
    `<html><head>${ld({
      "@type": "Organization",
      name: "Acme",
      telephone: phone,
      email,
      url: "https://example.com",
    })}</head><body><p>Call ${phone}</p><p>${email}</p><h1>Acme</h1></body></html>`,
    { url },
  );

describe("geo.entity.name-consistency", () => {
  it("passes when every page uses one name", async () => {
    const r = await runSite(
      entityNameConsistency,
      site([orgPage("Acme Robotics"), orgPage("Acme Robotics", "https://example.com/about")]),
    );
    expect(r.status).toBe("pass");
  });

  it("fails when names diverge", async () => {
    const r = await runSite(
      entityNameConsistency,
      site([orgPage("Acme Robotics"), orgPage("Globex Robotics", "https://example.com/about")]),
    );
    expect(r.status).toBe("fail");
  });

  it("warns when no name is available", async () => {
    const r = await runSite(
      entityNameConsistency,
      site([page("<html><head></head><body></body></html>")]),
    );
    expect(r.status).toBe("warn");
  });
});

describe("geo.entity.contact-consistency", () => {
  it("passes identical visible contact details", async () => {
    const r = await runSite(
      entityContactConsistency,
      site([
        contactPage("+1 555 010 1234", "hello@acme.com"),
        contactPage("+1 555 010 1234", "hello@acme.com", "https://example.com/about"),
      ]),
    );
    expect(r.status).toBe("pass");
  });

  it("fails conflicting phone numbers", async () => {
    const r = await runSite(
      entityContactConsistency,
      site([
        contactPage("+1 555 010 1234", "hello@acme.com"),
        contactPage("+1 555 999 0000", "hello@acme.com", "https://example.com/about"),
      ]),
    );
    expect(r.status).toBe("fail");
  });

  it("warns when contact markup is absent", async () => {
    const r = await runSite(
      entityContactConsistency,
      site([page("<html><body><h1>Acme</h1></body></html>")]),
    );
    expect(r.status).toBe("warn");
  });
});

describe("geo.entity.about-contact", () => {
  const links = [
    { from: "https://example.com/", to: "https://example.com/about", anchor: "About", nofollow: false },
    { from: "https://example.com/", to: "https://example.com/contact", anchor: "Contact", nofollow: false },
  ];

  it("passes when both are one click from home", async () => {
    const r = await runSite(
      entityAboutContact,
      site(
        [
          page("<html><body><h1>Home</h1></body></html>", { url: "https://example.com/" }),
          page("<html><body><h1>About</h1></body></html>", { url: "https://example.com/about" }),
          page("<html><body><h1>Contact</h1></body></html>", { url: "https://example.com/contact" }),
        ],
        { links },
      ),
    );
    expect(r.status).toBe("pass");
  });

  it("fails when the pages cannot be reached", async () => {
    const r = await runSite(
      entityAboutContact,
      site([
        page("<html><body><h1>Home</h1></body></html>", { url: "https://example.com/" }),
        page("<html><body><h1>About</h1></body></html>", { url: "https://example.com/about" }),
        page("<html><body><h1>Contact</h1></body></html>", { url: "https://example.com/contact" }),
      ]),
    );
    expect(r.status).toBe("fail");
  });
});

describe("geo.entity.author-identification", () => {
  it("passes an author with a profile URL", async () => {
    const r = await runPage(entityAuthorIdentification, page(fixture("schema/article.html")));
    expect(r.status).toBe("pass");
  });

  it("warns when the author has no profile URL", async () => {
    const html = `<html><head>${ld({
      "@type": "Article",
      headline: "Grippers",
      author: { "@type": "Person", name: "Jane Doe" },
    })}</head><body><h1>Grippers</h1></body></html>`;
    const r = await runPage(entityAuthorIdentification, page(html));
    expect(r.status).toBe("warn");
  });

  it("fails when the author is missing", async () => {
    const html = `<html><head>${ld({ "@type": "Article", headline: "Grippers" })}</head><body><h1>Grippers</h1></body></html>`;
    const r = await runPage(entityAuthorIdentification, page(html));
    expect(r.status).toBe("fail");
  });
});

describe("geo.entity.sameas", () => {
  it("passes with two independent profiles", async () => {
    const r = await runSite(entitySameAs, site([page(fixture("schema/organization.html"))]));
    expect(r.status).toBe("pass");
  });

  it("fails on self-referential sameAs", async () => {
    const html = `<html><head>${ld({
      "@type": "Organization",
      name: "Acme",
      sameAs: ["https://example.com/about"],
    })}</head><body></body></html>`;
    const r = await runSite(entitySameAs, site([page(html)]));
    expect(r.status).toBe("fail");
  });

  it("warns with a single profile", async () => {
    const html = `<html><head>${ld({
      "@type": "Organization",
      name: "Acme",
      sameAs: ["https://www.linkedin.com/company/acme"],
    })}</head><body></body></html>`;
    const r = await runSite(entitySameAs, site([page(html)]));
    expect(r.status).toBe("warn");
  });
});
