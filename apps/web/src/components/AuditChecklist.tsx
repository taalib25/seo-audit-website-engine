import { Check, Circle, LoaderCircle, Minus, X } from "lucide-react";
import { useEffect, useId, useMemo, useRef, useState, type CSSProperties } from "react";
import { flushSync } from "react-dom";
import type { CheckResult, Pillar, Status } from "@aeo/core";
import { Tabs, TabsList, TabsTrigger } from "./ui/tabs";

const pillars: Pillar[] = ["seo", "aeo", "geo"];
const pillarNames: Record<Pillar, string> = { seo: "SEO", aeo: "AEO", geo: "GEO" };

export function AuditChecklist({ results, running = false, replay = false, liveResolved = 0, onReplayDone }: { results: CheckResult[]; running?: boolean; replay?: boolean; liveResolved?: number; onReplayDone?: () => void }) {
  const [resolved, setResolved] = useState(replay ? 0 : results.length);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [selectedPillar, setSelectedPillar] = useState("all");
  const [reduceMotion, setReduceMotion] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const userPausedScroll = useRef(false);
  function settleReplay() {
    const settle = () => flushSync(() => setResolved(results.length));
    if (!reduceMotion && results.length <= 150 && "startViewTransition" in document) {
      document.startViewTransition(settle);
    } else settle();
    onReplayDone?.();
  }
  const ordered = useMemo(() => {
    const items = [...results];
    if (!running && resolved >= results.length) items.sort((a, b) => rank(a.status) - rank(b.status));
    return items;
  }, [results, running, resolved]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduceMotion(query.matches);
    update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!replay || reduceMotion) { setResolved(results.length); onReplayDone?.(); return; }
    setResolved(0);
    let step = 0;
    const timer = window.setInterval(() => {
      step += 1;
      setResolved(Math.min(results.length, Math.ceil((step / 40) * results.length)));
      if (step >= 40) { window.clearInterval(timer); settleReplay(); }
    }, 50);
    return () => window.clearInterval(timer);
  }, [replay, reduceMotion, results.length]);

  useEffect(() => {
    if (running && !userPausedScroll.current) listRef.current?.scrollTo({ top: listRef.current.scrollHeight, behavior: reduceMotion ? "instant" : "smooth" });
  }, [results.length, running, reduceMotion]);

  const completedCount = running ? Math.min(liveResolved, results.length) : resolved;
  const pillarStats = pillars.map((pillar) => {
    const rows = results.filter((item) => item.pillar === pillar);
    const done = rows.filter((item) => results.indexOf(item) < completedCount).length;
    return { pillar, rows, done, passed: rows.filter((item) => item.status === "pass").length };
  });

  return <section className="checklist-panel" aria-label="Audit checklist" data-large={results.length > 150} data-scrollable={results.length > 12}>
    <div className="checklist-heading"><div><h2>Checklist</h2><p>{running ? `${completedCount} of ${results.length} checks complete` : `${completedCount} of ${results.length} complete`}</p></div><span className={`live-indicator ${running ? "is-live" : ""}`}><i />{running ? "LIVE" : "DONE"}</span></div>
    <div className="pillar-progress-grid">{pillarStats.map(({ pillar, rows, done }) => <div className="pillar-progress" key={pillar} aria-live="polite"><div className="pillar-progress-label"><span>{pillarNames[pillar]}</span><span>{done}/{rows.length} done</span></div><div className="pillar-track"><i style={{ transform: `scaleX(${rows.length ? done / rows.length : 0})` }} /></div>{rows.length > 0 && done === rows.length && <span className="sr-only">{pillarNames[pillar]} checks complete</span>}</div>)}</div>
    <Tabs value={selectedPillar} onValueChange={setSelectedPillar} className="checklist-tabs">
      <TabsList aria-label="Filter checklist by pillar"><TabsTrigger value="all">All</TabsTrigger>{pillars.map((item) => <TabsTrigger key={item} value={item}>{pillarNames[item]}</TabsTrigger>)}</TabsList>
    </Tabs>
    <div ref={listRef} className="checklist-scroll" onScroll={(event) => { const target = event.currentTarget; userPausedScroll.current = target.scrollHeight - target.scrollTop - target.clientHeight > 48; }}>
      {pillars.filter((item) => selectedPillar === "all" || selectedPillar === item).map((pillar) => {
        const grouped = new Map<string, CheckResult[]>();
        ordered.filter((result) => result.pillar === pillar).forEach((result) => grouped.set(result.category, [...(grouped.get(result.category) ?? []), result]));
        if (!grouped.size) return null;
        return <section className="checklist-pillar" key={pillar} aria-label={`${pillarNames[pillar]} checks`}><h3>{pillarNames[pillar]} <span>{pillarStats.find((item) => item.pillar === pillar)?.done}/{pillarStats.find((item) => item.pillar === pillar)?.rows.length}</span></h3>
          {[...grouped.entries()].map(([category, rows]) => <div className="checklist-category" key={category}><h4>{category.replaceAll("-", " ")}</h4>{rows.map((result, index) => {
            const rowIndex = results.indexOf(result);
            const complete = rowIndex < completedCount;
            const currentStatus = complete ? result.status : running && rowIndex === resolved ? "running" : "pending";
            const key = `${result.id}:${result.url ?? "site"}`;
            return <ChecklistRow key={key} result={result} state={currentStatus} index={Math.min(index, 10)} open={expanded === key} onToggle={() => setExpanded(expanded === key ? null : key)} />;
          })}</div>)}
        </section>;
      })}
    </div>
    {replay && resolved < results.length && <button className="skip-replay" onClick={settleReplay}>Skip replay <span aria-hidden="true">↗</span></button>}
  </section>;
}

