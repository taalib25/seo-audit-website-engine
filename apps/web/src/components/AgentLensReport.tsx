import { useMemo, useState, type ChangeEvent } from "react";
import type { AgentView } from "@aeo/core";
import "./agent-lens.css";

type AgentPage = AgentView["pages"][number];

function pageLabel(url: string) {
  try { return new URL(url).pathname || "/"; } catch { return url; }
}

/** A report-backed summary of the crawler's actual text capture for one page. */
export function AgentLensReport({ agentView }: { agentView?: AgentView }) {
  const [pageIndex, setPageIndex] = useState(0);
  const pages = agentView?.pages ?? [];
  const page = pages[pageIndex] ?? pages[0];
  const options = useMemo(() => pages.map((entry, index) => ({
    value: String(index),
    label: `${entry.agent} · ${pageLabel(entry.url)}`,
  })), [pages]);

  if (!agentView || !page) return null;

  function selectPage(event: ChangeEvent<HTMLSelectElement>) {
    const next = Number(event.currentTarget.value);
    if (Number.isInteger(next) && next >= 0 && next < pages.length) setPageIndex(next);
  }

  const coverage = Math.round(page.coverage * 100);
  return <section className="agent-lens-report" aria-labelledby="agent-lens-report-title">
    <header className="agent-lens-report__head">
      <div><p>AGENT VIEW · CAPTURED DATA</p><h2 id="agent-lens-report-title">What the crawler received</h2></div>
      <label>PAGE AND BOT<select value={String(pages[pageIndex] ? pageIndex : 0)} onChange={selectPage} aria-label="Choose audited page and bot">
        {options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
      </select></label>
    </header>
    <div className="agent-lens-report__metrics">
      <span><b>{coverage}%</b> word coverage</span>
      <span><b>{page.headingsSeen}/{page.headingsTotal}</b> headings</span>
      <span><b>{page.linksSeen}/{page.linksTotal}</b> links</span>
      <span><b className={page.jsonLdSeen ? "" : "is-missing"}>{page.jsonLdSeen ? "Found" : "Missing"}</b> JSON-LD</span>
    </div>
    <div className="agent-lens-report__body">
      <div><h3>Text in the captured page</h3><p className="agent-lens-report__excerpt">{page.excerpt || "No page text was available to this crawler."}</p></div>
      <div className="agent-lens-report__missing"><h3>Visible to people, missing to this bot</h3>
        {page.missing.length ? <ul>{page.missing.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p>No notable missing content was recorded.</p>}
        {!page.executesJs && page.missing.length > 0 && <small>[not in raw HTML — rendered by JavaScript]</small>}
      </div>
    </div>
    {agentView.estimated && <p className="agent-lens-report__note">Coverage is estimated from raw HTML because rendered page data was unavailable.</p>}
  </section>;
}
