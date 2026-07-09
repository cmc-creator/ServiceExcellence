# Destiny Springs Healthcare Annual Training Prototype

White-label product edition for Destiny Springs Healthcare.
Trademark and Copyright (c) NyxArete.

This prototype demonstrates a premium interactive training experience for:

- Service Excellence
- Code of Conduct
- Psychiatric acute care inpatient environment

## Emergency Code Reference

- Code Red: Fire
- Code Orange: Missing Patient
- Code Blue: Medical Emergency
- Code Purple: Psychiatric Emergency/Support
- Code Silver: Active Shooter
- Code Yellow: Internal/external disaster
- Code Black: Bomb Threats
- Code Green: Severe Weather

## Run

Open `index.html` in a browser.

Configure runtime settings in `runtime-config.js` for production backend routing.

## Included

- Luxury glassmorphism visual style with animated effects
- Thirteen built-in annual modules:
  - Observation precaution reassessment and handoff clarity
  - Leave return screening and contraband re-entry control
  - Dining room Code Purple response and team role assignment
  - Critical lab result escalation and provider read-back
  - Discharge transportation release and guardian verification
  - Emergency code reference and response priorities
  - Code Blue medical emergency response and resuscitation support
  - Code Silver active shooter response and lockdown support
  - Code Black bomb threat response and area safety
  - Code Green severe weather response and shelter support
  - Code Yellow internal/external disaster response and surge coordination
  - Code Red fire response and evacuation/containment support
  - Code Orange missing patient search and elopement response
- Facility Role Builder module toggles (enable/disable modules by role without code changes)
- Branching scenarios with role-based tracks (clinical, non-clinical, leadership)
- Timed challenge round
- Full final assessment with 30 questions
- Policy topic explorer
- Completion summary and achievement badges
- Exportable tracking JSON for LMS mapping
- LMS connection indicator and SCORM completion submission with attestation

## Deck Merge Workflow (Exact Slide Mapping)

1. Drop original decks into `source-decks/`.
2. Run:

```powershell
pwsh ./tools/extract-pptx-slides.ps1
```

1. Review generated files:

- `docs/deck-slide-inventory.csv`
- `docs/deck-merge-map.csv`

These files provide a concrete Keep/Merge/Rewrite/Retire map from the two source PowerPoints.

## LMS Packaging Starter

- SCORM template: `lms/scorm-manifest-template.xml`
- xAPI mapping model: `lms/xapi-event-model.md`

Use these with your LMS vendor or internal team to publish completion, scoring, and attempt analytics.

The training runtime also emits xAPI-shaped interaction statements alongside the normal backend event payloads.

## Content Pack Deliverables

- Master script: `content/master-facilitation-script.md`
- Production pack: `content/production-content-pack.md`
- Policy citation map: `docs/policy-citation-map.md`
- Manager toolkit: `docs/manager-toolkit.md`
- Audio voiceover pack: `content/audio-voiceover-pack.md`
- Department scenario packs: `content/department-scenario-packs.md`
- Hospital buyer readiness scorecard: `docs/hospital-buyer-readiness-scorecard.md`
- Pilot outcomes plan: `docs/pilot-outcomes-plan.md`

## Backend Integration

- Backend service docs: `../backend/README.md`
- Backend deployment steps: `../backend/DEPLOYMENT.md`
- Frontend connection setup: `docs/backend-connection.md`

Set runtime config in browser local storage:

```javascript
localStorage.setItem("nyxApiBase", "https://your-backend-domain")
localStorage.setItem("nyxOrgSlug", "destiny-springs-healthcare")
```

Or set defaults in `runtime-config.js`.

## Next Production Steps

- Migrate content into role-based learning paths
- Connect to LMS with SCORM/xAPI
- Add audio narration and caption files
- Add completion data export
