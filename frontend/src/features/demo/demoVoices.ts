export interface DemoVoice {
  id: string;
  label: string;
  provider: "mock";
  description: string;
  previewLine: string;
}

export const demoVoices: readonly DemoVoice[] = [
  {
    description: "Neutral narration voice used by the mock provider for first-run walkthroughs.",
    id: "default",
    label: "Default mock narrator",
    previewLine: "A clear studio voice for checking pacing, pronunciation, and playback controls.",
    provider: "mock",
  },
  {
    description: "A brighter comparison voice for auditioning alternate delivery choices.",
    id: "demo-bright",
    label: "Bright comparison voice",
    previewLine: "A more energetic read for preview and A/B comparison examples.",
    provider: "mock",
  },
];

export function demoVoiceLabel(voiceId: string): string {
  return demoVoices.find((voice) => voice.id === voiceId)?.label ?? demoVoices[0].label;
}
