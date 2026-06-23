import { promises as fs } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import nodeCron from "node-cron";
import {
  type AutomationInput,
  type DashboardSummary,
  type FolderConnection,
  type Platform,
  type PlatformAccount,
  type PlatformUpload,
  type PublishingSchedule,
  type SocialMediaSchedule,
  type UpdateUploadDetailsInput,
  type UploadStatus,
  type UpsertPlatformAccountInput,
  type UpsertPublishingScheduleInput,
  platformHandles,
  platformLabels,
  platformSurfaces,
  platforms
} from "../shared/schema";

type AccountSecret = { encryptedPassword?: string; password?: string };

type Store = {
  version: 3;
  accounts: PlatformAccount[];
  accountSecrets: Record<string, AccountSecret>;
  schedules: PublishingSchedule[];
  socialMediaSchedules: SocialMediaSchedule[];
  uploads: PlatformUpload[];
  folderConnections: FolderConnection[];
};

type StoredFileInput = {
  originalName: string;
  fileName: string;
  mimeType: string;
  size: number;
  url: string;
  title?: string;
  caption: string;
  scheduledAt?: string;
  scheduleId?: number;
  folderSource?: PlatformUpload["folderSource"];
};

export type AutomationInputMode = "ready" | "scheduledOnly";
export type PublishingAccount = PlatformAccount & { password?: string };

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const dataFile = resolveFromRoot(process.env.DATA_FILE ?? "./data/store.json");
const localSecretKeyFile = resolveFromRoot(process.env.LOCAL_ACCOUNT_KEY_FILE ?? "./data/account-secret.key");
let storeMutationQueue: Promise<void> = Promise.resolve();
let secretKeyPromise: Promise<Buffer> | null = null;

function resolveFromRoot(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
}

function emptyStore(): Store {
  return { version: 3, accounts: [], accountSecrets: {}, schedules: [], socialMediaSchedules: [], uploads: [], folderConnections: [] };
}

function nowIso() {
  return new Date().toISOString();
}

async function getLocalSecretKey() {
  if (secretKeyPromise) return secretKeyPromise;
  secretKeyPromise = (async () => {
    const configured = process.env.LOCAL_ACCOUNT_SECRET_KEY?.trim();
    if (configured) return createHash("sha256").update(configured).digest();
    try {
      const encoded = await fs.readFile(localSecretKeyFile, "utf8");
      return Buffer.from(encoded.trim(), "base64");
    } catch {
      const key = randomBytes(32);
      await fs.mkdir(path.dirname(localSecretKeyFile), { recursive: true });
      await fs.writeFile(localSecretKeyFile, key.toString("base64"), { encoding: "utf8", mode: 0o600 });
      return key;
    }
  })();
  return secretKeyPromise;
}

async function encryptPassword(password: string) {
  const key = await getLocalSecretKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const ciphertext = Buffer.concat([cipher.update(password, "utf8"), cipher.final()]);
  return [iv, cipher.getAuthTag(), ciphertext].map(value => value.toString("base64")).join(".");
}

