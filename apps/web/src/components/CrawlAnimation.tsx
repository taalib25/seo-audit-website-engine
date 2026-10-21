import { useState } from 'react';
import './crawl-animation.css';

export function CrawlAnimation() {
  const [replay, setReplay] = useState(0);

  return (
    <section className="crawl-demo" aria-labelledby="crawl-demo-title">
      <div className="crawl-demo__topline">
        <button className="crawl-demo__replay" type="button" onClick={() => setReplay((value) => value + 1)}>
          <svg aria-hidden="true" viewBox="0 0 16 16"><path d="M13 7a5 5 0 0 0-8.8-2L3 6m0-3v3h3M3 9a5 5 0 0 0 8.8 2L13 10m0 3v-3h-3" /></svg>
          Replay demo
        </button>
      </div>

      <div className="crawl-demo__layout" key={replay}>
        <div className="crawl-demo__copy">
          <h2 id="crawl-demo-title">From page<br className="crawl-demo__heading-break" />{' '}<span>to signals.</span></h2>
          <p className="crawl-demo__description">Illustrative example · no site is being scanned.</p>
        </div>

        <div className="crawl-demo__stage" role="img" aria-label="Illustration showing page source becoming a rendered page and structured signals">
          <div className="crawl-demo__flow" aria-hidden="true">
            <div className="crawl-demo__inputs">
              <div className="crawl-demo__source">
                <div className="crawl-demo__card-label">PAGE SOURCE</div>
                <div className="crawl-demo__code-line"><span>&lt;title&gt;</span> Maker studio</div>
                <div className="crawl-demo__code-line"><span>&lt;h1&gt;</span> Meet the makers</div>
                <div className="crawl-demo__code-line"><span>&lt;a&gt;</span> Our story</div>
                <div className="crawl-demo__scanline" />
              </div>

              <div className="crawl-demo__rendered">
                <div className="crawl-demo__browser-bar"><i /><i /><i /><span>example.site</span></div>
                <div className="crawl-demo__rendered-content">
                  <span className="crawl-demo__rendered-tag">MAKER STUDIO</span>
                  <strong>Meet the makers</strong>
                  <span className="crawl-demo__rendered-rule" />
                  <span className="crawl-demo__rendered-link">Our story <b>↗</b></span>
                </div>
                <div className="crawl-demo__card-label">RENDERED</div>
              </div>
            </div>

            <div className="crawl-demo__crawler" aria-hidden="true">
              <span className="crawl-demo__crawler-label">CRAWLER</span>
              <div className="crawl-demo__bot">
                <div className="crawl-demo__antenna"><i /></div>
                <div className="crawl-demo__bot-body">
                  <div className="crawl-demo__face"><i /><i /><b /></div>
                  <div className="crawl-demo__bot-feet"><i /><i /></div>
                </div>
              </div>
              <span className="crawl-demo__crawler-glint">✦</span>
            </div>

            <div className="crawl-demo__signals">
              <div className="crawl-demo__card-label">SIGNALS</div>
              <div className="crawl-demo__signal crawl-demo__signal--lime"><span className="crawl-demo__signal-icon">H₁</span><span><b>Page topic</b><small>Meet the makers</small></span><i>✓</i></div>
              <div className="crawl-demo__signal crawl-demo__signal--aqua"><span className="crawl-demo__signal-icon">↗</span><span><b>Links</b><small>Our story</small></span><i>✓</i></div>
              <div className="crawl-demo__signal crawl-demo__signal--pink"><span className="crawl-demo__signal-icon">Aa</span><span><b>Page details</b><small>Title · description</small></span><i>✓</i></div>
              <div className="crawl-demo__signal crawl-demo__signal--orange"><span className="crawl-demo__signal-icon">☷</span><span><b>Structure</b><small>Headings</small></span><i>✓</i></div>
            </div>
          </div>
          <div className="crawl-demo__caption"><span className="crawl-demo__caption-dot" /> SOURCE <b>→</b> RENDER <b>→</b> SIGNALS</div>
        </div>
      </div>
    </section>
  );
}
