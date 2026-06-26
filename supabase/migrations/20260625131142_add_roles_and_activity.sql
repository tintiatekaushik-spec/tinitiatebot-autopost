alter type app_user_role rename to app_user_role_old;

create type app_user_role as enum (
  'operations_manager',
  'post_uploader',
  'scheduler',
  'viewer'
);

alter table user_profiles
  alter column role type app_user_role
  using (
    case role::text
      when 'manager' then 'operations_manager'
      when 'customer' then 'viewer'
      else 'viewer'
    end
  )::app_user_role;

drop type app_user_role_old;

alter table user_profiles
  add column username text,
  add column password_hash text,
  add column last_login_at timestamptz;

update user_profiles
set username = lower(regexp_replace(coalesce(nullif(email, ''), full_name), '[^a-zA-Z0-9]+', '.', 'g'))
where username is null;

alter table user_profiles
  alter column username set not null;

create unique index user_profiles_username_key on user_profiles(lower(username));

comment on column user_profiles.username is 'Unique login username for this app.';
comment on column user_profiles.password_hash is 'PBKDF2 password hash for local app authentication.';
comment on column user_profiles.last_login_at is 'Date and time when this user last signed in.';

alter table posts
  add column created_by_user_profile_id uuid references user_profiles(id) on delete set null,
  add column scheduled_by_user_profile_id uuid references user_profiles(id) on delete set null,
  add column last_updated_by_user_profile_id uuid references user_profiles(id) on delete set null,
  add column approved_by_user_profile_id uuid references user_profiles(id) on delete set null;

comment on column posts.created_by_user_profile_id is 'User who originally uploaded or created this post.';
comment on column posts.scheduled_by_user_profile_id is 'User who last assigned a schedule to this post.';
comment on column posts.last_updated_by_user_profile_id is 'User who last edited this post in the dashboard.';
comment on column posts.approved_by_user_profile_id is 'Manager who approved this post, if approvals are enabled later.';

create table activity_logs (
  id uuid primary key default gen_random_uuid(),
  actor_user_profile_id uuid references user_profiles(id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id text,
  summary text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

comment on table activity_logs is 'Audit log of important user and automation actions in the workspace.';
comment on column activity_logs.id is 'Unique activity log id.';
comment on column activity_logs.actor_user_profile_id is 'User who performed the action, when known.';
comment on column activity_logs.action is 'Machine-readable action name such as post.created or user.updated.';
comment on column activity_logs.entity_type is 'Type of record affected by the action.';
comment on column activity_logs.entity_id is 'Id of the affected record, when available.';
comment on column activity_logs.summary is 'Human-readable description of what happened.';
comment on column activity_logs.metadata is 'Extra structured details about the action.';
comment on column activity_logs.created_at is 'Date and time when the action happened.';

create index activity_logs_created_at_idx on activity_logs(created_at desc);
create index activity_logs_actor_user_profile_id_idx on activity_logs(actor_user_profile_id);
create index activity_logs_entity_idx on activity_logs(entity_type, entity_id);
create index posts_created_by_user_profile_id_idx on posts(created_by_user_profile_id);
create index posts_scheduled_by_user_profile_id_idx on posts(scheduled_by_user_profile_id);
