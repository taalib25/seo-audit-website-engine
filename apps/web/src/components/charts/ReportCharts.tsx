import { useEffect, useMemo, useState } from "react";
import type { AuditReport, Pillar, Severity } from "@aeo/core";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, PolarAngleAxis, PolarGrid, Radar, RadarChart, RadialBar, RadialBarChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "../ui/card";
import { ChartContainer } from "../ui/chart";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Tooltip as UiTooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "../ui/tooltip";

const palette = { pass: "var(--pass)", warn: "var(--warn)", fail: "var(--fail)", skip: "var(--skip)", search: "var(--chart-1)", training: "var(--chart-2)", "user-fetch": "var(--chart-3)", browser: "var(--chart-4)" };
const pillarNames: Record<Pillar, string> = { seo: "SEO", aeo: "AEO", geo: "GEO" };
const statusNames = { pass: "Pass", warn: "Warn", fail: "Fail", skip: "Skip" } as const;
const severityOrder: Severity[] = ["critical", "high", "medium", "low", "info"];
const severityColors: Record<Severity, string> = { critical: "var(--fail)", high: "var(--chart-5)", medium: "var(--warn)", low: "var(--chart-2)", info: "var(--skip)" };

function useCountUp(target: number, reducedMotion: boolean) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    if (reducedMotion) { setValue(target); return; }
    let frame = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const progress = Math.min(1, (now - start) / 720);
      const eased = 1 - Math.pow(1 - progress, 4);
      setValue(Math.round(target * eased));
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [target, reducedMotion]);
  return value;
}

function ScoreGauge({ label, score, compact = false, reducedMotion }: { label: string; score: number; compact?: boolean; reducedMotion: boolean }) {
  const count = useCountUp(score, reducedMotion);
  const data = [{ name: label, value: Math.max(0, Math.min(100, score)), fill: "var(--primary)" }];
  return <div className={`score-gauge ${compact ? "score-gauge--compact" : ""}`} aria-label={`${label} score ${score} out of 100`}>
    <div className="score-gauge-chart"><ResponsiveContainer width="100%" height="100%"><RadialBarChart data={data} startAngle={90} endAngle={-270} innerRadius="78%" outerRadius="100%"><RadialBar dataKey="value" cornerRadius={999} background={{ fill: "var(--border)" }} animationDuration={reducedMotion ? 0 : 850} animationEasing="ease-out" /></RadialBarChart></ResponsiveContainer><div className="score-gauge-value"><strong>{count}</strong><span>/100</span></div></div>
    <UiTooltip><TooltipTrigger asChild><span className="score-gauge-label" tabIndex={0}>{label}</span></TooltipTrigger><TooltipContent>{label} weighted readiness score out of 100</TooltipContent></UiTooltip>
  </div>;
}

