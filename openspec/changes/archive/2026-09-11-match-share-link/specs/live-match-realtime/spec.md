# Delta for live-match-realtime

## ADDED Requirements

### Requirement: LM-32 · Guest Watch SSE Read Path

The guest SSE route `GET /api/watch/[token]/live` MUST be token-gated and MUST NOT alter LM-2's member matrix: `resolveLiveAccess`, the member fixture GET, and the member live routes stay byte-for-byte unchanged (401 anonymous, 404 foreign, member gates intact). The guest subscription MUST use `coachId: null`, set no grace handler, and reduce every hub frame (see `match-share-link` MSL-5) so no private live field reaches the wire.

#### Scenario: Member gates unchanged

- GIVEN the guest SSE route is added
- WHEN the existing member SSE/GET routes run
- THEN their LM-2 decisions (401 anonymous / 404 foreign / member allow) are identical

#### Scenario: Reduced guest frames only

- GIVEN a guest token subscription and a hub publish
- WHEN the guest stream enqueues the frame
- THEN only the reduced frame (MSL-5) is delivered, never the full view state
