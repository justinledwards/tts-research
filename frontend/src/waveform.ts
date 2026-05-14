export function buildWaveformBars(seed: string, count = 72): number[] {
  const safeCount = Math.max(8, Math.min(160, Math.round(count)));
  let state = hashSeed(seed);
  return Array.from({ length: safeCount }, (_, index) => {
    state = (state * 1_664_525 + 1_013_904_223) >>> 0;
    const random = state / 4_294_967_295;
    const centerBias = 1 - Math.abs(index / Math.max(1, safeCount - 1) - 0.5) * 0.6;
    const pulse = Math.sin(index * 0.55) * 0.18 + Math.sin(index * 0.17) * 0.12;
    return clamp01(0.22 + random * 0.48 + centerBias * 0.22 + pulse);
  });
}

export function waveformProgressIndex(progress: number, barCount: number): number {
  if (barCount <= 0) {
    return 0;
  }
  if (!Number.isFinite(progress)) {
    return 0;
  }
  return Math.max(0, Math.min(barCount, Math.round(clamp01(progress) * barCount)));
}

function hashSeed(seed: string): number {
  let hash = 2_166_136_261;
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0;
    hash = Math.imul(hash, 16_777_619);
  }
  return hash >>> 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
