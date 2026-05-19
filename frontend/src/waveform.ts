const DEFAULT_WAVEFORM_BAR_COUNT = 76;

export function buildWaveformBarsFromSamples(
  samples: ArrayLike<number>,
  count = DEFAULT_WAVEFORM_BAR_COUNT,
): number[] {
  const safeCount = normalizeBarCount(count);
  if (samples.length === 0) {
    return Array.from({ length: safeCount }, () => 0);
  }

  const values = Array.from({ length: safeCount }, (_, index) => {
    const start = Math.floor((index / safeCount) * samples.length);
    const end = Math.max(start + 1, Math.floor(((index + 1) / safeCount) * samples.length));
    return measureSampleWindow(samples, start, Math.min(end, samples.length));
  });

  return normalizeWaveformValues(values);
}

export function buildWaveformBarsFromAudioBuffers(
  buffers: readonly AudioBuffer[],
  count = DEFAULT_WAVEFORM_BAR_COUNT,
): number[] {
  const safeCount = normalizeBarCount(count);
  const usableBuffers = buffers.filter((buffer) => buffer.length > 0 && buffer.duration > 0);
  if (usableBuffers.length === 0) {
    return Array.from({ length: safeCount }, () => 0);
  }

  const totalDurationSec = usableBuffers.reduce((total, buffer) => total + buffer.duration, 0);
  if (totalDurationSec <= 0) {
    return Array.from({ length: safeCount }, () => 0);
  }

  const values = Array.from({ length: safeCount }, (_, index) => {
    const startSec = (index / safeCount) * totalDurationSec;
    const endSec = ((index + 1) / safeCount) * totalDurationSec;
    return measureAudioBufferWindow(usableBuffers, startSec, endSec);
  });

  return normalizeWaveformValues(values);
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

function measureAudioBufferWindow(
  buffers: readonly AudioBuffer[],
  startSec: number,
  endSec: number,
): number {
  let timelineCursorSec = 0;
  let peak = 0;
  let squareSum = 0;
  let sampleCount = 0;

  for (const buffer of buffers) {
    const bufferStartSec = timelineCursorSec;
    const bufferEndSec = bufferStartSec + buffer.duration;
    timelineCursorSec = bufferEndSec;

    const overlapStartSec = Math.max(startSec, bufferStartSec);
    const overlapEndSec = Math.min(endSec, bufferEndSec);
    if (overlapEndSec <= overlapStartSec) {
      continue;
    }

    const startFrame = Math.max(
      0,
      Math.floor((overlapStartSec - bufferStartSec) * buffer.sampleRate),
    );
    const endFrame = Math.min(
      buffer.length,
      Math.max(startFrame + 1, Math.ceil((overlapEndSec - bufferStartSec) * buffer.sampleRate)),
    );
    const stride = Math.max(1, Math.floor((endFrame - startFrame) / 700));
    let frame = startFrame;

    while (frame < endFrame) {
      const amplitude = measureFrameAmplitude(buffer, frame);
      peak = Math.max(peak, amplitude);
      squareSum += amplitude * amplitude;
      sampleCount += 1;
      frame += stride;
    }
  }

  if (sampleCount === 0) {
    return 0;
  }

  const rms = Math.sqrt(squareSum / sampleCount);
  return peak * 0.72 + rms * 0.28;
}

function measureFrameAmplitude(buffer: AudioBuffer, frame: number): number {
  let channel = 0;
  let peak = 0;
  while (channel < buffer.numberOfChannels) {
    peak = Math.max(peak, Math.abs(buffer.getChannelData(channel)[frame] ?? 0));
    channel += 1;
  }
  return peak;
}

function measureSampleWindow(samples: ArrayLike<number>, start: number, end: number): number {
  const stride = Math.max(1, Math.floor((end - start) / 700));
  let index = start;
  let peak = 0;
  let squareSum = 0;
  let sampleCount = 0;

  while (index < end) {
    const amplitude = Math.abs(samples[index] ?? 0);
    peak = Math.max(peak, amplitude);
    squareSum += amplitude * amplitude;
    sampleCount += 1;
    index += stride;
  }

  if (sampleCount === 0) {
    return 0;
  }

  const rms = Math.sqrt(squareSum / sampleCount);
  return peak * 0.72 + rms * 0.28;
}

function normalizeWaveformValues(values: number[]): number[] {
  const peak = Math.max(...values);
  if (!Number.isFinite(peak) || peak <= 0) {
    return values.map(() => 0);
  }
  return values.map((value) => clamp01(value / peak));
}

function normalizeBarCount(count: number): number {
  return Math.max(8, Math.min(160, Math.round(count)));
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  return Math.max(0, Math.min(1, value));
}
