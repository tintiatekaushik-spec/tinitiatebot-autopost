$ErrorActionPreference = "Stop"

if (-not $env:DOCKER_NAMESPACE) {
  throw "Set DOCKER_NAMESPACE first. Example: `$env:DOCKER_NAMESPACE='your-dockerhub-username'"
}

$namespace = $env:DOCKER_NAMESPACE.Trim().TrimEnd("/")
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

Set-Location $root

Write-Host "Building API image: $namespace/tinitiate-autopost-api:latest"
docker build --target api -t "$namespace/tinitiate-autopost-api:latest" .

Write-Host "Building web image: $namespace/tinitiate-autopost-web:latest"
docker build --target web -t "$namespace/tinitiate-autopost-web:latest" .

Write-Host "Building database image: $namespace/tinitiate-autopost-db:latest"
docker build -f Dockerfile.db -t "$namespace/tinitiate-autopost-db:latest" .

Write-Host "Pushing images to registry..."
docker push "$namespace/tinitiate-autopost-api:latest"
docker push "$namespace/tinitiate-autopost-web:latest"
docker push "$namespace/tinitiate-autopost-db:latest"

Write-Host ""
Write-Host "Done. Share docker-compose.registry.yml and this namespace with your college:"
Write-Host $namespace
