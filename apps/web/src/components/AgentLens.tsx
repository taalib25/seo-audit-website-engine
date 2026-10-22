import { useEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type PointerEvent as ReactPointerEvent } from "react";
import "./agent-lens.css";

type Bot = "GPTBot" | "ClaudeBot" | "PerplexityBot" | "Googlebot";
type View = "lens" | "human" | "agent";

const bots: Bot[] = ["GPTBot", "ClaudeBot", "PerplexityBot", "Googlebot"];
const metrics: Record<Bot, { words: number; headings: string; schema: string }> = {
  GPTBot: { words: 38, headings: "2/6", schema: "missing" },
  ClaudeBot: { words: 42, headings: "2/6", schema: "missing" },
  PerplexityBot: { words: 46, headings: "3/6", schema: "partial" },
  Googlebot: { words: 96, headings: "6/6", schema: "detected" },
};

function MockSite({ agent, google }: { agent?: boolean; google?: boolean }) {
  return <div className={`agent-lens__site${agent ? " agent-lens__site--agent" : ""}`}>
    <div className="agent-lens__browser"><span/><span/><span/><i>atelier.example</i><b>↗</b></div>
    <header className="agent-lens__nav"><strong>FORMA<span>®</span></strong><nav>Furniture <i>·</i> Lighting <i>·</i> Objects</nav><button>Bag <small>0</small></button></header>
    <section className="agent-lens__hero"><div><p className="agent-lens__overline"><span>01 — 04</span> Objects for everyday rituals</p><h3>Make room<br/>for <em>living.</em></h3><p className="agent-lens__body">Thoughtful pieces, made to stay. Designed in Copenhagen, crafted to last a lifetime.</p><a>Explore the collection <b>↗</b></a></div><div className="agent-lens__chair" aria-label="Sculptural walnut chair"><div className="chair-back"/><div className="chair-seat"/><div className="chair-leg chair-leg--a"/><div className="chair-leg chair-leg--b"/><i>F. 01</i></div><span className="agent-lens__hero-caption">THE FORM CHAIR · OAK / NATURAL</span></section>
    <div className="agent-lens__trust"><span>Made with intention</span><b>✳</b><span>Ships worldwide</span><b>✳</b><span>30 day returns</span></div>
    <section className="agent-lens__products"><div className="agent-lens__section-title"><p>THE EDIT · 2025</p><h4>Pieces to come home to</h4><a>View all ↗</a></div><div className="agent-lens__product-grid"><article><div className="product-art product-art--lamp"><i/></div><b>Arc table light</b><small>Brushed brass · $240</small></article><article><div className="product-art product-art--vase"><i/></div><b>Soft form vase</b><small>Stoneware · $86</small></article><article><div className="product-art product-art--stool"><i/></div><b>Studio stool</b><small>Solid ash · $395</small></article></div></section>
    <section className="agent-lens__price"><div><p>GOOD THINGS TAKE TIME</p><h4>Built for the<br/>long way around.</h4></div><div><p>Made slowly, in small runs, with materials that get better with age. Every piece comes with a lifetime repair promise.</p><button>Our approach ↗</button></div></section>
    <section className="agent-lens__faq"><div><p>GOOD TO KNOW</p><h4>A few questions,<br/>answered.</h4></div><div><p>Where are your pieces made? <b>＋</b></p><p>How long does delivery take? <b>＋</b></p><p>Can I return my order? <b>＋</b></p></div></section>
    <footer className="agent-lens__footer"><b>FORMA®</b><span>Objects for everyday rituals.</span><small>© 2025 FORMA STUDIO</small></footer>
    {agent && <div className="agent-lens__annotations" aria-hidden="true">
      <span className="tag tag--h1">&lt;h1&gt; Make room for living. &lt;/h1&gt;</span>
      <span className="tag tag--meta">&lt;meta name="description"&gt; Thoughtful pieces, made to stay…</span>
      <span className="tag tag--link">&lt;a href="/collections"&gt; Explore the collection &lt;/a&gt;</span>
      <span className={`tag tag--schema${google ? " tag--schema-found" : ""}`}>{google ? "✓ Product schema detected" : "⚠ No Product JSON-LD found"}</span>
      {!google && <div className="agent-lens__missing"><b>×</b> Product details are missing<br/><small>[not in raw HTML — rendered by JavaScript]</small></div>}
      {google && <div className="agent-lens__google">Googlebot rendered this JavaScript content</div>}
    </div>}
  </div>;
}

