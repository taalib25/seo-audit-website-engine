import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowUpRight, Bot, Globe2, SearchCheck, ShieldCheck } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/")({
  head: () => ({
    title: "Search readiness audits for modern discovery | AEO Audit",
    meta: [
      { name: "description", content: "Audit technical SEO, answer engine readiness, and generative search visibility in one clear report." },
      { property: "og:title", content: "AEO Audit — search readiness, clearly measured" },
      { property: "og:description", content: "A single audit for SEO, AEO, and GEO." },
    ],
    links: [{ rel: "canonical", href: "/" }],
    scripts: [{
      type: "application/ld+json",
      children: JSON.stringify({ "@context": "https://schema.org", "@type": "SoftwareApplication", name: "Signal / Audit", applicationCategory: "BusinessApplication", operatingSystem: "Web", description: "Audit technical SEO, answer engine readiness, and generative search visibility.", offers: { "@type": "Offer", price: "0", priceCurrency: "USD" } }),
    }],
  }),
  component: Home,
});

function Home() {
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const navigate = useNavigate();
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const response = await fetch("/api/audits", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ url: url.includes("://") ? url : `https://${url}` }) });
      const data: unknown = await response.json();
      if (!response.ok || typeof data !== "object" || data === null || !("id" in data) || typeof data.id !== "string") throw new Error("Enter a public website URL to begin.");
      await navigate({ to: "/audit/$id", params: { id: data.id } });
    } catch (e) { setError(e instanceof Error ? e.message : "Audit could not be started."); setBusy(false); }
  }
  return <main className="min-h-screen">
    <header className="mx-auto flex max-w-7xl items-center justify-between px-6 py-7"><a href="/" className="flex items-center gap-3 font-semibold tracking-tight"><span className="grid size-9 place-items-center rounded-xl bg-[var(--accent)] text-white"><SearchCheck size={21} /></span>Signal / Audit</a><nav className="flex items-center gap-7 text-sm text-[var(--muted)]"><a href="#method" className="hover:text-[var(--ink)]">Method</a><a href="/audit/demo" className="hover:text-[var(--ink)]">Sample report</a><span className="rounded-full border border-[var(--line)] px-3 py-1.5">SEO · AEO · GEO</span></nav></header>
    <section className="mx-auto grid max-w-7xl items-center gap-14 px-6 pb-20 pt-20 lg:grid-cols-[1.15fr_.85fr] lg:pt-28">
      <div><p className="mb-6 flex items-center gap-2 text-xs font-semibold uppercase tracking-[.18em] text-[var(--accent)]"><span className="size-2 rounded-full bg-[var(--accent)]"/> Search visibility, measured</p><h1 className="max-w-3xl text-5xl font-semibold leading-[1.08] tracking-[-.055em] sm:text-7xl">Be understood by every kind of search.</h1><p className="mt-7 max-w-xl text-lg leading-8 text-[var(--muted)]">One practical audit for classic search, answer engines, and generative discovery. Find what blocks visibility and get fixes your team can act on.</p>
        <form onSubmit={submit} className="mt-10 flex max-w-2xl flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] p-2 shadow-[0_16px_60px_rgba(22,43,48,.08)] sm:flex-row"><label className="flex min-w-0 flex-1 items-center gap-3 px-4"><Globe2 size={19} className="shrink-0 text-[var(--muted)]"/><input value={url} onChange={(e) => setUrl(e.target.value)} type="text" inputMode="url" placeholder="Enter your website, e.g. example.com" className="h-12 min-w-0 w-full bg-transparent text-sm outline-none placeholder:text-[var(--muted)]" aria-label="Website URL" required /></label><button disabled={busy} className="flex h-12 items-center justify-center gap-2 rounded-xl bg-[var(--accent)] px-6 text-sm font-semibold text-white transition hover:opacity-90 disabled:opacity-60">{busy ? "Starting audit…" : "Audit my site"}<ArrowUpRight size={17}/></button></form>{error && <p role="alert" className="mt-3 text-sm text-red-600">{error}</p>}<p className="mt-4 text-xs text-[var(--muted)]">No account required · Fetch-only audit · Usually under a minute</p>
      </div>
      <div className="relative"><div className="absolute -inset-10 rounded-full bg-[var(--accent-soft)] blur-3xl opacity-70"/><div className="relative rounded-3xl border border-[var(--line)] bg-[var(--surface)] p-7 shadow-[0_30px_100px_rgba(22,43,48,.1)]"><div className="flex items-center justify-between border-b border-[var(--line)] pb-5"><div><div className="text-xs text-[var(--muted)]">AUDIT OVERVIEW</div><div className="mt-1 font-medium">northstar.studio</div></div><span className="rounded-full bg-[var(--accent-soft)] px-3 py-1.5 text-xs font-medium text-[var(--accent)]">12 opportunities</span></div><div className="grid grid-cols-3 gap-4 py-7">{[["SEO",86],["AEO",72],["GEO",64]].map(([name, score]) => <div key={name} className="rounded-2xl border border-[var(--line)] p-4"><div className="text-xs text-[var(--muted)]">{name}</div><div className="mt-3 text-3xl font-semibold tracking-tight">{score}<span className="text-sm text-[var(--muted)]">/100</span></div><div className="mt-3 h-1 rounded bg-[var(--line)]"><div className="h-full rounded bg-[var(--accent)]" style={{ width: `${score}%` }}/></div></div>)}</div><div className="space-y-3">{[["Add descriptive page titles", "SEO · High"],["Make key answers easier to cite", "AEO · Medium"],["Clarify organization identity", "GEO · Medium"]].map(([title, meta]) => <div key={title} className="flex items-center justify-between rounded-xl bg-[var(--bg)] px-4 py-3"><span className="text-sm">{title}</span><span className="text-xs text-[var(--muted)]">{meta}</span></div>)}</div></div></div>
    </section>
    <section id="method" className="border-y border-[var(--line)] bg-[var(--surface)]"><div className="mx-auto grid max-w-7xl gap-8 px-6 py-12 md:grid-cols-3">{[{ Icon: SearchCheck, title: "SEO", description: "Can search engines crawl, understand, and index your pages?" }, { Icon: Bot, title: "AEO", description: "Can answer engines find clear, trustworthy responses?" }, { Icon: ShieldCheck, title: "GEO", description: "Can generative systems identify and cite your organization?" }].map(({ Icon, title, description }) => <article key={title} className="flex gap-4"><span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[var(--accent-soft)] text-[var(--accent)]"><Icon size={20}/></span><div><h2 className="font-semibold">{title}</h2><p className="mt-1 text-sm leading-6 text-[var(--muted)]">{description}</p></div></article>)}</div></section>
    <footer className="mx-auto flex max-w-7xl flex-col gap-2 px-6 py-8 text-xs text-[var(--muted)] sm:flex-row sm:justify-between"><span>Signal / Audit · Clear findings for a changing search landscape.</span><span>Fetch-only analysis. Your site content is not used to train models.</span></footer>
  </main>;
}
