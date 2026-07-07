# Frontend to Backend Connection

## Configure API Base
In browser dev tools console, set:

```javascript
localStorage.setItem("nyxApiBase", "https://your-backend-domain")
localStorage.setItem("nyxOrgSlug", "destiny-springs-healthcare")
```

Or edit `training-tool/runtime-config.js`:

```javascript
window.NYX_API_BASE = "https://your-backend-domain"
window.NYX_ORG_SLUG = "destiny-springs-healthcare"
```

Then refresh the page.

## Runtime Behavior
- On Start Experience, frontend creates a backend attempt.
- During scenarios and assessment, events are posted to backend.
- On Submit Completion, attempt status is finalized and scored.
- Each posted event also includes an xAPI-shaped statement for LMS export and analytics interoperability.

## Branding
- Client deployment: Destiny Springs Healthcare psychiatric acute inpatient edition.
- Trademark and Copyright (c) NyxArete.

## Fallback Mode
If `nyxApiBase` is not configured, the training app runs standalone with local export only.
