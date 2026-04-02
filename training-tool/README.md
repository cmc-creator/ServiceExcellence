# Destint Springs Healthcare Annual Training Prototype

This prototype demonstrates a premium interactive training experience for:
- Service Excellence
- Code of Conduct

## Run

Open `index.html` in a browser.

## Included

- Luxury glassmorphism visual style with animated effects
- Branching scenarios with role-based tracks (clinical, non-clinical, leadership)
- Timed challenge round
- Full final assessment with 25 questions
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

3. Review generated files:
- `docs/deck-slide-inventory.csv`
- `docs/deck-merge-map.csv`

These files provide a concrete Keep/Merge/Rewrite/Retire map from the two source PowerPoints.

## LMS Packaging Starter

- SCORM template: `lms/scorm-manifest-template.xml`
- xAPI mapping model: `lms/xapi-event-model.md`

Use these with your LMS vendor or internal team to publish completion, scoring, and attempt analytics.

## Content Pack Deliverables

- Master script: `content/master-facilitation-script.md`
- Production pack: `content/production-content-pack.md`

## Next Production Steps

- Migrate content into role-based learning paths
- Connect to LMS with SCORM/xAPI
- Add audio narration and caption files
- Add completion data export
