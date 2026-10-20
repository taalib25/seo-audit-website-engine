import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Clipboard, Download, ExternalLink, LoaderCircle, Moon, SlidersHorizontal, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuditReport, Pillar, Status, Severity } from "@aeo/core";
import { CheckResult } from "@aeo/core/types";
import { z } from "zod";
import type { PromptTrace } from "@aeo/llm";
import type { FixTask } from "@aeo/prompt";
import { sampleReport } from "../fixtures/sample-report";
import { AuditChecklist } from "../components/AuditChecklist";

type AuditState = { status: "queued" | "running" | "complete" | "failed"; report?: AuditReport; prompt?: { markdown: string; tasks: FixTask[] }; traces?: PromptTrace[]; capabilityNotes?: string[]; progress?: number; stage?: string };
const EngineEventSchema = z.object({ type: z.string(), url: z.string().optional(), index: z.number().optional(), total: z.number().optional(), count: z.number().optional(), id: z.string().optional(), title: z.string().optional(), status: z.string().optional(), pages: z.number().optional(), result: CheckResult.optional() });
type EngineEvent = z.infer<typeof EngineEventSchema>;
export const Route = createFileRoute("/audit/$id")({ component: AuditPage });

function Ring({ score, label }: { score: number; label: string }) {
  const [value, setValue] = useState(0);
  useEffect(() => { if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { setValue(score); return; } const started = performance.now(); let frame = 0; const tick = (now: number) => { const progress = Math.min(1, (now - started) / 700); setValue(Math.round(score * (1 - Math.pow(1 - progress, 3)))); if (progress < 1) frame = requestAnimationFrame(tick); }; frame = requestAnimationFrame(tick); return () => cancelAnimationFrame(frame); }, [score]);
  const circumference = 2 * Math.PI * 24;
  return <div className={`score-metric ${label === "overall" ? "score-overall" : ""}`}><div className="metric-ring"><svg className="score-ring" viewBox="0 0 56 56" aria-hidden="true"><circle className="score-ring-track" cx="28" cy="28" r="24"/><circle className="score-ring-fill" cx="28" cy="28" r="24" style={{ strokeDasharray: circumference, strokeDashoffset: circumference * (1 - value / 100) }}/></svg><span className="metric-value">{value}</span></div><div className="metric-copy"><strong>{label === "overall" ? "Overall readiness" : label.toUpperCase()}</strong><span>{label === "overall" ? "Your search foundations, at a glance" : "Readiness score"}</span></div></div>;
}

