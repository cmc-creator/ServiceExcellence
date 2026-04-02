$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$source = Join-Path $root 'source-decks'
$docs = Join-Path $root 'docs'

if (-not (Test-Path $source)) {
  throw "source-decks folder not found: $source"
}

$deckFiles = Get-ChildItem -Path $source -Filter *.pptx -File
if ($deckFiles.Count -eq 0) {
  throw "No .pptx files found in $source"
}

$inventory = @()

foreach ($deck in $deckFiles) {
  $temp = Join-Path ([System.IO.Path]::GetTempPath()) ("pptx_" + [System.Guid]::NewGuid().ToString())
  New-Item -ItemType Directory -Path $temp | Out-Null

  try {
    Expand-Archive -Path $deck.FullName -DestinationPath $temp -Force
    $slidesPath = Join-Path $temp 'ppt/slides'
    $slideFiles = Get-ChildItem -Path $slidesPath -Filter slide*.xml -File | Sort-Object Name

    foreach ($slide in $slideFiles) {
      $xml = Get-Content -Path $slide.FullName -Raw
      $matches = [regex]::Matches($xml, '<a:t>(.*?)</a:t>')
      $texts = @()
      foreach ($m in $matches) {
        $value = $m.Groups[1].Value.Trim()
        if ($value.Length -gt 0) {
          $texts += $value
        }
      }

      $slideNumber = [int](([regex]::Match($slide.BaseName, 'slide(\d+)')).Groups[1].Value)
      $title = if ($texts.Count -gt 0) { $texts[0] } else { '' }
      $preview = ($texts | Select-Object -First 8) -join ' | '

      $inventory += [pscustomobject]@{
        SourceDeck = $deck.Name
        SlideNumber = $slideNumber
        SlideTitle = $title
        TextPreview = $preview
        KeepMergeRewriteRetire = ''
        TopicArea = ''
        ModuleTarget = ''
        Notes = ''
      }
    }
  }
  finally {
    Remove-Item -Path $temp -Recurse -Force -ErrorAction SilentlyContinue
  }
}

$inventory = $inventory | Sort-Object SourceDeck, SlideNumber
$inventoryPath = Join-Path $docs 'deck-slide-inventory.csv'
$mapPath = Join-Path $docs 'deck-merge-map.csv'

$inventory | Export-Csv -Path $inventoryPath -NoTypeInformation -Encoding UTF8
$inventory | Select-Object SourceDeck, SlideNumber, SlideTitle, KeepMergeRewriteRetire, TopicArea, ModuleTarget, Notes |
  Export-Csv -Path $mapPath -NoTypeInformation -Encoding UTF8

Write-Host "Generated inventory: $inventoryPath"
Write-Host "Generated merge map: $mapPath"
