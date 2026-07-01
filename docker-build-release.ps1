$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$releaseDir = Join-Path $root "docker-release"
$zipPath = Join-Path $root "tinitiate-autopost-docker-release.zip"

Set-Location $root

Write-Host "Building API image..."
docker build --target api -t tinitiate-autopost-api:latest .

Write-Host "Building web image..."
docker build --target web -t tinitiate-autopost-web:latest .

Write-Host "Pulling Postgres image..."
docker pull postgres:16-alpine

if (Test-Path $releaseDir) {
  Remove-Item -LiteralPath $releaseDir -Recurse -Force
}

New-Item -ItemType Directory -Force -Path $releaseDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releaseDir "migrations") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releaseDir "uploads") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releaseDir "browser-data") | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $releaseDir "storage-sources") | Out-Null

Write-Host "Saving Docker images into release tar..."
docker save -o (Join-Path $releaseDir "tinitiate-autopost-images.tar") `
  tinitiate-autopost-api:latest `
  tinitiate-autopost-web:latest `
  postgres:16-alpine

Copy-Item -LiteralPath (Join-Path $root "docker-compose.release.yml") -Destination $releaseDir
Copy-Item -LiteralPath (Join-Path $root ".env.docker.example") -Destination $releaseDir
Copy-Item -LiteralPath (Join-Path $root "docker-run-release.ps1") -Destination $releaseDir
Copy-Item -LiteralPath (Join-Path $root "DOCKER_RELEASE_RUN.md") -Destination $releaseDir
Copy-Item -Path (Join-Path $root "supabase/migrations/*") -Destination (Join-Path $releaseDir "migrations")

if (Test-Path $zipPath) {
  Remove-Item -LiteralPath $zipPath -Force
}

Write-Host "Creating zip..."
Compress-Archive -Path (Join-Path $releaseDir "*") -DestinationPath $zipPath -Force

Write-Host ""
Write-Host "Docker release created:"
Write-Host $zipPath
Write-Host ""
Write-Host "Share this zip with your college."