export function AgentLens() {
  const stage = useRef<HTMLDivElement>(null);
  const agentLayer = useRef<HTMLDivElement>(null);
  const frame = useRef<number | null>(null);
  const target = useRef({ x: 180, y: 150, r: 116 });
  const point = useRef({ x: 180, y: 150, r: 116, vx: 0, vy: 0, vr: 0 });
  const baseRadius = useRef(116);
  const [bot, setBot] = useState<Bot>("GPTBot");
  const [view, setView] = useState<View>("lens");
  const [pressed, setPressed] = useState(false);

  useEffect(() => {
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    const mobile = window.matchMedia("(max-width: 650px)");
    const setRadius = () => {
      baseRadius.current = mobile.matches ? 82 : 116;
      target.current.r = baseRadius.current;
      point.current.r = baseRadius.current;
    };
    setRadius();
    mobile.addEventListener("change", setRadius);
    let last = 0;
    const draw = (time: number) => {
      const el = stage.current;
      const layer = agentLayer.current;
      if (!el || !layer) return;
      const rect = el.getBoundingClientRect();
      const tx = Math.max(0, Math.min(rect.width, target.current.x));
      const ty = Math.max(0, Math.min(rect.height, target.current.y));
      if (reduce.matches) Object.assign(point.current, { x: tx, y: ty, r: target.current.r, vx: 0, vy: 0, vr: 0 });
      else {
        const dt = Math.min((time - (last || time)) / 1000, 0.032); last = time;
        const spring = 310, damping = 2 * Math.sqrt(spring);
        for (const key of ["x", "y", "r"] as const) {
          const p = point.current, velocity = key === "x" ? "vx" : key === "y" ? "vy" : "vr";
          const acceleration = spring * (target.current[key] - p[key]) - damping * p[velocity];
          p[velocity] += acceleration * dt; p[key] += p[velocity] * dt;
        }
      }
      const { x, y, r } = point.current;
      layer.style.clipPath = `circle(${r}px at ${x}px ${y}px)`;
      layer.style.transformOrigin = `${x}px ${y}px`;
      layer.style.transform = `scale(1.15)`;
      layer.style.setProperty("--lens-x", `${x}px`); layer.style.setProperty("--lens-y", `${y}px`); layer.style.setProperty("--lens-r", `${r}px`);
      el.style.setProperty("--lens-x", `${x}px`); el.style.setProperty("--lens-y", `${y}px`); el.style.setProperty("--lens-r", `${r}px`); el.style.setProperty("--lens-scale", `${r / 116}`);
      frame.current = requestAnimationFrame(draw);
    };
    frame.current = requestAnimationFrame(draw);
    return () => { mobile.removeEventListener("change", setRadius); if (frame.current !== null) cancelAnimationFrame(frame.current); };
  }, []);

  function move(event: ReactPointerEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    target.current = { ...target.current, x: event.clientX - rect.left, y: event.clientY - rect.top };
  }
  function keyMove(event: ReactKeyboardEvent<HTMLDivElement>) {
    const step = event.shiftKey ? 48 : 24;
    const keyMap: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const delta = keyMap[event.key];
    if (delta) { event.preventDefault(); const rect = stage.current?.getBoundingClientRect(); target.current.x = Math.max(0, Math.min(rect?.width ?? 0, target.current.x + delta[0])); target.current.y = Math.max(0, Math.min(rect?.height ?? 0, target.current.y + delta[1])); }
    if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setView((current) => current === "agent" ? "human" : "agent"); }
  }
  const demo = metrics[bot];

  return <section className="agent-lens" aria-labelledby="agent-lens-title">
    <div className="agent-lens__heading"><div><p className="agent-lens__eyebrow">THE VIEW FROM THE OTHER SIDE</p><h2 id="agent-lens-title">See your site the way <em>AI does.</em></h2><p>Drag the lens to reveal what a crawler can actually read.</p></div><label className="agent-lens__bot">BOT VIEW<select value={bot} aria-label="Choose crawler" onChange={(e) => setBot(e.target.value as Bot)}>{bots.map((name) => <option key={name}>{name}</option>)}</select><span>⌄</span></label></div>
    <div className={`agent-lens__frame agent-lens__frame--${view}`} ref={stage} tabIndex={0} role="application" aria-label="Website preview. Move pointer to inspect crawler view, or use arrow keys to move the lens." onPointerMove={move} onPointerDown={(e) => { move(e); setPressed(true); target.current.r = baseRadius.current * 1.32; }} onPointerUp={() => { setPressed(false); target.current.r = baseRadius.current; }} onPointerCancel={() => { setPressed(false); target.current.r = baseRadius.current; }} onKeyDown={keyMove}>
      <div className="agent-lens__human"><MockSite/></div>
      <div className="agent-lens__agent" ref={agentLayer}><MockSite agent google={bot === "Googlebot"}/></div>
      {view === "lens" && <><div className={`agent-lens__rim${pressed ? " is-pressed" : ""}`} aria-hidden="true"/><div className="agent-lens__chip" aria-live="polite"><span/> {bot} sees</div></>}
      {view !== "lens" && <div className="agent-lens__full-label">{view === "human" ? "HUMAN VIEW" : `${bot.toUpperCase()} · AGENT VIEW`}</div>}
    </div>
    <div className="agent-lens__bottom"><div className="agent-lens__legend"><span className="agent-lens__legend-dot"/><span>WORDS SEEN <b>{demo.words}%</b></span><i/><span>HEADINGS <b>{demo.headings}</b></span><i/><span>JSON-LD <b className={demo.schema === "missing" ? "is-missing" : ""}>{demo.schema}</b></span></div><div className="agent-lens__toggle" role="group" aria-label="Choose preview view"><button type="button" aria-pressed={view === "human"} onClick={() => setView(view === "human" ? "lens" : "human")}>Human</button><button type="button" aria-pressed={view === "agent"} onClick={() => setView(view === "agent" ? "lens" : "agent")}>Agent</button></div></div>
  </section>;
}
