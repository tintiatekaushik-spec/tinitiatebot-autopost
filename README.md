# Tinitiate Autopost

A focused web app dashboard for synchronizing platform folders into scheduled publishing queues.

The app is intentionally simple in this phase:

- Instagram, X, LinkedIn, Facebook, and YouTube folder connections.
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

Allowed platform values:

```text
instagram
x
linkedin
facebook
youtube
```

## Connected Folders

Each platform card has a **Connect folder** action. Enter the absolute path of a local folder, such as:

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
POST   /api/platforms/:platform/folder-connection
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
