import { describe, expect, it } from "vitest";

const sourceModules = import.meta.glob<string>("../**/*.{ts,tsx}", {
  eager: true,
  import: "default",
  query: "?raw",
});
const rawPalettePrefixes = ["bg", "text", "border", "ring", "shadow"] as const;
const rawPaletteColors = [
  "amber",
  "black",
  "blue",
  "cyan",
  "emerald",
  "gray",
  "green",
  "indigo",
  "lime",
  "neutral",
  "orange",
  "pink",
  "purple",
  "red",
  "rose",
  "sky",
  "slate",
  "stone",
  "teal",
  "violet",
  "white",
  "yellow",
  "zinc",
] as const;
const rawPaletteStates = ["", "active:", "dark:", "disabled:", "focus:", "hover:"] as const;

describe("visual design system usage", () => {
  it("keeps app UI on semantic visual tokens instead of raw palette utilities", () => {
    const offenders = Object.entries(sourceModules)
      .filter(([file]) => !file.endsWith(".test.ts") && !file.endsWith(".test.tsx"))
      .flatMap(([file, content]) => rawPaletteHits(file, content));

    expect(offenders).toEqual([]);
  });
});

function rawPaletteHits(file: string, content: string): string[] {
  return content
    .split("\n")
    .flatMap((line, index) =>
      hasRawPaletteUtility(line) ? [`${file}:${(index + 1).toString()}: ${line.trim()}`] : [],
    );
}

function hasRawPaletteUtility(line: string): boolean {
  return rawPaletteStates.some((state) =>
    rawPalettePrefixes.some((prefix) =>
      rawPaletteColors.some((color) => line.includes(`${state}${prefix}-${color}-`)),
    ),
  );
}
