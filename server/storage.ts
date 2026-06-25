import { promises as fs } from "node:fs";
import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { nanoid } from "nanoid";
import nodeCron from "node-cron";
import pg, { type PoolClient } from "pg";
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

const { Pool } = pg;

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
export type AutomationRunTrigger = "manual" | "scheduler";
export type AutomationRunStatus = "running" | "completed" | "failed";
export type AutomationPostStatus = "processing" | "posted" | "failed";

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const localSecretKeyFile = resolveFromRoot(process.env.LOCAL_ACCOUNT_KEY_FILE ?? "./data/account-secret.key");
const databaseUrl = process.env.SUPABASE_DATABASE_URL ?? process.env.DATABASE_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";
const db = new Pool({ connectionString: databaseUrl });
let storeMutationQueue: Promise<void> = Promise.resolve();
let secretKeyPromise: Promise<Buffer> | null = null;

function resolveFromRoot(candidate: string) {
  return path.isAbsolute(candidate) ? candidate : path.resolve(rootDir, candidate);
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

function isoString(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(String(value));
  return Number.isFinite(date.getTime()) ? date.toISOString() : undefined;
}

function dbTime(value: unknown) {
  if (!value) return "00:00";
  return String(value).slice(0, 5);
}

function dbDate(value: unknown) {
  if (!value) return undefined;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value).slice(0, 10);
}

function normalizeOptionalString(value: unknown) {
  if (value === null || value === undefined || value === "") return undefined;
  return String(value);
}

function normalizeFileName(row: any) {
  const blobPath = normalizeOptionalString(row.azure_blob_path);
  if (blobPath) return blobPath;
  const blobUrl = normalizeOptionalString(row.azure_blob_url);
  if (blobUrl) return path.basename(blobUrl);
  return normalizeOptionalString(row.original_file_name) ?? row.id;
}

function asPlatform(value: unknown): Platform {
  return value as Platform;
}

function asUploadStatus(value: unknown): UploadStatus {
  return value as UploadStatus;
}

function accountFromRow(row: any): PlatformAccount {
  return {
    id: row.id,
    platform: asPlatform(row.platform_name),
    displayName: row.account_name,
    handle: row.account_handle,
    loginIdentifier: row.login_username,
    loginConfirmation: normalizeOptionalString(row.login_note),
    credentialConfigured: Boolean(row.has_saved_password),
    enabled: Boolean(row.is_enabled),
    createdAt: isoString(row.created_at) ?? nowIso(),
    updatedAt: isoString(row.updated_at) ?? nowIso()
  };
}

function scheduleFromRow(row: any): PublishingSchedule {
  return {
    id: Number(row.id),
    name: row.schedule_name,
    time: dbTime(row.publish_time),
    frequency: row.repeat_type,
    endDate: dbDate(row.end_date),
    status: row.is_active ? "active" : "inactive",
    customCronExpression: normalizeOptionalString(row.custom_cron),
    lastRunAt: isoString(row.last_used_at),
    createdAt: isoString(row.created_at) ?? nowIso(),
    updatedAt: isoString(row.updated_at) ?? nowIso()
  };
}

function folderConnectionFromRow(row: any): FolderConnection {
  return {
    id: row.id,
    platform: asPlatform(row.platform_name),
    accountId: row.publishing_account_id,
    folderPath: row.folder_path,
    createdAt: isoString(row.created_at) ?? nowIso(),
    updatedAt: isoString(row.updated_at) ?? nowIso(),
    lastScannedAt: isoString(row.last_scanned_at),
    lastError: normalizeOptionalString(row.last_scan_error)
  };
}

function uploadFromRow(row: any): PlatformUpload {
  const platform = asPlatform(row.platform_name);
  const accountId = row.publishing_account_id;
  const fileName = normalizeFileName(row);
  const url = normalizeOptionalString(row.azure_blob_url) ?? `/uploads/${fileName}`;
  const folderSource = row.folder_connection_id
    ? {
        connectionId: row.folder_connection_id,
        relativePath: row.folder_relative_path,
        fingerprint: row.folder_file_fingerprint,
        present: Boolean(row.folder_file_still_exists)
      }
    : undefined;

  return {
    id: row.id,
    platform,
    accountId,
    originalName: normalizeOptionalString(row.original_file_name) ?? fileName,
    fileName,
    mimeType: normalizeOptionalString(row.mime_type) ?? "application/octet-stream",
    extension: normalizeOptionalString(row.file_extension) ?? (path.extname(fileName).replace(".", "").toLowerCase() || "unknown"),
    size: Number(row.file_size_bytes ?? 0),
    url,
    title: normalizeOptionalString(row.post_title),
    caption: row.post_caption,
    status: asUploadStatus(row.post_status),
    uploadedAt: isoString(row.created_at) ?? nowIso(),
    updatedAt: isoString(row.updated_at) ?? nowIso(),
    scheduledAt: isoString(row.scheduled_publish_at),
    scheduleId: row.schedule_template_id === null || row.schedule_template_id === undefined ? undefined : Number(row.schedule_template_id),
    folderSource,
    automation: createAutomation(platform, accountId, row.id, url)
  };
}

