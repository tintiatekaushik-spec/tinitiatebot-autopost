# Tinitiate Autopost

A focused web app dashboard for uploading post files into platform-specific queues.

The app is intentionally simple in this phase:

- Instagram section with upload button.
- X section with upload button.
- LinkedIn section with upload button.
- Facebook section with upload button.
- Any file format can be uploaded.
- Uploaded files are stored locally and exposed as structured input for future n8n + Playwright automation.
- No official social platform APIs are used.

## Product Decision

This should be a web app, not a public website.

A website is best for public pages, marketing, and content. This project needs an authenticated-style dashboard, uploads, queue state, and automation handoff. That is web app territory.

## Run Locally

```bash
npm install
npm run dev
```

Web app:

```text
http://localhost:5173
```

API:

```text
http://localhost:4100
```

## Main API Endpoints

Upload to a platform:

```text
POST /api/platforms/:platform/uploads
```

Allowed platform values:

```text
instagram
x
linkedin
facebook
```

List all uploads:

```text
GET /api/uploads
```

List uploads for one platform:

```text
GET /api/platforms/:platform/uploads
```

n8n input endpoint:

```text
GET /api/automation/input
```

That endpoint returns queued uploads grouped like this:

```json
{
  "officialPlatformApisRequired": false,
  "channels": {
    "instagram": [],
    "x": [],
    "linkedin": [],
    "facebook": []
  }
}
```

## Storage

- Upload metadata is stored in `data/store.json`.
- Uploaded files are stored in `uploads/`.
- Shared TypeScript/Zod contracts live in `shared/schema.ts`.

## Next Phase

n8n will read `GET /api/automation/input`, then pass each platform queue item to Playwright code that opens the correct browser profile and posts to the respective platform through the browser UI.
