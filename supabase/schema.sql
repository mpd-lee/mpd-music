-- MPD Music Studio: realtime global/direct chat + shared file attachments
-- Run the complete file in Supabase Dashboard > SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.global_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  sender_name text not null default 'Guest',
  content text not null check (char_length(content) between 1 and 300),
  file_url text,
  file_name text,
  file_size bigint,
  file_type text,
  created_at timestamptz not null default now()
);

create index if not exists global_messages_created_at_idx
  on public.global_messages (created_at desc);

create table if not exists public.direct_messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references auth.users (id) on delete cascade,
  recipient_id uuid not null references auth.users (id) on delete cascade,
  sender_name text not null default 'Guest',
  content text not null check (char_length(content) between 1 and 300),
  file_url text,
  file_name text,
  file_size bigint,
  file_type text,
  created_at timestamptz not null default now(),
  constraint direct_messages_no_self_message check (sender_id <> recipient_id)
);

create index if not exists direct_messages_pair_created_at_idx
  on public.direct_messages (sender_id, recipient_id, created_at desc);
create index if not exists direct_messages_recipient_created_at_idx
  on public.direct_messages (recipient_id, created_at desc);

alter table public.global_messages enable row level security;
alter table public.direct_messages enable row level security;

-- A signed-in (including anonymous-auth) visitor can read the global room.
drop policy if exists "Global chat is readable by authenticated visitors" on public.global_messages;
create policy "Global chat is readable by authenticated visitors"
  on public.global_messages for select to authenticated
  using (true);

drop policy if exists "Visitors can post as themselves in global chat" on public.global_messages;
create policy "Visitors can post as themselves in global chat"
  on public.global_messages for insert to authenticated
  with check (sender_id = auth.uid());

-- Only the two participants can read a direct-message row.
drop policy if exists "Participants can read their direct messages" on public.direct_messages;
create policy "Participants can read their direct messages"
  on public.direct_messages for select to authenticated
  using (auth.uid() = sender_id or auth.uid() = recipient_id);

drop policy if exists "A visitor can send a direct message as themselves" on public.direct_messages;
create policy "A visitor can send a direct message as themselves"
  on public.direct_messages for insert to authenticated
  with check (sender_id = auth.uid() and recipient_id <> auth.uid());

grant select, insert on public.global_messages to authenticated;
grant select, insert on public.direct_messages to authenticated;

-- Enable Realtime Postgres Changes for both tables. The duplicate_object
-- exception makes this script safe to run again if a table is already listed.
do $$
begin
  alter publication supabase_realtime add table public.global_messages;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then
  null;
end $$;



-- Shared public guestbook. Public visitors may read and submit entries;
-- only the server-verified studio owner can delete entries through the API.
create table if not exists public.guestbook_entries (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 30),
  message text not null check (char_length(message) between 1 and 300),
  candle boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists guestbook_entries_created_at_idx
  on public.guestbook_entries (created_at desc);

alter table public.guestbook_entries enable row level security;
alter table public.guestbook_entries replica identity full;

drop policy if exists "Public can read MPD guestbook" on public.guestbook_entries;
create policy "Public can read MPD guestbook"
  on public.guestbook_entries for select to anon, authenticated
  using (true);

drop policy if exists "Public can post MPD guestbook entries" on public.guestbook_entries;
create policy "Public can post MPD guestbook entries"
  on public.guestbook_entries for insert to anon, authenticated
  with check (char_length(name) between 1 and 30 and char_length(message) between 1 and 300);

grant select, insert on public.guestbook_entries to anon, authenticated;

do $$
begin
  alter publication supabase_realtime add table public.guestbook_entries;
exception when duplicate_object then
  null;
end $$;

-- Shared chat file storage. Free Supabase projects allow up to 50 MB per file.
-- NULL allowed_mime_types means common document, archive, audio, video and image files are not blocked by a MIME allow-list.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chat-files',
  'chat-files',
  true,
  52428800,
  NULL
)
on conflict (id) do update set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

