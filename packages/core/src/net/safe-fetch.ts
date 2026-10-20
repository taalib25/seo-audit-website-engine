import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import http from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import type { Readable } from "node:stream";
import zlib from "node:zlib";
import { BlockedAddressError, isPublicAddress } from "./ip-guard.ts";

export interface SafeFetchOptions {
  timeoutMs?: number;
  maxBytes?: number;
  maxRedirects?: number;
  userAgent?: string;
  headers?: Record<string, string>;
  signal?: AbortSignal;
  /** Tests only: allow loopback/private targets. Never enable for user-supplied URLs. */
  allowPrivate?: boolean;
}

export interface SafeResponse {
  url: string;
  finalUrl: string;
  status: number;
  redirectChain: string[];
  /** Lower-cased header names; repeated headers joined with ", ". */
  headers: Record<string, string>;
  body: string;
  truncated: boolean;
  timing: { ttfbMs: number; totalMs: number };
}

export const DEFAULT_USER_AGENT =
  "Mozilla/5.0 (compatible; AEOAuditBot/1.0; +https://github.com/taalibazj/seo-audit-website-engine)";

export class UnsafeUrlError extends Error {
  override name = "UnsafeUrlError";
}

/** Validates a user-supplied URL before any network access. */
export function assertSafeUrl(input: string): URL {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new UnsafeUrlError(`Invalid URL: ${input}`);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new UnsafeUrlError(`Unsupported protocol: ${url.protocol}`);
  }
  if (url.username || url.password) throw new UnsafeUrlError("Credentials in URL are not allowed");
  if (url.port && !["80", "443", "8080", "8443"].includes(url.port)) {
    throw new UnsafeUrlError(`Port ${url.port} is not allowed`);
  }
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) {
    throw new UnsafeUrlError(`Host ${host} is not allowed`);
  }
  return url;
}

/**
 * Resolves DNS and rejects non-public addresses at connect time, so DNS
 * rebinding between validation and connection can't reach internal hosts.
 */
const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses: LookupAddress[]) => {
    if (err) return callback(err, "", 0);
    const bad = addresses.find((a) => !isPublicAddress(a.address));
    if (bad) return callback(new BlockedAddressError(hostname, bad.address), "", 0);
    if (options.all) return (callback as unknown as (e: null, a: LookupAddress[]) => void)(null, addresses);
    const first = addresses[0];
    if (!first) return callback(new Error(`No addresses for ${hostname}`), "", 0);
    callback(null, first.address, first.family);
  });
};

export async function safeFetch(input: string, opts: SafeFetchOptions = {}): Promise<SafeResponse> {
  const {
    timeoutMs = 15_000,
    maxBytes = 5 * 1024 * 1024,
    maxRedirects = 5,
    userAgent = DEFAULT_USER_AGENT,
  } = opts;
  const started = performance.now();
  const chain: string[] = [];
  let current = opts.allowPrivate ? new URL(input) : assertSafeUrl(input);

  for (let hop = 0; ; hop++) {
    const res = await requestOnce(current, {
      timeoutMs,
      maxBytes,
      userAgent,
      headers: opts.headers ?? {},
      signal: opts.signal,
      allowPrivate: opts.allowPrivate ?? false,
      started,
    });
    const location = res.headers["location"];
    if (res.status >= 300 && res.status < 400 && location) {
      if (hop >= maxRedirects) throw new UnsafeUrlError(`Too many redirects (>${maxRedirects})`);
      chain.push(current.href);
      const nextUrl = new URL(location, current);
      current = opts.allowPrivate ? nextUrl : assertSafeUrl(nextUrl.href);
      continue;
    }
    return {
      url: input,
      finalUrl: current.href,
      status: res.status,
      redirectChain: chain,
      headers: res.headers,
      body: res.body,
      truncated: res.truncated,
      timing: { ttfbMs: res.ttfbMs, totalMs: Math.round(performance.now() - started) },
    };
  }
}

interface RequestOnceOpts {
  timeoutMs: number;
  maxBytes: number;
  userAgent: string;
  headers: Record<string, string>;
  signal: AbortSignal | undefined;
  allowPrivate: boolean;
  started: number;
}

function requestOnce(
  url: URL,
  o: RequestOnceOpts,
): Promise<{ status: number; headers: Record<string, string>; body: string; truncated: boolean; ttfbMs: number }> {
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "GET",
        headers: {
          "user-agent": o.userAgent,
          accept: "text/html,application/xhtml+xml,application/xml;q=0.9,text/plain;q=0.8,*/*;q=0.5",
          "accept-encoding": "gzip, deflate, br",
          ...o.headers,
        },
        timeout: o.timeoutMs,
        ...(o.allowPrivate ? {} : { lookup: guardedLookup }),
        ...(o.signal ? { signal: o.signal } : {}),
      },
      (res) => {
        const ttfbMs = Math.round(performance.now() - o.started);
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(res.headers)) {
          if (v !== undefined) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(", ") : v;
        }
        const encoding = headers["content-encoding"]?.toLowerCase();
        const stream: Readable =
          encoding === "gzip" ? res.pipe(zlib.createGunzip())
          : encoding === "deflate" ? res.pipe(zlib.createInflate())
          : encoding === "br" ? res.pipe(zlib.createBrotliDecompress())
          : res;
        const chunks: Buffer[] = [];
        let size = 0;
        let truncated = false;
        stream.on("data", (chunk: Buffer) => {
          if (truncated) return;
          size += chunk.length;
          if (size > o.maxBytes) {
            truncated = true;
            chunks.push(chunk.subarray(0, chunk.length - (size - o.maxBytes)));
            res.destroy();
            finish();
            return;
          }
          chunks.push(chunk);
        });
        let done = false;
        const finish = () => {
          if (done) return;
          done = true;
          resolve({
            status: res.statusCode ?? 0,
            headers,
            body: Buffer.concat(chunks).toString("utf8"),
            truncated,
            ttfbMs,
          });
        };
        stream.on("end", finish);
        stream.on("error", (e) => (truncated ? finish() : reject(e)));
      },
    );
    req.on("timeout", () => req.destroy(new Error(`Timed out after ${o.timeoutMs}ms: ${url.href}`)));
    req.on("error", reject);
    req.end();
  });
}
