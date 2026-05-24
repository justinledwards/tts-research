import { StatusChip } from "../../design";
import { capabilityLabel, type ProviderCapabilityKey } from "./providerCapabilities";

export function CapabilityBadge({
  capability,
  available,
}: Readonly<{
  available: boolean;
  capability: ProviderCapabilityKey;
}>) {
  return (
    <StatusChip
      className="rounded-full py-0.5 text-[0.65rem]"
      tone={available ? "success" : "warning"}
    >
      {capabilityLabel(capability)}
    </StatusChip>
  );
}
