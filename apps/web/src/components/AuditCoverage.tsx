import { ArrowUpRight, Plus } from "lucide-react";

const coverage = [
  {
    number: "01", title: "Search foundations", tag: "SEO", color: "citrus",
    intro: "Titles, links, crawl rules, and sitemaps.",
    items: ["Page metadata and headings", "Canonical URLs and redirects", "Robots rules and sitemaps"],
    output: "Findings include the values captured from your pages.",
  },
  {
    number: "02", title: "Answers and identity", tag: "AEO · GEO", color: "lavender",
    intro: "Page answers, organization details, and structured data.",
    items: ["Question headings and answer structure", "FAQ and structured-data checks", "Organization names and entity signals"],
    output: "Optional AI checks can add separate guidance; they are not required for a standard audit.",
  },
  {
    number: "03", title: "Crawler access", tag: "Source · rendered", color: "aqua",
    intro: "Compare captured page source with a rendered reference when available.",
    items: ["Robots rules for supported crawlers", "Words, headings, and links in the captured pages", "Separate search, fetch, and training policy labels"],
    output: "This is a snapshot model, not observed vendor behavior. Rendering is optional; training access remains your choice.",
  },
  {
    number: "04", title: "Evidence and fixes", tag: "Your report", color: "lavender",
    intro: "Use findings to decide what to change and verify.",
    items: ["Finding priority and captured evidence", "Suggested fixes and snippets where available", "Commands to rerun affected checks"],
    output: "Review suggested changes before applying them. The audit does not edit your site.",
  },
];

export function AuditCoverage() {
  return <section className="coverage-section" id="coverage" aria-labelledby="coverage-title"><div className="page-width">
    <div className="section-head"><div><p className="kicker kicker--blue">Audit details</p><h2 className="display" id="coverage-title">What the report covers</h2></div></div>
    <div className="coverage-grid">{coverage.map((item) => <details className={`coverage-card coverage-card--${item.color}`} key={item.number}>
      <summary><span className="coverage-meta"><span>{item.number}</span><span>{item.tag}</span></span><span className="coverage-title">{item.title}</span><span className="coverage-intro">{item.intro}</span><span className="coverage-open">Explore this lens <Plus size={18}/></span></summary>
      <div className="coverage-detail"><ul>{item.items.map((text) => <li key={text}>{text}</li>)}</ul><p><strong>In the report</strong>{item.output}</p></div>
    </details>)}</div>
    <a className="coverage-report-link" href="/audit/demo">View sample report <ArrowUpRight size={17}/></a>
  </div></section>;
}
