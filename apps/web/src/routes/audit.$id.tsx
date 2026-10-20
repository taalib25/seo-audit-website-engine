import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, ArrowUpRight, Check, ChevronDown, Clipboard, Download, ExternalLink, LoaderCircle, Moon, Sun } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import type { AuditReport, CheckResult, Pillar, Status, Severity } from "@aeo/core";
import { sampleReport } from "../fixtures/sample-report";

type AuditState = { status: "queued" | "running" | "complete" | "failed"; report?: AuditReport; progress?: number; stage?: string };
export const Route = createFileRoute("/audit/$id")({ component: AuditPage });

function Ring({ score, label }: { score: number; label: string }) {
  return <div className="flex items-center gap-3"><div className="ring grid size-14 shrink-0 place-items-center rounded-full" style={{ "--score": score } as React.CSSProperties}><div className="grid size-11 place-items-center rounded-full bg-[var(--surface)] text-sm font-semibold">{score}</div></div><div><div className="text-sm font-semibold uppercase tracking-wide">{label}</div><div className="text-xs text-[var(--muted)]">readiness score</div></div></div>;
}

function AuditPage() {
  const { id } = Route.useParams();
  const [state, setState] = useState<AuditState>(id === "demo" ? { status: "complete", report: sampleReport } : { status: "queued" });
  const [pillar, setPillar] = useState("all"); const [category, setCategory] = useState("all"); const [status, setStatusFilter] = useState("all"); const [severity, setSeverity] = useState("all"); const [group, setGroup] = useState("page"); const [dark, setDark] = useState(false); const [copied, setCopied] = useState(false);
  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    if (id === "demo") return;
    let source: EventSource | undefined;
    let cancelled = false;
    async function poll() {
      try {
        const response = await fetch(`/api/audits/${encodeURIComponent(id)}`);
        if (!response.ok) throw new Error("Audit not found");
        const data = await response.json() as AuditState;
        if (!cancelled) setState(data);
        if (data.status === "queued" || data.status === "running") {
          source = new EventSource(`/api/audits/${encodeURIComponent(id)}/events`);
          source.addEventListener("progress", (event) => { const payload = JSON.parse((event as MessageEvent<string>).data) as { progress?: number; stage?: string }; setState((s) => ({ ...s, status: "running", ...payload })); });
          source.addEventListener("complete", () => { source?.close(); void poll(); });
          source.addEventListener("error", () => { source?.close(); void poll(); });
        }
      } catch { if (!cancelled) setState({ status: "failed" }); }
    }
    void poll();
    return () => { cancelled = true; source?.close(); };
  }, [id, dark]);
  const report = state.report;
  const results = useMemo(() => report?.results.filter((item) => (pillar === "all" || item.pillar === pillar) && (category === "all" || item.category === category) && (status === "all" || item.status === status) && (severity === "all" || item.severity === severity) && (group === "site" ? !item.url : Boolean(item.url))) ?? [], [report, pillar, category, status, severity, group]);
  async function copyPrompt() {
    const prompt = `Review this SEO, AEO, and GEO audit for ${report?.startUrl}. Prioritize the high and critical findings, make minimal changes, and verify the result.\n\n${report?.results.filter((item) => item.fix).map((item) => `## ${item.title}\n${item.fix?.summary}\n${item.fix?.snippet ?? ""}`).join("\n\n") ?? ""}`;
    await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }
  if (state.status === "queued" || state.status === "running") return <main className="mx-auto min-h-screen max-w-5xl px-6 py-12"><Link to="/" className="flex items-center gap-2 text-sm text-[var(--muted)]"><ArrowLeft size={16}/>New audit</Link><div className="mx-auto mt-36 max-w-lg text-center"><span className="mx-auto grid size-16 place-items-center rounded-2xl bg-[var(--accent-soft)] text-[var(--accent)]"><LoaderCircle className="animate-spin" size={28}/></span><h1 className="mt-7 text-3xl font-semibold tracking-tight">Analyzing your site</h1><p className="mt-3 text-[var(--muted)]">{state.stage ?? "Waiting for an audit worker"}</p><div className="mt-8 h-2 overflow-hidden rounded-full bg-[var(--line)]"><div className="h-full rounded-full bg-[var(--accent)] transition-all" style={{ width: `${state.progress ?? 4}%` }}/></div><p className="mt-2 text-xs text-[var(--muted)]">{state.progress ?? 0}% · This page updates as checks finish</p></div></main>;
  if (!report) return <main className="mx-auto max-w-4xl px-6 py-20"><Link to="/" className="text-sm text-[var(--muted)]">← Back home</Link><h1 className="mt-12 text-3xl font-semibold">Audit unavailable</h1><p className="mt-3 text-[var(--muted)]">This audit could not be found or completed. Start a new audit and try again.</p></main>;
  const categories = [...new Set(report.results.map((item) => item.category))].sort();
  return <main className="min-h-screen"><header className="border-b border-[var(--line)] bg-[var(--surface)]"><div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-5"><Link to="/" className="flex items-center gap-2 text-sm text-[var(--muted)]"><ArrowLeft size={16}/>All audits</Link><div className="flex gap-2"><button onClick={() => setDark(!dark)} className="grid size-9 place-items-center rounded-lg border border-[var(--line)]" aria-label="Toggle theme">{dark ? <Sun size={16}/> : <Moon size={16}/>}</button><button onClick={() => void copyPrompt()} className="flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-sm font-semibold text-white">{copied ? <Check size={16}/> : <Clipboard size={16}/>} {copied ? "Copied" : "Copy fix prompt for your AI agent"}</button><a href={`/api/audits/${id}/prompt.md`} download className="grid size-9 place-items-center rounded-lg border border-[var(--line)]" title="Download fix prompt"><Download size={16}/></a></div></div></header>
    <div className="mx-auto max-w-7xl px-6 py-10"><div className="flex flex-col justify-between gap-6 lg:flex-row lg:items-end"><div><p className="text-xs font-semibold uppercase tracking-[.16em] text-[var(--accent)]">Website audit · {new Date(report.createdAt).toLocaleDateString()}</p><h1 className="mt-3 break-all text-3xl font-semibold tracking-tight sm:text-4xl">{new URL(report.startUrl).hostname}</h1><a className="mt-2 inline-flex items-center gap-1 text-sm text-[var(--muted)]" href={report.startUrl} target="_blank" rel="noreferrer">{report.startUrl}<ExternalLink size={13}/></a><div className="mt-4 flex flex-wrap gap-2 text-xs"><span className="rounded-full border border-[var(--line)] px-3 py-1.5">{report.pagesCrawled} page{report.pagesCrawled === 1 ? "" : "s"} crawled</span><span className="rounded-full border border-[var(--line)] px-3 py-1.5">{report.capabilities.includes("rendered-dom") ? "Rendered DOM" : "Raw HTML only"}</span><a href={`/api/audits/${id}/report.json`} className="inline-flex items-center gap-1 rounded-full border border-[var(--line)] px-3 py-1.5">JSON report <ArrowUpRight size={12}/></a></div></div><div className="flex flex-wrap items-center gap-6 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-5"><Ring score={report.scores.overall} label="overall"/>{report.scores.pillars.map((item) => <Ring key={item.pillar} score={item.score} label={item.pillar}/>)}</div></div>
      <section className="mt-10 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)]"><div className="flex flex-col gap-4 border-b border-[var(--line)] p-5 md:flex-row md:items-center md:justify-between"><div><h2 className="font-semibold">Findings</h2><p className="mt-1 text-sm text-[var(--muted)]">{results.length} results · inspect evidence and suggested fixes</p></div><div className="flex flex-wrap gap-2">{[[pillar,setPillar,["all","seo","aeo","geo"]],[category,setCategory,["all",...categories]],[status,setStatusFilter,["all","fail","warn","pass","skip","error"]],[severity,setSeverity,["all","critical","high","medium","low","info"]]].map(([value,setter,options], idx) => <select key={idx} value={value as string} onChange={(e) => (setter as (v:string)=>void)(e.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs capitalize"><>{(options as string[]).map((option) => <option key={option} value={option}>{option === "all" ? `All ${["pillars","categories","statuses","severity"][idx]}` : option.replaceAll("-", " ")}</option>)}</></select>)}<select value={group} onChange={(e) => setGroup(e.target.value)} className="rounded-lg border border-[var(--line)] bg-[var(--surface)] px-3 py-2 text-xs"><option value="page">Per page</option><option value="site">Site level</option></select></div></div>
      <div className="divide-y divide-[var(--line)]">{results.length === 0 ? <p className="p-8 text-center text-sm text-[var(--muted)]">No findings match these filters.</p> : results.map((item) => <Finding key={item.id} result={item}/>)}</div></section>
      <footer className="py-8 text-xs text-[var(--muted)]">{report.stack.length ? `Detected stack: ${report.stack.join(", ")}` : "Checks are based on publicly accessible page data."}</footer>
    </div></main>;
}

function Finding({ result }: { result: CheckResult }) {
  const [open, setOpen] = useState(false);
  const color: Record<Status, string> = { fail: "text-red-700 bg-red-50 dark:text-red-300 dark:bg-red-950/50", warn: "text-amber-700 bg-amber-50 dark:text-amber-300 dark:bg-amber-950/40", error: "text-red-700 bg-red-50", pass: "text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-950/40", skip: "text-[var(--muted)] bg-[var(--bg)]" };
  const sev: Record<Severity, string> = { critical: "Critical", high: "High", medium: "Medium", low: "Low", info: "Info" };
  return <article><button onClick={() => setOpen(!open)} className="flex w-full items-start gap-4 px-5 py-5 text-left hover:bg-[var(--bg)]"><span className={`mt-0.5 rounded-md px-2 py-1 text-[10px] font-semibold uppercase ${color[result.status]}`}>{result.status}</span><span className="min-w-0 flex-1"><span className="block font-medium">{result.title}</span><span className="mt-1 block text-sm text-[var(--muted)]">{result.message}</span><span className="mt-2 flex flex-wrap gap-x-3 text-[11px] text-[var(--muted)]"><span className="uppercase">{result.pillar} · {result.category.replaceAll("-", " ")}</span><span>{sev[result.severity]} priority</span>{result.url && <span className="max-w-sm truncate">{result.url}</span>}</span></span><ChevronDown size={18} className={`mt-1 shrink-0 text-[var(--muted)] transition ${open ? "rotate-180" : ""}`}/></button>{open && <div className="grid gap-5 bg-[var(--bg)] px-5 pb-5 md:grid-cols-2"><div><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Evidence</h3><pre className="mt-2 max-h-56 overflow-auto rounded-xl border border-[var(--line)] bg-[var(--surface)] p-4 text-xs leading-5">{JSON.stringify(result.evidence, null, 2)}</pre></div><div><h3 className="text-xs font-semibold uppercase tracking-wide text-[var(--muted)]">Suggested fix</h3><p className="mt-2 text-sm leading-6">{result.fix?.summary ?? "Review the page and verify this check manually."}</p>{result.fix?.snippet && <div className="relative mt-3"><pre className="overflow-auto rounded-xl bg-[#10191b] p-4 pr-16 text-xs leading-5 text-[#c5e8e1]">{result.fix.snippet}</pre><button onClick={() => void navigator.clipboard.writeText(result.fix?.snippet ?? "")} className="absolute right-2 top-2 rounded-md border border-white/15 p-2 text-white" title="Copy snippet"><Clipboard size={14}/></button><span className="mt-1 block text-[10px] text-[var(--muted)]">{result.fix.snippetLang ?? "text"}</span></div>}</div></div>}</article>;
}
