import {
  definePageCheck,
  defineSiteCheck,
  fail,
  pass,
  skip,
  warn,
} from "../../check.ts";
import type { PageCheck, SiteCheck } from "../../check.ts";
import { header } from "../../extract/headers.ts";
import type { PageSnapshot, SiteSnapshot } from "../../snapshot.ts";
import { pageMeta, siteMeta } from "./shared.ts";

export const securityChecks: SiteCheck[] = [
  defineSiteCheck({
    ...siteMeta(
      "security.https",
      "Canonical site uses HTTPS",
      "security",
      "critical",
      5,
      ["headers", "crawl-graph"],
      "Secure transport protects users and is a lightweight Google signal.",
      "https://developers.google.com/search/docs/appearance/ranking-systems-guide#https",
    ),
    run: ({ site: s }) => {
      if (!s.pages.length)
        return skip("No crawled pages are available to evaluate HTTPS.");
      const http = s.pages.filter(
        (p) => new URL(p.finalUrl).protocol !== "https:",
      );
      const errors = s.pages.filter((p) => p.status < 200 || p.status >= 300);
      const missingRedirect = s.pages.filter(
        (p) =>
          new URL(p.url).protocol === "http:" &&
          p.finalUrl !== p.url &&
          p.redirectChain.length === 0,
      );
      const ev = {
        sampled: s.pages.length,
        httpUrls: http.map((p) => ({
          url: p.finalUrl,
          status: p.status,
          redirects: p.redirectChain,
        })),
        unsuccessful: errors.map((p) => ({
          url: p.finalUrl,
          status: p.status,
        })),
        httpRequestsWithoutObservedRedirect: missingRedirect.map((p) => p.url),
      };
      if (http.length || errors.length)
        return fail(
          "Sampled pages include an HTTP final URL or unsuccessful response.",
          {
            evidence: ev,
            fix: { summary: "Install valid TLS and redirect HTTP to HTTPS." },
          },
        );
      if (missingRedirect.length)
        return warn(
          "HTTP requests reached HTTPS without an observed redirect chain.",
          { evidence: ev },
        );
      return pass(
        "Sampled pages return successful HTTPS responses; observed HTTP requests include redirect evidence.",
        { evidence: ev },
      );
    },
  }),
  defineSiteCheck({
    ...siteMeta(
      "security.hsts",
      "HSTS enabled on HTTPS host",
      "security",
      "medium",
      2,
      ["headers"],
      "HSTS tells browsers to use HTTPS on future visits.",
      "https://cheatsheetseries.owasp.org/cheatsheets/HTTP_Strict_Transport_Security_Cheat_Sheet.html",
    ),
    run: ({ site: s }) => {
      if (!s.pages.length)
        return skip("No crawled page headers are available to evaluate HSTS.");
      const value = header(
        s.pages[0]?.headers ?? {},
        "strict-transport-security",
      );
      const age = Number(value?.match(/max-age\s*=\s*(\d+)/i)?.[1]);
      const ev = { value, maxAge: Number.isFinite(age) ? age : undefined };
      if (age >= 15552000)
        return pass("HSTS max-age meets the six-month target.", {
          evidence: ev,
        });
      if (age > 0)
        return warn("HSTS is present with a shorter max-age.", {
          evidence: ev,
        });
      return fail("HSTS is absent or invalid.", {
        evidence: ev,
        fix: {
          summary: "Enable HSTS after confirming HTTPS coverage.",
          snippet:
            "Strict-Transport-Security: max-age=15552000; includeSubDomains",
        },
      });
    },
  }),
  defineSiteCheck({
    ...siteMeta(
      "security.csp",
      "Content Security Policy present",
      "security",
      "low",
      1,
      ["headers"],
      "CSP reduces some injection risks and supports site integrity.",
      "https://cheatsheetseries.owasp.org/cheatsheets/Content_Security_Policy_Cheat_Sheet.html",
    ),
    run: ({ site: s }) => {
      if (!s.pages.length)
        return skip("No crawled page headers are available to evaluate CSP.");
      const h = s.pages[0]?.headers ?? {};
      const enforced = header(h, "content-security-policy");
      const report = header(h, "content-security-policy-report-only");
      return enforced
        ? pass("Enforced Content-Security-Policy header is present.", {
            evidence: { policy: enforced },
          })
        : report
          ? warn("Only a report-only CSP is present.", {
              evidence: { reportOnly: report },
            })
          : fail("No CSP header was found.", {
              fix: {
                summary: "Deploy a tested restrictive policy incrementally.",
              },
            });
    },
  }),
  defineSiteCheck({
    ...siteMeta(
      "security.headers.disclosure",
      "Server does not expose unnecessary version details",
      "security",
      "low",
      1,
      ["headers"],
      "Reduces avoidable technology fingerprinting.",
      "https://owasp.org/www-project-secure-headers/",
    ),
    run: ({ site: s }) => {
      if (!s.pages.length)
        return skip(
          "No crawled page headers are available for disclosure checks.",
        );
      const disclosed = s.pages.flatMap((p) =>
        ["server", "x-powered-by"].flatMap((k) => {
          const v = header(p.headers, k);
          return v ? [{ url: p.finalUrl, header: k, value: v }] : [];
        }),
      );
      const precise = disclosed.filter(
        (x) =>
          /\d+\.\d+(?:\.\d+)?/.test(x.value) || x.header === "x-powered-by",
      );
      if (precise.length)
        return fail(
          "Version or framework details are exposed in response headers.",
          {
            evidence: { disclosed, precise },
            fix: {
              summary: "Remove detailed version headers at the edge or server.",
            },
          },
        );
      return disclosed.length
        ? warn("A generic Server header is exposed.", {
            evidence: { disclosed },
          })
        : pass("No Server or X-Powered-By header was found.");
    },
  }),
];

export const mixedContent = definePageCheck({
  ...pageMeta(
    "security.mixed-content",
    "HTTPS page has no HTTP active content",
    "security",
    "high",
    3,
    ["raw-html"],
    "Mixed content can be blocked and breaks secure-page behavior.",
    "https://developer.mozilla.org/en-US/docs/Web/Security/Mixed_content",
  ),
  run: ({ page: p, raw, dom }) => {
    const $ = p.renderedHtml ? dom() : raw();
    const urls = $(
      "script[src],link[href],iframe[src],img[src],source[src],video[src],audio[src]",
    )
      .toArray()
      .flatMap((el) => {
        const v = $(el).attr("src") ?? $(el).attr("href");
        return v?.startsWith("http://") ? [{ tag: el.tagName, url: v }] : [];
      });
    const active = urls.filter((x) =>
      ["script", "link", "iframe"].includes(x.tag),
    );
    const evidence = { resources: urls, activeCount: active.length };
    if (active.length || urls.length > 5)
      return fail("HTTP active content or many HTTP resources were found.", {
        evidence,
        fix: { summary: "Serve all resources over HTTPS." },
      });
    if (urls.length)
      return warn("HTTP passive image or media resources were found.", {
        evidence,
      });
    return pass("No HTTP resource URLs were found.", { evidence });
  },
});

export const securityChecksWithMixedContent = [...securityChecks, mixedContent];