async function readStore(): Promise<Store> {
  const [
    accountRows,
    secretRows,
    scheduleRows,
    folderRows,
    uploadRows
  ] = await Promise.all([
    db.query("select * from publishing_accounts order by platform_name, account_name"),
    db.query("select * from publishing_account_secrets"),
    db.query("select * from schedule_templates order by id"),
    db.query("select * from connected_folders order by platform_name, folder_path"),
    db.query(`
      select
        posts.*,
        folder_post_sources.connected_folder_id as folder_connection_id,
        folder_post_sources.relative_file_path as folder_relative_path,
        folder_post_sources.file_fingerprint as folder_file_fingerprint,
        folder_post_sources.file_still_exists as folder_file_still_exists
      from posts
      left join folder_post_sources on folder_post_sources.post_id = posts.id
      order by posts.created_at desc
    `)
  ]);

  const accountSecrets: Record<string, AccountSecret> = {};
  for (const row of secretRows.rows) {
    accountSecrets[row.publishing_account_id] = { encryptedPassword: row.encrypted_password };
  }

  return {
    version: 3,
    accounts: accountRows.rows.map(accountFromRow),
    accountSecrets,
    schedules: scheduleRows.rows.map(scheduleFromRow),
    socialMediaSchedules: [],
    uploads: uploadRows.rows.map(uploadFromRow),
    folderConnections: folderRows.rows.map(folderConnectionFromRow)
  };
}

async function deleteRowsMissing(client: PoolClient, tableName: string, idColumn: string, ids: Array<string | number>, idType: "text" | "bigint") {
  if (ids.length === 0) {
    await client.query(`delete from ${tableName}`);
    return;
  }

  await client.query(`delete from ${tableName} where not (${idColumn} = any($1::${idType}[]))`, [ids]);
}

async function upsertAccount(client: PoolClient, account: PlatformAccount) {
  await client.query(`
    insert into publishing_accounts (
      id,
      platform_name,
      account_name,
      account_handle,
      login_username,
      login_note,
      has_saved_password,
      is_enabled,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
    on conflict (id) do update set
      platform_name = excluded.platform_name,
      account_name = excluded.account_name,
      account_handle = excluded.account_handle,
      login_username = excluded.login_username,
      login_note = excluded.login_note,
      has_saved_password = excluded.has_saved_password,
      is_enabled = excluded.is_enabled,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
    where (
      publishing_accounts.platform_name,
      publishing_accounts.account_name,
      publishing_accounts.account_handle,
      publishing_accounts.login_username,
      publishing_accounts.login_note,
      publishing_accounts.has_saved_password,
      publishing_accounts.is_enabled,
      publishing_accounts.created_at,
      publishing_accounts.updated_at
    ) is distinct from (
      excluded.platform_name,
      excluded.account_name,
      excluded.account_handle,
      excluded.login_username,
      excluded.login_note,
      excluded.has_saved_password,
      excluded.is_enabled,
      excluded.created_at,
      excluded.updated_at
    )
  `, [
    account.id,
    account.platform,
    account.displayName,
    account.handle,
    account.loginIdentifier,
    account.loginConfirmation ?? null,
    account.credentialConfigured,
    account.enabled,
    account.createdAt,
    account.updatedAt
  ]);
}

async function upsertAccountSecret(client: PoolClient, accountId: string, secret: AccountSecret) {
  if (!secret.encryptedPassword) return;

  await client.query(`
    insert into publishing_account_secrets (
      publishing_account_id,
      encrypted_password,
      encryption_method
    )
    values ($1, $2, 'aes-256-gcm')
    on conflict (publishing_account_id) do update set
      encrypted_password = excluded.encrypted_password,
      encryption_method = excluded.encryption_method
    where (
      publishing_account_secrets.encrypted_password,
      publishing_account_secrets.encryption_method
    ) is distinct from (
      excluded.encrypted_password,
      excluded.encryption_method
    )
  `, [accountId, secret.encryptedPassword]);
}

