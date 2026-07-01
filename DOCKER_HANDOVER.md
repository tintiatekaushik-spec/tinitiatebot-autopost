# Tinitiate Autopost Docker Handover

This package runs the dashboard with Docker Compose:

- `web`: serves the React dashboard on `http://localhost:5173`
- `api`: runs the Express API on `http://localhost:4100`
- `db`: runs Postgres and loads the SQL migrations from `supabase/migrations`

## If You Want To Share Only Docker

A `Dockerfile` does not contain the full app by itself. The full app is inside Docker **images** after building.

To create a Docker-only release zip, run this on the project machine:

```powershell
.\docker-build-release.ps1
```

It creates:

```text
tinitiate-autopost-docker-release.zip
```

Share that zip with the other person. They do not need the source code. They only need Docker Desktop.

They unzip it and run:

```powershell
.\docker-run-release.ps1
```

Then they open:

```text
http://localhost:5173
```

## Files To Share

Share the full project folder with these Docker files included:

- `Dockerfile`
- `docker-compose.yml`
- `.dockerignore`
- `.env.docker.example`
- `docker-compose.release.yml`
- `docker-build-release.ps1`
- `docker-run-release.ps1`
- `DOCKER_RELEASE_RUN.md`
- `docker/nginx.conf`
- `DOCKER_HANDOVER.md`
- `package.json`
- `package-lock.json`
- `server/`
- `shared/`
- `src/`
- `public/`
- `supabase/migrations/`
- `index.html`
- `tsconfig.json`
- `vite.config.ts`

Do not share these unless you intentionally want to transfer local private data:

- `.env`
- `node_modules/`
- `dist/`
- `uploads/`
- `browser-data/`
- `tmp/`
- `data/`

## First Run

Install Docker Desktop, open Docker, then run:

```powershell
docker compose up --build
```

Docker needs several GB of free disk space because the API image includes Playwright/Chrome for browser automation.

Open:

```text
http://localhost:5173
```

The API health check is:

```text
http://localhost:4100/api/health
```

## Default Dashboard Users

```text
Operations Manager: operations.manager / Tinitiate@2026
Post Uploader:      content.uploader / Uploader@2026
Scheduler:          post.scheduler / Scheduler@2026
Viewer:             workspace.viewer / Viewer@2026
```

You can override these passwords before starting Docker:

```powershell
$env:OPERATIONS_MANAGER_PASSWORD="YourStrongPassword"
docker compose up --build
```

Or copy `.env.docker.example` to `.env`, edit the values, then run Docker Compose.

## Local Storage Folders

Docker cannot see normal Windows paths unless they are mounted.

This compose file mounts:

```text
./storage-sources -> /storage-sources
```

Create folders like:

```text
storage-sources/youtube
storage-sources/instagram
```

In the dashboard, connect them using container paths:

```text
/storage-sources/youtube
/storage-sources/instagram
```

## Persistent Data

These folders stay on the host machine:

```text
uploads/       imported media files
browser-data/  saved browser sessions
storage-sources/ local source folders for imports
```

The database is stored in the Docker volume:

```text
tinitiate_pgdata
```

## Stop The App

```powershell
docker compose down
```

## Troubleshooting

If ports are already used, stop the local dev server, local Supabase, or any process using these ports:

```text
5173 dashboard
4100 API
54322 database
```

If Docker shows errors like `read-only file system`, `unable to start`, or fails while pulling/building images, free disk space first and restart Docker Desktop. This usually means Docker Desktop's internal Linux storage ran out of space.

## Fresh Reset

This deletes the database volume and starts fresh:

```powershell
docker compose down -v
docker compose up --build
```

To also clear local imported files and browser sessions:

```powershell
Remove-Item -Recurse -Force .\uploads, .\browser-data -ErrorAction SilentlyContinue
docker compose down -v
docker compose up --build
```

## Manual Login Note

This Docker setup does not include VNC/noVNC.

That means the dashboard, database, storage sync, schedules, and API run in Docker, but manual social-login browser windows are not visible from the container. To use scheduled posting in Docker, saved sessions must already exist in `browser-data/`, or VNC/noVNC should be added later.
