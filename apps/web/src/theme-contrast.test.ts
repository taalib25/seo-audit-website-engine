import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Reads the theme tokens straight from styles.css so a palette change can't silently break AA contrast.
const css = readFileSync(new URL("./styles.css", import.meta.url), "utf8");
const token = (name: string): string => {
  const hex = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css)?.[1];
  if (!hex) throw new Error(`token --${name} not found as a hex value`);
  return hex;
};

const luminance = (hex: string): number => {
  const channel = (i: number) => {
    const v = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
};
const contrast = (a: string, b: string): number => {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
};

const text = ["foreground", "muted-foreground", "pass", "warn", "fail", "human", "agent", "primary", "chart-4", "chart-5"];
const surfaces = ["background", "card", "popover", "muted-surface", "secondary"];

describe("theme contrast (WCAG 2.2 AA)", () => {
  for (const fg of text) {
    for (const bg of surfaces) {
      it(`--${fg} on --${bg} is at least 4.5:1`, () => {
        expect(contrast(token(fg), token(bg))).toBeGreaterThanOrEqual(4.5);
      });
    }
  }
  it("--primary-foreground on --primary is at least 4.5:1", () => {
    expect(contrast(token("primary-foreground"), token("primary"))).toBeGreaterThanOrEqual(4.5);
  });
  it("detects a failing pair (guards the formula)", () => {
    expect(contrast("#777777", "#888888")).toBeLessThan(4.5);
  });
});