async function upsertSchedule(client: PoolClient, schedule: PublishingSchedule) {
  await client.query(`
    insert into schedule_templates (
      id,
      schedule_name,
      publish_time,
      timezone,
      repeat_type,
      end_date,
      custom_cron,
      is_active,
      last_used_at,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
    on conflict (id) do update set
      schedule_name = excluded.schedule_name,
      publish_time = excluded.publish_time,
      timezone = excluded.timezone,
      repeat_type = excluded.repeat_type,
      end_date = excluded.end_date,
      custom_cron = excluded.custom_cron,
      is_active = excluded.is_active,
      last_used_at = excluded.last_used_at,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
    where (
      schedule_templates.schedule_name,
      schedule_templates.publish_time,
      schedule_templates.timezone,
      schedule_templates.repeat_type,
      schedule_templates.end_date,
      schedule_templates.custom_cron,
      schedule_templates.is_active,
      schedule_templates.last_used_at,
      schedule_templates.created_at,
      schedule_templates.updated_at
    ) is distinct from (
      excluded.schedule_name,
      excluded.publish_time,
      excluded.timezone,
      excluded.repeat_type,
      excluded.end_date,
      excluded.custom_cron,
      excluded.is_active,
      excluded.last_used_at,
      excluded.created_at,
      excluded.updated_at
    )
  `, [
    schedule.id,
    schedule.name,
    schedule.time,
    process.env.SCHEDULER_TIMEZONE?.trim() || "Asia/Kolkata",
    schedule.frequency,
    schedule.endDate ?? null,
    schedule.customCronExpression ?? null,
    schedule.status === "active",
    schedule.lastRunAt ?? null,
    schedule.createdAt,
    schedule.updatedAt
  ]);
}

async function upsertFolderConnectionRow(client: PoolClient, connection: FolderConnection) {
  await client.query(`
    insert into connected_folders (
      id,
      publishing_account_id,
      platform_name,
      folder_path,
      last_scanned_at,
      last_scan_error,
      is_active,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, true, $7, $8)
    on conflict (id) do update set
      publishing_account_id = excluded.publishing_account_id,
      platform_name = excluded.platform_name,
      folder_path = excluded.folder_path,
      last_scanned_at = excluded.last_scanned_at,
      last_scan_error = excluded.last_scan_error,
      is_active = excluded.is_active,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
    where (
      connected_folders.publishing_account_id,
      connected_folders.platform_name,
      connected_folders.folder_path,
      connected_folders.last_scanned_at,
      connected_folders.last_scan_error,
      connected_folders.is_active,
      connected_folders.created_at,
      connected_folders.updated_at
    ) is distinct from (
      excluded.publishing_account_id,
      excluded.platform_name,
      excluded.folder_path,
      excluded.last_scanned_at,
      excluded.last_scan_error,
      excluded.is_active,
      excluded.created_at,
      excluded.updated_at
    )
  `, [
    connection.id,
    connection.accountId,
    connection.platform,
    connection.folderPath,
    connection.lastScannedAt ?? null,
    connection.lastError ?? null,
    connection.createdAt,
    connection.updatedAt
  ]);
}

