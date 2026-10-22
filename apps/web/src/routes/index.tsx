import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, ArrowUpRight, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";

import { CrawlAnimation } from "../components/CrawlAnimation";
import { BuilderCredit } from "../components/BuilderCredit";
import { AuditCoverage } from "../components/AuditCoverage";
import { AgentLens } from "../components/AgentLens";

const createdAudit = z.object({ id: z.string() });
const auditError = z.object({ error: z.string() });

const faqs = [
  { q: "What does the audit check?", a: "It checks search foundations, page answer structure, structured data, and crawler access from a crawl snapshot. Optional AI checks are separate; the standard audit does not need them." },
  { q: "What does the report tell me?", a: "It includes findings, the captured evidence, suggested fixes, and checks you can run again to verify changes. Rendered-page comparisons are available when rendering is enabled." },
  { q: "Does this predict rankings or AI citations?", a: "No. It reports what the captured pages and policies show. It does not observe vendor crawlers or guarantee rankings, mentions, or citations." },
] as const;

function faqJsonLd() {
  return JSON.stringify({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: { "@type": "Answer", text: a },
    })),
  });
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signal / Audit — Website SEO and AI readiness audit" },
      { name: "description", content: "Audit a website's search foundations, answer structure, structured data, and crawler access. Review evidence and suggested fixes." },
      { property: "og:title", content: "Signal / Audit — Website audit" },
      { property: "og:description", content: "Review search foundations, answer structure, structured data, and crawler access with evidence-backed findings." },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [
      { type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Signal / Audit", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "Audit technical SEO, answer engine readiness, and generative search visibility.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }) },
      { type: "application/ld+json", children: faqJsonLd() },
    ],
  }),
  component: Home,
});

const pillars = [
  { name: "SEO", label: "Search foundations", description: "Titles, crawl rules, links, sitemaps, and page structure.", tags: ["Metadata", "Crawlability", "Sitemaps"] },
  { name: "AEO", label: "Page answers", description: "Question headings, clear answers, and FAQ structure.", tags: ["Answer structure", "Clarity", "Headings"] },
  { name: "GEO", label: "Identity and access", description: "Organization details, structured data, and crawler access rules.", tags: ["Entities", "Structured data", "AI crawlers"] },
];

function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const site = url.trim();
      const response = await fetch("/api/audits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: site.includes("://") ? site : `https://${site}` }) });
      const data: unknown = await response.json();
      if (!response.ok) {
        const error = auditError.safeParse(data);
        throw new Error(error.success ? error.data.error : "Audit could not be started. Try again shortly.");
      }
      const result = createdAudit.parse(data);
      await navigate({ to: "/audit/$id", params: { id: result.id } });
    } catch (e) { setError(e instanceof Error ? e.message : "Audit could not be started."); setBusy(false); }
  }

  return <main className="landing">
    <div className="page-width">
      <header className="site-head">
        <a href="/" className="wordmark" aria-label="Signal Audit home">Signal<span className="wordmark-slash">/</span>Audit</a>
        <nav aria-label="Main navigation">
          <a className="nav-quiet link-underline" href="#how">How it works</a>
          <a className="btn btn--ink btn--sm btn--nav" href="/audit/demo">Sample report <ArrowUpRight size={15}/></a>
        </nav>
      </header>
    </div>

    <section className="hero">
      <div className="page-width hero-layout"><div className="hero-copy">
        <p className="kicker kicker--blue">Website audit</p>
        <h1 className="display">See your site<br/><span className="line-blue">the way AI does.</span><span className="hero-asterisk" aria-hidden="true">✳</span></h1>
        <p className="hero-intro">Check search foundations, page answers, structured data, and crawler access. Get findings with evidence and suggested fixes.</p>

        <form onSubmit={submit} className="audit-form" aria-label="Start a website audit">
          <label htmlFor="site-url" className="audit-label">Website URL</label>
          <div className="audit-input-row">
            <input id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder="yourwebsite.com" aria-describedby={error ? "audit-error" : "audit-note"} aria-invalid={Boolean(error)} required/>
            <button className="btn btn--blue btn--md" disabled={busy}>{busy ? <><LoaderCircle size={17} className="animate-spin"/>Starting…</> : <>Start audit <ArrowRight size={17}/></>}</button>
          </div>
        </form>
        {error && <p id="audit-error" role="alert" className="form-error">{error}</p>}
        <p className="form-note" id="audit-note"><i aria-hidden="true"/>Free · no account · up to 25 pages</p>

        <div className="hero-links">
          <a className="go-blue link-underline" href="/audit/demo">View sample report <ArrowRight size={15}/></a>
        </div>
      </div><CrawlAnimation/></div>

    </section>

    <section className="landing-lens"><div className="page-width"><AgentLens/></div></section>

    <section className="pillars" id="pillars">
      <div className="page-width">
        <div className="section-head">
          <div>
            <p className="kicker kicker--blue">What it checks</p>
            <h2 className="display">Three parts of one audit</h2>
          </div>
        </div>
        <div className="pillar-grid">
          {pillars.map(({ name, label, description, tags }, index) => <article className={`pillar-card ${index % 2 ? "pillar-card--red" : "pillar-card--blue"}`} key={name}>
            <p className="pillar-index">0{index + 1}</p>
            <h3>{name}</h3>
            <p className="pillar-label">{label}</p>
            <p>{description}</p>
            <div className="pillar-tags">{tags.map((tag) => <span key={tag}>{tag}</span>)}</div>
          </article>)}
        </div>
      </div>
    </section>

    <AuditCoverage/>

    <section className="how" id="how">
      <div className="page-width">
        <div className="section-head">
          <div>
          <p className="kicker kicker--blue">How it works</p>
            <h2 className="display">Three steps</h2>
          </div>
        </div>
        <ol className="how-steps">
          <li className="how-step how-step--accent">
            <span className="kicker">STEP 01</span>
            <h3>Crawl</h3>
            <p>Capture page source. A rendered comparison is available when enabled.</p>
          </li>
          <li className="how-step">
            <span className="kicker">STEP 02</span>
            <h3>Review findings</h3>
            <p>Checks analyze the captured snapshot. Optional AI checks can add separate guidance.</p>
          </li>
          <li className="how-step">
            <span className="kicker">STEP 03</span>
            <h3>Fix and verify</h3>
            <p>Use the evidence and suggested fix, then rerun checks to confirm the change.</p>
          </li>
        </ol>
      </div>
    </section>

    <section className="faq" id="faq">
      <div className="page-width faq-grid">
        <div>
          <p className="kicker kicker--red">FAQ</p>
          <h2 className="display" style={{ fontSize: "clamp(32px, 4vw, 48px)", marginTop: 14 }}>Common questions</h2>
        </div>
        <div className="faq-list">
          {faqs.map(({ q, a }) => <details className="faq-item" key={q}><summary>{q}</summary><p className="faq-answer">{a}</p></details>)}
        </div>
      </div>
    </section>

    <div className="page-width">
      <footer className="site-footer">
        <a href="/" className="wordmark">Signal<span className="wordmark-slash">/</span>Audit</a>
        <BuilderCredit/>
        <a href="#site-url">Run your own audit <ArrowUpRight size={14}/></a>
      </footer>
    </div>
  </main>;
}

