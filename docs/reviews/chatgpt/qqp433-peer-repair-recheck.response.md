PEER APPROVED

Original blocker is fixed for the targeted scope: BuildV2 now writes source word/span text into TextQuote, RawText, NormalizedText, and source traceability fields, while keeping spoken timing token text in SpokenText / SpokenTextMatch.

Exact sync no longer relies on presence-only source IDs/indexes/node IDs: exactWordMappingValid now gates word entries through syncWordTextMappingMatches, and divergent normalized source/spoken text denies MappingValid and ExactAllowed.

Remaining blocker: none found in the targeted re-check.

Non-blocking follow-up: exactGateFallbackReason still reports any mappingValid=false as “word highlight mapping is missing source word identity”; a text-divergence-specific reason would make the fallback explanation more precise.
Source: https://chatgpt.com/g/g-p-6a4c3396e3948191a15f9959895179d7-tts-research/c/6a4dc72b-43b4-83ed-8a85-ba886ffa2d21
Archive: /tmp/tts-research-qqp433-repair-peer-20260708-053817-5faeec3-dirty.zip
Archive-SHA256: 47bb046a9c82111e9e69d16f402080954c7214e6fc98de31ec96e48c5bba411d
