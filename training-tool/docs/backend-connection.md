# Frontend to Backend Connection

## Configure API Base
In browser dev tools console, set:

```javascript
localStorage.setItem("nyxApiBase", "https://your-backend-domain")
localStorage.setItem("nyxOrgSlug", "destint-springs-healthcare")
```

Then refresh the page.

## Runtime Behavior
- On Start Experience, frontend creates a backend attempt.
- During scenarios and assessment, events are posted to backend.
- On Submit Completion, attempt status is finalized and scored.

## Fallback Mode
If `nyxApiBase` is not configured, the training app runs standalone with local export only.
