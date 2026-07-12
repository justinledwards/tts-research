export const minInteractiveSize = 44;
export const touchTargetPx = minInteractiveSize;

export const spacing = {
  actionGap: "gap-2",
  metadataGap: "gap-1.5",
  panelGap: "gap-3",
  sectionGap: "gap-4",
  compactPadding: "p-3",
  comfortablePadding: "p-4",
  spaciousPadding: "p-5",
  workbenchPadding: "p-4 sm:p-5",
} as const;

export const radius = {
  control: "rounded-md",
  panel: "rounded-lg",
} as const;

export const controlSizeClassName = {
  sm: "min-h-11 px-3 text-xs",
  md: "min-h-11 px-3 text-sm",
  lg: "min-h-12 px-4 text-sm",
  icon: "h-11 w-11 p-0",
} as const;
