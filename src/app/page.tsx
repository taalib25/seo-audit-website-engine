"use client";

import { useState, useEffect, useRef } from "react";
import type { AuditResponse, AIInsight, Recommendation, DerivedSignals } from "@/types/audit";

const STEPS = [
  { label: "Fetching", detail: "Downloading HTML and extracting meta tags, links, images..." },
  { label: "Analyzing", detail: "Counting words, measuring structure, checking accessibility..." },
  { label: "Generating", detail: "AI analyzing SEO, content, and conversion patterns..." },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<"system" | "user" | "input" | "output">("system");
  const [elapsed, setElapsed] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (status === "loading") {
      setElapsed(0);
      timerRef.current = setInterval(() => setElapsed(s => s + 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [status]);

  const cleanUrl = (v: string) => v.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") || "";
  const hostname = (u: string) => {
    try {
      const withProto = u.startsWith("http") ? u : "https://" + u;
      return new URL(withProto).hostname.replace(/^www\./, "");
    } catch {
      return u.split("/")[0].replace(/^www\./, "");
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const target = cleanUrl(url);
    if (!target) return;

    setStatus("loading");
    setStepIndex(0);
    setError("");
    setResult(null);

    let step = 0;
    const tick = setInterval(() => { if (step < 2) { step++; setStepIndex(step); } }, 2000);

    try {
      const res = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: `https://${target}` }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      clearInterval(tick);
      setStatus("done");
      setResult(data);
    } catch (err) {
      clearInterval(tick);
      setError(err instanceof Error ? err.message : "Error");
      setStatus("idle");
    }
  };

  if (status === "loading") {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="absolute top-0 left-0 p-8">
          <span className="text-sm font-medium tracking-wide" style={{ color: 'var(--text-muted)' }}>webaudit</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <div className="animate-fade-in text-center max-w-2xl mx-auto">
            <p className="text-5xl md:text-6xl font-bold tracking-tight mb-4 max-w-2xl mx-auto break-all" style={{ color: '#fff' }}>{hostname(cleanUrl(url))}</p>
            <p className="text-xl mb-2" style={{ color: 'var(--text-muted)' }}>Analyzing your website</p>
            <p className="text-sm mb-20 tabular-nums" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
              {elapsed < 30
                ? `~${30 - elapsed}s remaining`
                : "Almost there..."}
            </p>
            <div className="flex items-center justify-center gap-4 flex-wrap">
              {STEPS.map((step, i) => {
                const done = i < stepIndex;
                const active = i === stepIndex;
                return (
                  <div
                    key={i}
                    className="flex items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-700"
                    style={{
                      background: active ? 'var(--primary-subtle)' : 'var(--bg-card)',
                      border: `1px solid ${active ? 'var(--primary-border-strong)' : 'var(--border-subtle)'}`,
                    }}
                  >
                    {done ? (
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3} style={{ color: 'var(--primary)' }}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    ) : active ? (
                      <span className="w-5 h-5 rounded-full border-2 animate-spin" style={{ borderColor: 'var(--primary)', borderTopColor: 'transparent' }} />
                    ) : (
                      <span className="w-5 h-5 rounded-full border-2" style={{ borderColor: 'var(--border)' }} />
                    )}
                    <span className="font-medium" style={{ color: active ? '#fff' : done ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0.2)' }}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
            {STEPS[stepIndex] && (
              <p className="text-sm mt-8 animate-fade-in" style={{ color: 'var(--text-muted)' }}>{STEPS[stepIndex].detail}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="absolute top-0 left-0 p-8">
          <span className="text-sm font-medium tracking-wide" style={{ color: 'var(--text-muted)' }}>webaudit</span>
        </header>
        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <form onSubmit={handleSubmit} className="w-full max-w-2xl">
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter website URL..."
                className="w-full text-2xl py-6 px-8 pr-20 rounded-3xl glass text-white transition-all focus:outline-none"
                style={{ color: '#fff' }}
                autoFocus
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 w-12 h-12 rounded-2xl flex items-center justify-center disabled:opacity-20 hover:opacity-90 transition-all"
                style={{ background: 'var(--primary)' }}
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} style={{ color: '#fff' }}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </button>
            </div>
          </form>
          {error && <p className="mt-8 text-center" style={{ color: '#ef4444' }}>{error}</p>}
        </div>
        <footer className="pb-6 flex items-center justify-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>built by Taalib Asaf</span>
          <a href="https://github.com/talibasaf" target="_blank" rel="noopener noreferrer" className="opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </footer>
      </div>
    );
  }

  const m = result.metrics;
  const s = result.signals;

  return (
    <div className="min-h-screen flex flex-col px-6 py-10">
      <div className="max-w-6xl mx-auto w-full flex-1">
        {/* Header */}
        <header className="mb-8 flex items-center justify-between">
          <span className="text-sm font-medium tracking-wide" style={{ color: 'var(--text-muted)' }}>webaudit</span>
          <button onClick={() => setLogOpen(!logOpen)} className="text-base transition-colors" style={{ color: 'var(--text-muted)' }}>
            {logOpen ? "Close Logger" : "View Prompt Log"}
          </button>
        </header>

        <div className="flex items-center justify-between mb-10">
          <button
            onClick={() => { setStatus("idle"); setResult(null); setUrl(""); }}
            className="w-12 h-12 rounded-full flex items-center justify-center transition-all"
            style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          <div className="text-center">
            <h2 className="text-5xl font-bold tracking-tight break-all" style={{ color: '#fff' }}>{hostname(result.url)}</h2>
            <p className="text-sm mt-3 max-w-lg mx-auto truncate" style={{ color: 'var(--text-muted)' }} title={result.url}>{result.url}</p>
          </div>
          <div className="w-12" />
        </div>

        {/* === FACTUAL METRICS (Required by assignment) === */}
        <section className="mb-6">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Factual Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard value={m.wordCount.toLocaleString()} label="Words" ok={m.wordCount >= 300} tip="Total word count on page" />
            <MetricCard value={m.headings.h1} label="H1 Tags" ok={m.headings.h1 === 1} tip="Exactly one H1 recommended" />
            <MetricCard value={m.headings.h2} label="H2 Tags" tip="Section headings" />
            <MetricCard value={m.headings.h3} label="H3 Tags" tip="Sub-section headings" />
          </div>
        </section>

        <section className="mb-10">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricCard value={m.ctaCount} label="CTAs" ok={m.ctaCount >= 3} tip="Buttons and action links" />
            <MetricCard value={m.links.internal} label="Internal Links" ok={m.links.internal >= 3} tip="Links within the site" />
            <MetricCard value={m.links.external} label="External Links" tip="Links to other sites" />
            <MetricCard value={m.images.total} label="Images" tip="Total images on page" />
          </div>
        </section>

        <section className="mb-10">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            <MetricCard value={`${Math.round(m.images.missingAltPercent)}%`} label="Missing Alt Text" ok={m.images.missingAltPercent <= 30} tip="Aim for 0% missing" />
            <MetricCard value={m.meta.titleLength} label="Title Length" ok={m.meta.titleLength >= 30 && m.meta.titleLength <= 60} tip="30–60 chars optimal" />
            <MetricCard value={m.meta.descriptionLength} label="Description Length" ok={m.meta.descriptionLength >= 120 && m.meta.descriptionLength <= 160} tip="120–160 chars optimal" />
          </div>
        </section>

        {/* === TECHNICAL CHECKS (Deterministic — no AI) === */}
        <section className="mb-10">
          <h3 className="text-xs font-medium uppercase tracking-wider mb-3" style={{ color: 'var(--text-muted)' }}>Technical Checks</h3>
          <div className="flex flex-wrap gap-2">
            <HealthCheck label="Canonical" status={m.seo.canonical ? "pass" : "warn"} detail={m.seo.canonical ? "set" : "missing"} />
            <HealthCheck label="Indexable" status={s.hasNoindex ? "fail" : "pass"} detail={s.hasNoindex ? "noindex!" : "yes"} />
            <HealthCheck label="Viewport" status={m.seo.viewport ? "pass" : "fail"} detail={m.seo.viewport ? "set" : "missing"} />
            <HealthCheck label="OG Tags" status={s.ogImagePresent ? "pass" : Object.keys(m.meta.ogTags).length > 0 ? "warn" : "fail"} detail={s.ogImagePresent ? "with image" : Object.keys(m.meta.ogTags).length > 0 ? "no image" : "missing"} />
            <HealthCheck label="Scannability" status={s.contentScannability === "good" ? "pass" : s.contentScannability === "ok" ? "warn" : "fail"} detail={`${m.listCount} lists · ${m.headings.h2} H2s`} />
            <HealthCheck label="Anchor Text" status={m.genericAnchorCount === 0 ? "pass" : m.genericAnchorCount <= 3 ? "warn" : "fail"} detail={m.genericAnchorCount === 0 ? "all specific" : `${m.genericAnchorCount} generic`} />
            {m.dynamicContentSuspected && (
              <HealthCheck label="JS Rendering" status="warn" detail="content may be incomplete" />
            )}
          </div>
        </section>

        {/* Meta Title & Description */}
        {m.meta.title && (
          <section className="mb-10 p-6 rounded-2xl" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}>
            <p className="text-sm mb-2" style={{ color: 'var(--text-muted)' }}>Meta Title</p>
            <p className="text-xl font-medium" style={{ color: '#fff' }}>{m.meta.title}</p>
            {m.meta.description && (
              <>
                <p className="text-sm mt-5 mb-2" style={{ color: 'var(--text-muted)' }}>Meta Description</p>
                <p className="text-base" style={{ color: 'var(--text-muted)' }}>{m.meta.description}</p>
              </>
            )}
          </section>
        )}

        {/* === AI INSIGHTS (Required by assignment) === */}
        {result.insights.length > 0 && (
          <section className="mb-10">
            <h3 className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>AI Insights</h3>
            <div className="rounded-2xl divide-y" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderColor: 'var(--border-subtle)' }}>
              {[...result.insights].sort((a, b) => {
                const o = { high: 0, medium: 1, low: 2 };
                return o[a.severity] - o[b.severity];
              }).map((insight, i) => <InsightRow key={i} insight={insight} />)}
            </div>
          </section>
        )}

        {/* === RECOMMENDATIONS (Required by assignment) === */}
        {result.recommendations.length > 0 && (
          <section className="mb-10">
            <h3 className="text-xs font-medium uppercase tracking-wider mb-4" style={{ color: 'var(--text-muted)' }}>Recommendations</h3>
            <div className="rounded-2xl divide-y" style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)', borderColor: 'var(--border-subtle)' }}>
              {[...result.recommendations].sort((a, b) => a.priority - b.priority).map((rec, i) => <RecommendationRow key={i} rec={rec} />)}
            </div>
          </section>
        )}

        <footer className="pt-8 pb-6 flex items-center justify-center gap-2">
          <span className="text-xs" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>built by Taalib Asaf</span>
          <a href="https://github.com/talibasaf" target="_blank" rel="noopener noreferrer" className="opacity-50 hover:opacity-100 transition-opacity">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24" style={{ color: 'var(--text-muted)' }}>
              <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
            </svg>
          </a>
        </footer>
      </div>

      {/* === PROMPT LOG PANEL (Required by assignment) === */}
      {logOpen && result.promptLog && (
        <div className="fixed top-0 right-0 w-[480px] h-full z-50 overflow-hidden flex flex-col animate-fade-in" style={{ background: 'var(--bg)', borderLeft: '1px solid var(--border-subtle)' }}>
          <div className="p-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <h3 className="text-sm font-medium" style={{ color: '#fff' }}>Prompt Logger</h3>
            <button onClick={() => setLogOpen(false)} style={{ color: 'var(--text-muted)' }}>
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          <div className="flex" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            {(["system", "user", "input", "output"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setLogTab(tab)}
                className="flex-1 py-3 text-xs font-medium capitalize transition-colors"
                style={{
                  color: logTab === tab ? 'var(--primary)' : 'var(--text-muted)',
                  borderBottom: logTab === tab ? '2px solid var(--primary)' : '2px solid transparent',
                }}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            <pre className="text-xs font-mono whitespace-pre-wrap" style={{ color: 'var(--text-muted)' }}>
              {logTab === "system" && result.promptLog.systemPrompt}
              {logTab === "user" && result.promptLog.userPrompt}
              {logTab === "input" && JSON.stringify(result.promptLog.structuredInput, null, 2)}
              {logTab === "output" && result.promptLog.rawModelOutput}
            </pre>
          </div>

          <div className="p-4 text-xs" style={{ borderTop: '1px solid var(--border-subtle)', color: 'var(--text-muted)' }}>
            <div className="flex gap-4">
              <span>Model: {result.promptLog.executionMeta?.model}</span>
              <span>Time: {result.promptLog.executionMeta?.timestamp}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Components ─── */

function MetricCard({ value, label, ok, tip }: {
  value: string | number; label: string; ok?: boolean; tip?: string;
}) {
  return (
    <div
      className="group relative p-6 rounded-2xl transition-all"
      style={{ background: 'var(--bg-card)', border: '1px solid var(--border-subtle)' }}
    >
      {tip && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10" style={{ background: 'var(--bg-elevated)' }}>
          {tip}
        </div>
      )}
      {ok !== undefined && (
        <span className="absolute top-4 right-4 w-2 h-2 rounded-full" style={{ background: ok ? 'var(--primary)' : 'var(--warning)' }} />
      )}
      <p className="text-4xl font-bold mb-1" style={{ color: '#fff' }}>{value}</p>
      <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{label}</p>
    </div>
  );
}

function InsightRow({ insight }: { insight: AIInsight }) {
  const colors = {
    high: { dot: '#ef4444', badge: 'rgba(239, 68, 68, 0.1)', text: '#ef4444', border: 'rgba(239, 68, 68, 0.3)' },
    medium: { dot: '#f59e0b', badge: 'rgba(245, 158, 11, 0.1)', text: '#f59e0b', border: 'rgba(245, 158, 11, 0.3)' },
    low: { dot: '#10b981', badge: 'rgba(16, 185, 129, 0.1)', text: '#10b981', border: 'rgba(16, 185, 129, 0.3)' },
  }[insight.severity];

  return (
    <div className="px-6 py-6 flex items-start gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
      {/* Severity dot */}
      <span className="w-2 h-2 rounded-full mt-2.5 flex-shrink-0" style={{ background: colors.dot }} />
      <div className="flex-1 min-w-0">
        {/* Level 1 — Headline: summary + badge */}
        <div className="flex items-center gap-2.5 mb-2 flex-wrap">
          <span className="text-base font-semibold leading-snug" style={{ color: '#fff' }}>{insight.summary}</span>
          <span className="text-xs px-2 py-0.5 rounded-full font-medium flex-shrink-0" style={{ background: colors.badge, color: colors.text }}>{insight.severity}</span>
        </div>
        {/* Level 2 — Body: finding detail */}
        <p className="text-sm leading-relaxed" style={{ color: 'rgba(255,255,255,0.45)' }}>{insight.finding}</p>
        {/* Level 3 — Callout: impact (left border, no purple) */}
        {insight.impact && (
          <div className="mt-3 pl-3 text-sm leading-relaxed" style={{ borderLeft: `2px solid ${colors.border}`, color: 'rgba(255,255,255,0.6)' }}>
            {insight.impact}
          </div>
        )}
      </div>
    </div>
  );
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  return (
    <div className="px-6 py-5 flex items-start gap-4" style={{ borderColor: 'var(--border-subtle)' }}>
      <span className="w-8 h-8 rounded-xl text-base font-bold flex items-center justify-center flex-shrink-0" style={{ background: 'var(--primary-subtle)', color: 'var(--primary)' }}>
        {rec.priority}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-base font-medium" style={{ color: '#fff' }}>{rec.title}</span>
          <span className="text-sm capitalize" style={{ color: 'var(--text-muted)' }}>{rec.category}</span>
          <span className="text-sm" style={{
            color: rec.effort === "low" ? '#10b981' : rec.effort === "medium" ? '#f59e0b' : '#ef4444'
          }}>· {rec.effort} effort</span>
        </div>
        <p className="text-base" style={{ color: 'var(--text-muted)' }}>{rec.description}</p>
      </div>
    </div>
  );
}

function HealthCheck({ label, status, detail }: { label: string; status: "pass" | "warn" | "fail"; detail: string }) {
  const cfg = {
    pass: { icon: "✓", color: "#10b981", bg: "rgba(16,185,129,0.08)", border: "rgba(16,185,129,0.2)" },
    warn: { icon: "~", color: "#f59e0b", bg: "rgba(245,158,11,0.08)", border: "rgba(245,158,11,0.2)" },
    fail: { icon: "✗", color: "#ef4444", bg: "rgba(239,68,68,0.08)", border: "rgba(239,68,68,0.2)" },
  }[status];

  return (
    <div
      className="flex items-center gap-2 px-3 py-2 rounded-xl text-sm"
      style={{ background: cfg.bg, border: `1px solid ${cfg.border}` }}
    >
      <span className="font-bold text-xs" style={{ color: cfg.color }}>{cfg.icon}</span>
      <span style={{ color: '#fff' }}>{label}</span>
      <span style={{ color: 'var(--text-muted)' }}>{detail}</span>
    </div>
  );
}