async function upsertUpload(client: PoolClient, upload: PlatformUpload) {
  await client.query(`
    insert into posts (
      id,
      publishing_account_id,
      platform_name,
      post_title,
      post_caption,
      post_status,
      azure_blob_path,
      azure_blob_url,
      original_file_name,
      media_file_type,
      mime_type,
      file_extension,
      file_size_bytes,
      scheduled_publish_at,
      schedule_template_id,
      published_at,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
    on conflict (id) do update set
      publishing_account_id = excluded.publishing_account_id,
      platform_name = excluded.platform_name,
      post_title = excluded.post_title,
      post_caption = excluded.post_caption,
      post_status = excluded.post_status,
      azure_blob_path = excluded.azure_blob_path,
      azure_blob_url = excluded.azure_blob_url,
      original_file_name = excluded.original_file_name,
      media_file_type = excluded.media_file_type,
      mime_type = excluded.mime_type,
      file_extension = excluded.file_extension,
      file_size_bytes = excluded.file_size_bytes,
      scheduled_publish_at = excluded.scheduled_publish_at,
      schedule_template_id = excluded.schedule_template_id,
      published_at = case
        when excluded.post_status = 'posted' then coalesce(posts.published_at, excluded.published_at, now())
        else null
      end,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
    where (
      posts.publishing_account_id,
      posts.platform_name,
      posts.post_title,
      posts.post_caption,
      posts.post_status,
      posts.azure_blob_path,
      posts.azure_blob_url,
      posts.original_file_name,
      posts.media_file_type,
      posts.mime_type,
      posts.file_extension,
      posts.file_size_bytes,
      posts.scheduled_publish_at,
      posts.schedule_template_id,
      posts.published_at,
      posts.created_at,
      posts.updated_at
    ) is distinct from (
      excluded.publishing_account_id,
      excluded.platform_name,
      excluded.post_title,
      excluded.post_caption,
      excluded.post_status,
      excluded.azure_blob_path,
      excluded.azure_blob_url,
      excluded.original_file_name,
      excluded.media_file_type,
      excluded.mime_type,
      excluded.file_extension,
      excluded.file_size_bytes,
      excluded.scheduled_publish_at,
      excluded.schedule_template_id,
      excluded.published_at,
      excluded.created_at,
      excluded.updated_at
    )
  `, [
    upload.id,
    upload.accountId,
    upload.platform,
    upload.title ?? null,
    upload.caption,
    upload.status,
    upload.fileName,
    upload.url,
    upload.originalName,
    upload.mimeType.startsWith("image/") ? "image" : upload.mimeType.startsWith("video/") ? "video" : "other",
    upload.mimeType,
    upload.extension,
    upload.size,
    upload.scheduledAt ?? null,
    upload.scheduleId ?? null,
    upload.status === "posted" ? upload.updatedAt : null,
    upload.uploadedAt,
    upload.updatedAt
  ]);
}

async function upsertFolderSource(client: PoolClient, upload: PlatformUpload) {
  if (!upload.folderSource) return;

  await client.query(`
    insert into folder_post_sources (
      post_id,
      connected_folder_id,
      relative_file_path,
      file_fingerprint,
      file_still_exists,
      created_at,
      updated_at
    )
    values ($1, $2, $3, $4, $5, $6, $7)
    on conflict (post_id) do update set
      connected_folder_id = excluded.connected_folder_id,
      relative_file_path = excluded.relative_file_path,
      file_fingerprint = excluded.file_fingerprint,
      file_still_exists = excluded.file_still_exists,
      created_at = excluded.created_at,
      updated_at = excluded.updated_at
    where (
      folder_post_sources.connected_folder_id,
      folder_post_sources.relative_file_path,
      folder_post_sources.file_fingerprint,
      folder_post_sources.file_still_exists,
      folder_post_sources.created_at,
      folder_post_sources.updated_at
    ) is distinct from (
      excluded.connected_folder_id,
      excluded.relative_file_path,
      excluded.file_fingerprint,
      excluded.file_still_exists,
      excluded.created_at,
      excluded.updated_at
    )
  `, [
    upload.id,
    upload.folderSource.connectionId,
    upload.folderSource.relativePath,
    upload.folderSource.fingerprint,
    upload.folderSource.present,
    upload.uploadedAt,
    upload.updatedAt
  ]);
}

