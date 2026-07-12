import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const styles = readFileSync(new URL("../styles.css", import.meta.url), "utf8");

const palettes = {
  dark: tokensFor(":root", '[data-theme="dark"]'),
  light: tokensFor(":root"),
  theatre: tokensFor(":root", '[data-cinema-theatre-mode="true"],\n[data-teleprompt-theatre-mode]'),
} as const;

const requiredPairs = [
  ["--vs-text-primary", "--vs-surface-primary", 4.5],
  ["--vs-text-primary", "--vs-workspace", 4.5],
  ["--vs-text-secondary", "--vs-surface-metadata", 4.5],
  ["--vs-text-muted", "--vs-surface-primary", 4.5],
  ["--vs-action-primary-text", "--vs-action-primary", 4.5],
  ["--vs-action-soft-text", "--vs-action-soft-bg", 4.5],
  ["--vs-action-warning", "--vs-action-warning-bg", 4.5],
  ["--vs-action-destructive", "--vs-action-destructive-bg", 4.5],
  ["--vs-action-disabled-text", "--vs-action-disabled-bg", 3],
  ["--vs-selected-text", "--vs-selected", 4.5],
  ["--vs-pinned-text", "--vs-pinned", 4.5],
  ["--vs-status-warning", "--vs-status-warning-bg", 4.5],
  ["--vs-status-danger", "--vs-status-danger-bg", 4.5],
  ["--vs-status-success", "--vs-status-success-bg", 4.5],
  ["--vs-status-info", "--vs-status-info-bg", 4.5],
  ["--vs-status-metadata-text", "--vs-status-metadata-bg", 4.5],
  ["--vs-status-disabled-text", "--vs-status-disabled-bg", 3],
  ["--vs-focus-ring", "--vs-shell", 3],
  ["--vs-highlight-current-word-strong", "--vs-highlight-current-word", 3],
] as const;

describe("visual design token contrast", () => {
  it("keeps required semantic pairs readable across light, dark, and Theatre", () => {
    for (const [theme, tokens] of Object.entries(palettes)) {
      for (const [foreground, background, minimum] of requiredPairs) {
        expectContrast(theme, tokens, foreground, background, minimum);
      }
    }
  });
});

function tokensFor(...selectors: string[]): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const selector of selectors) {
    Object.assign(tokens, extractCustomProperties(blockFor(selector)));
  }
  return tokens;
}

function blockFor(selector: string): string {
  const selectorIndex = styles.indexOf(selector);
  if (selectorIndex === -1) {
    throw new Error(`Missing selector ${selector}`);
  }
  const openIndex = styles.indexOf("{", selectorIndex);
  if (openIndex === -1) {
    throw new Error(`Missing block for selector ${selector}`);
  }
  let depth = 0;
  for (let index = openIndex; index < styles.length; index += 1) {
    const char = styles[index];
    if (char === "{") {
      depth += 1;
    }
    if (char === "}") {
      depth -= 1;
      if (depth === 0) {
        return styles.slice(openIndex + 1, index);
      }
    }
  }
  throw new Error(`Unclosed block for selector ${selector}`);
}

function extractCustomProperties(block: string): Record<string, string> {
  const tokens: Record<string, string> = {};
  for (const declaration of block.split(";")) {
    const separatorIndex = declaration.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const name = declaration.slice(0, separatorIndex).trim();
    const value = declaration.slice(separatorIndex + 1).trim();
    if (name.startsWith("--") && value) {
      tokens[name] = value;
    }
  }
  return tokens;
}

function expectContrast(
  theme: string,
  tokens: Record<string, string>,
  foregroundToken: string,
  backgroundToken: string,
  minimum: number,
) {
  const background = colorFor(tokens, backgroundToken, colorFor(tokens, "--vs-surface-primary"));
  const foreground = colorFor(tokens, foregroundToken, background);
  const ratio = contrastRatio(foreground, background);
  expect(ratio, `${theme} ${foregroundToken} on ${backgroundToken}`).toBeGreaterThanOrEqual(
    minimum,
  );
}

function colorFor(
  tokens: Record<string, string>,
  token: string,
  backdrop = [255, 255, 255],
  seen = new Set<string>(),
): number[] {
  const raw = tokens[token];
  if (!raw) {
    throw new Error(`Missing token ${token}`);
  }
  return parseColor(raw, tokens, backdrop, seen.add(token));
}

function parseColor(
  raw: string,
  tokens: Record<string, string>,
  backdrop: number[],
  seen: Set<string>,
): number[] {
  const tokenReference = /^var\((--[\w-]+)\)$/.exec(raw);
  if (tokenReference) {
    const nextToken = tokenReference[1];
    if (!nextToken) {
      throw new Error(`Unsupported token reference ${raw}`);
    }
    if (seen.has(nextToken)) {
      throw new Error(`Circular token reference ${nextToken}`);
    }
    return colorFor(tokens, nextToken, backdrop, seen);
  }
  const hex = /^#([\da-f]{6})$/i.exec(raw);
  if (hex) {
    const value = hex[1];
    if (!value) {
      throw new Error(`Unsupported hex color ${raw}`);
    }
    return [0, 2, 4].map((offset) => Number.parseInt(value.slice(offset, offset + 2), 16));
  }
  const rgb = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/i.exec(raw);
  if (rgb) {
    const [, red, green, blue, alphaValue] = rgb;
    if (!red || !green || !blue || !alphaValue) {
      throw new Error(`Unsupported rgb color ${raw}`);
    }
    const alpha = Number(alphaValue);
    return [Number(red), Number(green), Number(blue)].map((channel, index) =>
      Math.round(channel * alpha + backdrop[index] * (1 - alpha)),
    );
  }
  throw new Error(`Unsupported color value ${raw}`);
}

function contrastRatio(foreground: number[], background: number[]): number {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function relativeLuminance(color: number[]): number {
  const [red, green, blue] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.039_28 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}
