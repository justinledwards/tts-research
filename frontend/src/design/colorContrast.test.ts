import { describe, expect, it } from "vitest";

const palettes = {
  light: {
    "--vs-action-disabled-bg": "#e9ddcb",
    "--vs-action-disabled-text": "#76685b",
    "--vs-action-primary": "#c2410c",
    "--vs-action-primary-text": "#fffaf5",
    "--vs-focus-ring": "#b45309",
    "--vs-highlight-current-word": "rgb(194 65 12 / 0.22)",
    "--vs-highlight-current-word-strong": "#c2410c",
    "--vs-shell": "#f7f1e8",
    "--vs-status-danger": "#b42318",
    "--vs-status-danger-bg": "rgb(180 35 24 / 0.1)",
    "--vs-status-info": "#1d4ed8",
    "--vs-status-info-bg": "rgb(37 99 235 / 0.1)",
    "--vs-status-success": "#047857",
    "--vs-status-success-bg": "rgb(4 120 87 / 0.1)",
    "--vs-status-warning": "#8a3f0b",
    "--vs-status-warning-bg": "rgb(217 119 6 / 0.13)",
    "--vs-surface-primary": "#fffdf9",
    "--vs-text-muted": "#6d5f52",
    "--vs-text-primary": "#17130f",
  },
  dark: {
    "--vs-action-disabled-bg": "#2d261f",
    "--vs-action-disabled-text": "#a08c7b",
    "--vs-action-primary": "#fb923c",
    "--vs-action-primary-text": "#1e1208",
    "--vs-focus-ring": "#fb923c",
    "--vs-highlight-current-word": "rgb(251 146 60 / 0.24)",
    "--vs-highlight-current-word-strong": "#fb923c",
    "--vs-shell": "#0d0b09",
    "--vs-status-danger": "#fca5a5",
    "--vs-status-danger-bg": "rgb(239 68 68 / 0.16)",
    "--vs-status-info": "#93c5fd",
    "--vs-status-info-bg": "rgb(59 130 246 / 0.16)",
    "--vs-status-success": "#86efac",
    "--vs-status-success-bg": "rgb(34 197 94 / 0.16)",
    "--vs-status-warning": "#fcd34d",
    "--vs-status-warning-bg": "rgb(245 158 11 / 0.18)",
    "--vs-surface-primary": "#1c1712",
    "--vs-text-muted": "#c7b29f",
    "--vs-text-primary": "#fff7ed",
  },
} as const;

describe("visual design token contrast", () => {
  it("keeps required light and dark semantic pairs readable", () => {
    for (const [name, tokens] of Object.entries(palettes)) {
      expectContrast(name, tokens, "--vs-text-primary", "--vs-surface-primary", 4.5);
      expectContrast(name, tokens, "--vs-text-muted", "--vs-surface-primary", 4.5);
      expectContrast(name, tokens, "--vs-action-primary-text", "--vs-action-primary", 4.5);
      expectContrast(name, tokens, "--vs-action-disabled-text", "--vs-action-disabled-bg", 3);
      expectContrast(name, tokens, "--vs-status-warning", "--vs-status-warning-bg", 4.5);
      expectContrast(name, tokens, "--vs-status-danger", "--vs-status-danger-bg", 4.5);
      expectContrast(name, tokens, "--vs-status-success", "--vs-status-success-bg", 4.5);
      expectContrast(name, tokens, "--vs-status-info", "--vs-status-info-bg", 4.5);
      expectContrast(name, tokens, "--vs-focus-ring", "--vs-shell", 3);
      expectContrast(
        name,
        tokens,
        "--vs-highlight-current-word-strong",
        "--vs-highlight-current-word",
        3,
      );
    }
  });
});

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

function colorFor(tokens: Record<string, string>, token: string, backdrop = [255, 255, 255]) {
  const raw = tokens[token];
  if (!raw) {
    throw new Error(`Missing token ${token}`);
  }
  return parseColor(raw, backdrop);
}

function parseColor(raw: string, backdrop: number[]): number[] {
  const hex = /^#([\da-f]{6})$/i.exec(raw);
  if (hex) {
    return [0, 2, 4].map((offset) => Number.parseInt(hex[1].slice(offset, offset + 2), 16));
  }
  const rgb = /^rgb\((\d+)\s+(\d+)\s+(\d+)\s*\/\s*([\d.]+)\)$/i.exec(raw);
  if (rgb) {
    const alpha = Number(rgb[4]);
    return [Number(rgb[1]), Number(rgb[2]), Number(rgb[3])].map((channel, index) =>
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
  const [r, g, b] = color.map((channel) => {
    const normalized = channel / 255;
    return normalized <= 0.039_28 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
