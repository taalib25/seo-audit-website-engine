import { clientIdentity } from "./client-ip";

export class RequestBodyTooLargeError extends Error {}

export async function boundedJson(request: Request, maxBytes = 8192): Promise<unknown> {
  if (Number(request.headers.get("content-length")) > maxBytes) throw new RequestBodyTooLargeError();
  const reader = request.body?.getReader();
  if (!reader) throw new SyntaxError("Missing request body");
  const chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) { await reader.cancel(); throw new RequestBodyTooLargeError(); }
      chunks.push(chunk.value);
    }
    const body: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return body;
  } finally { reader.releaseLock(); }
}

const headers = {
  "Content-Security-Policy": "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self'; font-src 'self' data:; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'",
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
} as const;

export function json(data: unknown, status = 200, extraHeaders?: HeadersInit): Response {
  return Response.json(data, { status, headers: { ...headers, ...Object.fromEntries(new Headers(extraHeaders)) } });
}

export function secureResponse(body: BodyInit | null, init: ResponseInit = {}): Response {
  const responseHeaders = new Headers(headers);
  new Headers(init.headers).forEach((value, key) => responseHeaders.set(key, value));
  return new Response(body, { ...init, headers: responseHeaders });
}

export function clientIp(request: Request, trustProxy = process.env.TRUST_PROXY === "true"): string {
  return clientIdentity.ip(request, trustProxy);
}
