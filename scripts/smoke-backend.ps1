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

function Test-ProtectedEndpoint {
  param(
    [string]$Url,
    [string]$Name,
    [hashtable]$Headers = @{}
  )

  $result = Test-Endpoint -Url $Url -Headers $Headers
  if ($result.pass) {
    Write-Host "PASS - $Name responded"
    return
  }

  if ($result.error -match "401") {
    Write-Host "PASS - $Name requires authorization (401 as expected)"
    return
  }

  Write-Host "FAIL - $Name failed: $($result.error)"
}

Write-Host "Running backend smoke checks..."

$health = Test-Endpoint -Url "http://localhost:4100/health"
if ($health.pass) {
  Write-Host "PASS - /health is reachable"
} else {
  Write-Host "FAIL - /health check failed: $($health.error)"
}

$baseHeaders = @{}
if ($env:SMOKE_ADMIN_TOKEN) {
  $baseHeaders = @{ Authorization = "Bearer $($env:SMOKE_ADMIN_TOKEN)" }
}

Test-ProtectedEndpoint -Url "http://localhost:4100/api/analytics/by-module" -Name "/api/analytics/by-module" -Headers $baseHeaders
Test-ProtectedEndpoint -Url "http://localhost:4100/api/analytics/role-module-coverage" -Name "/api/analytics/role-module-coverage" -Headers $baseHeaders

if ($env:SMOKE_ADMIN_TOKEN) {
  $headers = @{ Authorization = "Bearer $($env:SMOKE_ADMIN_TOKEN)" }
  $body = @{
    sampleDepartment = "Nursing"
    sampleRoleTrack = "Clinical Staff"
    ruleSet = @{
      coreCodes = @("ANNUAL-COMPLIANCE-CORE", "ABUSE-NEGLECT-ANNUAL")
      departmentRules = @(
        @{ keywords = @("nursing"); codes = @("INFECTION-CONTROL-ANNUAL") }
      )
      roleTrackRules = @(
        @{ roleTracks = @("clinical"); codes = @("DEESCALATION-ANNUAL") }
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
