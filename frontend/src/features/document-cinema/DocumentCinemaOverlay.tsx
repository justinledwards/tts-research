import type { ComponentProps } from "react";
import { PreparedSourceCinemaOverlay } from "../cinema/PreparedSourceCinemaBase";

type PreparedSourceCinemaOverlayProps = ComponentProps<typeof PreparedSourceCinemaOverlay>;

export function DocumentCinemaOverlay(props: Readonly<PreparedSourceCinemaOverlayProps>) {
  return <PreparedSourceCinemaOverlay {...props} surfaceKind="document" />;
}

export type { PreparedSourceCinemaPlaybackControls } from "../cinema/PreparedSourceCinemaBase";