async function writeStore(store: Store) {
  const client = await db.connect();
  try {
    await client.query("begin");

    const accountIds = store.accounts.map(account => account.id);
    const secretAccountIds = Object.entries(store.accountSecrets)
      .filter(([, secret]) => secret.encryptedPassword)
      .map(([accountId]) => accountId);
    const scheduleIds = store.schedules.map(schedule => schedule.id);
    const uploadIds = store.uploads.map(upload => upload.id);
    const folderConnectionIds = store.folderConnections.map(connection => connection.id);
    const activeFolderConnectionIds = new Set(folderConnectionIds);
    const folderSourceUploadIds = store.uploads
      .filter(upload => upload.folderSource && activeFolderConnectionIds.has(upload.folderSource.connectionId))
      .map(upload => upload.id);

    await deleteRowsMissing(client, "folder_post_sources", "post_id", folderSourceUploadIds, "text");
    await deleteRowsMissing(client, "posts", "id", uploadIds, "text");
    await deleteRowsMissing(client, "connected_folders", "id", folderConnectionIds, "text");
    await deleteRowsMissing(client, "publishing_account_secrets", "publishing_account_id", secretAccountIds, "text");
    await deleteRowsMissing(client, "schedule_templates", "id", scheduleIds, "bigint");
    await deleteRowsMissing(client, "publishing_accounts", "id", accountIds, "text");

    for (const account of store.accounts) await upsertAccount(client, account);
    for (const [accountId, secret] of Object.entries(store.accountSecrets)) await upsertAccountSecret(client, accountId, secret);
    for (const schedule of store.schedules) await upsertSchedule(client, schedule);
    for (const connection of store.folderConnections) await upsertFolderConnectionRow(client, connection);
    for (const upload of store.uploads) await upsertUpload(client, upload);
    for (const upload of store.uploads) {
      if (upload.folderSource && activeFolderConnectionIds.has(upload.folderSource.connectionId)) {
        await upsertFolderSource(client, upload);
      }
    }

    if (store.schedules.length > 0) {
      await client.query(`
        select setval(
          pg_get_serial_sequence('schedule_templates', 'id'),
          greatest(coalesce((select max(id) from schedule_templates), 1), 1),
          true
        )
      `);
    }

    await client.query("commit");
  } catch (error) {
    await client.query("rollback").catch(() => undefined);
    throw error;
  } finally {
    client.release();
  }
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

async function insertPostStatusHistory(
  postId: string,
  oldStatus: UploadStatus | null,
  newStatus: UploadStatus,
  changeReason: string,
  changedAt = nowIso(),
) {
  await db.query(`
    insert into post_status_history (
      post_id,
      old_status,
      new_status,
      change_reason,
      changed_at
    )
    values ($1, $2, $3, $4, $5)
  `, [postId, oldStatus, newStatus, changeReason, changedAt]);
}

export async function createAutomationRun(trigger: AutomationRunTrigger) {
  const result = await db.query<{ id: string }>(`
    insert into automation_runs (
      run_trigger,
      run_status,
      started_at,
      created_at
    )
    values ($1, 'running', now(), now())
    returning id
  `, [trigger]);

  return result.rows[0].id;
}

export async function finishAutomationRun(
  automationRunId: string,
  status: Exclude<AutomationRunStatus, "running">,
  errorMessage?: string,
) {
  await db.query(`
    update automation_runs
    set
      run_status = $2,
      finished_at = now(),
      error_message = $3
    where id = $1
  `, [automationRunId, status, errorMessage ?? null]);
}

export async function createAutomationRunPost(automationRunId: string, upload: PlatformUpload) {
  const result = await db.query<{ id: string }>(`
    insert into automation_run_posts (
      automation_run_id,
      post_id,
      publishing_account_id,
      platform_name,
      publish_status,
      started_at,
      created_at
    )
    values ($1, $2, $3, $4, 'processing', now(), now())
    returning id
  `, [
    automationRunId,
    upload.id,
    upload.accountId,
    upload.platform,
  ]);

  return result.rows[0].id;
}

export async function finishAutomationRunPost(
  automationRunPostId: string,
  status: AutomationPostStatus,
  failureMessage?: string,
) {
  await db.query(`
    update automation_run_posts
    set
      publish_status = $2,
      finished_at = now(),
      failure_message = $3
    where id = $1
  `, [automationRunPostId, status, failureMessage ?? null]);
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
  const upload = await mutateStore(store => {
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

  await insertPostStatusHistory(upload.id, null, "queued", "Post created", upload.uploadedAt);
  return upload;
}

export async function updateUploadStatus(uploadId: string, status: UploadStatus, changeReason = "Post status updated") {
  let oldStatus: UploadStatus | null = null;
  let statusChanged = false;
  const changedAt = nowIso();

  const updated = await mutateStore(store => {
    const index = store.uploads.findIndex(upload => upload.id === uploadId);
    if (index === -1) return null;
    oldStatus = store.uploads[index].status;
    statusChanged = oldStatus !== status;
    const updated = { ...store.uploads[index], status, updatedAt: changedAt };
    store.uploads[index] = updated;
    return updated;
  });

  if (updated && statusChanged) {
    await insertPostStatusHistory(uploadId, oldStatus, status, changeReason, changedAt);
  }

  return updated;
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
  let oldStatus: UploadStatus | null = null;
  let statusChanged = false;
  const changedAt = nowIso();

  const updatedUpload = await mutateStore(store => {
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
    oldStatus = existing.status;
    statusChanged = oldStatus !== "queued";
    const updated: PlatformUpload = {
      ...existing,
      accountId,
      title: input.title?.trim() || input.caption.trim(),
      caption: input.caption.trim(),
      scheduledAt: nextScheduledAt,
      scheduleId: nextScheduleId,
      status: "queued",
      updatedAt: changedAt,
      automation: createAutomation(existing.platform, accountId, existing.id, existing.url)
    };
    store.uploads[index] = updated;
    return updated;
  });

  if (updatedUpload && statusChanged) {
    await insertPostStatusHistory(uploadId, oldStatus, "queued", "Post details updated and requeued", changedAt);
  }

  return updatedUpload;
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
