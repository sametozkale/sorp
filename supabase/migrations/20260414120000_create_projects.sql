create extension if not exists "pgcrypto";

create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title text not null default 'New component',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.project_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  label text not null,
  spec_json jsonb not null,
  created_at timestamptz not null default now(),
  unique (project_id, label)
);

create or replace function public.set_projects_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists projects_set_updated_at on public.projects;
create trigger projects_set_updated_at
before update on public.projects
for each row execute function public.set_projects_updated_at();

alter table public.projects enable row level security;
alter table public.project_versions enable row level security;

drop policy if exists projects_select_own on public.projects;
create policy projects_select_own
on public.projects
for select
to authenticated
using (auth.uid() = user_id);

drop policy if exists projects_insert_own on public.projects;
create policy projects_insert_own
on public.projects
for insert
to authenticated
with check (auth.uid() = user_id);

drop policy if exists projects_update_own on public.projects;
create policy projects_update_own
on public.projects
for update
to authenticated
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists projects_delete_own on public.projects;
create policy projects_delete_own
on public.projects
for delete
to authenticated
using (auth.uid() = user_id);

drop policy if exists project_versions_select_own on public.project_versions;
create policy project_versions_select_own
on public.project_versions
for select
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
);

drop policy if exists project_versions_insert_own on public.project_versions;
create policy project_versions_insert_own
on public.project_versions
for insert
to authenticated
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
);

drop policy if exists project_versions_update_own on public.project_versions;
create policy project_versions_update_own
on public.project_versions
for update
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
);

drop policy if exists project_versions_delete_own on public.project_versions;
create policy project_versions_delete_own
on public.project_versions
for delete
to authenticated
using (
  exists (
    select 1
    from public.projects p
    where p.id = project_id and p.user_id = auth.uid()
  )
);