export function ReportCharts({ report }: { report: AuditReport }) {
  const [reducedMotion, setReducedMotion] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(query.matches);
    update(); query.addEventListener("change", update); return () => query.removeEventListener("change", update);
  }, []);
  const categoryRows = useMemo(() => {
    const groups = new Map<string, { sum: number; count: number }>();
    for (const result of report.results) {
      if (result.status === "skip") continue;
      const current = groups.get(result.category) ?? { sum: 0, count: 0 };
      current.sum += result.score * 100;
      current.count += 1;
      groups.set(result.category, current);
    }
    return [...groups].map(([category, score]) => ({ category: category.replaceAll("-", " "), score: Math.round(score.sum / score.count) })).sort((a, b) => a.category.localeCompare(b.category));
  }, [report.results]);
  const stackRows = report.scores.pillars.map((pillar) => ({ pillar: pillarNames[pillar.pillar], pass: pillar.passed, warn: pillar.warned, fail: pillar.failed, skip: pillar.skipped }));
  const agentRows = (report.agentView?.agents ?? []).map((agent) => ({ agent: agent.agent, purpose: agent.purpose, coverage: Math.round(agent.coverage * 100), blocked: agent.pagesBlocked }));
  const failures = report.results.filter((result) => result.status === "fail" || result.status === "error");
  const severityRows = severityOrder.map((severity) => ({ severity, count: failures.filter((item) => item.severity === severity).length })).filter((item) => item.count > 0);
  const severityTotal = severityRows.reduce((sum, item) => sum + item.count, 0);
  const chartConfig = { pass: { label: "Pass", color: palette.pass }, warn: { label: "Warn", color: palette.warn }, fail: { label: "Fail", color: palette.fail }, skip: { label: "Skip", color: palette.skip }, coverage: { label: "Coverage", color: "var(--agent)" }, score: { label: "Score", color: "var(--primary)" } };

  return <TooltipProvider><section className="report-analytics" aria-labelledby="analytics-title">
    <div className="analytics-heading"><div><p className="kicker">Audit signals</p><h2 id="analytics-title">Performance at a glance</h2></div><p>Scores and check outcomes from this audit.</p></div>
    <Tabs defaultValue="overview" className="analytics-tabs">
      <TabsList aria-label="Report chart views"><TabsTrigger value="overview">Overview</TabsTrigger><TabsTrigger value="visibility">Agent visibility</TabsTrigger></TabsList>
      <TabsContent value="overview"><div className="analytics-grid">
        <Card className="chart-card chart-card--scores"><CardHeader><CardTitle>Readiness scores</CardTitle><CardDescription>Weighted score by audit pillar</CardDescription></CardHeader><CardContent><div className="score-gauges"><ScoreGauge label="Overall" score={report.scores.overall} reducedMotion={reducedMotion}/>{report.scores.pillars.map((item) => <ScoreGauge key={item.pillar} label={pillarNames[item.pillar]} score={item.score} compact reducedMotion={reducedMotion}/>)}</div></CardContent></Card>
        <Card className="chart-card chart-card--wide"><CardHeader><CardTitle>Check outcomes by pillar</CardTitle><CardDescription>Number of checks in each status</CardDescription></CardHeader><CardContent><ChartContainer config={chartConfig} className="report-chart report-chart--stack"><ResponsiveContainer width="100%" height="100%"><BarChart data={stackRows} layout="vertical" margin={{ top: 4, right: 12, left: 8, bottom: 4 }} barSize={20}><CartesianGrid horizontal={false} stroke="var(--border)"/><XAxis type="number" tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false} allowDecimals={false}/><YAxis type="category" dataKey="pillar" width={44} tick={{ fill: "var(--foreground)", fontSize: 12, fontWeight: 600 }} axisLine={false} tickLine={false}/><Tooltip cursor={{ fill: "#ffffff08" }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }}/><Bar dataKey="pass" stackId="outcomes" fill={palette.pass} name="Pass" animationDuration={reducedMotion ? 0 : 700}/><Bar dataKey="warn" stackId="outcomes" fill={palette.warn} name="Warn" animationDuration={reducedMotion ? 0 : 700}/><Bar dataKey="fail" stackId="outcomes" fill={palette.fail} name="Fail" animationDuration={reducedMotion ? 0 : 700}/><Bar dataKey="skip" stackId="outcomes" fill={palette.skip} name="Skip" radius={[0, 5, 5, 0]} animationDuration={reducedMotion ? 0 : 700}/></BarChart></ResponsiveContainer></ChartContainer><div className="chart-legend">{Object.entries(statusNames).map(([key, name]) => <span key={key}><i style={{ background: palette[key as keyof typeof palette] }}/>{name}</span>)}</div></CardContent></Card>
        <Card className="chart-card"><CardHeader><CardTitle>Category scores</CardTitle><CardDescription>Average check score grouped by category</CardDescription></CardHeader><CardContent><ChartContainer config={chartConfig} className="report-chart report-chart--radar"><ResponsiveContainer width="100%" height="100%"><RadarChart data={categoryRows} outerRadius="68%"><PolarGrid stroke="var(--border)"/><PolarAngleAxis dataKey="category" tick={{ fill: "var(--muted-foreground)", fontSize: 10 }}/><Tooltip formatter={(value) => [`${value}%`, "Score"]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }}/><Radar name="Score" dataKey="score" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.18} strokeWidth={2} animationDuration={reducedMotion ? 0 : 850}/></RadarChart></ResponsiveContainer></ChartContainer></CardContent></Card>
        <Card className="chart-card"><CardHeader><CardTitle>Failure severity</CardTitle><CardDescription>{severityTotal} failing checks · grouped by priority</CardDescription></CardHeader><CardContent><div className="severity-chart-wrap"><ChartContainer config={chartConfig} className="report-chart report-chart--donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={severityRows} dataKey="count" nameKey="severity" innerRadius="68%" outerRadius="90%" paddingAngle={3} stroke="none" animationDuration={reducedMotion ? 0 : 800}>{severityRows.map((row) => <Cell key={row.severity} fill={severityColors[row.severity]}/>)}</Pie><Tooltip formatter={(value, name) => [value, String(name).replace(/^./, (letter) => letter.toUpperCase())]} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }}/></PieChart></ResponsiveContainer></ChartContainer><div className="severity-center"><strong>{severityTotal}</strong><span>failures</span></div></div>{severityRows.length ? <div className="chart-legend chart-legend--severity">{severityRows.map((row) => <span key={row.severity}><i style={{ background: severityColors[row.severity] }}/>{row.severity} <b>{row.count}</b></span>)}</div> : <p className="chart-empty">No failing checks in this report.</p>}</CardContent></Card>
      </div></TabsContent>
        <TabsContent value="visibility"><Card className="chart-card"><CardHeader><CardTitle>Agent page coverage</CardTitle><CardDescription>Share of rendered reference words visible to each agent · purpose colors distinguish agent types</CardDescription></CardHeader><CardContent>{agentRows.length ? <><ChartContainer config={chartConfig} className="report-chart report-chart--agents"><ResponsiveContainer width="100%" height="100%"><BarChart data={agentRows} layout="vertical" margin={{ top: 6, right: 34, left: 16, bottom: 6 }} barSize={15}><CartesianGrid horizontal={false} stroke="var(--border)"/><XAxis type="number" domain={[0, 100]} tickFormatter={(value: number) => `${value}%`} tick={{ fill: "var(--muted-foreground)", fontSize: 11 }} axisLine={{ stroke: "var(--border)" }} tickLine={false}/><YAxis type="category" dataKey="agent" width={112} tick={{ fill: "var(--foreground)", fontSize: 11 }} axisLine={false} tickLine={false}/><Tooltip formatter={(value) => [`${value}%`, "Coverage"]} labelFormatter={(label, payload) => { const row = payload?.[0]?.payload as (typeof agentRows)[number] | undefined; return `${label} · ${row?.purpose ?? "agent"}`; }} contentStyle={{ background: "var(--popover)", border: "1px solid var(--border)", borderRadius: 10, color: "var(--foreground)" }}/><Bar dataKey="coverage" name="coverage" radius={[0, 5, 5, 0]} animationDuration={reducedMotion ? 0 : 700}>{agentRows.map((row) => <Cell key={row.agent} fill={palette[row.purpose]}/>)}</Bar></BarChart></ResponsiveContainer></ChartContainer><div className="agent-block-summary">{agentRows.map((row) => <span key={row.agent}>{row.agent}<b>{row.blocked} blocked</b></span>)}</div></> : <p className="chart-empty">This report has no agent visibility data.</p>}</CardContent></Card></TabsContent>
    </Tabs>
  </section></TooltipProvider>;
}
