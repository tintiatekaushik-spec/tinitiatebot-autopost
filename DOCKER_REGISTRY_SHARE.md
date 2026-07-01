# Share Through Docker Hub Or Registry

Use this when you do not want to send the source code or a zip file.

The full project will be inside Docker images:

- `<namespace>/tinitiate-autopost-api:latest`
- `<namespace>/tinitiate-autopost-web:latest`
- `<namespace>/tinitiate-autopost-db:latest`

## Your Steps

1. Create or use a Docker Hub account.

2. Login:

```powershell
docker login
```

3. Set your Docker Hub username or registry namespace:

```powershell
$env:DOCKER_NAMESPACE="your-dockerhub-username"
```

4. Build and push:

```powershell
.\docker-push-registry.ps1
```

This uploads the whole app into Docker images.

## What To Share

Share only:

```text
docker-compose.registry.yml
```

Also tell them your namespace, for example:

```text
DOCKER_NAMESPACE=your-dockerhub-username
```

## Their Steps

They create an empty folder, put `docker-compose.registry.yml` inside it, open PowerShell there, then run:

```powershell
$env:DOCKER_NAMESPACE="your-dockerhub-username"
docker compose -f docker-compose.registry.yml up
```

Then open:

```text
http://localhost:5173
```

## Important

They do not need the project source code.

They do need:

- Docker Desktop running
- Internet access to pull the images
- 15GB+ free disk space
- Ports `5173`, `4100`, and `54322` free
