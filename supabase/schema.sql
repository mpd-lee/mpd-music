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
