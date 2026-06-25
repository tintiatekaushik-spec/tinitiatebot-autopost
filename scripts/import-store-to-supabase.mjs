import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, "..");
const storePath = path.join(rootDir, "data", "store.json");
const dockerContainer = process.env.SUPABASE_DB_CONTAINER || "supabase_db_tinitiatebot_autopost";

const platforms = new Set(["youtube", "instagram", "facebook", "linkedin", "x"]);
const postStatuses = new Set(["queued", "processing", "posted", "failed"]);
const scheduleRepeatTypes = new Set(["daily", "weekly", "biweekly", "monthly", "yearly", "custom", "onetime"]);

function sql(value) {
  if (value === undefined || value === null || value === "") return "null";
  if (typeof value === "boolean") return value ? "true" : "false";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "null";
  return `'${String(value).replace(/'/g, "''")}'`;
}

function enumSql(value, typeName) {
  return `${sql(value)}::${typeName}`;
}

function timestamptzSql(value) {
  return value ? `${sql(value)}::timestamptz` : "null";
}

function timeSql(value) {
  return value ? `${sql(value)}::time` : "null";
}

function dateSql(value) {
  return value ? `${sql(value)}::date` : "null";
}

function requirePlatform(value, context) {
  if (!platforms.has(value)) throw new Error(`${context} has invalid platform: ${value}`);
  return value;
}

function requirePostStatus(value, context) {
  if (!postStatuses.has(value)) throw new Error(`${context} has invalid post status: ${value}`);
  return value;
}

function requireScheduleRepeatType(value, context) {
  if (!scheduleRepeatTypes.has(value)) throw new Error(`${context} has invalid schedule repeat type: ${value}`);
  return value;
}

function mediaFileType(mimeType) {
  if (mimeType?.startsWith("image/")) return "image";
  if (mimeType?.startsWith("video/")) return "video";
  return "other";
}

function valuesList(rows) {
  return rows.length ? rows.join(",\n") : "";
}

