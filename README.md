# Tinitiate Autopost

A focused web app dashboard for synchronizing platform folders into scheduled publishing queues.

The app is intentionally simple in this phase:

- Multiple Instagram, X, LinkedIn, Facebook, and YouTube accounts.
- One isolated media folder, post queue, delivery history, and browser profile per account.
- Per-post title, caption, date, and time controls.
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

Include `accountId` in the multipart form so the post is routed to one specific publishing account.

Publishing account endpoints:

```text
GET    /api/accounts
POST   /api/platforms/:platform/accounts
PATCH  /api/accounts/:id
DELETE /api/accounts/:id
```

Allowed platform values:

```text
instagram
x
linkedin
facebook
youtube
```

## Connected Folders

Open a platform card, add an account, and connect that account's folder. Enter an absolute path such as:

```text
C:\Users\YourName\Posts\Instagram
```

- Image and video files are discovered recursively for every platform folder.
- New files are added to the queue automatically and remain paused until a caption and future schedule are saved.
- Deleting a source file removes its queued or failed post and cancels its schedule.
- Published history is retained when its source file is deleted.
- Connections are restored and fully rescanned whenever the API restarts.
- The API server and computer must remain running for live filesystem detection and scheduled publishing.

Folder connection endpoints:

```text
GET    /api/folder-connections
POST   /api/accounts/:accountId/folder-connection
DELETE /api/folder-connections/:id
```

List all uploads:

```text
GET /api/uploads
```

List uploads for one platform:

```text
GET /api/platforms/:platform/uploads
```

List uploads routed to one account:

```text
GET /api/uploads?accountId=:accountId
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
    "facebook": [],
    "youtube": []
  }
}
```

## Storage

- Upload metadata is stored in `data/store.json`.
- Platform account sessions are created manually in Chrome and saved under `browser-data/accounts/`; scheduled publishing reuses those saved sessions only.
- Passwords are never returned by the account API.
- Uploaded files are stored in `uploads/`.
- Shared TypeScript/Zod contracts live in `shared/schema.ts`.

## Next Phase

Supabase can replace the local account and secret store without changing account IDs or post routing. Automation already opens a separate persistent browser profile for each account and publishes only that account's assigned queue.