async function decryptPassword(secret?: AccountSecret) {
  if (!secret) return undefined;
  if (secret.password) return secret.password;
  if (!secret.encryptedPassword) return undefined;
  const [iv, tag, ciphertext] = secret.encryptedPassword.split(".").map(value => Buffer.from(value, "base64"));
  const decipher = createDecipheriv("aes-256-gcm", await getLocalSecretKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8");
}

function primaryAccount(platform: Platform): PlatformAccount {
  const timestamp = nowIso();
  return {
    id: `account_${platform}_primary`,
    platform,
    displayName: `${platformLabels[platform]} Primary`,
    handle: platformHandles[platform],
    loginIdentifier: "Existing browser session",
    credentialConfigured: false,
    enabled: true,
    createdAt: timestamp,
    updatedAt: timestamp
  };
}

function createAutomation(platform: Platform, accountId: string, uploadId: string, sourceFileUrl: string) {
  return {
    schemaVersion: "autopost.upload.v1" as const,
    n8nInputKey: `accounts.${accountId}.${uploadId}`,
    playwright: {
      platform,
      accountId,
      browserProfileName: `${platform}-${accountId}-session`,
      publishSurface: platformSurfaces[platform],
      sourceFileUrl
    }
  };
}

function normalizeEndDate(value?: string | null) {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function nextNumericId(items: Array<{ id: number }>) {
  return items.reduce((max, item) => Math.max(max, item.id), 0) + 1;
}

function validateScheduleInput(input: UpsertPublishingScheduleInput) {
  if (input.frequency === "custom" && input.customCronExpression && !nodeCron.validate(input.customCronExpression)) {
    throw new Error("Custom schedule cron expression is invalid.");
  }
  if (input.frequency === "onetime" && !normalizeEndDate(input.endDate)) {
    throw new Error("One-time schedules need a schedule date.");
  }
}

function normalizeScheduleId(value: unknown) {
  if (value === undefined || value === null || value === "") return undefined;
  const scheduleId = Number(value);
  if (!Number.isInteger(scheduleId) || scheduleId <= 0) throw new Error("Selected schedule is invalid.");
  return scheduleId;
}

function migrateStore(parsed: any): Store {
  if (!Array.isArray(parsed?.uploads)) return emptyStore();

  const accounts: PlatformAccount[] = Array.isArray(parsed.accounts) ? parsed.accounts : [];
  const schedules = (Array.isArray(parsed.schedules) ? parsed.schedules : []) as PublishingSchedule[];
  const socialMediaSchedules = (Array.isArray(parsed.socialMediaSchedules) ? parsed.socialMediaSchedules : []) as SocialMediaSchedule[];
  const uploads = parsed.uploads as Array<PlatformUpload & { accountId?: string }>;
  const folderConnections = (Array.isArray(parsed.folderConnections) ? parsed.folderConnections : []) as Array<FolderConnection & { accountId?: string }>;
  const legacyPlatforms = new Set<Platform>();
  uploads.forEach(upload => legacyPlatforms.add(upload.platform));
  folderConnections.forEach(connection => legacyPlatforms.add(connection.platform));

  for (const platform of legacyPlatforms) {
    if (!accounts.some(account => account.platform === platform)) accounts.push(primaryAccount(platform));
  }

  const primaryId = (platform: Platform) => accounts.find(account => account.platform === platform)?.id ?? primaryAccount(platform).id;
  const migratedUploads = uploads.map(upload => {
    const accountId = upload.accountId || primaryId(upload.platform);
    return {
      ...upload,
      accountId,
      automation: createAutomation(upload.platform, accountId, upload.id, upload.url)
    } as PlatformUpload;
  });
  const migratedConnections = folderConnections.map(connection => ({
    ...connection,
    accountId: connection.accountId || primaryId(connection.platform)
  })) as FolderConnection[];

  const store: Store = {
    version: 3,
    accounts,
    accountSecrets: parsed.accountSecrets && typeof parsed.accountSecrets === "object" ? parsed.accountSecrets : {},
    schedules,
    socialMediaSchedules,
    uploads: migratedUploads,
    folderConnections: migratedConnections
  };

  return store;
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
  const parsed = JSON.parse(raw);
  const store = migrateStore(parsed);
  if (parsed.version !== 3) await writeStore(store);
  return store;
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

export async function listPlatformAccounts(platform?: Platform) {
  const store = await readStore();
  return store.accounts
    .filter(account => !platform || account.platform === platform)
    .sort((a, b) => a.platform.localeCompare(b.platform) || a.displayName.localeCompare(b.displayName));
}

export async function getPlatformAccount(accountId: string) {
  const store = await readStore();
  return store.accounts.find(account => account.id === accountId) ?? null;
}

export async function getPublishingAccount(accountId: string): Promise<PublishingAccount | null> {
  const store = await readStore();
  const account = store.accounts.find(item => item.id === accountId);
  if (!account) return null;
  return { ...account, password: await decryptPassword(store.accountSecrets[accountId]) };
}

export async function createPlatformAccount(platform: Platform, input: UpsertPlatformAccountInput) {
  const encryptedPassword = input.password ? await encryptPassword(input.password) : undefined;
  return mutateStore(store => {
    const duplicate = store.accounts.some(account => account.platform === platform && account.handle.toLowerCase() === input.handle.toLowerCase());
    if (duplicate) throw new Error(`${platformLabels[platform]} account ${input.handle} already exists.`);
    if (!input.password) throw new Error("Password is required when adding an account.");
    const timestamp = nowIso();
    const account: PlatformAccount = {
      id: `account_${nanoid(12)}`,
      platform,
      displayName: input.displayName,
      handle: input.handle,
      loginIdentifier: input.loginIdentifier,
      loginConfirmation: input.loginConfirmation || undefined,
      credentialConfigured: true,
      enabled: input.enabled ?? true,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.accounts.push(account);
    store.accountSecrets[account.id] = { encryptedPassword };
    return account;
  });
}

export async function updatePlatformAccount(accountId: string, input: UpsertPlatformAccountInput) {
  const encryptedPassword = input.password ? await encryptPassword(input.password) : undefined;
  return mutateStore(store => {
    const index = store.accounts.findIndex(account => account.id === accountId);
    if (index === -1) return null;
    const existing = store.accounts[index];
    const duplicate = store.accounts.some(account => account.id !== accountId && account.platform === existing.platform && account.handle.toLowerCase() === input.handle.toLowerCase());
    if (duplicate) throw new Error(`${platformLabels[existing.platform]} account ${input.handle} already exists.`);
    const updated: PlatformAccount = {
      ...existing,
      displayName: input.displayName,
      handle: input.handle,
      loginIdentifier: input.loginIdentifier,
      loginConfirmation: input.loginConfirmation || undefined,
      credentialConfigured: Boolean(input.password || store.accountSecrets[accountId]?.encryptedPassword || store.accountSecrets[accountId]?.password),
      enabled: input.enabled ?? existing.enabled,
      updatedAt: nowIso()
    };
    store.accounts[index] = updated;
    if (encryptedPassword) store.accountSecrets[accountId] = { encryptedPassword };
    return updated;
  });
}

export async function deletePlatformAccount(accountId: string) {
  return mutateStore(store => {
    const existing = store.accounts.find(account => account.id === accountId);
    if (!existing) return null;
    if (store.folderConnections.some(connection => connection.accountId === accountId)) throw new Error("Disconnect this account's folder before deleting it.");
    if (store.uploads.some(upload => upload.accountId === accountId)) throw new Error("This account has post history and cannot be deleted. Disable it instead.");
    store.accounts = store.accounts.filter(account => account.id !== accountId);
    store.socialMediaSchedules = store.socialMediaSchedules.filter(item => item.accountId !== accountId);
    delete store.accountSecrets[accountId];
    return existing;
  });
}

export async function listPublishingSchedules() {
  const store = await readStore();
  return [...store.schedules].sort((a, b) => a.id - b.id);
}

export async function listSocialMediaSchedules() {
  const store = await readStore();
  return store.uploads
    .filter(upload => upload.scheduleId)
    .map((upload, index) => ({
      id: index + 1,
      scheduleId: upload.scheduleId!,
      accountId: upload.accountId,
      platform: upload.platform,
      createdAt: upload.uploadedAt,
      updatedAt: upload.updatedAt
    }))
    .sort((a, b) => a.id - b.id);
}

export async function createPublishingSchedule(input: UpsertPublishingScheduleInput) {
  validateScheduleInput(input);
  return mutateStore(store => {
    const timestamp = nowIso();
    const schedule: PublishingSchedule = {
      id: nextNumericId(store.schedules),
      name: input.name.trim(),
      time: input.time,
      frequency: input.frequency,
      endDate: normalizeEndDate(input.endDate),
      status: input.status ?? "active",
      customCronExpression: input.frequency === "custom" ? input.customCronExpression?.trim() : undefined,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.schedules.push(schedule);
    return schedule;
  });
}

export async function updatePublishingSchedule(scheduleId: number, input: UpsertPublishingScheduleInput) {
  validateScheduleInput(input);
  return mutateStore(store => {
    const index = store.schedules.findIndex(schedule => schedule.id === scheduleId);
    if (index === -1) return null;
    const existing = store.schedules[index];
    const updated: PublishingSchedule = {
      ...existing,
      name: input.name.trim(),
      time: input.time,
      frequency: input.frequency,
      endDate: normalizeEndDate(input.endDate),
      status: input.status ?? existing.status,
      customCronExpression: input.frequency === "custom" ? input.customCronExpression?.trim() : undefined,
      updatedAt: nowIso()
    };
    store.schedules[index] = updated;
    return updated;
  });
}

export async function deletePublishingSchedule(scheduleId: number) {
  return mutateStore(store => {
    const existing = store.schedules.find(schedule => schedule.id === scheduleId);
    if (!existing) return null;
    if (store.uploads.some(upload => upload.scheduleId === scheduleId)) {
      throw new Error("Remove this schedule from posts before deleting it.");
    }
    store.schedules = store.schedules.filter(schedule => schedule.id !== scheduleId);
    store.socialMediaSchedules = store.socialMediaSchedules.filter(item => item.scheduleId !== scheduleId);
    return existing;
  });
}

function localDateAt(date: Date, time: string) {
  const [hour, minute] = time.split(":").map(Number);
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), hour, minute, 0, 0);
}

function endOfLocalDate(dateValue?: string) {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day, 23, 59, 59, 999);
}

function localDateFromValue(dateValue?: string) {
  if (!dateValue) return null;
  const [year, month, day] = dateValue.split("-").map(Number);
  if (!year || !month || !day) return null;
  return new Date(year, month - 1, day);
}

function daysBetween(start: Date, end: Date) {
  const startDay = new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime();
  const endDay = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  return Math.floor((endDay - startDay) / 86_400_000);
}

function lastDayOfMonth(year: number, month: number) {
  return new Date(year, month + 1, 0).getDate();
}

function scheduleDateInMonth(year: number, month: number, anchorDay: number, time: string) {
  const day = Math.min(anchorDay, lastDayOfMonth(year, month));
  return localDateAt(new Date(year, month, day), time);
}

function previousScheduleOccurrence(schedule: PublishingSchedule, now: Date) {
  const createdAt = new Date(schedule.createdAt);
  const anchor = Number.isFinite(createdAt.getTime()) ? createdAt : now;

  if (schedule.frequency === "custom") {
    if (!schedule.customCronExpression || !nodeCron.validate(schedule.customCronExpression)) return null;
    const currentMinute = new Date(now);
    currentMinute.setSeconds(0, 0);
    const task = nodeCron.createTask(schedule.customCronExpression, () => undefined);
    try {
      return task.match(currentMinute) ? currentMinute : null;
    } finally {
      void task.destroy();
    }
  }

  if (schedule.frequency === "onetime") {
    const runDate = localDateFromValue(schedule.endDate);
    if (!runDate) return null;
    const occurrence = localDateAt(runDate, schedule.time);
    return occurrence.getTime() <= now.getTime() ? occurrence : null;
  }

  if (schedule.frequency === "daily") {
    const today = localDateAt(now, schedule.time);
    if (today.getTime() <= now.getTime()) return today;
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
    return localDateAt(yesterday, schedule.time);
  }

  if (schedule.frequency === "weekly") {
    const dayDiff = (now.getDay() - anchor.getDay() + 7) % 7;
    const candidateDay = new Date(now);
    candidateDay.setDate(candidateDay.getDate() - dayDiff);
    const candidate = localDateAt(candidateDay, schedule.time);
    if (candidate.getTime() <= now.getTime()) return candidate;
    candidateDay.setDate(candidateDay.getDate() - 7);
    return localDateAt(candidateDay, schedule.time);
  }

  if (schedule.frequency === "biweekly") {
    const elapsedDays = Math.max(0, daysBetween(anchor, now));
    const cycleStart = elapsedDays - (elapsedDays % 14);
    const candidateDay = new Date(anchor);
    candidateDay.setDate(candidateDay.getDate() + cycleStart);
    const candidate = localDateAt(candidateDay, schedule.time);
    if (candidate.getTime() <= now.getTime()) return candidate;
    candidateDay.setDate(candidateDay.getDate() - 14);
    return localDateAt(candidateDay, schedule.time);
  }

  if (schedule.frequency === "monthly") {
    const candidate = scheduleDateInMonth(now.getFullYear(), now.getMonth(), anchor.getDate(), schedule.time);
    if (candidate.getTime() <= now.getTime()) return candidate;
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return scheduleDateInMonth(previousMonth.getFullYear(), previousMonth.getMonth(), anchor.getDate(), schedule.time);
  }

  const candidate = scheduleDateInMonth(now.getFullYear(), anchor.getMonth(), anchor.getDate(), schedule.time);
  if (candidate.getTime() <= now.getTime()) return candidate;
  return scheduleDateInMonth(now.getFullYear() - 1, anchor.getMonth(), anchor.getDate(), schedule.time);
}

function isScheduleDue(schedule: PublishingSchedule, now = new Date()) {
  if (schedule.status !== "active") return false;
  const occurrence = previousScheduleOccurrence(schedule, now);
  if (!occurrence) return false;

  const endAt = endOfLocalDate(schedule.endDate);
  if (endAt && occurrence.getTime() > endAt.getTime()) return false;

  const lastRunAt = schedule.lastRunAt ? Date.parse(schedule.lastRunAt) : null;
  return !lastRunAt || !Number.isFinite(lastRunAt) || occurrence.getTime() > lastRunAt;
}

function dueScheduleIds(store: Store, now = new Date()) {
  return new Set(store.schedules.filter(schedule => isScheduleDue(schedule, now)).map(schedule => schedule.id));
}

function isDueByPostSchedule(upload: PlatformUpload, account: PlatformAccount | undefined, dueIds: Set<number>) {
  if (!account?.enabled || !upload.scheduleId) return false;
  if (upload.status !== "queued" || upload.scheduledAt) return false;
  return dueIds.has(upload.scheduleId);
}

function isStoreUploadReadyForAutomation(store: Store, upload: PlatformUpload, mode: AutomationInputMode, now = Date.now(), scheduledIds = dueScheduleIds(store, new Date(now))) {
  const account = store.accounts.find(item => item.id === upload.accountId);
  if (!account?.enabled) return false;
  if (upload.scheduleId) {
    return isDueByPostSchedule(upload, account, scheduledIds);
  }
  if (mode === "scheduledOnly") {
    return isDueScheduledUpload(upload, now);
  }
  return isUploadReadyForAutomation(upload, now);
}

export async function listDueScheduleIdsWithQueuedUploads() {
  const store = await readStore();
  const dueIds = dueScheduleIds(store);
  const accountById = new Map(store.accounts.map(account => [account.id, account]));
  const ids = new Set<number>();
  for (const upload of store.uploads) {
    const account = accountById.get(upload.accountId);
    if (upload.scheduleId && isDueByPostSchedule(upload, account, dueIds)) ids.add(upload.scheduleId);
  }
  return [...ids];
}

export async function markSchedulesTriggered(scheduleIds: number[], triggeredAt = nowIso()) {
  if (scheduleIds.length === 0) return [];
  const uniqueIds = new Set(scheduleIds);
  return mutateStore(store => {
    const updated: PublishingSchedule[] = [];
    store.schedules = store.schedules.map(schedule => {
      if (!uniqueIds.has(schedule.id)) return schedule;
      const nextSchedule = { ...schedule, lastRunAt: triggeredAt, updatedAt: triggeredAt };
      updated.push(nextSchedule);
      return nextSchedule;
    });
    return updated;
  });
}

export async function dashboardSummary(): Promise<DashboardSummary> {
  const store = await readStore();
  const uploads = [...store.uploads].sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const scheduledIds = dueScheduleIds(store);
  return {
    totalUploads: uploads.length,
    readyForAutomation: uploads.filter(upload => isStoreUploadReadyForAutomation(store, upload, "ready", Date.now(), scheduledIds)).length,
    processing: uploads.filter(upload => upload.status === "processing").length,
    posted: uploads.filter(upload => upload.status === "posted").length,
    failed: uploads.filter(upload => upload.status === "failed").length,
    channels: platforms.map(platform => {
      const channelUploads = uploads.filter(upload => upload.platform === platform);
      return {
        platform,
        label: platformLabels[platform],
        handle: platformHandles[platform],
        total: channelUploads.length,
        queued: channelUploads.filter(upload => upload.status === "queued").length,
        latestUploadAt: channelUploads[0]?.uploadedAt ?? null
      };
    })
  };
}

export async function listUploads(platform?: Platform, accountId?: string) {
  const store = await readStore();
  return store.uploads
    .filter(upload => (!platform || upload.platform === platform) && (!accountId || upload.accountId === accountId))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

export async function createUpload(accountId: string, file: StoredFileInput) {
  return mutateStore(store => {
    const account = store.accounts.find(item => item.id === accountId);
    if (!account) throw new Error("Publishing account not found.");
    if (!account.enabled) throw new Error("This publishing account is disabled.");
    const timestamp = nowIso();
    const id = `upload_${nanoid(12)}`;
    const extension = path.extname(file.originalName).replace(".", "").toLowerCase() || "unknown";
    const upload: PlatformUpload = {
      id,
      platform: account.platform,
      accountId,
      originalName: file.originalName,
      fileName: file.fileName,
      mimeType: file.mimeType || "application/octet-stream",
      extension,
      size: file.size,
      url: file.url,
      title: file.title || file.caption,
      caption: file.caption,
      status: "queued",
      uploadedAt: timestamp,
      updatedAt: timestamp,
      scheduledAt: file.scheduledAt || undefined,
      scheduleId: file.scheduleId,
      folderSource: file.folderSource,
      automation: createAutomation(account.platform, accountId, id, file.url)
    };
    store.uploads.unshift(upload);
    return upload;
  });
}

export async function updateUploadStatus(uploadId: string, status: UploadStatus) {
  return mutateStore(store => {
    const index = store.uploads.findIndex(upload => upload.id === uploadId);
    if (index === -1) return null;
    const updated = { ...store.uploads[index], status, updatedAt: nowIso() };
    store.uploads[index] = updated;
    return updated;
  });
}

export async function deleteUpload(uploadId: string) {
  return mutateStore(store => {
    const existing = store.uploads.find(upload => upload.id === uploadId);
    if (!existing) return null;
    store.uploads = store.uploads.filter(upload => upload.id !== uploadId);
    return existing;
  });
}

export async function updateUploadDetails(uploadId: string, input: UpdateUploadDetailsInput) {
  const selectedScheduleId = input.scheduleId === null ? undefined : normalizeScheduleId(input.scheduleId);
  return mutateStore(store => {
    const index = store.uploads.findIndex(upload => upload.id === uploadId);
    if (index === -1) return null;
    const existing = store.uploads[index];
    if (existing.status === "processing" || existing.status === "posted") throw new Error(`Cannot edit a ${existing.status} post.`);
    let accountId = existing.accountId;
    if (input.accountId && input.accountId !== accountId) {
      if (existing.folderSource) throw new Error("Folder posts stay assigned to the account that owns their source folder.");
      const account = store.accounts.find(item => item.id === input.accountId);
      if (!account || account.platform !== existing.platform) throw new Error("Choose an account from the same platform.");
      if (!account.enabled) throw new Error("Choose an enabled publishing account.");
      accountId = account.id;
    }
    if (selectedScheduleId && !store.schedules.some(schedule => schedule.id === selectedScheduleId)) {
      throw new Error("Selected schedule was not found.");
    }
    const nextScheduledAt = input.scheduledAt === null || selectedScheduleId ? undefined : input.scheduledAt ?? existing.scheduledAt;
    const nextScheduleId = input.scheduledAt ? undefined : input.scheduleId === undefined ? existing.scheduleId : selectedScheduleId;
    const updated: PlatformUpload = {
      ...existing,
      accountId,
      title: input.title?.trim() || input.caption.trim(),
      caption: input.caption.trim(),
      scheduledAt: nextScheduledAt,
      scheduleId: nextScheduleId,
      status: "queued",
      updatedAt: nowIso(),
      automation: createAutomation(existing.platform, accountId, existing.id, existing.url)
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
  return store.folderConnections.find(connection => connection.id === connectionId) ?? null;
}

export async function upsertFolderConnection(accountId: string, folderPath: string) {
  return mutateStore(store => {
    const account = store.accounts.find(item => item.id === accountId);
    if (!account) throw new Error("Publishing account not found.");
    const timestamp = nowIso();
    const index = store.folderConnections.findIndex(connection => connection.accountId === accountId);
    if (index >= 0) {
      const updated: FolderConnection = { ...store.folderConnections[index], folderPath, updatedAt: timestamp, lastScannedAt: undefined, lastError: undefined };
      store.folderConnections[index] = updated;
      return updated;
    }
    const connection: FolderConnection = {
      id: `folder_${nanoid(12)}`,
      platform: account.platform,
      accountId,
      folderPath,
      createdAt: timestamp,
      updatedAt: timestamp
    };
    store.folderConnections.push(connection);
    return connection;
  });
}

export async function deleteFolderConnection(connectionId: string) {
  return mutateStore(store => {
    const existing = store.folderConnections.find(connection => connection.id === connectionId);
    if (!existing) return null;
    store.folderConnections = store.folderConnections.filter(connection => connection.id !== connectionId);
    return existing;
  });
}

export async function updateFolderConnectionScan(connectionId: string, lastError?: string) {
  return mutateStore(store => {
    const index = store.folderConnections.findIndex(connection => connection.id === connectionId);
    if (index === -1) return null;
    const timestamp = nowIso();
    const updated: FolderConnection = { ...store.folderConnections[index], updatedAt: timestamp, lastScannedAt: timestamp, lastError };
    store.folderConnections[index] = updated;
    return updated;
  });
}

export async function setFolderSourcePresent(uploadId: string, present: boolean) {
  return mutateStore(store => {
    const index = store.uploads.findIndex(upload => upload.id === uploadId);
    if (index === -1 || !store.uploads[index].folderSource) return null;
    const existing = store.uploads[index];
    const updated: PlatformUpload = { ...existing, folderSource: { ...existing.folderSource!, present }, updatedAt: nowIso() };
    store.uploads[index] = updated;
    return updated;
  });
}

export async function updateFolderUploadFile(uploadId: string, input: { originalName: string; mimeType: string; size: number; fingerprint: string }) {
  return mutateStore(store => {
    const index = store.uploads.findIndex(upload => upload.id === uploadId);
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
  const store = await readStore();
  const scheduledIds = dueScheduleIds(store);
  return store.uploads
    .filter(upload => isStoreUploadReadyForAutomation(store, upload, "scheduledOnly", Date.now(), scheduledIds))
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
}

export async function automationInput(platform?: Platform, mode: AutomationInputMode = "ready"): Promise<AutomationInput> {
  const store = await readStore();
  const scheduledIds = dueScheduleIds(store);
  const uploads = store.uploads
    .filter(upload => !platform || upload.platform === platform)
    .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime());
  const queued = uploads.filter(upload => isStoreUploadReadyForAutomation(store, upload, mode, Date.now(), scheduledIds));
  const channels = Object.fromEntries(platforms.map(channel => [
    channel,
    platform && platform !== channel ? [] : queued.filter(upload => upload.platform === channel)
  ])) as AutomationInput["channels"];
  return { generatedAt: nowIso(), officialPlatformApisRequired: false, intakeSource: "tinitiatebot_autopost", channels };
}
