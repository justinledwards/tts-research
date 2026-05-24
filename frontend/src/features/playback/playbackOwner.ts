export const PLAYBACK_OWNERS = [
  "preview",
  "cinema",
  "teleprompt",
  "workspace",
  "dashboard",
] as const;

export type PlaybackOwner = (typeof PLAYBACK_OWNERS)[number];

export type PlaybackOwnerRole = "primary-playback" | "generation-request" | "status-only";

export interface PlaybackOwnerDefinition {
  readonly canRequestGeneration: boolean;
  readonly canShowStatus: boolean;
  readonly description: string;
  readonly id: PlaybackOwner;
  readonly label: string;
  readonly ownsPlaybackControls: boolean;
  readonly role: PlaybackOwnerRole;
}

export const PLAYBACK_OWNER_DEFINITIONS = {
  cinema: {
    canRequestGeneration: true,
    canShowStatus: true,
    description: "Owns full generated-audio playback, transport, resume, and rebuild actions.",
    id: "cinema",
    label: "Cinema",
    ownsPlaybackControls: true,
    role: "primary-playback",
  },
  dashboard: {
    canRequestGeneration: false,
    canShowStatus: true,
    description: "Shows generated-audio asset status and navigation without playback controls.",
    id: "dashboard",
    label: "Dashboard",
    ownsPlaybackControls: false,
    role: "status-only",
  },
  preview: {
    canRequestGeneration: false,
    canShowStatus: true,
    description:
      "Owns audition playback, selected-block preview, whole-source preview, and A/B comparison.",
    id: "preview",
    label: "Preview",
    ownsPlaybackControls: true,
    role: "primary-playback",
  },
  teleprompt: {
    canRequestGeneration: false,
    canShowStatus: true,
    description: "Owns cue playback for presenter rehearsal and recording workflows.",
    id: "teleprompt",
    label: "Teleprompt",
    ownsPlaybackControls: true,
    role: "primary-playback",
  },
  workspace: {
    canRequestGeneration: true,
    canShowStatus: true,
    description:
      "Requests generated audio for the active source but does not own long-form playback.",
    id: "workspace",
    label: "Workspace",
    ownsPlaybackControls: false,
    role: "generation-request",
  },
} as const satisfies Record<PlaybackOwner, PlaybackOwnerDefinition>;

export function playbackOwnerDefinition(owner: PlaybackOwner): PlaybackOwnerDefinition {
  return PLAYBACK_OWNER_DEFINITIONS[owner];
}

export function playbackOwnerLabel(owner: PlaybackOwner): string {
  return playbackOwnerDefinition(owner).label;
}

export function playbackOwnerCanOwnPlaybackControls(owner: PlaybackOwner): boolean {
  return playbackOwnerDefinition(owner).ownsPlaybackControls;
}

export function playbackOwnerCanRequestGeneration(owner: PlaybackOwner): boolean {
  return playbackOwnerDefinition(owner).canRequestGeneration;
}
