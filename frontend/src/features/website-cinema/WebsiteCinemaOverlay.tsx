import type { ComponentProps } from "react";
import { PreparedSourceCinemaOverlay } from "../cinema/PreparedSourceCinemaBase";

type PreparedSourceCinemaOverlayProps = ComponentProps<typeof PreparedSourceCinemaOverlay>;

export function WebsiteCinemaOverlay(props: Readonly<PreparedSourceCinemaOverlayProps>) {
  return <PreparedSourceCinemaOverlay {...props} surfaceKind="website" />;
}

export type { PreparedSourceCinemaPlaybackControls } from "../cinema/PreparedSourceCinemaBase";
