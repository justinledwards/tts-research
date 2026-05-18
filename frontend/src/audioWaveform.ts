import { useEffect, useState } from "react";

const waveformCache = new Map<string, Promise<number[]>>();

export function useAudioWaveformBars(
  audioUrl: string | null | undefined,
  barCount: number,
): number[] | null {
  const [bars, setBars] = useState<number[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    if (!audioUrl) {
      setBars(null);
      return () => {
        cancelled = true;
      };
    }
    const cacheKey = `${audioUrl}:${barCount.toString()}`;
    const promise = waveformCache.get(cacheKey) ?? decodeAudioWaveform(audioUrl, barCount);
    waveformCache.set(cacheKey, promise);
    setBars(null);
    void promise
      .then((nextBars) => {
        if (!cancelled) {
          setBars(nextBars);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setBars([]);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [audioUrl, barCount]);

  return bars;
}

async function decodeAudioWaveform(audioUrl: string, barCount: number): Promise<number[]> {
  const response = await fetch(audioUrl);
  if (!response.ok) {
    return [];
  }
  const data = await response.arrayBuffer();
  let context: AudioContext;
  try {
    context = new globalThis.AudioContext();
  } catch {
    return [];
  }
  try {
    const buffer = await context.decodeAudioData(data);
    return sampleAudioBuffer(buffer, barCount);
  } finally {
    await context.close().catch(() => null);
  }
}

function sampleAudioBuffer(buffer: AudioBuffer, barCount: number): number[] {
  const safeCount = Math.max(8, Math.min(160, Math.round(barCount)));
  const samplesPerBar = Math.max(1, Math.floor(buffer.length / safeCount));
  const values = Array.from({ length: safeCount }, (_, index) => {
    const start = index * samplesPerBar;
    const end = Math.min(buffer.length, start + samplesPerBar);
    let squareSum = 0;
    let sampleCount = 0;
    for (let channel = 0; channel < buffer.numberOfChannels; channel += 1) {
      const channelData = buffer.getChannelData(channel);
      for (let sampleIndex = start; sampleIndex < end; sampleIndex += 1) {
        const sample = channelData[sampleIndex] ?? 0;
        squareSum += sample * sample;
        sampleCount += 1;
      }
    }
    return sampleCount > 0 ? Math.sqrt(squareSum / sampleCount) : 0;
  });
  const maximum = Math.max(...values, 0.0001);
  return values.map((value) => value / maximum);
}
