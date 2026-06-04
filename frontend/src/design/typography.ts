export const textStyles = {
  display: "text-2xl font-semibold leading-tight",
  eyebrow: "text-[0.65rem] font-semibold uppercase tracking-[0.16em]",
  label: "text-xs font-semibold",
  metadata: "text-xs leading-5",
  body: "text-sm leading-6",
  compactBody: "text-xs leading-5",
  sectionHeading: "text-lg font-semibold leading-7",
  heading: "text-base font-semibold",
  compactHeading: "text-sm font-semibold",
} as const;

export const truncation = {
  singleLine: "min-w-0 truncate",
  twoLine: "line-clamp-2",
} as const;
