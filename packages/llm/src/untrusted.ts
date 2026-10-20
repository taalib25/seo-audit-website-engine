const OPEN = "<<<UNTRUSTED ";
const CLOSE = "<<<END UNTRUSTED>>>";

/** Wraps crawled text so it cannot be confused with instructions; strips delimiter look-alikes. */
export function untrusted(label: string, text: string, maxChars = 8_000): string {
  const safeLabel = label.replace(/[<>\r\n]/g, "").trim().slice(0, 80) || "page content";
  const safeText = text
    .replace(/<<<\s*(?:END\s+)?UNTRUSTED\s*/gi, "[removed delimiter] ")
    .slice(0, Math.max(0, maxChars));
  return `${OPEN}${safeLabel}>>>\n${safeText}\n${CLOSE}`;
}
