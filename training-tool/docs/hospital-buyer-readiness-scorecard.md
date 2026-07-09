# Hospital Buyer Readiness Scorecard

Use this scorecard before outreach, pilot kickoff, and procurement review.

## How to Score

- `0` = not started
- `1` = partial / draft only
- `2` = complete and evidence available

Target: `>= 30/40` before formal hospital procurement.

## 1) Compliance and Policy Controls (0-10)

- Policy-to-scenario citation map is current: score `0-2`; evidence `docs/policy-citation-map.md`.
- Annual attestation language is finalized: score `0-2`; evidence runtime + policy review notes.
- Version/effective-date controls are documented: score `0-2`; evidence compliance pack and release notes.
- Escalation/reporting references validated by compliance: score `0-2`; evidence sign-off record.
- Remediation path for failed learners is defined: score `0-2`; evidence training flow + manager toolkit.

## 2) Integration and IT Fit (0-10)

- SCORM/xAPI package guidance is complete: score `0-2`; evidence `lms/scorm-manifest-template.xml`, `lms/xapi-event-model.md`.
- Runtime successfully posts attempt/events/completion: score `0-2`; evidence backend smoke run + logs.
- CORS and environment setup is documented for IT: score `0-2`; evidence `backend/DEPLOYMENT.md`.
- LMS sandbox test script exists: score `0-2`; evidence pilot runbook / smoke checklist.
- SSO and identity roadmap is defined for enterprise deals: score `0-2`; evidence `docs/saas-product-roadmap.md`.

## 3) Security and Procurement Readiness (0-10)

- Security overview and data flow summary prepared: score `0-2`; evidence security packet.
- BAA/HIPAA handling stance documented: score `0-2`; evidence legal + security notes.
- Audit/export capability for completion events defined: score `0-2`; evidence analytics/export docs.
- Access control model documented (OWNER/ADMIN/MANAGER): score `0-2`; evidence backend docs.
- Incident and support escalation contacts prepared: score `0-2`; evidence support runbook.

## 4) Outcomes and Adoption Proof (0-10)

- Pilot success metrics are pre-defined: score `0-2`; evidence `docs/pilot-outcomes-plan.md`.
- Baseline vs post-pilot analytics are captured: score `0-2`; evidence pilot report.
- Manager coaching follow-up process is active: score `0-2`; evidence `docs/manager-toolkit.md`.
- Department scenario packs are mapped to role tracks: score `0-2`; evidence `content/department-scenario-packs.md`.
- Stakeholder testimonial / champion feedback captured: score `0-2`; evidence pilot debrief notes.

## Decision Bands

- `34-40`: Buyer-ready for security/procurement conversations.
- `26-33`: Pilot-ready, but likely procurement questions remain.
- `0-25`: Continue internal hardening before external hospital sales.

## Minimum Evidence Packet for First Buyer Calls

- Product one-pager with problem, workflow fit, and outcomes promise.
- Compliance controls summary with citation map reference.
- LMS integration summary (SCORM/xAPI + backend event flow).
- Pilot plan with clear success criteria and timeline.
- Deployment and support model (who does what, when, and how fast).
