# xAPI Event Model (Starter)

## Recommended Verbs
- started-training
- answered-scenario
- started-lightning-round
- answered-lightning
- completed-lightning-round
- started-final-assessment
- answered-assessment
- completed-training

## Core Statement Shape

```json
{
  "actor": {"name": "employee", "account": {"name": "employee-id"}},
  "verb": {"id": "https://destintsprings/verbs/answered-assessment", "display": {"en-US": "answered-assessment"}},
  "object": {"id": "https://destintsprings/training/annual-service-conduct"},
  "result": {"score": {"raw": 154}, "success": true},
  "context": {
    "extensions": {
      "https://destintsprings/extensions/role-track": "clinical",
      "https://destintsprings/extensions/module": "final-assessment"
    }
  },
  "timestamp": "2026-04-02T00:00:00.000Z"
}
```

## Mapping Notes
- `roleTrack` from app state maps to context extension.
- Final pass threshold: assessment percent >= 80.
- Keep one statement per interaction for detailed analytics.
