import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUpRight, LoaderCircle } from "lucide-react";
import { useState, type FormEvent } from "react";
import { z } from "zod";

const createdAudit = z.object({ id: z.string() });
const auditError = z.object({ error: z.string() });

const faqs = [
  { q: "What does the audit actually check?", a: "Four bundled lenses: crawlability and metadata, on-page structure, structured data and entity signals, and AI-agent access. Every deterministic check is a pure function of one crawl snapshot, plus LLM-judged checks where judgment genuinely helps. Each finding ships with the raw evidence, not just a verdict." },
  { q: "Why the two colors?", a: "Blue is what search engines and AI agents can see — the checks that pass, the content that reaches the models. Red is your blind spot — the failures, the blocked bots, the content that never makes it into an answer. The whole product is the distance between them." },
  { q: "Who really reads my pages?", a: "GPTBot, OAI-SearchBot, ClaudeBot, PerplexityBot and friends each fetch your site differently, and a finished report shows exactly what each of them receives per page — seen headings, links, and what gets missed — side by side with what a human sees in a browser." },
  { q: "What do I get at the end?", a: "A scorecard, a live checklist of every check, and a prioritized fix prompt written for a coding agent — each task carries the evidence, the suggested change, and a verification command. Feed it to Claude, Cursor or Codex, then confirm it yourself." },
  { q: "Do I need an account?", a: "No. Paste a URL and the audit starts. Anonymous runs crawl up to 25 pages with raw HTML; enabling render and LLM checks widens the picture using your own configured API keys." },
  { q: "Can I trust the numbers?", a: "Deterministic checks are pure functions of one crawl snapshot with no network, no clock and no randomness — the same page always produces the same result. Scores are weighted by severity, and every claim links to the evidence that produced it." },
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
      { title: "Signal / Audit — See what AI sees. Fix what it misses." },
      { name: "description", content: "A dual-lens audit for SEO, AEO and GEO: what search engines and AI agents see in blue, what they miss in red. Crawl to prioritized fix prompt in one run." },
      { property: "og:title", content: "Signal / Audit — See what AI sees." },
      { property: "og:description", content: "What search engines and AI agents see vs what they miss — an evidence-backed audit with a plan your coding agent can execute." },
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
  { name: "SEO", label: "Search engines", description: "Can search engines crawl, understand and index your pages? Metadata, canonical flow, structured data — measured, not guessed.", tags: ["Metadata", "Crawlability", "Sitemaps"] },
  { name: "AEO", label: "Answer engines", description: "Do answers actually exist on the page, stated clearly enough to quote? Question-led structure and self-contained passages an engine can lift.", tags: ["Answer structure", "Clarity", "Question headings"] },
  { name: "GEO", label: "Generative engines", description: "Who are you when a model cites you? Consistent entity naming, Organization schema, and the AI-crawler access that citation depends on.", tags: ["Entity signals", "Schema.org", "AI crawlers"] },
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
          <a className="nav-quiet link-underline" href="#cli">CLI</a>
          <a className="btn btn--ink btn--sm btn--nav" href="/audit/demo">Sample report <ArrowUpRight size={15}/></a>
        </nav>
      </header>
    </div>

    <section className="hero">
      <div className="page-width">
        <p className="kicker hero-kicker">
          <span className="kicker--blue"><i className="dot-blue"/>Blue — what engines see</span>
          <span className="kicker--red"><i className="dot-red"/>Red — what they miss</span>
          <span className="kicker">SEO · AEO · GEO</span>
        </p>
        <h1 className="display">
          What you see<br/>
          <span className="line-blue">isn't what AI</span><br/>
          <span className="line-red">sees at all.</span>
        </h1>
        <p className="hero-intro">Signal / Audit crawls your site twice over — once for search engines, once for the AI agents that answer about you. Two colors, one report, zero guesswork: everything your pages get right in <strong className="ink-blue">blue</strong>, every blind spot in <strong className="ink-red">red</strong>.</p>

        <form onSubmit={submit} className="audit-form" aria-label="Start a website audit">
          <label htmlFor="site-url" className="audit-label">Run it on your site</label>
          <div className="audit-input-row">
            <input id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder="yourwebsite.com" aria-describedby={error ? "audit-error" : "audit-note"} aria-invalid={Boolean(error)} required/>
            <button className="btn btn--blue btn--md" disabled={busy}>{busy ? <><LoaderCircle size={17} className="animate-spin"/>Starting…</> : <>Audit my site <ArrowRight size={17}/></>}</button>
          </div>
        </form>
        {error && <p id="audit-error" role="alert" className="form-error">{error}</p>}
        <p className="form-note" id="audit-note"><i aria-hidden="true"/> Free · no account · 25 pages on the house</p>

        <div className="hero-links">
          <a className="go-blue link-underline" href="/audit/demo">Walk through a sample report <ArrowRight size={15}/></a>
          <a className="go-red link-underline" href="#how">How the audit works <ArrowDown size={15}/></a>
        </div>
      </div>

      <div className="split" aria-label="What engines see versus what they miss">
        <div className="split-cells">
          <div className="split-cell split-cell--blue">
            <p className="kicker"><i aria-hidden="true"/>What search engines + AI agents see</p>
            <h2 className="display">The signal</h2>
            <p>Crawlable pages, real headings, structured data, honest canonicals. The things engines index and quote.</p>
            <ul className="split-list">
              <li><span className="plus">+</span>A title AI can actually read</li>
              <li><span className="plus">+</span>Question-led headings</li>
              <li><span className="plus">+</span>Organization schema</li>
              <li><span className="plus">+</span>Answers in plain text</li>
            </ul>
          </div>
          <div className="split-cell split-cell--red">
            <p className="kicker"><i aria-hidden="true"/>What they miss on most sites</p>
            <h2 className="display">The blind spot</h2>
            <p>JS-only content, blocked crawlers, missing schema, washed-out entity names. The reasons AI answers don't mention you.</p>
            <ul className="split-list">
              <li><span className="minus">−</span>GPTBot blocked in robots.txt</li>
              <li><span className="minus">−</span>Content that needs JavaScript</li>
              <li><span className="minus">−</span>No structured data</li>
              <li><span className="minus">−</span>No quotable answer anywhere</li>
            </ul>
          </div>
        </div>
      </div>
    </section>

    <section className="pillars" id="pillars">
      <div className="page-width">
        <div className="section-head">
          <div>
            <p className="kicker kicker--blue">The three pillars</p>
            <h2 className="display">Two colors. Three lenses.<br/>One crawl.</h2>
          </div>
          <p>Every check belongs to a pillar, carries a severity, and reports pass or fail with the evidence attached. No mysterious score, no black-box advice.</p>
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

    <section className="how" id="how">
      <div className="page-width">
        <div className="section-head">
          <div>
            <p className="kicker kicker--blue">How it works</p>
            <h2 className="display">Crawl. Judge. Fix. Verify.</h2>
          </div>
          <p>The same pipeline powers the web app and the CLI: bounded crawler, deterministic checks plus LLM judgment, and a fix plan a real agent can execute.</p>
        </div>
        <ol className="how-steps">
          <li className="how-step how-step--accent">
            <span className="kicker">STEP 01</span>
            <h3>Crawl</h3>
            <p>A bounded crawler fetches raw HTML and, when enabled, a rendered DOM — through the same SSRF guard, with byte and time limits.</p>
            <span className="step-owner">Automatic</span>
          </li>
          <li className="how-step">
            <span className="kicker">STEP 02</span>
            <h3>Run the checks</h3>
            <p>Deterministic checks are pure functions of the snapshot. LLM-judged checks do the reading a parser can't: clarity, answer quality, citation-worthiness.</p>
            <span className="step-owner">Deterministic + LLM</span>
          </li>
          <li className="how-step">
            <span className="kicker">STEP 03</span>
            <h3>Get the fix prompt</h3>
            <p>Pass the report to your coding agent. Every task carries the evidence, the smallest useful change, and a paste-ready snippet.</p>
            <span className="step-owner">For your coding agent</span>
          </li>
          <li className="how-step">
            <span className="kicker">STEP 04</span>
            <h3>Verify</h3>
            <p>Re-run only the checks you touched. The report goes from red back to blue in front of you.</p>
            <span className="step-owner">aeo verify</span>
          </li>
        </ol>
      </div>
    </section>

    <section className="cli-section" id="cli">
        <div className="page-width cli-grid">
        <div className="cli-copy">
          <p className="kicker kicker--blue">Own the terminal</p>
          <h2 className="display">The audit that fits<br/>in your terminal</h2>
          <p>No dashboard to babysit. The CLI runs the same engine and writes the report, the evidence and the fix prompt into <code>.audits/</code> — durable data your agent can read, not screenshots of a score.</p>
          <div className="hero-links">
            <a className="go-blue link-underline" href="/audit/demo">See the web version <ArrowRight size={15}/></a>
          </div>
        </div>
        <Terminal/>
      </div>
    </section>

    <section className="faq" id="faq">
      <div className="page-width faq-grid">
        <div>
          <p className="kicker kicker--red">Frequently asked</p>
          <h2 className="display" style={{ fontSize: "clamp(32px, 4vw, 48px)", marginTop: 14 }}>Straight answers</h2>
          <p style={{ marginTop: 16, color: "var(--muted)", fontSize: 14, lineHeight: 1.75, maxWidth: 360 }}>The fine print, in plain text. Each answer is also shipped as machine-readable FAQ data, right behind it — we eat our own AEO dogfood.</p>
        </div>
        <div className="faq-list">
          {faqs.map(({ q, a }) => <details className="faq-item" key={q}><summary>{q}</summary><p className="faq-answer">{a}</p></details>)}
        </div>
      </div>
    </section>

    <div className="page-width">
      <footer className="site-footer">
        <a href="/" className="wordmark">Signal<span className="wordmark-slash">/</span>Audit</a>
        <span>A little more signal. A lot less guesswork.</span>
        <a href="#site-url">Run your own audit <ArrowUpRight size={14}/></a>
      </footer>
    </div>
  </main>;
}

function Terminal() {
  return <div className="term">
    <div className="term-bar"><span className="term-dots" aria-hidden="true"><span/>
    </span><span aria-hidden="true">signal-audit — zsh</span></div>
    <pre aria-label="CLI example">
      <span className="comment"># first look, raw HTML, 25 pages</span>{"\n"}
      <span className="prompt">$</span> <span className="cmd">npx aeo audit northstar.studio</span>{"\n"}
      <span className="out">crawled 3 pages · 42 checks · 0.74 overall{"\n"}</span>
      <span className="out-ok">✓ report.json + fix-prompt.md in .audits/</span>{"\n"}
      <span className="out">{"\n"}# after you make the changes</span>{"\n"}
      <span className="prompt">$</span> <span className="cmd">npx aeo verify --ids seo.on-page.title,geo.entity.organization</span>{"\n"}
      <span className="out-ok">✓ 2/2 checks now pass</span>
    </pre>
  </div>;
}
