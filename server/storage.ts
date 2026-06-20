import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import {
  type AutomationInput,
  type DashboardSummary,
  type FolderConnection,
  type Platform,
  type PlatformUpload,
  type UpdateUploadDetailsInput,
  type UploadStatus,
  platformHandles,
  platformLabels,
  platformSurfaces,
  platforms
} from "../shared/schema";

type Store = {
  version: 1;
  uploads: PlatformUpload[];
  folderConnections: FolderConnection[];
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
  folderSource?: PlatformUpload["folderSource"];
};

export type AutomationInputMode = "ready" | "scheduledOnly";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = resolveFromRoot(process.env.DATA_FILE ?? "./data/store.json");
let storeMutationQueue: Promise<void> = Promise.resolve();

function resolveFromRoot(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
}

function emptyStore(): Store {
  return {
    version: 1,
    uploads: [],
    folderConnections: []
  };
}

function nowIso() {
  return new Date().toISOString();
}

function scheduledTime(upload: PlatformUpload) {
  if (!upload.scheduledAt) return null;
  const timestamp = Date.parse(upload.scheduledAt);
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function isUploadReadyForAutomation(upload: PlatformUpload, now = Date.now()) {
  if (upload.status !== "queued") return false;
  if (upload.folderSource && !upload.scheduledAt) return false;
  const scheduledAt = scheduledTime(upload);
  return scheduledAt === null ? !upload.scheduledAt : scheduledAt <= now;
}

export function isDueScheduledUpload(upload: PlatformUpload, now = Date.now()) {
  if (upload.status !== "queued" || !upload.scheduledAt) return false;
  const scheduledAt = scheduledTime(upload);
  return scheduledAt !== null && scheduledAt <= now;
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
    uploads: parsed.uploads,
    folderConnections: Array.isArray(parsed.folderConnections) ? parsed.folderConnections : []
  };
}

async function writeStore(store: Store) {
  await fs.writeFile(dataFile, `${JSON.stringify(store, null, 2)}\n`, "utf8");
}

async function mutateStore<T>(mutator: (store: Store) => T | Promise<T>) {
  const operation = storeMutationQueue.then(async () => {
    const store = await readStore();
    const result = await mutator(store);
    await writeStore(store);
    return result;
  });

  storeMutationQueue = operation.then(() => undefined, () => undefined);
  return operation;
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
    readyForAutomation: uploads.filter((upload) => isUploadReadyForAutomation(upload)).length,
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
  return mutateStore((store) => {
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
    folderSource: file.folderSource,
    automation: createAutomation(platform, id, file.url)
  };

  store.uploads.unshift(upload);
  return upload;
  });
}

export async function updateUploadStatus(uploadId: string, status: UploadStatus) {
  return mutateStore((store) => {
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
  return updated;
  });
}

export async function deleteUpload(uploadId: string) {
  return mutateStore((store) => {
  const existing = store.uploads.find((upload) => upload.id === uploadId);

  if (!existing) {
    return null;
  }

  store.uploads = store.uploads.filter((upload) => upload.id !== uploadId);
  return existing;
  });
}

export async function updateUploadDetails(uploadId: string, input: UpdateUploadDetailsInput) {
  return mutateStore((store) => {
    const index = store.uploads.findIndex((upload) => upload.id === uploadId);
    if (index === -1) return null;

    const existing = store.uploads[index];
    if (existing.status === "processing" || existing.status === "posted") {
      throw new Error(`Cannot edit a ${existing.status} post.`);
    }

    const updated: PlatformUpload = {
      ...existing,
      title: input.title?.trim() || input.caption.trim(),
      caption: input.caption.trim(),
      scheduledAt: input.scheduledAt === null ? undefined : input.scheduledAt ?? existing.scheduledAt,
      status: "queued",
      updatedAt: nowIso()
    };

    store.uploads[index] = updated;
    return updated;
  });
}

export async function listFolderConnections() {
  const store = await readStore();
  return [...store.folderConnections].sort((a, b) => a.platform.localeCompare(b.platform));
}

export async function getFolderConnection(connectionId: string) {
  const store = await readStore();
  return store.folderConnections.find((connection) => connection.id === connectionId) ?? null;
}

export async function upsertFolderConnection(platform: Platform, folderPath: string) {
  return mutateStore((store) => {
    const timestamp = nowIso();
    const index = store.folderConnections.findIndex((connection) => connection.platform === platform);

    if (index >= 0) {
      const updated: FolderConnection = {
        ...store.folderConnections[index],
        folderPath,
        updatedAt: timestamp,
        lastScannedAt: undefined,
        lastError: undefined
      };
      store.folderConnections[index] = updated;
      return updated;
    }

    const connection: FolderConnection = {
      id: `folder_${nanoid(12)}`,
      platform,
      folderPath,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.folderConnections.push(connection);
    return connection;
  });
}

export async function deleteFolderConnection(connectionId: string) {
  return mutateStore((store) => {
    const existing = store.folderConnections.find((connection) => connection.id === connectionId);
    if (!existing) return null;

    store.folderConnections = store.folderConnections.filter((connection) => connection.id !== connectionId);
    return existing;
  });
}

export async function updateFolderConnectionScan(connectionId: string, lastError?: string) {
  return mutateStore((store) => {
    const index = store.folderConnections.findIndex((connection) => connection.id === connectionId);
    if (index === -1) return null;

    const timestamp = nowIso();
    const updated: FolderConnection = {
      ...store.folderConnections[index],
      updatedAt: timestamp,
      lastScannedAt: timestamp,
      lastError
    };
    store.folderConnections[index] = updated;
    return updated;
  });
}

export async function setFolderSourcePresent(uploadId: string, present: boolean) {
  return mutateStore((store) => {
    const index = store.uploads.findIndex((upload) => upload.id === uploadId);
    if (index === -1 || !store.uploads[index].folderSource) return null;

    const existing = store.uploads[index];
    const updated: PlatformUpload = {
      ...existing,
      folderSource: { ...existing.folderSource!, present },
      updatedAt: nowIso()
    };
    store.uploads[index] = updated;
    return updated;
  });
}

export async function updateFolderUploadFile(
  uploadId: string,
  input: { originalName: string; mimeType: string; size: number; fingerprint: string },
) {
  return mutateStore((store) => {
    const index = store.uploads.findIndex((upload) => upload.id === uploadId);
    if (index === -1 || !store.uploads[index].folderSource) return null;

    const existing = store.uploads[index];
    const updated: PlatformUpload = {
      ...existing,
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      status: existing.status === "failed" ? "queued" : existing.status,
      folderSource: { ...existing.folderSource!, fingerprint: input.fingerprint, present: true },
      updatedAt: nowIso()
    };
    store.uploads[index] = updated;
    return updated;
  });
}

export async function listDueScheduledUploads() {
  const uploads = await listUploads();
  return uploads.filter((upload) => isDueScheduledUpload(upload));
}

export async function automationInput(
  platform?: Platform,
  mode: AutomationInputMode = "ready",
): Promise<AutomationInput> {
  const uploads = await listUploads(platform);
  const queued = uploads.filter((upload) =>
    mode === "scheduledOnly" ? isDueScheduledUpload(upload) : isUploadReadyForAutomation(upload),
  );

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
