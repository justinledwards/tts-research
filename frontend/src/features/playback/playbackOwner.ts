export const PLAYBACK_OWNERS = [
  "cinema",
  "preview",
  "review",
  "teleprompt",
  "mini-player",
] as const;

export type PlaybackOwner = (typeof PLAYBACK_OWNERS)[number];

export const PLAYBACK_ACTION_MEANINGS = [
  "play",
  "preview-audition",
  "create-and-listen",
  "open-cinema",
  "ab-compare",
] as const;

export type PlaybackActionMeaning = (typeof PLAYBACK_ACTION_MEANINGS)[number];

export interface PlaybackActionDefinition {
  readonly description: string;
  readonly label: string;
  readonly meaning: PlaybackActionMeaning;
  readonly owner: PlaybackOwner;
}

export const PLAYBACK_ACTIONS = {
  abCompare: {
    description: "Compare two voice, run, or speech-policy variants without creating job audio.",
    label: "A/B Compare",
    meaning: "ab-compare",
    owner: "preview",
  },
  createAndListen: {
    description: "Create production/job audio, then queue playback or open the playback surface.",
    label: "Create & Listen",
    meaning: "create-and-listen",
    owner: "preview",
  },
  openCinema: {
    description: "Navigate to the full playback and review surface.",
    label: "Open Cinema",
    meaning: "open-cinema",
    owner: "cinema",
  },
  play: {
    description: "Play existing generated audio.",
    label: "Play",
    meaning: "play",
    owner: "cinema",
  },
  previewAudition: {
    description: "Generate or play a temporary preview/audition.",
    label: "Audition Preview",
    meaning: "preview-audition",
    owner: "preview",
  },
  telepromptPlay: {
    description: "Play the active Teleprompt cue.",
    label: "Play Cue",
    meaning: "play",
    owner: "teleprompt",
  },
} as const satisfies Record<string, PlaybackActionDefinition>;

export function playbackActionLabel(action: keyof typeof PLAYBACK_ACTIONS): string {
  return PLAYBACK_ACTIONS[action].label;
}
