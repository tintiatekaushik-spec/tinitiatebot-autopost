# Run Tinitiate Autopost Docker Release

This folder contains the Docker images and Compose file needed to run the app.

## Requirements

- Docker Desktop installed
- Docker Desktop running
- 15GB+ free disk space
- Ports `5173`, `4100`, and `54322` free

## Run

Open PowerShell inside this folder and run:

```powershell
.\docker-run-release.ps1
```

Then open:

```text
http://localhost:5173
```

API health check:

```text
http://localhost:4100/api/health
```

## Default Login

```text
Operations Manager: operations.manager / Tinitiate@2026
Post Uploader:      content.uploader / Uploader@2026
Scheduler:          post.scheduler / Scheduler@2026
Viewer:             workspace.viewer / Viewer@2026
```

## Stop

Press `Ctrl+C`, then run:

```powershell
docker compose -f .\docker-compose.release.yml down
```

## Fresh Reset

This deletes the database volume:

```powershell
docker compose -f .\docker-compose.release.yml down -v
```

Then run again:

```powershell
.\docker-run-release.ps1
```

## Storage Folders

Local source folders should be created inside:

```text
storage-sources/
```

Use container paths in the dashboard:

```text
/storage-sources/youtube
/storage-sources/instagram
```
