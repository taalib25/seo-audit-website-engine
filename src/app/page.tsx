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
  const [logOpen, setLogOpen] = useState(false);
  const [logTab, setLogTab] = useState<"system" | "user" | "input" | "output">("system");

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
          <p className="text-xl var-text-muted mb-20">Analyzing your website</p>

          <div className="flex items-center justify-center gap-4 flex-wrap">
            {STEPS.map((step, i) => {
              const done = i < stepIndex;
              const active = i === stepIndex;
              return (
                <div
                  key={i}
                  className={`flex items-center gap-3 px-6 py-4 rounded-2xl transition-all duration-700 ${
                    active ? "var-primary-subtle border var-primary-border-strong" :
                    done ? "var-bg-card border var-border-subtle" :
                    "var-bg-card/50 border var-border-subtle"
                  }`}
                >
                  {done ? (
                    <svg className="w-5 h-5 var-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : active ? (
                    <span className="w-5 h-5 rounded-full border-2 border-primary border-t-transparent animate-spin" />
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
            <p className="text-sm var-text-muted mt-8 animate-fade-in">{STEPS[stepIndex].detail}</p>
          )}
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className="min-h-screen flex flex-col">
        <header className="absolute top-0 left-0 p-8">
          <span className="text-sm font-medium var-text-muted">Audit Engine</span>
        </header>

        <div className="flex-1 flex flex-col items-center justify-center px-6">
          <form onSubmit={handleSubmit} className="w-full max-w-2xl">
            <div className="relative">
              <input
                type="text"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="Enter website URL..."
                className="w-full text-2xl py-6 px-8 pr-32 rounded-3xl var-bg-card border var-border-subtle text-white placeholder:var-text-muted-subtle focus:outline-none focus:border-primary focus:ring-4 focus:ring-primary-subtle transition-all"
                autoFocus
              />
              <button
                type="submit"
                disabled={!url.trim()}
                className="absolute right-3 top-1/2 -translate-y-1/2 px-6 py-3 rounded-2xl bg-primary text-white font-medium disabled:opacity-20 hover:bg-primary-hover transition-all"
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
  const imgAny = m.images;

  return (
    <div className="min-h-screen px-6 py-10">
      <div className="max-w-6xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <button 
            onClick={() => { setStatus("idle"); setResult(null); setUrl(""); }} 
            className="w-12 h-12 rounded-full var-bg-card border var-border-subtle var-text-muted hover:text-white hover:var-primary-border flex items-center justify-center transition-all"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
          </button>
          
          <button onClick={() => setLogOpen(!logOpen)} className="text-base var-text-muted hover:text-primary transition-colors">
            {logOpen ? "Close Logger" : "View Prompt Log"}
          </button>
        </div>

        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-white">{hostname(result.url)}</h2>
          <p className="text-base var-text-muted mt-2">{result.url}</p>
        </div>

        <section className="mb-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <BigMetricBox
              value={m.wordCount.toLocaleString()}
              label="Words"
              ok={m.wordCount >= 800}
              tip="Aim for 800+ words"
            />
            <BigMetricBox
              value={m.headings.h1}
              label="H1 Tags"
              ok={m.headings.h1 === 1}
              tip="Exactly one H1 recommended"
            />
            <BigMetricBox
              value={m.ctaCount}
              label="CTAs"
              ok={m.ctaCount >= 3}
              tip="3+ call-to-actions recommended"
            />
            <BigMetricBox
              value={m.links.internal}
              label="Internal Links"
              ok={m.links.internal >= 3}
              tip="3+ internal links recommended"
            />
          </div>
        </section>

        <section className="mb-12">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <BigMetricBox
              value={m.links.external}
              label="External Links"
              tip="Links to other sites"
            />
            <BigMetricBox
              value={m.images.total}
              label="Images"
              tip="Total images on page"
            />
            <BigMetricBox
              value={`${imgAny.missingAltPercent ?? 0}%`}
              label="Missing Alt"
              ok={(imgAny.missingAltPercent ?? 100) <= 30}
              tip="Aim for 0% missing alt text"
            />
            <BigMetricBox
              value={m.meta.titleLength}
              label="Title Length"
              ok={m.meta.titleLength >= 30 && m.meta.titleLength <= 60}
              tip="30-60 characters optimal"
            />
          </div>
        </section>

        {m.meta.title && (
          <section className="mb-8 p-6 rounded-2xl var-bg-card border var-border-subtle">
            <p className="text-sm var-text-muted mb-2">Meta Title</p>
            <p className="text-xl font-medium text-white">{m.meta.title}</p>
            {m.meta.description && (
              <>
                <p className="text-sm var-text-muted mt-5 mb-2">Meta Description</p>
                <p className="text-base var-text-muted">{m.meta.description}</p>
              </>
            )}
          </section>
        )}

        {result.insights.length > 0 && (
          <section className="mb-12">
            <h3 className="text-base font-medium text-white/80 mb-4">AI Insights</h3>
            <div className="var-bg-card rounded-2xl border var-border-subtle divide-y divide-white/5">
              {[...result.insights].sort((a, b) => {
                const o = { high: 0, medium: 1, low: 2 };
                return o[a.severity] - o[b.severity];
              }).map((insight, i) => <InsightRow key={i} insight={insight} />)}
            </div>
          </section>
        )}

        {result.recommendations.length > 0 && (
          <section className="mb-10">
            <h3 className="text-base font-medium text-white/80 mb-4">Recommendations</h3>
            <div className="var-bg-card rounded-2xl border var-border-subtle divide-y divide-white/5">
              {[...result.recommendations].sort((a, b) => a.priority - b.priority).map((rec, i) => <RecommendationRow key={i} rec={rec} />)}
            </div>
          </section>
        )}
      </div>

      {logOpen && result.promptLog && (
        <div className="fixed top-0 right-0 w-[480px] h-full var-bg border-l var-border-subtle z-50 overflow-hidden flex flex-col animate-fade-in">
          <div className="p-4 border-b var-border-subtle flex items-center justify-between">
            <h3 className="text-sm font-medium text-white">Prompt Logger</h3>
            <button onClick={() => setLogOpen(false)} className="var-text-muted hover:text-white">
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          
          <div className="flex border-b var-border-subtle">
            {(["system", "user", "input", "output"] as const).map(tab => (
              <button
                key={tab}
                onClick={() => setLogTab(tab)}
                className={`flex-1 py-3 text-xs font-medium capitalize transition-colors ${
                  logTab === tab 
                    ? "text-primary border-b-2 border-primary" 
                    : "var-text-muted hover:text-white"
                }`}
              >
                {tab}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-auto p-4">
            <pre className="text-xs var-text-muted font-mono whitespace-pre-wrap">
              {logTab === "system" && result.promptLog.systemPrompt}
              {logTab === "user" && result.promptLog.userPrompt}
              {logTab === "input" && JSON.stringify(result.promptLog.structuredInput, null, 2)}
              {logTab === "output" && result.promptLog.rawModelOutput}
            </pre>
          </div>

          <div className="p-4 border-t var-border-subtle text-xs var-text-muted">
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

function BigMetricBox({ value, label, ok, tip }: {
  value: string | number; label: string; ok?: boolean; tip?: string;
}) {
  return (
    <div className={`group relative p-6 rounded-2xl ${ok !== undefined ? (ok ? "var-primary-subtle border var-primary-border" : "var-bg-card border var-border-subtle") : "var-bg-card border var-border-subtle"} transition-all hover:var-primary-border-hover`}>
      {tip && (
        <div className="absolute -top-10 left-1/2 -translate-x-1/2 var-bg text-white text-xs px-3 py-1.5 rounded-lg opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap z-10">
          {tip}
        </div>
      )}
      {ok !== undefined && (
        <span className={`absolute top-4 right-4 w-2 h-2 rounded-full ${ok ? "bg-primary" : "bg-warning"}`} />
      )}
      <p className="text-5xl font-bold text-white mb-1">{value}</p>
      <p className="text-sm var-text-muted">{label}</p>
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
    <div className="px-6 py-5 flex items-start gap-4">
      <span className={`w-2.5 h-2.5 rounded-full mt-2 ${colors.dot}`} />
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-base font-medium text-white">{insight.summary}</span>
          <span className={`text-xs px-2.5 py-1 rounded-full ${colors.badge}`}>{insight.severity}</span>
        </div>
        <p className="text-base var-text-muted">{insight.finding}</p>
        <p className="text-sm text-primary mt-3">{insight.impact}</p>
      </div>
    </div>
  );
}

function RecommendationRow({ rec }: { rec: Recommendation }) {
  return (
    <div className="px-6 py-5 flex items-start gap-4">
      <span className="w-8 h-8 rounded-xl bg-primary/20 text-primary text-base font-bold flex items-center justify-center flex-shrink-0">
        {rec.priority}
      </span>
      <div className="flex-1">
        <div className="flex items-center gap-3 mb-2">
          <span className="text-base font-medium text-white">{rec.title}</span>
          <span className="text-sm var-text-muted capitalize">{rec.category}</span>
          <span className={`text-sm ${
            rec.effort === "low" ? "text-emerald-400" : rec.effort === "medium" ? "text-amber-400" : "text-red-400"
          }`}>· {rec.effort} effort</span>
        </div>
        <p className="text-base var-text-muted">{rec.description}</p>
      </div>
    </div>
  );
}