function AuditPage() { const { id } = Route.useParams(); return <AuditExperience auditId={id} />; }
export function DemoAuditPage() { return <AuditExperience auditId="demo" demo />; }
function AuditExperience({ auditId, demo = false }: { auditId: string; demo?: boolean }) {
  const [state, setState] = useState<AuditState>(demo ? { status: "running", stage: "Discovering pages", progress: 8, report: sampleReport } : auditId === "demo" ? { status: "complete", report: sampleReport } : { status: "queued" });
  const [engineEvents, setEngineEvents] = useState<EngineEvent[]>([]);
  const [crawlPages, setCrawlPages] = useState<string[]>([]);
  const [replay, setReplay] = useState(auditId === "demo" && !demo);
  const [celebrate, setCelebrate] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [pillar, setPillar] = useState("all"); const [category, setCategory] = useState("all"); const [status, setStatusFilter] = useState("all"); const [severity, setSeverity] = useState("all"); const [group, setGroup] = useState("all"); const [dark, setDark] = useState(false); const [copied, setCopied] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    const themeColor = document.querySelector('meta[name="theme-color"]');
    themeColor?.setAttribute("content", dark ? "#0b1114" : "#f8f9f6");
    return () => { document.documentElement.classList.remove("dark"); themeColor?.setAttribute("content", "#f8f9f6"); };
  }, [dark]);
  useEffect(() => {
    if (demo) {
      const pages = ["https://northstar.studio/", "https://northstar.studio/services", "https://northstar.studio/about"];
      let cursor = 0; let phase: "crawl" | "checks" = "crawl";
      const simulation = window.setInterval(() => {
        if (phase === "crawl" && cursor < pages.length) { setCrawlPages((items) => [...items, pages[cursor++]!]); setState((current) => ({ ...current, stage: "Crawling site", progress: Math.min(42, 12 + cursor * 10) })); }
        else if (phase === "crawl") { phase = "checks"; cursor = 0; setState((current) => ({ ...current, stage: `Running ${sampleReport.results.length} checks`, progress: 55 })); }
        else if (cursor < sampleReport.results.length) { const result = sampleReport.results[cursor++]!; setEngineEvents((items) => [...items, { type: "check:result", id: result.id, status: result.status, title: result.title }]); setState((current) => ({ ...current, progress: 55 + Math.round(cursor / sampleReport.results.length * 30) })); }
        else { window.clearInterval(simulation); setReplay(true); setState({ status: "complete", report: sampleReport }); }
      }, 260);
      return () => window.clearInterval(simulation);
    }
    if (auditId === "demo") return;
    let source: EventSource | undefined;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/audits/${encodeURIComponent(auditId)}`);
        if (!response.ok) throw new Error("Audit not found");
        const data = await response.json() as AuditState;
        if (!cancelled) { setState(data); if (data.status === "complete" && data.report) setReplay(true); }
        if (data.status === "queued" || data.status === "running") {
          source = new EventSource(`/api/audits/${encodeURIComponent(auditId)}/events`);
          source.addEventListener("progress", (event) => { const payload = JSON.parse((event as MessageEvent<string>).data) as { progress?: number; stage?: string }; setState((s) => ({ ...s, status: "running", ...payload })); });
          source.addEventListener("engine", (event) => {
            if (!(event instanceof MessageEvent)) return;
            const payload = EngineEventSchema.parse(JSON.parse(event.data));
            setEngineEvents((items) => payload.result ? [...items.filter((item) => !(item.result?.id === payload.result?.id && item.result?.url === payload.result?.url)), payload] : [...items, payload]);
            const url = payload.url;
            if (payload.type === "crawl:page" && url) setCrawlPages((items) => items.includes(url) ? items : [...items, url]);
          });
          source.addEventListener("complete", () => { source?.close(); void poll(); });
          source.addEventListener("error", () => { source?.close(); void poll(); });
        }
      } catch { if (!cancelled) setState({ status: "failed" }); }
    }
    void poll();
    return () => { cancelled = true; source?.close(); };
  }, [auditId, demo]);
  const report = state.report;
  const liveResults = engineEvents.flatMap((event) => event.result ? [event.result] : []);
  const results = useMemo(() => report?.results.filter((item) => (pillar === "all" || item.pillar === pillar) && (category === "all" || item.category === category) && (status === "all" || item.status === status) && (severity === "all" || item.severity === severity) && (group === "all" || (group === "site" ? !item.url : Boolean(item.url)))) ?? [], [report, pillar, category, status, severity, group]);
  useEffect(() => { if (report?.scores.overall && report.scores.overall >= 90 && !celebrate) setCelebrate(true); }, [report?.scores.overall, celebrate]);
  useEffect(() => { if (replay) { const timer = window.setTimeout(() => setReplay(false), 2200); return () => window.clearTimeout(timer); } }, [replay]);
  async function copyPrompt() {
    const prompt = state.prompt?.markdown ?? `Review this SEO, AEO, and GEO audit for ${report?.startUrl}. Prioritize the high and critical findings, make minimal changes, and verify the result.\n\n${report?.results.filter((item) => item.fix).map((item) => `## ${item.title}\n${item.fix?.summary}\n${item.fix?.snippet ?? ""}`).join("\n\n") ?? ""}`;
    await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }
  if (state.status === "queued" || state.status === "running") return <main className="min-h-screen px-6 py-8"><div className="mx-auto max-w-6xl"><Link to="/" className="flex items-center gap-2 text-sm text-[var(--muted)]"><ArrowLeft size={16}/>New audit</Link><div className="mt-10 grid gap-7 lg:grid-cols-[minmax(0,1fr)_minmax(320px,.85fr)]"><div><span className="inline-flex items-center gap-2 rounded-full bg-[var(--accent-soft)] px-3 py-1 text-xs font-semibold text-[var(--accent)]"><LoaderCircle className="animate-spin" size={14}/> AUDIT IN PROGRESS</span><h1 className="mt-5 text-3xl font-semibold tracking-tight">Analyzing your site</h1><p className="mt-2 text-[var(--muted)]">{state.stage ?? "Waiting for an audit worker"}</p><div className="mt-7 h-2 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-[var(--accent)] transition-transform duration-300" style={{ transform: `scaleX(${(state.progress ?? 4) / 100})`, transformOrigin: "left" }}/></div><p className="mt-2 text-xs text-[var(--muted)]">{state.progress ?? 0}% · {engineEvents.filter((event) => event.type === "check:result").length} checks resolved</p><div className="mt-8 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><h2 className="text-sm font-semibold">Discovered pages</h2><ul className="mt-4 space-y-2">{crawlPages.slice(-8).map((url) => <li key={url} className="flex items-center gap-3 text-sm"><span className="favicon-dot">{new URL(url).hostname.slice(0, 1).toUpperCase()}</span><span className="truncate">{url}</span></li>)}{crawlPages.length === 0 && <li className="text-sm text-[var(--muted)]">Waiting for the first page…</li>}</ul></div><ol className="mt-6 space-y-2" aria-live="polite">{engineEvents.filter((event) => event.type === "check:result").slice(-6).map((event, index) => <li className="event-toast" key={`${event.id}-${index}`}><Check size={14}/>{event.title} <span>{event.status}</span></li>)}</ol></div><div><AuditChecklist results={report?.results ?? liveResults} running liveResolved={engineEvents.filter((event) => event.type === "check:result").length}/></div></div></div></main>;
  if (!report) return <main className="mx-auto max-w-4xl px-6 py-20"><Link to="/" className="text-sm text-[var(--muted)]">← Back home</Link><h1 className="mt-12 text-3xl font-semibold">Audit unavailable</h1><p className="mt-3 text-[var(--muted)]">This audit could not be found or completed. Start a new audit and try again.</p></main>;
  const categories = [...new Set(report.results.map((item) => item.category))].sort();
  return <main className="report-page"><header className="report-header"><div className="report-toolbar page-width"><Link to="/" className="report-back"><ArrowLeft size={17}/>New audit</Link><span className="report-header-label">SIGNAL / AUDIT</span><div className="report-actions"><button onClick={() => setDark(!dark)} className="icon-button" aria-label="Toggle theme">{dark ? <Sun size={18}/> : <Moon size={18}/>}</button><div className="report-action-dock"><button onClick={() => void copyPrompt()} className={`copy-prompt-btn primary-button ${copied ? "is-copied" : ""}`} aria-label={copied ? "Fix prompt copied" : "Copy fix prompt for your AI agent"}>{copied ? <Check size={17}/> : <Clipboard size={17}/>}<span>{copied ? "Copied to clipboard" : "Copy fix prompt"}</span></button><a href={`/api/audits/${auditId}/prompt.md`} download className="icon-button" aria-label="Download fix prompt"><Download size={18}/></a></div></div></div></header>
    <div className="report-content page-width"><div className="report-hero"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Website audit · {new Date(report.createdAt).toLocaleDateString()}</p><h1 className="report-title">{new URL(report.startUrl).hostname}</h1><a className="report-site-link" href={report.startUrl} target="_blank" rel="noreferrer">{report.startUrl}<ExternalLink size={13}/></a><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-[var(--line)] px-3 py-1.5">{report.pagesCrawled} page{report.pagesCrawled === 1 ? "" : "s"} crawled</span><span className="rounded-full border border-[var(--line)] px-3 py-1.5">{report.capabilities.includes("rendered-dom") ? "Rendered DOM" : "Raw HTML only"}</span><a href={`/api/audits/${auditId}/report.json`} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1.5">JSON report <ArrowUpRight size={12}/></a></div></div><div className={`score-summary ${celebrate ? "score-celebrate" : ""}`}><Ring score={report.scores.overall} label="overall"/>{report.scores.pillars.map((item) => <Ring key={item.pillar} score={item.score} label={item.pillar}/>)}</div></div>
      <div className="mt-8"><AuditChecklist results={report.results} replay={replay} onReplayDone={() => setReplay(false)}/></div>
      <section className="findings-panel"><div className="findings-heading"><div><h2 className="font-semibold">Findings</h2><p className="mt-1 text-sm text-[var(--muted)]">{results.length} results · inspect evidence and suggested fixes</p></div><button className="filter-toggle" aria-expanded={filtersOpen} aria-controls="finding-filters" onClick={() => setFiltersOpen(!filtersOpen)}><SlidersHorizontal size={16}/>Filters<ChevronDown size={14}/></button></div><div id="finding-filters" className={`findings-filters ${filtersOpen ? "is-open" : ""}`}><FilterSelect label="Pillar" value={pillar} onChange={setPillar} options={["all","seo","aeo","geo"]}/><FilterSelect label="Category" value={category} onChange={setCategory} options={["all",...categories]}/><FilterSelect label="Status" value={status} onChange={setStatusFilter} options={["all","fail","warn","pass","skip","error"]}/><FilterSelect label="Priority" value={severity} onChange={setSeverity} options={["all","critical","high","medium","low","info"]}/><FilterSelect label="Scope" value={group} onChange={setGroup} options={["all","page","site"]}/></div>
      <div className="divide-y divide-[var(--line)]">{results.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">No findings match these filters.</p> : results.map((item) => <Finding key={`${item.id}:${item.url ?? "site"}`} result={item}/>)}</div></section>
      {state.capabilityNotes && state.capabilityNotes.length > 0 && <section className="mt-8 rounded-xl border border-amber-300/50 bg-amber-50/60 p-4 text-sm text-amber-950 dark:bg-amber-950/20 dark:text-amber-100"><h2 className="font-semibold">Capabilities</h2><ul className="mt-2 list-inside list-disc">{state.capabilityNotes.map((note) => <li key={note}>{note}</li>)}</ul></section>}
      <PromptLog traces={state.traces ?? []}/>
      <footer className="py-8 text-xs text-[var(--muted)]">{report.stack.length ? `Detected stack: ${report.stack.join(", ")}` : "Checks are based on publicly accessible page data."}</footer>
    </div></main>;
}

function PromptLog({ traces }: { traces: PromptTrace[] }) {
  const [open, setOpen] = useState(false);
  return <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><button aria-expanded={open} className="prompt-log-trigger flex w-full items-center justify-between p-5 text-left" onClick={() => setOpen(!open)}><span><span className="block font-semibold">Prompt log</span><span className="mt-1 block text-sm text-[var(--muted)]">System, user, and model output for {traces.length} LLM call{traces.length === 1 ? "" : "s"}</span></span><ChevronDown size={18} className={open ? "rotate-180" : ""}/></button>{open && <div className="space-y-4 border-t border-[var(--line)] p-5">{traces.length === 0 ? <p className="text-sm text-[var(--muted)]">No LLM calls were made for this audit.</p> : traces.map((trace, index) => <article key={`${trace.task}-${trace.recordedAt}-${index}`} className="rounded-xl border border-[var(--line)] p-4"><div className="mb-3 flex flex-wrap justify-between gap-2 text-xs text-[var(--muted)]"><span>{trace.task} · {trace.model}</span><span>{trace.latencyMs} ms{trace.costUsd === undefined ? "" : ` · $${trace.costUsd.toFixed(4)}`}</span></div><TraceBlock label="System" value={trace.system}/><TraceBlock label="User" value={trace.user}/><TraceBlock label="Output" value={trace.error ? `Error: ${trace.error}` : trace.rawOutput}/></article>)}</div>}</section>;
}

function TraceBlock({ label, value }: { label: string; value: string }) {
  return <div className="mt-3"><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">{label}</h3><pre className="mt-1 max-h-72 overflow-auto whitespace-pre-wrap rounded-lg bg-[var(--bg)] p-3 text-xs leading-5">{value}</pre></div>;
}

function Finding({ result }: { result: CheckResult }) {
  const [open, setOpen] = useState(false);
  const color: Record<Status, string> = { fail: "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50", warn: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40", error: "text-red-700 bg-red-50", pass: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40", skip: "text-[var(--muted)] bg-[var(--bg)]" };
  const sev: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
  return <article className="finding-row"><button aria-expanded={open} onClick={() => setOpen(!open)} className="finding-trigger flex w-full items-start gap-4 px-5 py-5 text-left hover:bg-[var(--bg)]"><span className={`mt-0.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase ${color[result.status]}`}>{result.status}</span><span className="min-w-0 flex-1"><span className="block font-medium">{result.title}</span><span className="mt-1 block text-sm text-[var(--muted)]">{result.message}</span><span className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-[var(--muted)]"><span className="uppercase">{result.pillar} · {result.category.replaceAll("-", " ")}</span><span>{sev[result.severity]} priority</span>{result.url && <span className="finding-url">{result.url}</span>}</span></span><ChevronDown size={18} className={`mt-1 shrink-0 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`}/></button>{open && <div className="grid gap-5 bg-[var(--bg)] px-5 pb-5 md:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Evidence</h3><pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs leading-5">{JSON.stringify(result.evidence, null, 2)}</pre></div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Suggested fix</h3><p className="mt-2 text-sm leading-6">{result.fix?.summary ?? "Review the page and verify this check manually."}</p>{result.fix?.snippet && <div className="relative mt-3"><pre className="overflow-auto rounded-xl bg-[#10191b] p-4 pr-16 text-xs leading-5 text-[#c5e8e1]">{result.fix.snippet}</pre><button onClick={() => void navigator.clipboard.writeText(result.fix?.snippet ?? "")} className="absolute right-2 top-2 rounded-md border border-white/15 p-2 text-white" title="Copy snippet"><Clipboard size={14}/></button><span className="mt-1 block text-[10px] text-[var(--muted)]">{result.fix.snippetLang ?? "text"}</span></div>}</div></div>}</article>;
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: string[] }) {
  return <label className="filter-control"><span>{label}</span><select aria-label={label} value={value} onChange={(event) => onChange(event.target.value)}>{options.map((option) => <option key={option} value={option}>{option === "all" ? "All" : option.replaceAll("-", " ")}</option>)}</select></label>;
}
