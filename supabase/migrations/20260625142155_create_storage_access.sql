create type app_storage_source_type as enum (
  'local_drive',
  'google_drive'
);

create type app_storage_connection_status as enum (
  'connected',
  'syncing',
  'pending_auth',
  'error',
  'disabled'
);

create table storage_connections (
  id text primary key,
  storage_type app_storage_source_type not null,
  display_name text not null,
  publishing_account_id text not null references publishing_accounts(id) on delete cascade,
  platform_name app_platform_name not null,
  connected_by_user_profile_id uuid references user_profiles(id) on delete set null,
  local_folder_path text,
  google_drive_folder_id text,
  google_drive_folder_url text,
  google_drive_folder_name text,
  legacy_connected_folder_id text references connected_folders(id) on delete set null,
  connection_status app_storage_connection_status not null default 'connected',
  is_active boolean not null default true,
  last_synced_at timestamptz,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint storage_connections_local_drive_requires_path check (
    storage_type <> 'local_drive' or local_folder_path is not null
  ),
  constraint storage_connections_google_drive_requires_folder check (
    storage_type <> 'google_drive' or google_drive_folder_id is not null or google_drive_folder_url is not null
  )
);

comment on table storage_connections is 'External storage sources that can feed media into the autopost workflow.';
comment on column storage_connections.id is 'Unique storage connection id.';
comment on column storage_connections.storage_type is 'Storage source type, such as local drive or Google Drive.';
comment on column storage_connections.display_name is 'Readable name shown in the Storage Access module.';
comment on column storage_connections.publishing_account_id is 'Publishing account that receives posts from this storage source.';
comment on column storage_connections.platform_name is 'Social platform connected through the publishing account.';
comment on column storage_connections.connected_by_user_profile_id is 'User who created this storage connection.';
comment on column storage_connections.local_folder_path is 'Absolute local folder path for local drive sources.';
comment on column storage_connections.google_drive_folder_id is 'Google Drive folder id for Google Drive sources.';
comment on column storage_connections.google_drive_folder_url is 'Google Drive folder URL for Google Drive sources.';
comment on column storage_connections.google_drive_folder_name is 'Readable Google Drive folder name, when known.';
comment on column storage_connections.legacy_connected_folder_id is 'Existing local folder sync record used by the Local Drive engine.';
comment on column storage_connections.connection_status is 'Current storage connection state.';
comment on column storage_connections.is_active is 'Whether this storage source can be used for imports or sync.';
comment on column storage_connections.last_synced_at is 'Last successful sync time for this storage source.';
comment on column storage_connections.last_error is 'Most recent storage sync or connection error.';
comment on column storage_connections.created_at is 'Date and time when this storage connection was created.';
comment on column storage_connections.updated_at is 'Date and time when this storage connection was last updated.';

create unique index storage_connections_legacy_connected_folder_id_key
on storage_connections(legacy_connected_folder_id)
where legacy_connected_folder_id is not null;

create index storage_connections_account_idx on storage_connections(publishing_account_id);
create index storage_connections_type_status_idx on storage_connections(storage_type, connection_status);
create index storage_connections_platform_idx on storage_connections(platform_name);

insert into storage_connections (
  id,
  storage_type,
  display_name,
  publishing_account_id,
  platform_name,
  local_folder_path,
  legacy_connected_folder_id,
  connection_status,
  is_active,
  last_synced_at,
  last_error,
  created_at,
  updated_at
)
select
  'storage_' || substr(md5(id), 1, 12),
  'local_drive'::app_storage_source_type,
  initcap(replace(platform_name::text, '_', ' ')) || ' local drive',
  publishing_account_id,
  platform_name,
  folder_path,
  id,
  case
    when last_scan_error is null then 'connected'::app_storage_connection_status
    else 'error'::app_storage_connection_status
  end,
  is_active,
  last_scanned_at,
  last_scan_error,
  created_at,
  updated_at
from connected_folders
on conflict do nothing;

create trigger set_storage_connections_updated_at
before update on storage_connections
for each row execute function set_updated_at();
