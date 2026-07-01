$ErrorActionPreference = "Stop"

$frontendPath = "\\192.168.168.182\Folder Redirection\Ccooper\Documents\GitHub\SE\ServiceExcellence"
$backendPath = "C:\repos\ServiceExcellence\backend"

if (-not (Test-Path -LiteralPath $frontendPath)) {
  throw "Frontend workspace path not found: $frontendPath"
}

if (-not (Test-Path -LiteralPath $backendPath)) {
  throw "Backend local clone path not found: $backendPath"
}

Write-Host "Starting backend from $backendPath ..."
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-Command", "Set-Location -LiteralPath '$backendPath'; npm run start"

Write-Host "Starting frontend from $frontendPath ..."
Start-Process -FilePath "pwsh" -ArgumentList "-NoExit", "-Command", "py -3 -m http.server 3000 --directory '$frontendPath'"

Write-Host ""
Write-Host "App starting now:"
Write-Host "Frontend: http://localhost:3000"
Write-Host "Backend:  http://localhost:4100/health"
