# Reader-First v5 quarantine and v6 self-audit

Status: owner self-audit; no Peer, Linear, or product authorization.

## Quarantine

The v5 archive and submission were quarantined before a Peer verdict. A required ad-hoc verifier exposed that the canonical OCR resolution schema still used legacy fields:

- `nodeId`
- `priorOverlayRevision`
- `newOverlayRevision`
- `resolvedText`

The v5 validator derived its packet expectation from that stale contract list. Contract and packet could therefore drift together while tests passed. The active v5 generation and poller were stopped. V5 must not authorize Linear creation or implementation.

## V6 repair

The canonical contract now fixes the exact OCR resolution audit fields:

1. `sourceNodeId`
2. `sourceEvidence`
3. `sourceOverlayRevision`
4. `reviewedOverlayRevision`
5. `reviewerId`
6. `resolvedRole`
7. `resolvedDisposition`
8. `resolvedAt`

RFA-04 acceptance and telemetry use the same fields. Legacy aliases are removed from issue telemetry.

The validator now compares the contract array against this fixed literal list before deriving any issue check. An adversarial mutation changing `sourceNodeId` back to `nodeId` must fail with `canonical OCR resolution audit-field contract drift`.

## Verification boundary

The repair changes architecture/packet/validator evidence only. It does not modify product implementation, create Linear issues, or grant authorization. V6 remains fail-closed pending an explicit Peer verdict bound to the exact future v6 archive SHA-256.
