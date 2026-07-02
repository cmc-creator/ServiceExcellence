$ErrorActionPreference = "Stop"

function Test-Endpoint {
  param(
    [string]$Url,
    [string]$Method = "GET",
    [hashtable]$Headers = @{},
    [string]$Body = $null
  )

  try {
    if ($Body) {
      $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $Headers -ContentType "application/json" -Body $Body
    } else {
      $response = Invoke-RestMethod -Uri $Url -Method $Method -Headers $Headers
    }
    return @{ pass = $true; response = $response }
  } catch {
    return @{ pass = $false; error = $_.Exception.Message }
  }
}

Write-Host "Running backend smoke checks..."

$health = Test-Endpoint -Url "http://localhost:4100/health"
if ($health.pass) {
  Write-Host "PASS - /health is reachable"
} else {
  Write-Host "FAIL - /health check failed: $($health.error)"
}

if ($env:SMOKE_ADMIN_TOKEN) {
  $headers = @{ Authorization = "Bearer $($env:SMOKE_ADMIN_TOKEN)" }
  $body = @{
    sampleDepartment = "Nursing"
    ruleSet = @{
      coreCodes = @("ANNUAL-COMPLIANCE-CORE", "ABUSE-NEGLECT-ANNUAL")
      departmentRules = @(
        @{ keywords = @("nursing"); codes = @("INFECTION-CONTROL-ANNUAL") }
      )
    }
  } | ConvertTo-Json -Depth 8

  $preview = Test-Endpoint -Url "http://localhost:4100/api/admin/settings/auto-enrollment/preview" -Method "POST" -Headers $headers -Body $body
  if ($preview.pass) {
    Write-Host "PASS - auto-enrollment preview endpoint responded"
  } else {
    Write-Host "FAIL - auto-enrollment preview endpoint failed: $($preview.error)"
  }
} else {
  Write-Host "SKIP - Set SMOKE_ADMIN_TOKEN to test protected auto-enrollment preview endpoint"
}

Write-Host "Backend smoke checks complete."
