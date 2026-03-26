"use client";

import { useState } from "react";
import type {
  AuditResponse,
  MetricsObject,
  DerivedSignals,
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
            {/* Tabs */}
            <div className="flex gap-2 mb-4 border-b">
              <TabButton active={activeTab === "metrics"} onClick={() => setActiveTab("metrics")}>
                Metrics
              </TabButton>
              <TabButton active={activeTab === "signals"} onClick={() => setActiveTab("signals")}>
                Signals
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
            {activeTab === "signals" && <SignalsPanel signals={result.signals} />}
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
  return (
    <div className="space-y-6">
      <Section title="Meta Tags">
        <MetricGrid
          items={[
            { label: "Title", value: metrics.meta.title || "(empty)" },
            { label: "Title Length", value: `${metrics.meta.titleLength} chars` },
            { label: "Description", value: metrics.meta.description || "(empty)" },
            { label: "Description Length", value: `${metrics.meta.descriptionLength} chars` },
          ]}
        />
      </Section>

      <Section title="Headings">
        <MetricGrid
          items={[
            { label: "H1", value: metrics.headings.h1 },
            { label: "H2", value: metrics.headings.h2 },
            { label: "H3", value: metrics.headings.h3 },
            { label: "H4", value: metrics.headings.h4 },
            { label: "H5", value: metrics.headings.h5 },
            { label: "H6", value: metrics.headings.h6 },
          ]}
        />
      </Section>

      <Section title="Content">
        <MetricGrid
          items={[
            { label: "Word Count", value: metrics.wordCount },
            { label: "CTA Count", value: metrics.ctaCount },
            { label: "CTA Keywords", value: metrics.ctaKeywords.join(", ") || "(none)" },
          ]}
        />
      </Section>

      <Section title="Links">
        <MetricGrid
          items={[
            { label: "Internal Links", value: metrics.links.internal },
            { label: "External Links", value: metrics.links.external },
            { label: "Total Links", value: metrics.links.total },
          ]}
        />
      </Section>

      <Section title="Images">
        <MetricGrid
          items={[
            { label: "Total Images", value: metrics.images.total },
            { label: "With Alt Text", value: metrics.images.withAlt },
            { label: "Missing Alt", value: metrics.images.missingAlt },
            { label: "Missing Alt %", value: `${metrics.images.missingAltPercent}%` },
          ]}
        />
      </Section>
    </div>
  );
}

function SignalsPanel({ signals }: { signals: DerivedSignals }) {
  return (
    <div className="space-y-4">
      <SignalCard
        label="CTA Density"
        value={signals.ctaDensityLabel}
        subtext={`${(signals.ctaDensity * 100).toFixed(2)} CTAs per 100 words`}
      />
      <SignalCard label="Content Depth" value={signals.contentDepth} />
      <SignalCard
        label="Heading Structure"
        value={signals.headingStructure}
        subtext={signals.headingStructure === "valid" ? "Exactly one H1" : "Missing or multiple H1s"}
      />
      <SignalCard
        label="Alt Text Coverage"
        value={signals.altTextCoverage}
        subtext={
          signals.altTextCoverage === "good" ? "Less than 30% missing" : "More than 30% missing"
        }
      />
      <SignalCard
        label="Internal Link Ratio"
        value={`${(signals.internalLinkRatio * 100).toFixed(0)}%`}
        subtext={`${Math.round(signals.internalLinkRatio * 100)}% internal links`}
      />
      <SignalCard label="Meta Optimization" value={signals.metaOptimization} />
    </div>
  );
}

function SignalCard({
  label,
  value,
  subtext,
}: {
  label: string;
  value: string | number;
  subtext?: string;
}) {
  return (
    <div className="p-4 border rounded-md bg-card">
      <div className="text-sm text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold capitalize">{value}</div>
      {subtext && <div className="text-xs text-muted-foreground mt-1">{subtext}</div>}
    </div>
  );
}

function InsightsPanel({ insights }: { insights: AIInsight[] }) {
  const severityColors: Record<string, string> = {
    high: "border-destructive bg-destructive/5",
    medium: "border-yellow-500 bg-yellow-500/5",
    low: "border-green-500 bg-green-500/5",
  };

  return (
    <div className="space-y-4">
      {insights.length === 0 ? (
        <p className="text-muted-foreground">No insights generated.</p>
      ) : (
        insights.map((insight, index) => (
          <div
            key={index}
            className={`p-4 border rounded-md ${severityColors[insight.severity] || ""}`}
          >
            <div className="flex items-center gap-2 mb-2">
              <SeverityBadge severity={insight.severity} />
              <span className="text-sm text-muted-foreground">{insight.metricReferenced}</span>
            </div>
            <h3 className="font-semibold mb-2">{insight.summary}</h3>
            <p className="text-sm mb-2">{insight.finding}</p>
            <p className="text-sm text-muted-foreground">
              <strong>Impact:</strong> {insight.impact}
            </p>
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

  return (
    <div className="space-y-4">
      {sorted.length === 0 ? (
        <p className="text-muted-foreground">No recommendations generated.</p>
      ) : (
        sorted.map((rec, index) => (
          <div key={index} className="p-4 border rounded-md">
            <div className="flex items-center gap-2 mb-2">
              <span className="px-2 py-0.5 text-xs bg-primary text-primary-foreground rounded-full">
                Priority {rec.priority}
              </span>
              <span className="px-2 py-0.5 text-xs bg-muted rounded capitalize">{rec.category}</span>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border rounded-md p-4">
      <h2 className="font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function MetricGrid({
  items,
}: {
  items: { label: string; value: string | number }[];
}) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item, index) => (
        <div key={index}>
          <div className="text-xs text-muted-foreground">{item.label}</div>
          <div className="font-medium truncate" title={String(item.value)}>
            {item.value}
          </div>
        </div>
      ))}
    </div>
  );
}
