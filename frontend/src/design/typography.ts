export const textStyles = {
  eyebrow: "text-[0.65rem] font-semibold uppercase tracking-[0.16em]",
  label: "text-xs font-semibold",
  body: "text-sm leading-6",
  compactBody: "text-xs leading-5",
  heading: "text-base font-semibold",
  compactHeading: "text-sm font-semibold",
} as const;

export const truncation = {
  singleLine: "min-w-0 truncate",
  twoLine: "line-clamp-2",
} as const;
