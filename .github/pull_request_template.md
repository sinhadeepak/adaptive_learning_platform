# Pull Request

## Summary
<!-- 1-3 sentences: what and why. Link the user story / gap / ADR. -->

## Related
- Story: `STU-REQ-XX`
- Gap: `GAP-XX` (if applicable)
- ADR: `ADR-XXXX` (if applicable)

## Type of change
- [ ] Feature
- [ ] Bug fix
- [ ] Refactor / chore
- [ ] Docs only
- [ ] Infrastructure / CI

## Definition of Done
- [ ] Tests added/updated; `make test` passes locally
- [ ] `make lint` clean
- [ ] No new `HIGH`/`CRITICAL` CVEs (Trivy report)
- [ ] OpenAPI / gRPC schema updated if API changed
- [ ] Observability: metrics + structured logs added for new code paths
- [ ] Runbook updated if on-call behavior changes

## Backward compatibility (OI-01 / GAP-27)
- [ ] No breaking API changes, **OR**
- [ ] Breaking changes are guarded by `X-Client-Version` header and documented in [docs/06_gaps_resolution/](../docs/06_gaps_resolution/)
- [ ] Mobile `min_version` bump is **not** required by this change, **OR**
- [ ] `min_version` bump is justified and coordinated with App Store release window

## Rollout & rollback
<!-- How to deploy this; how to back it out if it breaks. Feature flag? Migration order? -->

## Screenshots / recordings
<!-- UI changes only -->
