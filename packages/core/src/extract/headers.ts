/** Header helpers for deterministic checks; names are case-insensitive. */
export function header(headers: Record<string, string>, name: string): string | undefined {
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key === undefined ? undefined : headers[key];
}

export function directiveTokens(value: string | undefined): string[] {
  return (value ?? "").split(/[;,]/).map((part) => part.trim()).filter(Boolean);
}
