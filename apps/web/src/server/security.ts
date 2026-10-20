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

export function clientIp(request: Request): string {
  return request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || "unknown";
}