alter table public.global_messages
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists file_type text;

alter table public.direct_messages
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists file_type text;

-- Global and 1:1 chat messages both reference this bucket. Users may upload only into their own folder: <auth.uid()>/<filename>
-- This is a public bucket: anyone holding a file URL can open that attachment.
drop policy if exists "Chat users can upload their own files" on storage.objects;
create policy "Chat users can upload their own files"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "Chat files are publicly readable" on storage.objects;
create policy "Chat files are publicly readable"
  on storage.objects for select to public
  using (bucket_id = 'chat-files');

drop policy if exists "Chat users can delete their own files" on storage.objects;
create policy "Chat users can delete their own files"
  on storage.objects for delete to authenticated
  using (bucket_id = 'chat-files' and (storage.foldername(name))[1] = auth.uid()::text);

-- -----------------------------------------------------------------------------
-- MPD Studio Realtime reliability update
-- Run this complete schema again after deploying the multiplayer chat update.
-- Presence is used only for online join/leave; high-frequency avatar movement
-- is sent as Broadcast events to avoid flooding Presence sync.
-- -----------------------------------------------------------------------------

alter table public.direct_messages
  add column if not exists recipient_id uuid references auth.users (id) on delete cascade,
  add column if not exists sender_name text not null default 'Guest',
  add column if not exists content text,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists file_url text,
  add column if not exists file_name text,
  add column if not exists file_size bigint,
  add column if not exists file_type text;

alter table public.direct_messages replica identity full;
alter table public.global_messages replica identity full;

-- Private studio presence channel: authenticated anonymous visitors may see
-- the online list and receive avatar movement broadcasts.
drop policy if exists "MPD users can receive studio presence and movement" on realtime.messages;
create policy "MPD users can receive studio presence and movement"
  on realtime.messages for select to authenticated
  using (
    realtime.topic() = 'mpd-studio-presence'
    and extension in ('presence', 'broadcast')
  );

drop policy if exists "MPD users can publish studio presence and movement" on realtime.messages;
create policy "MPD users can publish studio presence and movement"
  on realtime.messages for insert to authenticated
  with check (
    realtime.topic() = 'mpd-studio-presence'
    and extension in ('presence', 'broadcast')
  );

-- Voice signaling uses a dedicated private topic for each pair of online users.
-- Topic format: mpd-studio-voice:<user-uuid-1>:<user-uuid-2>
-- Only either participant may read or publish in that pair's voice room.
drop policy if exists "MPD voice call participants can receive signaling" on realtime.messages;
create policy "MPD voice call participants can receive signaling"
  on realtime.messages for select to authenticated
  using (
    extension = 'broadcast'
    and realtime.topic() like 'mpd-studio-voice:%'
    and auth.uid()::text in (
      split_part(realtime.topic(), ':', 2),
      split_part(realtime.topic(), ':', 3)
    )
  );

drop policy if exists "MPD voice call participants can publish signaling" on realtime.messages;
create policy "MPD voice call participants can publish signaling"
  on realtime.messages for insert to authenticated
  with check (
    extension = 'broadcast'
    and realtime.topic() like 'mpd-studio-voice:%'
    and auth.uid()::text in (
      split_part(realtime.topic(), ':', 2),
      split_part(realtime.topic(), ':', 3)
    )
  );


-- Ensure Postgres Changes can publish the rows used by global and 1:1 chat.
do $$
begin
  alter publication supabase_realtime add table public.global_messages;
exception when duplicate_object then
  null;
end $$;

do $$
begin
  alter publication supabase_realtime add table public.direct_messages;
exception when duplicate_object then
  null;
end $$;

-- Voice calling was intentionally removed. Drop only the obsolete transient signaling inbox; chat history and uploaded files remain untouched.
drop table if exists public.voice_signals;
