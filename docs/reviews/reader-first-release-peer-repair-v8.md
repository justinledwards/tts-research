# Reader-First Peer repair v8

Status: owner repair after exact-archive v7 `PEER REQUEST_CHANGES`; no Peer, Linear, or product authorization.

V7 verdict binding:

- Archive: `tts-research-reader-first-peer-review-v7.zip`
- Archive SHA-256: `b105fc493407207125ed2d51165a2c86d882abcee622b0cef7f0021cbd5f65db`
- Response: `docs/reviews/chatgpt-reader-first-release-response-v7.md`
- Response SHA-256: `e838c60cc28d1bbdd8fd4f4b6aa286560a61190c0b04e9eda4a598a33f039b01`
- Verdict: `PEER REQUEST_CHANGES`
- Blocking findings: one remaining timing-fidelity ownership gap spanning two live renderer defaults

## Repair

RFA-15 now additionally owns:

- `frontend/src/features/teleprompt/TelepromptTheatre.tsx`
- `TelepromptTheatre omitted timing input fail-closed default`
- `frontend/src/features/cinema/PreparedSourceCinemaBase.tsx`
- `PreparedSourceCinema active and inactive block authoritative timing state`

RFA-15-AC05 now explicitly requires:

- omitted Theatre timing input defaults to estimated or unknown and cannot claim exact read-along;
- inactive prepared-source blocks consume authoritative fidelity or remain unknown;
- inactivity cannot turn a block trusted or enable exact read-along.

The fixed source-ownership validator requires each new path and symbol. Adversarial tests remove every RFA-15 renderer path and symbol independently, and mutate each new AC05 scenario independently back toward trusted behavior.

No DAG change was made: RFA-15 already depends on RFA-13 and RFA-14.

## Authorization

The canonical authorization state remains fail-closed:

- `ownerAccepted: true`
- `peerApproved: false`
- `linearCreationAuthorized: false`
- `productImplementationAuthorized: false`
- `authorizedIssues: []`

No Linear issue was created and no product implementation began.
