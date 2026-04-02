# Source Deck Drop Zone

Place your original PowerPoint files in this folder:

- `DSH Code_Conduct_.pptx`
- `1) Service Excellence.pptx`

Then run the extraction script:

```powershell
pwsh ./tools/extract-pptx-slides.ps1
```

This generates:
- `docs/deck-slide-inventory.csv`
- `docs/deck-merge-map.csv`

Those files provide an exact slide-by-slide mapping workflow for final merge decisions.
