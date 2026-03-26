"use client";

import { useState } from "react";
import type {
  AuditResponse,
  MetricsObject,
  AIInsight,
  Recommendation,
  PromptLog,
} from "@/types/audit";

type TabType = "metrics" | "insights" | "recommendations" | "prompts";
type PromptTabType = "system" | "user" | "input" | "output";

export default function Home() {
  const [url, setUrl] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AuditResponse | null>(null);
  const [activeTab, setActiveTab] = useState<TabType>("metrics");
  const [promptTab, setPromptTab] = useState<PromptTabType>("system");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const response = await fetch("/api/audit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Failed to analyze URL");
      }

      setResult(data);
      setActiveTab("metrics");
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b">
        <div className="container mx-auto px-4 py-4">
          <h1 className="text-xl font-bold">AI Website Audit Engine</h1>
          <p className="text-sm text-muted-foreground">
            Deterministic metrics + Derived signals + AI insights
          </p>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        {/* Input Form */}
        <form onSubmit={handleSubmit} className="mb-8">
          <div className="flex gap-2 max-w-2xl mx-auto">
            <input
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="Enter URL (e.g., https://example.com)"
              className="flex-1 px-4 py-2 border rounded-md bg-background"
              required
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 disabled:opacity-50"
            >
              {loading ? "Analyzing..." : "Audit"}
            </button>
          </div>
        </form>

        {/* Error */}
        {error && (
          <div className="max-w-2xl mx-auto mb-8 p-4 bg-destructive/10 border border-destructive rounded-md text-destructive">
            {error}
          </div>
        )}

        {/* Loading */}
        {loading && (
          <div className="max-w-2xl mx-auto text-center py-8">
            <p className="text-muted-foreground">
              Scraping page, deriving signals, and generating AI insights...
            </p>
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="max-w-4xl mx-auto">
            {/* Dynamic Content Warning */}
            {result.metrics.dynamicContentSuspected && (
              <div className="flex items-center gap-3 p-4 bg-yellow-50 border border-yellow-200 rounded-md mb-4">
                <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-yellow-600 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="text-sm text-yellow-800">Dynamic content detected — metrics may be incomplete. This page appears to be JavaScript-heavy.</span>
              </div>
            )}

            {/* Tabs */}
            <div className="flex gap-2 mb-4 border-b">
              <TabButton active={activeTab === "metrics"} onClick={() => setActiveTab("metrics")}>
                Metrics
              </TabButton>
              <TabButton active={activeTab === "insights"} onClick={() => setActiveTab("insights")}>
                Insights
              </TabButton>
              <TabButton
                active={activeTab === "recommendations"}
                onClick={() => setActiveTab("recommendations")}
              >
                Recommendations
              </TabButton>
              <TabButton active={activeTab === "prompts"} onClick={() => setActiveTab("prompts")}>
                Prompt Logs
              </TabButton>
            </div>

            {/* Tab Content */}
            {activeTab === "metrics" && <MetricsPanel metrics={result.metrics} />}
            {activeTab === "insights" && <InsightsPanel insights={result.insights} />}
            {activeTab === "recommendations" && (
              <RecommendationsPanel recommendations={result.recommendations} />
            )}
            {activeTab === "prompts" && (
              <PromptLogsPanel promptLog={result.promptLog} activeTab={promptTab} onTabChange={setPromptTab} />
            )}
          </div>
        )}
      </main>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm border-b-2 transition-colors ${
        active
          ? "border-primary text-foreground font-medium"
          : "border-transparent text-muted-foreground hover:text-foreground"
      }`}
    >
      {children}
    </button>
  );
}

function MetricsPanel({ metrics }: { metrics: MetricsObject }) {
  // Helper to get status label
  const getStatus = (condition: boolean, okLabel = "OK", warnLabel = "Warning") =>
    condition ? okLabel : warnLabel;

  return (
    <div className="space-y-6">
      {/* Meta Tags */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4">
          <h2 className="text-base font-semibold mb-3">Meta Tags</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <MetricStat
              label="Title"
              value={metrics.meta.title || "(empty)"}
              status={metrics.meta.titleLength > 0 ? "good" : "warning"}
              statusLabel={metrics.meta.titleLength > 0 ? "Present" : "Missing"}
            />
            <MetricStat
              label="Title Length"
              value={`${metrics.meta.titleLength} chars`}
              status={metrics.meta.titleLength >= 30 && metrics.meta.titleLength <= 60 ? "good" : "warning"}
              statusLabel={getStatus(metrics.meta.titleLength >= 30 && metrics.meta.titleLength <= 60, "Good length", "Should be 30-60 chars")}
            />
            <MetricStat
              label="Description"
              value={metrics.meta.description || "(empty)"}
              status={metrics.meta.descriptionLength > 0 ? "good" : "warning"}
              statusLabel={metrics.meta.descriptionLength > 0 ? "Present" : "Missing"}
            />
            <MetricStat
              label="Description Length"
              value={`${metrics.meta.descriptionLength} chars`}
              status={metrics.meta.descriptionLength >= 120 && metrics.meta.descriptionLength <= 160 ? "good" : "warning"}
              statusLabel={getStatus(metrics.meta.descriptionLength >= 120 && metrics.meta.descriptionLength <= 160, "Good length", "Should be 120-160 chars")}
            />
          </div>
        </div>
      </div>

      {/* Headings */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4">
          <h2 className="text-base font-semibold mb-3">Headings (SEO Structure)</h2>
          <div className="grid grid-cols-3 md:grid-cols-6 gap-4">
            <MetricStat
              label="H1"
              value={metrics.headings.h1}
              status={metrics.headings.h1 === 1 ? "good" : "warning"}
              statusLabel={metrics.headings.h1 === 1 ? "Good" : metrics.headings.h1 === 0 ? "Missing" : "Multiple"}
            />
            <MetricStat label="H2" value={metrics.headings.h2} />
            <MetricStat label="H3" value={metrics.headings.h3} />
            <MetricStat label="H4" value={metrics.headings.h4} />
            <MetricStat label="H5" value={metrics.headings.h5} />
            <MetricStat label="H6" value={metrics.headings.h6} />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4">
          <h2 className="text-base font-semibold mb-3">Content Analysis</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <MetricStat
              label="Word Count"
              value={metrics.wordCount}
              status={metrics.wordCount >= 800 ? "good" : metrics.wordCount >= 400 ? "warning" : "bad"}
              statusLabel={
                metrics.wordCount >= 2000 ? "Deep content" :
                metrics.wordCount >= 800 ? "Good depth" :
                metrics.wordCount >= 400 ? "Moderate (could be deeper)" : "Thin content"
              }
            />
            <MetricStat
              label="CTA Count"
              value={metrics.ctaCount}
              status={metrics.ctaCount >= 3 ? "good" : "warning"}
              statusLabel={metrics.ctaCount >= 3 ? `${metrics.ctaCount} CTAs found` : "Consider adding more CTAs"}
            />
            <div className="md:col-span-1">
              <div className="text-xs text-muted-foreground mb-1">CTA Keywords Found</div>
              <div className="flex flex-wrap gap-1">
                {metrics.ctaKeywords.length > 0 ? (
                  metrics.ctaKeywords.slice(0, 8).map((kw, i) => (
                    <span key={i} className="badge badge-primary badge-sm">{kw}</span>
                  ))
                ) : (
                  <span className="text-muted-foreground text-sm">None detected</span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Links */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4">
          <h2 className="text-base font-semibold mb-3">Links</h2>
          <div className="grid grid-cols-3 gap-4">
            <MetricStat
              label="Internal Links"
              value={metrics.links.internal}
              status={metrics.links.internal >= 3 ? "good" : "warning"}
            />
            <MetricStat label="External Links" value={metrics.links.external} />
            <MetricStat label="Total Links" value={metrics.links.total} />
          </div>
        </div>
      </div>

      {/* Images */}
      <div className="bg-white rounded-lg border shadow-sm">
        <div className="p-4">
          <h2 className="text-base font-semibold mb-3">Images (Accessibility & SEO)</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <MetricStat label="Total Images" value={metrics.images.total} />
            <MetricStat
              label="With Alt Text"
              value={metrics.images.withAlt}
              status={metrics.images.missingAltPercent <= 30 ? "good" : "warning"}
            />
            <MetricStat
              label="Missing Alt"
              value={metrics.images.missingAlt}
              status={metrics.images.missingAlt === 0 ? "good" : "warning"}
            />
            <MetricStat
              label="Missing Alt %"
              value={`${metrics.images.missingAltPercent}%`}
              status={metrics.images.missingAltPercent <= 30 ? "good" : "warning"}
              statusLabel={metrics.images.missingAltPercent <= 30 ? "Good coverage" : `${metrics.images.missingAlt} images need alt text`}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper component for displaying metrics with status
function MetricStat({
  label,
  value,
  status = "neutral",
  statusLabel,
}: {
  label: string;
  value: string | number;
  status?: "good" | "warning" | "bad" | "neutral";
  statusLabel?: string;
}) {
  const statusColors = {
    good: "text-green-600",
    warning: "text-yellow-600",
    bad: "text-red-600",
    neutral: "",
  };

  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="font-medium truncate" title={String(value)}>
        {value}
      </div>
      {statusLabel && (
        <div className={`text-xs mt-1 ${statusColors[status]}`}>{statusLabel}</div>
      )}
    </div>
  );
}

function InsightsPanel({ insights }: { insights: AIInsight[] }) {
  return (
    <div className="space-y-4">
      {insights.length === 0 ? (
        <p className="text-muted-foreground">No insights generated.</p>
      ) : (
        insights.map((insight, index) => (
          <div
            key={index}
            className={`card border-l-4 p-4 ${
              insight.severity === "high" ? "border-l-error bg-error/5" :
              insight.severity === "medium" ? "border-l-warning bg-warning/5" :
              "border-l-success bg-success/5"
            }`}
          >
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <SeverityBadge severity={insight.severity} />
              <span className="text-xs text-muted-foreground font-mono">{insight.metricReferenced}</span>
            </div>
            <h3 className="font-semibold mb-2">{insight.summary}</h3>
            <p className="text-sm mb-2">{insight.finding}</p>
            <p className="text-sm text-muted-foreground mb-3">
              <strong>Impact:</strong> {insight.impact}
            </p>
            <div className="alert alert-ghost p-2 text-xs">
              <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              <span><strong>For the agency:</strong> Consider reviewing this area during the next optimization sprint. {insight.severity === "high" ? "This should be prioritized." : insight.severity === "medium" ? "This is a meaningful improvement opportunity." : "This is a minor optimization."}</span>
            </div>
          </div>
        ))
      )}
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    high: "bg-destructive text-destructive-foreground",
    medium: "bg-yellow-500 text-yellow-500-foreground",
    low: "bg-green-500 text-green-500-foreground",
  };

  return (
    <span
      className={`px-2 py-0.5 text-xs rounded-full capitalize ${
        colors[severity] || "bg-muted"
      }`}
    >
      {severity}
    </span>
  );
}

function RecommendationsPanel({ recommendations }: { recommendations: Recommendation[] }) {
  const sorted = [...recommendations].sort((a, b) => a.priority - b.priority);

  const effortColor = (effort: string) => {
    switch (effort) {
      case "low": return "badge-success";
      case "medium": return "badge-warning";
      case "high": return "badge-error";
      default: return "badge-ghost";
    }
  };

  const categoryLabel = (category: string) => {
    const labels: Record<string, string> = {
      seo: "SEO",
      messaging: "Messaging",
      cta: "CTA",
      content: "Content",
      ux: "UX",
    };
    return labels[category] || category;
  };

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-muted-foreground">No recommendations generated.</p>
      ) : (
        sorted.map((rec, index) => (
          <div key={index} className="card border p-4">
            <div className="flex items-center gap-2 mb-2 flex-wrap">
              <span className="badge badge-primary badge-sm">Priority {rec.priority}</span>
              <span className="badge badge-ghost badge-sm capitalize">{categoryLabel(rec.category)}</span>
              <span className={`badge badge-sm capitalize ${effortColor(rec.effort)}`}>{rec.effort} effort</span>
              {rec.metricReferenced && (
                <span className="text-xs text-muted-foreground font-mono ml-auto">{rec.metricReferenced}</span>
              )}
            </div>
            <h3 className="font-semibold mb-2">{rec.title}</h3>
            <p className="text-sm text-muted-foreground">{rec.description}</p>
          </div>
        ))
      )}
    </div>
  );
}

function PromptLogsPanel({
  promptLog,
  activeTab,
  onTabChange,
}: {
  promptLog: PromptLog;
  activeTab: PromptTabType;
  onTabChange: (tab: PromptTabType) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 mb-4">
        <TabButton active={activeTab === "system"} onClick={() => onTabChange("system")}>
          System Prompt
        </TabButton>
        <TabButton active={activeTab === "user"} onClick={() => onTabChange("user")}>
          User Prompt
        </TabButton>
        <TabButton active={activeTab === "input"} onClick={() => onTabChange("input")}>
          Structured Input
        </TabButton>
        <TabButton active={activeTab === "output"} onClick={() => onTabChange("output")}>
          Model Output
        </TabButton>
      </div>

      <div className="p-4 border rounded-md bg-muted/50">
        <div className="flex gap-4 text-xs text-muted-foreground mb-3">
          <span>Model: {promptLog.executionMeta.model}</span>
          <span>Timestamp: {new Date(promptLog.executionMeta.timestamp).toLocaleString()}</span>
        </div>

        <pre className="whitespace-pre-wrap text-xs overflow-auto max-h-96 font-mono">
          {activeTab === "system" && promptLog.systemPrompt}
          {activeTab === "user" && promptLog.userPrompt}
          {activeTab === "input" &&
            JSON.stringify(promptLog.structuredInput, null, 2)}
          {activeTab === "output" && promptLog.rawModelOutput}
        </pre>
      </div>
    </div>
  );
}
