$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $MyInvocation.MyCommand.Path
Set-Location $root

if (!(Test-Path ".\tinitiate-autopost-images.tar")) {
  throw "tinitiate-autopost-images.tar was not found in this folder."
}

New-Item -ItemType Directory -Force -Path .\uploads, .\browser-data, .\storage-sources | Out-Null

Write-Host "Loading Docker images..."
docker load -i .\tinitiate-autopost-images.tar

Write-Host "Starting Tinitiate Autopost..."
docker compose -f .\docker-compose.release.yml up
