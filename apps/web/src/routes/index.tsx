import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ArrowRight, ArrowUpRight, Bot, Check, CheckCheck, CircleAlert, Globe2, LoaderCircle, SearchCheck, ShieldCheck, Terminal } from "lucide-react";
import { useState, type FormEvent } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Signal / Audit — Get found. Get understood." },
      { name: "description", content: "Find what holds your website back in search and AI answers. Get an evidence-backed SEO, AEO and GEO audit with a practical fix prompt." },
      { property: "og:title", content: "Signal / Audit — Get found. Get understood." },
      { property: "og:description", content: "An evidence-backed audit for SEO, AEO, and GEO, with a practical plan for your next changes." },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [{ type: "application/ld+json", children: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Signal / Audit", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "Audit technical SEO, answer engine readiness, and generative search visibility.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }) }],
  }),
  component: Home,
});

const pillars = [
  { name: "SEO", label: "Search engine optimization", Icon: SearchCheck, description: "The foundations that help search engines crawl, understand, and index your pages.", detail: "Metadata · Crawlability · Structured data" },
  { name: "AEO", label: "Answer engine optimization", Icon: Bot, description: "Clear, useful answers that people and answer engines can understand without the guesswork.", detail: "Answer structure · Clarity · Freshness" },
  { name: "GEO", label: "Generative engine optimization", Icon: ShieldCheck, description: "A consistent identity and credible information that generative systems can reference.", detail: "Entity signals · Sources · AI access" },
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
      if (!response.ok || typeof data !== "object" || data === null || !("id" in data) || typeof data.id !== "string") throw new Error("Enter a public website URL to begin.");
      await navigate({ to: "/audit/$id", params: { id: data.id } });
    } catch (e) { setError(e instanceof Error ? e.message : "Audit could not be started."); setBusy(false); }
  }

  return <main className="landing-page">
    <header className="site-header page-width">
      <a href="/" className="wordmark" aria-label="Signal Audit home"><span className="brand-icon"><SearchCheck size={20} strokeWidth={2}/></span>signal<span className="wordmark-divider">/</span><span className="wordmark-light">audit</span></a>
      <nav aria-label="Main navigation"><a className="method-link" href="#method">How it works</a><a className="nav-sample" href="/audit/demo">Sample report <ArrowUpRight size={15}/></a></nav>
    </header>

    <section className="landing-hero page-width">
      <div className="hero-copy">
        <span className="eyebrow"><span className="status-dot"/> Built for the new era of search</span>
        <h1>Good websites<br/>deserve to<br className="desktop-break"/> be <em>found.</em></h1>
        <p className="hero-description">See what’s holding your site back in search and AI answers. Get clear findings, real evidence, and a plan to fix it.</p>
        <form onSubmit={submit} className="audit-form" aria-label="Start a website audit">
          <label htmlFor="site-url">Your website</label>
          <div className="audit-input-row"><Globe2 size={19} aria-hidden="true"/><input id="site-url" value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" autoCapitalize="none" autoCorrect="off" spellCheck={false} enterKeyHint="go" placeholder="yourwebsite.com" aria-describedby={error ? "audit-error" : "audit-note"} aria-invalid={Boolean(error)} required/><button className="primary-button" disabled={busy}>{busy ? <><LoaderCircle size={17} className="animate-spin"/>Starting…</> : <>Audit my site <ArrowRight size={17}/></>}</button></div>
        </form>
        {error && <p id="audit-error" role="alert" className="form-error">{error}</p>}
        <p className="form-note" id="audit-note"><Check size={14}/> No account needed <span>·</span> Start with a free HTML audit</p>
        <a className="hero-sample-link" href="/audit/demo">Take a look at an example <ArrowUpRight size={15}/></a>
      </div>
      <AuditPreview/>
    </section>

    <section className="workflow-strip page-width" aria-label="From website to fixes">
      {[["01", "Scan your site", "We collect the evidence."], ["02", "Find the gaps", "See what needs attention."], ["03", "Make your next move", "Give the fix plan to your AI agent."]].map(([number, title, text]) => <div className="workflow-step" key={number}><span>{number}</span><div><h2>{title}</h2><p>{text}</p></div><ArrowRight size={18} aria-hidden="true"/></div>)}
    </section>

    <section className="method-section page-width" id="method">
      <div className="section-heading"><div><span className="eyebrow">A clearer picture</span><h2>Three lenses.<br className="mobile-break"/> One useful audit.</h2></div><p>Search is changing. Your foundations still matter.<br/>Understand where your site stands, from crawlability to citation.</p></div>
      <div className="method-grid">{pillars.map(({ name, label, Icon, description, detail }) => <article className="method-card" key={name}><div className="method-card-top"><span className="method-icon"><Icon size={23} strokeWidth={1.7}/></span><span>{name}</span></div><h3>{label}</h3><p>{description}</p><div className="method-detail">{detail}</div></article>)}</div>
    </section>

    <section className="agent-section page-width"><div className="agent-message"><span className="eyebrow"><Terminal size={15}/> From insight to implementation</span><h2>Less “now what?”<br/>More <em>“already on it.”</em></h2><p>Copy a prioritized fix prompt into your coding agent. Every task carries the evidence, the suggested change, and a way to verify it.</p><a className="text-link" href="/audit/demo">Explore a sample report <ArrowRight size={16}/></a></div><div className="prompt-preview"><div><span><Terminal size={15}/> fix-prompt.md</span><span>READY FOR YOUR AGENT</span></div><pre><span className="code-comment"># Your next steps, in order</span>{"\n\n"}<span>01</span>{"  Review the finding and its evidence\n"}<span>02</span>{"  Make the smallest useful change\n"}<span>03</span>{"  Run the verification command"}</pre><p><CheckCheck size={15}/> Clear scope. Verifiable fixes. Your codebase.</p></div></section>

    <footer className="site-footer page-width"><a href="/" className="wordmark">signal<span className="wordmark-divider">/</span><span className="wordmark-light">audit</span></a><span>A little more signal. A lot less guesswork.</span><a href="#site-url">Run an audit <ArrowUpRight size={14}/></a></footer>
  </main>;
}