function ChecklistRow({ result, state, index, open, onToggle }: { result: CheckResult; state: Status | "pending" | "running"; index: number; open: boolean; onToggle: () => void }) {
  const [copied, setCopied] = useState(false);
  const transitionId = useId().replace(/[^a-zA-Z0-9_-]/g, "-");
  const Icon = state === "pass" ? Check : state === "warn" ? Minus : state === "fail" || state === "error" ? X : state === "skip" ? Circle : state === "running" ? LoaderCircle : Circle;
  async function copySnippet() {
    if (!result.fix?.snippet) return;
    await navigator.clipboard.writeText(result.fix.snippet); setCopied(true); window.setTimeout(() => setCopied(false), 1400);
  }
  const style = { "--row-delay": `${Math.min(index * 40, 400)}ms`, viewTransitionName: `check-${transitionId}` } satisfies CSSProperties & { "--row-delay": string };
  return <article className={`check-row check-${state} ${open ? "is-expanded" : ""}`} style={style}>
    <button className="check-row-trigger" aria-expanded={open} onClick={onToggle}>
      <span className="check-icon"><Icon size={16} strokeWidth={state === "pass" ? 2.5 : 2} /></span><span className="check-row-copy"><strong>{result.title}</strong><span>{result.message}</span></span><span className="check-row-status">{state === "running" ? "Running" : state === "pending" ? "Pending" : state}</span>
    </button>
    <div className="check-detail-grid" aria-hidden={!open}><div className="check-detail" inert={!open}><div className="check-detail-columns"><div><h5>Finding</h5><p>{result.rationale ?? result.message}</p><h5>Evidence</h5><pre>{JSON.stringify(result.evidence, null, 2)}</pre></div><div><h5>Suggested fix</h5><p>{result.fix?.summary ?? "Review this check manually and confirm the expected behavior."}</p>{result.fix?.snippet && <div className="snippet-box"><pre>{result.fix.snippet}</pre><button onClick={() => void copySnippet()}>{copied ? <Check size={14} /> : "Copy snippet"} {copied ? "Copied" : ""}</button><small>{result.fix.snippetLang ?? "text"}</small></div>}</div></div></div></div>
  </article>;
}

function rank(status: Status) { return status === "fail" || status === "error" ? 0 : status === "warn" ? 1 : status === "pass" ? 2 : 3; }
