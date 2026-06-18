import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import {
  type AutomationInput,
  type DashboardSummary,
  type Platform,
  type PlatformUpload,
  type UploadStatus,
  platformHandles,
  platformLabels,
  platformSurfaces,
  platforms
} from "../shared/schema";

type Store = {
  version: 1;
  uploads: PlatformUpload[];
};

type StoredFileInput = {
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  title?: string;      // 👈 NEW
  caption: string;
  scheduledAt?: string;
};

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = resolveFromRoot(process.env.DATA_FILE ?? "./data/store.json");

function resolveFromRoot(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
}

function emptyStore(): Store {
  return {
    version: 1,
    uploads: []
  };
}

function nowIso() {
  return new Date().toISOString();
}

async function ensureStore() {
  await fs.mkdir(path.dirname(dataFile), { recursive: true });

  try {
    await fs.access(dataFile);
  } catch {
    await writeStore(emptyStore());
  }
}

async function readStore(): Promise<Store> {
  await ensureStore();
  const raw = await fs.readFile(dataFile, "utf8");
  const parsed = JSON.parse(raw) as Partial<Store>;

  if (!Array.isArray(parsed.uploads)) {
    const migrated = emptyStore();
    await writeStore(migrated);
    return migrated;
  }

  return {
    version: 1,
    uploads: parsed.uploads
  };
}

async function writeStore(store: Store) {
  await fs.writeFile(dataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

function createAutomation(platform: Platform, uploadId: string, sourceFileUrl: string) {
  return {
    schemaVersion: "autopost.upload.v1" as const,
    n8nInputKey: `channels.${platform}.${uploadId}`,
    playwright: {
      platform,
      browserProfileName: `${platform}-primary-session`,
      publishSurface: platformSurfaces[platform],
      sourceFileUrl
    }
  };
}

export async function dashboardSummary(): Promise<DashboardSummary> {
  const uploads = await listUploads();

  return {
    totalUploads: uploads.length,
    readyForAutomation: uploads.filter((upload) => upload.status === "queued").length,
    processing: uploads.filter((upload) => upload.status === "processing").length,
    posted: uploads.filter((upload) => upload.status === "posted").length,
    failed: uploads.filter((upload) => upload.status === "failed").length,
    channels: platforms.map((platform) => {
      const channelUploads = uploads.filter((upload) => upload.platform === platform);
      return {
        platform,
        label: platformLabels[platform],
        handle: platformHandles[platform],
        total: channelUploads.length,
        queued: channelUploads.filter((upload) => upload.status === "queued").length,
        latestUploadAt: channelUploads[0]?.uploadedAt ?? null
      };
    })
  };
}

export async function listUploads(platform?: Platform) {
  const store = await readStore();

  return store.uploads
    .filter((upload) => (platform ? upload.platform === platform : true))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

export async function createUpload(platform: Platform, file: StoredFileInput) {
  const store = await readStore();
  const timestamp = nowIso();
  const id = `upload_${nanoid(12)}`;
  const extension = path.extname(file.originalName).replace(".", "").toLowerCase() || "unknown";

  const upload: PlatformUpload = {
    id,
    platform,
    originalName: file.originalName,
    fileName: file.fileName,
    mimeType: file.mimeType || "application/octet-stream",
    extension,
    size: file.size,
    url: file.url,
    title: file.title || file.caption, // 👈 Use title if provided, else fallback to caption
    caption: file.caption,
    status: "queued",
    uploadedAt: timestamp,
    updatedAt: timestamp,
    scheduledAt: file.scheduledAt || undefined,
    automation: createAutomation(platform, id, file.url)
  };

  store.uploads.unshift(upload);
  await writeStore(store);
  return upload;
}

export async function updateUploadStatus(uploadId: string, status: UploadStatus) {
  const store = await readStore();
  const index = store.uploads.findIndex((upload) => upload.id === uploadId);

  if (index === -1) {
    return null;
  }

  const updated = {
    ...store.uploads[index],
    status,
    updatedAt: nowIso()
  };

  store.uploads[index] = updated;
  await writeStore(store);
  return updated;
}

export async function deleteUpload(uploadId: string) {
  const store = await readStore();
  const existing = store.uploads.find((upload) => upload.id === uploadId);

  if (!existing) {
    return null;
  }

  store.uploads = store.uploads.filter((upload) => upload.id !== uploadId);
  await writeStore(store);
  return existing;
}

export async function automationInput(platform?: Platform): Promise<AutomationInput> {
  const uploads = await listUploads(platform);
  const queued = uploads.filter((upload) => upload.status === "queued");

  const channels = Object.fromEntries(
    platforms.map((channel) => [
      channel,
      platform && platform !== channel ? [] : queued.filter((upload) => upload.platform === channel)
    ])
  ) as AutomationInput["channels"];

  return {
    generatedAt: nowIso(),
    officialPlatformApisRequired: false,
    intakeSource: "tinitiatebot_autopost",
    channels
  };
}