function AuditPreview() {
  return <div className="hero-preview">
    <div className="preview-caption"><span className="preview-label">THE BIG PICTURE</span><span>Example audit <ArrowDown size={13}/></span></div>
    <div className="preview-report">
      <div className="preview-report-heading"><span className="preview-site-icon"><Globe2 size={23} strokeWidth={1.5}/></span><div><strong>northstar.studio</strong><span>Website readiness report</span></div><span className="preview-complete"><Check size={12}/> Complete</span></div>
      <div className="preview-scores">{[{ name: "SEO", score: 86, color: "var(--accent)" }, { name: "AEO", score: 72, color: "#b28b42" }, { name: "GEO", score: 64, color: "#7884a3" }].map(({ name, score, color }) => <div key={name}><span>{name}<ArrowUpRight size={12}/></span><strong>{score}<small>/100</small></strong><div className="preview-track"><i style={{ width: `${score}%`, background: color }}/></div></div>)}</div>
      <div className="preview-checks-heading"><span>YOUR NEXT OPPORTUNITIES</span><span>03</span></div>
      <div className="preview-finding"><span className="preview-finding-icon"><CircleAlert size={17}/></span><div><strong>Give every page a clear title</strong><span>Help search engines understand your pages.</span></div><span className="preview-severity">High</span></div>
      <div className="preview-finding"><span className="preview-finding-icon amber"><CircleAlert size={17}/></span><div><strong>Make your answers easy to find</strong><span>Structure key information for direct answers.</span></div><span className="preview-severity">Medium</span></div>
      <div className="preview-finding"><span className="preview-finding-icon teal"><Check size={17}/></span><div><strong>A solid foundation to build on</strong><span>Your crawlability checks are looking good.</span></div><span className="preview-severity">Pass</span></div>
      <a className="preview-report-footer" href="/audit/demo"><span><Terminal size={15}/> Your evidence. Your next steps.</span><ArrowUpRight size={17}/></a>
    </div>
    <div className="preview-note"><span className="note-line"/><p>More than a score.<br/><strong>A starting point for what’s next.</strong></p></div>
  </div>;
}