function buildImportSql(store) {
  const statements = [
    "begin;",
    "set constraints all immediate;",
  ];

  const accounts = Array.isArray(store.accounts) ? store.accounts : [];
  const accountSecrets = store.accountSecrets && typeof store.accountSecrets === "object" ? store.accountSecrets : {};
  const schedules = Array.isArray(store.schedules) ? store.schedules : [];
  const folderConnections = Array.isArray(store.folderConnections) ? store.folderConnections : [];
  const uploads = Array.isArray(store.uploads) ? store.uploads : [];
  const accountIds = new Set(accounts.map((account) => account.id));
  const scheduleIds = new Set(schedules.map((schedule) => Number(schedule.id)));
  const folderIds = new Set(folderConnections.map((connection) => connection.id));

  if (accounts.length) {
    const rows = accounts.map((account) => {
      requirePlatform(account.platform, `account ${account.id}`);
      const hasSavedPassword = Boolean(
        account.credentialConfigured ||
        accountSecrets[account.id]?.encryptedPassword ||
        accountSecrets[account.id]?.password,
      );

      return `(${[
        sql(account.id),
        enumSql(account.platform, "app_platform_name"),
        sql(account.displayName),
        sql(account.handle),
        sql(account.loginIdentifier),
        sql(account.loginConfirmation),
        sql(hasSavedPassword),
        sql(account.enabled ?? true),
        timestamptzSql(account.createdAt),
        timestamptzSql(account.updatedAt),
      ].join(", ")})`;
    });

    statements.push(`
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
) values
${valuesList(rows)}
on conflict (id) do update set
  platform_name = excluded.platform_name,
  account_name = excluded.account_name,
  account_handle = excluded.account_handle,
  login_username = excluded.login_username,
  login_note = excluded.login_note,
  has_saved_password = excluded.has_saved_password,
  is_enabled = excluded.is_enabled,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
`);
  }

  const secretRows = Object.entries(accountSecrets)
    .filter(([accountId, secret]) => accountIds.has(accountId) && secret?.encryptedPassword)
    .map(([accountId, secret]) => `(${[
      sql(accountId),
      sql(secret.encryptedPassword),
      sql("aes-256-gcm"),
    ].join(", ")})`);

  if (secretRows.length) {
    statements.push(`
insert into publishing_account_secrets (
  publishing_account_id,
  encrypted_password,
  encryption_method
) values
${valuesList(secretRows)}
on conflict (publishing_account_id) do update set
  encrypted_password = excluded.encrypted_password,
  encryption_method = excluded.encryption_method,
  updated_at = now();
`);
  }

  if (schedules.length) {
    const rows = schedules.map((schedule) => {
      const repeatType = requireScheduleRepeatType(schedule.frequency, `schedule ${schedule.id}`);
      return `(${[
        sql(Number(schedule.id)),
        sql(schedule.name),
        timeSql(schedule.time),
        sql(process.env.DEFAULT_SCHEDULE_TIMEZONE || "Asia/Kolkata"),
        enumSql(repeatType, "app_schedule_repeat_type"),
        dateSql(schedule.endDate),
        sql(schedule.customCronExpression),
        sql((schedule.status ?? "active") === "active"),
        timestamptzSql(schedule.lastRunAt),
        timestamptzSql(schedule.createdAt),
        timestamptzSql(schedule.updatedAt),
      ].join(", ")})`;
    });

    statements.push(`
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
) values
${valuesList(rows)}
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
  updated_at = excluded.updated_at;

select setval(
  pg_get_serial_sequence('schedule_templates', 'id'),
  greatest(coalesce((select max(id) from schedule_templates), 1), 1),
  true
);
`);
  }

  if (folderConnections.length) {
    const rows = folderConnections.map((connection) => {
      requirePlatform(connection.platform, `folder connection ${connection.id}`);
      if (!accountIds.has(connection.accountId)) {
        throw new Error(`Folder connection ${connection.id} references missing account ${connection.accountId}`);
      }

      return `(${[
        sql(connection.id),
        sql(connection.accountId),
        enumSql(connection.platform, "app_platform_name"),
        sql(connection.folderPath),
        timestamptzSql(connection.lastScannedAt),
        sql(connection.lastError),
        sql(true),
        timestamptzSql(connection.createdAt),
        timestamptzSql(connection.updatedAt),
      ].join(", ")})`;
    });

    statements.push(`
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
) values
${valuesList(rows)}
on conflict (id) do update set
  publishing_account_id = excluded.publishing_account_id,
  platform_name = excluded.platform_name,
  folder_path = excluded.folder_path,
  last_scanned_at = excluded.last_scanned_at,
  last_scan_error = excluded.last_scan_error,
  is_active = excluded.is_active,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
`);
  }

  if (uploads.length) {
    const rows = uploads.map((upload) => {
      requirePlatform(upload.platform, `upload ${upload.id}`);
      requirePostStatus(upload.status, `upload ${upload.id}`);
      if (!accountIds.has(upload.accountId)) {
        throw new Error(`Upload ${upload.id} references missing account ${upload.accountId}`);
      }

      const scheduleId = upload.scheduleId && scheduleIds.has(Number(upload.scheduleId))
        ? Number(upload.scheduleId)
        : null;

      return `(${[
        sql(upload.id),
        sql(upload.accountId),
        enumSql(upload.platform, "app_platform_name"),
        sql(upload.title),
        sql(upload.caption),
        enumSql(upload.status, "app_post_status"),
        sql(null),
        sql(upload.fileName),
        sql(upload.url),
        sql(upload.originalName),
        enumSql(mediaFileType(upload.mimeType), "app_media_file_type"),
        sql(upload.mimeType),
        sql(upload.extension),
        sql(upload.size),
        timestamptzSql(upload.scheduledAt),
        sql(scheduleId),
        upload.status === "posted" ? timestamptzSql(upload.updatedAt) : "null",
        sql(upload.publishedUrl),
        sql(upload.failureReason),
        timestamptzSql(upload.uploadedAt),
        timestamptzSql(upload.updatedAt),
      ].join(", ")})`;
    });

    statements.push(`
insert into posts (
  id,
  publishing_account_id,
  platform_name,
  post_title,
  post_caption,
  post_status,
  azure_container_name,
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
  published_url,
  failure_message,
  created_at,
  updated_at
) values
${valuesList(rows)}
on conflict (id) do update set
  publishing_account_id = excluded.publishing_account_id,
  platform_name = excluded.platform_name,
  post_title = excluded.post_title,
  post_caption = excluded.post_caption,
  post_status = excluded.post_status,
  azure_container_name = excluded.azure_container_name,
  azure_blob_path = excluded.azure_blob_path,
  azure_blob_url = excluded.azure_blob_url,
  original_file_name = excluded.original_file_name,
  media_file_type = excluded.media_file_type,
  mime_type = excluded.mime_type,
  file_extension = excluded.file_extension,
  file_size_bytes = excluded.file_size_bytes,
  scheduled_publish_at = excluded.scheduled_publish_at,
  schedule_template_id = excluded.schedule_template_id,
  published_at = excluded.published_at,
  published_url = excluded.published_url,
  failure_message = excluded.failure_message,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
`);
  }

  const folderSourceRows = uploads
    .filter((upload) => upload.folderSource)
    .map((upload) => {
      const source = upload.folderSource;
      if (!folderIds.has(source.connectionId)) {
        throw new Error(`Upload ${upload.id} references missing folder connection ${source.connectionId}`);
      }

      return `(${[
        sql(upload.id),
        sql(source.connectionId),
        sql(source.relativePath),
        sql(source.fingerprint),
        sql(source.present ?? true),
        timestamptzSql(upload.uploadedAt),
        timestamptzSql(upload.updatedAt),
      ].join(", ")})`;
    });

  if (folderSourceRows.length) {
    statements.push(`
insert into folder_post_sources (
  post_id,
  connected_folder_id,
  relative_file_path,
  file_fingerprint,
  file_still_exists,
  created_at,
  updated_at
) values
${valuesList(folderSourceRows)}
on conflict (post_id) do update set
  connected_folder_id = excluded.connected_folder_id,
  relative_file_path = excluded.relative_file_path,
  file_fingerprint = excluded.file_fingerprint,
  file_still_exists = excluded.file_still_exists,
  created_at = excluded.created_at,
  updated_at = excluded.updated_at;
`);
  }

  if (uploads.length) {
    statements.push(`
insert into post_status_history (
  post_id,
  old_status,
  new_status,
  change_reason,
  changed_at
)
select
  posts.id,
  null,
  posts.post_status,
  'Imported from data/store.json',
  posts.updated_at
from posts
where not exists (
  select 1
  from post_status_history existing
  where existing.post_id = posts.id
    and existing.change_reason = 'Imported from data/store.json'
);
`);
  }

  statements.push("commit;");
  return `${statements.join("\n")}\n`;
}

