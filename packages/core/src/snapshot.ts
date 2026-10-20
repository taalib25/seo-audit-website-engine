/**
 * Serializable data collected by renderers/crawlers. Checks never fetch;
 * they only read snapshots, which keeps deterministic checks pure and testable.
 */

export interface FetchTiming {
  ttfbMs: number;
  totalMs: number;
}

export interface PageSnapshot {
  /** URL as requested (normalized). */
  url: string;
  /** URL after redirects. */
  finalUrl: string;
  status: number;
  redirectChain: string[];
  /** Lower-cased header names. */
  headers: Record<string, string>;
  /** HTML as served, before any JS ran (what most AI crawlers see). */
  rawHtml: string;
  /** DOM serialized after JS rendering; absent when no browser renderer was used. */
  renderedHtml?: string;
  timing: FetchTiming;
  /** Crawl depth from the start URL. */
  depth: number;
  /** Name of the renderer that produced renderedHtml, e.g. "lightpanda". */
  renderer?: string;
}

export interface TextFile {
  url: string;
  status: number;
  /** Empty when status is not 2xx. */
  body: string;
}

export interface SitemapEntry {
  loc: string;
  lastmod?: string;
}

export interface LinkEdge {
  from: string;
  to: string;
  anchor: string;
  nofollow: boolean;
}

export interface SiteSnapshot {
  startUrl: string;
  origin: string;
  robotsTxt?: TextFile;
  llmsTxt?: TextFile;
  llmsFullTxt?: TextFile;
  sitemaps: { url: string; status: number; entries: SitemapEntry[] }[];
  pages: PageSnapshot[];
  /** Internal links discovered during the crawl. */
  links: LinkEdge[];
  /** URLs discovered but not crawled (limit reached / disallowed). */
  uncrawled: string[];
  crawledAt: string;
}
