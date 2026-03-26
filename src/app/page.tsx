"use client";

import { useState } from "react";
import type { AuditResponse, AIInsight, Recommendation } from "@/types/audit";

const STEPS = [
  { label: "Fetching", detail: "Downloading HTML and extracting meta tags, links, images..." },
  { label: "Analyzing", detail: "Counting words, measuring structure, checking accessibility..." },
  { label: "Generating", detail: "AI analyzing SEO, UX, and conversion patterns..." },
];

export default function Home() {
  const [url, setUrl] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [showPrompt, setShowPrompt] = useState(false);

  const cleanUrl = (v: string) => v.trim().replace(/^https?:\/\//, "").replace(/\/+$/, "") || "";
  const hostname = (u: string) => { try { return new URL(u).hostname.replace("www.", ""); } catch { return u; } };

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
      <div className="min-h-screen flex flex-col items-center justify-center px-6">
        <div className="animate-fade-in text-center max-w-2xl mx-auto">
          <p className="text-6xl md:text-7xl font-bold text-white tracking-tight mb-4">{hostname(cleanUrl(url))}</p>
          <p className="text-[#64748b] text-xl mb-20">Analyzing your website</p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            {STEPS.map((step, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-700 ${
                    active ? "bg-[#7c3aed]/20 border border-[#7c3aed]/40" :
                    done ? "bg-[#13131a] border border-white/5" :
                    "bg-[#13131a]/50 border border-white/5"
                  }`}
                >
                  {done ? (
                    <svg className="w-5 h-5 text-[#7c3aed]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : active ? (
                    <span className="w-5 h-5 rounded-full border-2 border-[#7c3aed] border-t-transparent animate-spin" />
                  ) : (
                    <span className="w-5 h-5 rounded-full border-2 border-white/10" />
                  )}
                  <span className={`font-medium ${active ? "text-white" : done ? "text-white/50" : "text-white/20"}`}>
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>

          {STEPS[stepIndex] && (
            <p className="text-sm text-[#64748b] mt-8 animate-fade-in">{STEPS[stepIndex].detail}</p>
          )}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="absolute top-0 left-0 p-8">
          <span className="text-sm font-medium text-[#64748b]">Audit Engine</span>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <form onSubmit={handleSubmit} className="w-full max-w-2xl">
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter website URL..."
                className="w-full text-2xl py-6 px-8 pr-32 rounded-3xl bg-[#13131a] border border-white/5 text-white placeholder-[#64748b]/60 focus:outline-none focus:border-[#7c3aed] focus:ring-4 focus:ring-[#7c3aed]/10 transition-all"
                autoFocus
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-3 rounded-2xl bg-[#7c3aed] text-white font-medium disabled:opacity-20 hover:bg-[#8b5cf6] transition-all"
              >
                Analyze
              </button>
            </div>
          </form>
          {error && <p className="mt-8 text-red-400 text-center">{error}</p>}
        </div>
      </div>
    );
  }

  const m = result.metrics;
  const imgAny = m.images as any;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-12">
          <button onClick={() => { setStatus("idle"); setResult(null); setUrl(""); }} className="text-[#64748b] hover:text-white transition-colors text-sm">
            ← New Audit
          </button>
          <div className="text-center">
            <h2 className="text-2xl font-bold text-white">{hostname(result.url)}</h2>
            <p className="text-sm text-[#64748b] mt-1">{result.url}</p>
          </div>
          <button onClick={() => setShowPrompt(!showPrompt)} className="text-sm text-[#64748b] hover:text-[#7c3aed] transition-colors">
            {showPrompt ? "Hide" : "Show"} Log
          </button>
        </div>

        {showPrompt && result.promptLog && (
          <div className="mb-10 rounded-2xl bg-[#13131a] border border-white/5 p-5 animate-fade-in">
            <pre className="text-xs text-[#64748b] overflow-auto max-h-64 font-mono">{JSON.stringify(result.promptLog, null, 2)}</pre>
          </div>
        )}

        <section className="mb-12">
          <h3 className="text-sm font-medium text-white/80 mb-5">Page Metrics</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>}
              label="Meta Title"
              value={m.meta.title || "—"}
              sublabel={`${m.meta.titleLength} chars`}
              tip="Ideal length: 30-60 characters for good SEO"
            />
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 6h16M4 12h16M4 18h7" /></svg>}
              label="Word Count"
              value={m.wordCount.toLocaleString()}
              ok={m.wordCount >= 800}
              tip="Aim for 800+ words for good content depth"
            />
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" /></svg>}
              label="H1 Headings"
              value={m.headings.h1}
              ok={m.headings.h1 === 1}
              tip="Exactly one H1 tag is recommended"
            />
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.586m0 0L11 14h4a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2v4l.586-.586z" /></svg>}
              label="CTAs Found"
              value={m.ctaCount}
              ok={m.ctaCount >= 3}
              tip="3+ call-to-action elements recommended"
            />
          </div>
        </section>

        <section className="mb-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" /></svg>}
              label="Internal Links"
              value={m.links.internal}
              ok={m.links.internal >= 3}
              tip="Links to other pages on your site"
            />
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" /></svg>}
              label="External Links"
              value={m.links.external}
              tip="Links to other websites"
            />
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>}
              label="Total Images"
              value={m.images.total}
              tip="Total images found on the page"
            />
            <MetricBox
              icon={<svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}
              label="Missing Alt Text"
              value={`${imgAny.missingAltPercent ?? 0}%`}
              sublabel={`${imgAny.missingAlt ?? 0} images`}
              ok={(imgAny.missingAltPercent ?? 100) <= 30}
              tip="Aim for 100% alt text coverage for accessibility"
            />
          </div>
        </section>

        {result.insights.length > 0 && (
          <section className="mb-12">
            <h3 className="text-sm font-medium text-white/80 mb-4">Key Insights</h3>
            <div className="bg-[#13131a] rounded-2xl border border-white/5 divide-y divide-white/5">
              {[...result.insights].sort((a, b) => {
                const o = { high: 0, medium: 1, low: 2 };
                return o[a.severity] - o[b.severity];
              }).map((insight, i) => <InsightRow key={i} insight={insight} />)}
            </div>
          </section>
        )}

        {result.recommendations.length > 0 && (
          <section className="mb-10">
            <h3 className="text-sm font-medium text-white/80 mb-4">Recommendations</h3>
            <div className="bg-[#13131a] rounded-2xl border border-white/5 divide-y divide-white/5">
              {[...result.recommendations].sort((a, b) => a.priority - b.priority).map((rec, i) => <RecommendationRow key={i} rec={rec} />)}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}

function MetricBox({ icon, label, value, sublabel, ok, tip }: {
  icon: React.ReactNode; label: string; value: string | number; sublabel?: string; ok?: boolean; tip?: string;
}) {
  return (
    <div className={`group relative p-5 rounded-2xl ${ok !== undefined ? (ok ? "bg-[#7c3aed]/10 border border-[#7c3aed]/20" : "bg-[#13131a] border border-white/5") : "bg-[#13131a] border border-white/5"} transition-all hover:border-[#7c3aed]/30`}>
      {tip && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-[#1e1e2e] text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          {tip}
        </div>
      )}
      <div className="flex items-start justify-between mb-3">
        <span className="text-[#64748b]">{icon}</span>
        {ok !== undefined && (
          <span className={`w-2 h-2 rounded-full ${ok ? "bg-[#7c3aed]" : "bg-amber-500"}`} />
        )}
      </div>
      <p className="text-xs text-[#64748b] mb-1">{label}</p>
      <p className="text-xl font-bold text-white truncate" title={String(value)}>{value}</p>
      {sublabel && <p className="text-xs text-[#64748b]/60 mt-1">{sublabel}</p>}
    </div>
  );
}

function InsightRow({ insight }: { insight: AIInsight }) {
  const colors = {
    high: { dot: "bg-red-400", badge: "bg-red-500/10 text-red-400" },
    medium: { dot: "bg-amber-400", badge: "bg-amber-500/10 text-amber-400" },
    low: { dot: "bg-emerald-400", badge: "bg-emerald-500/10 text-emerald-400" },
  }[insight.severity];

  return (
    <div className="px-5 py-4 flex items-start gap-3">
      <span className={`w-2 h-2 rounded-full mt-2 ${colors.dot}`} />
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white">{insight.summary}</span>
          <span className={`text-xs px-2 py-0.5 rounded-full ${colors.badge}`}>{insight.severity}</span>
        </div>
        <p className="text-sm text-[#64748b]">{insight.finding}</p>
        <p className="text-xs text-[#7c3aed] mt-2">{insight.impact}</p>
      </div>
    </div>
  );
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  return (
    <div className="px-5 py-4 flex items-start gap-3">
      <span className="w-7 h-7 rounded-lg bg-[#7c3aed]/20 text-[#7c3aed] text-sm font-bold flex items-center justify-center flex-shrink-0">
        {rec.priority}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-sm font-medium text-white">{rec.title}</span>
          <span className="text-xs text-[#64748b] capitalize">{rec.category}</span>
          <span className={`text-xs ${
            rec.effort === "low" ? "text-emerald-400" : rec.effort === "medium" ? "text-amber-400" : "text-red-400"
          }`}>· {rec.effort} effort</span>
        </div>
        <p className="text-sm text-[#64748b]">{rec.description}</p>
      </div>
    </div>
  );
}