const store = JSON.parse(readFileSync(storePath, "utf8"));
const importSql = buildImportSql(store);

const result = spawnSync(
  "docker",
  ["exec", "-i", dockerContainer, "psql", "-U", "postgres", "-d", "postgres", "-v", "ON_ERROR_STOP=1"],
  {
    input: importSql,
    encoding: "utf8",
    maxBuffer: 1024 * 1024 * 10,
  },
);

if (result.stdout) process.stdout.write(result.stdout);
if (result.stderr) process.stderr.write(result.stderr);
if (result.status !== 0) process.exit(result.status ?? 1);

const summary = spawnSync(
  "docker",
  [
    "exec",
    dockerContainer,
    "psql",
    "-U",
    "postgres",
    "-d",
    "postgres",
    "-Atc",
    [
      "select 'publishing_accounts', count(*) from publishing_accounts",
      "union all select 'publishing_account_secrets', count(*) from publishing_account_secrets",
      "union all select 'schedule_templates', count(*) from schedule_templates",
      "union all select 'posts', count(*) from posts",
      "union all select 'connected_folders', count(*) from connected_folders",
      "union all select 'folder_post_sources', count(*) from folder_post_sources",
      "union all select 'post_status_history', count(*) from post_status_history",
      "order by 1;",
    ].join(" "),
  ],
  { encoding: "utf8" },
);

if (summary.stdout) process.stdout.write(summary.stdout);
if (summary.stderr) process.stderr.write(summary.stderr);
if (summary.status !== 0) process.exit(summary.status ?? 1);
