import { useId, useState } from "react";
import type { AgentView } from "@aeo/core";

export function AgentVisibility({ view }: { view: AgentView | undefined }) {
  const controlId = useId();
  const [selectedAgent, setSelectedAgent] = useState("OAI-SearchBot");
  const [selectedUrl, setSelectedUrl] = useState("");
  const agent = view?.agents.find((item) => item.agent === selectedAgent) ?? view?.agents[0];
  const rows = view?.pages.filter((item) => item.agent === agent?.agent) ?? [];
  const page = rows.find((item) => item.url === selectedUrl) ?? rows[0];
  const browser = view?.pages.find((item) => item.url === page?.url && item.agent === "browser");
  return <section className="agent-panel" aria-labelledby={`${controlId}-heading`}>
    <header className="agent-panel-head"><div><p className="kicker mb-2">Source / rendered comparison</p><h2 id={`${controlId}-heading`}>How much can an agent see?</h2></div></header>
    <p className="agent-method">Snapshot model from robots.txt and captured HTML; it does not show vendor behavior or predict citations. Coverage compares word counts, not meaning. {view?.estimated ? "Raw HTML only; rendered content was not measured." : "Rendering may be incomplete; check the page evidence."}</p>
    {!view || !agent ? <p className="agent-view-empty">This report has no agent comparison. Run a new audit to capture it.</p> : <div className="agent-body">
      <div className="agent-agents-col"><p className="agent-agents-sub">Coverage across audited pages</p>
        <div className="agent-picker"><label htmlFor={`${controlId}-agent`}>Choose an agent</label><select id={`${controlId}-agent`} value={agent.agent} onChange={(event) => setSelectedAgent(event.target.value)}>{view.agents.map((item) => <option key={item.agent} value={item.agent}>{item.agent} · {item.purpose}</option>)}</select></div>
        {view.agents.map((item) => <button type="button" className={`agent-row agent-select-row ${agent.agent === item.agent ? "is-selected" : ""}`} aria-pressed={agent.agent === item.agent} onClick={() => setSelectedAgent(item.agent)} key={item.agent}>
          <span className="agent-row-top"><span className="agent-name">{item.agent}<span className="agent-vendor">{item.vendor} · {item.purpose}</span></span><span className={`agent-coverage ${item.coverage < .8 ? "agent-coverage--low" : ""}`}>{Math.round(item.coverage * 100)}%</span></span>
          <span className="score-bar" aria-hidden="true"><i className="score-bar-fill" style={{ width: `${item.coverage * 100}%` }}/><i className="score-bar-rest"/></span>
          <span className="agent-vendor">{item.executesJs ? "Rendered DOM model" : "Source HTML model"} · {item.pagesBlocked} pages restricted</span>
        </button>)}
        <p className="agent-estimated-note">Training access is a policy choice; preserve intentional restrictions.</p>
      </div>
      <div className="agent-pages-col"><div className="agent-picker"><label htmlFor={`${controlId}-page`}>Inspect a page</label><select id={`${controlId}-page`} value={page?.url ?? ""} onChange={(event) => setSelectedUrl(event.target.value)}>{rows.map((item) => <option value={item.url} key={item.url}>{item.url}</option>)}</select></div>
        {!page ? <p className="agent-view-empty">No captured pages for this agent.</p> : <div aria-live="polite">
          <p className="agent-policy">{page.allowedByRobots ? "No robots restriction found for this path" : "Robots policy restricts this path"} · {page.executesJs ? "Rendered DOM" : "Source HTML"}</p>
          <div className="agent-counts"><div><strong>{page.wordsSeen}<small> / {page.wordsTotal}</small></strong><span>Words</span></div><div><strong>{page.headingsSeen}<small> / {page.headingsTotal}</small></strong><span>Headings</span></div><div><strong>{page.linksSeen}<small> / {page.linksTotal}</small></strong><span>Links</span></div></div>
          <div className="agent-compare"><article className="agent-view-card agent-view-card--human"><h3 className="agent-view-card-head">Rendered reference</h3><div className="agent-view-body"><p>{view.estimated ? "Not captured. Enable rendering for a browser comparison." : browser?.excerpt || "Rendered excerpt unavailable for this page."}</p></div></article><article className="agent-view-card agent-view-card--bot"><h3 className="agent-view-card-head">{agent.agent} model</h3><div className="agent-view-body"><p>{page.allowedByRobots ? page.excerpt || "No main text captured." : "Content excluded from this model by robots policy."}</p></div></article></div>
          <div className="agent-missing"><h3 className="agent-missing-title">Missing from this model</h3>{page.missing.length ? <ul className="agent-missing-list">{page.missing.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ul> : <p className="agent-method">No missing blocks detected in the captured comparison.</p>}<p className="agent-stat-line mt-4">Structured data: <b>{page.jsonLdSeen ? "detected" : "not detected"}</b></p></div>
        </div>}
      </div>
    </div>}
  </section>;
}
