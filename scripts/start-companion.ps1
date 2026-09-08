[CmdletBinding()]
param(
    [string]$DbPath = (Join-Path $PSScriptRoot '..\work\companion\vacancypilot.db')
)

$ErrorActionPreference = 'Stop'

# Always resolve paths from this script, never from the terminal's current
# directory. This prevents accidentally starting a different project's
# ``app.main`` (the source of the historical wrong-database failure).
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
Set-Location -LiteralPath $repoRoot

if ([System.IO.Path]::IsPathRooted($DbPath)) {
    $resolvedDbPath = [System.IO.Path]::GetFullPath($DbPath)
} else {
    $resolvedDbPath = [System.IO.Path]::GetFullPath((Join-Path $repoRoot $DbPath))
}
$dbDirectory = Split-Path -Parent $resolvedDbPath
New-Item -ItemType Directory -Force -Path $dbDirectory | Out-Null
$env:VACANCYPILOT_DB_PATH = $resolvedDbPath

Write-Host "VacancyPilot Companion"
Write-Host "Repository: $repoRoot"
Write-Host "Database:   $resolvedDbPath"
Write-Host ""

uv run --project companion alembic -c companion/alembic.ini upgrade head
if ($LASTEXITCODE -ne 0) {
    throw "Companion database migration failed with exit code $LASTEXITCODE"
}

Write-Host "Starting loopback service on http://127.0.0.1:8765 ..."
uv run --project companion uvicorn app.main:create_app --factory --host 127.0.0.1 --port 8765
exit $LASTEXITCODE
