-- ============================================================
-- DNM Agency Management — Base de datos (Fase 1)
-- Pega TODO esto en Supabase > SQL Editor y presiona "Run".
-- Crea las tablas, la seguridad (RLS) y el perfil automático.
-- Es seguro correrlo varias veces.
-- ============================================================

-- ---------- PERFILES ----------
create table if not exists public.profiles (
  id         uuid primary key references auth.users(id) on delete cascade,
  name       text,
  email      text,
  role       text not null default 'member',   -- 'owner' | 'member'
  created_at timestamptz not null default now()
);

-- ---------- CLIENTES ----------
create table if not exists public.clients (
  id         uuid primary key default gen_random_uuid(),
  owner_id   uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  notes      text,
  active      boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- TAREAS ----------
create table if not exists public.tasks (
  id           uuid primary key default gen_random_uuid(),
  owner_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
  title        text not null,
  proceso      text not null default 'Planeación',
  estado       text not null default 'Pendiente',
  prioridad    text not null default 'Media',
  due_date     date,
  client_id    uuid references public.clients(id) on delete set null,
  assignee_ids uuid[] not null default '{}',   -- responsables (varios)
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

-- Índices útiles
create index if not exists tasks_owner_idx    on public.tasks(owner_id);
create index if not exists tasks_assignees_idx on public.tasks using gin(assignee_ids);

-- ============================================================
-- SEGURIDAD (Row Level Security)
-- ============================================================
alter table public.profiles enable row level security;
alter table public.clients  enable row level security;
alter table public.tasks    enable row level security;

-- ---- PROFILES ----
-- Cualquier usuario autenticado puede ver los perfiles (para mostrar
-- nombres de responsables). Solo puede crear/editar el suyo.
drop policy if exists profiles_select on public.profiles;
create policy profiles_select on public.profiles
  for select to authenticated using (true);

drop policy if exists profiles_insert on public.profiles;
create policy profiles_insert on public.profiles
  for insert to authenticated with check (id = auth.uid());

drop policy if exists profiles_update on public.profiles;
create policy profiles_update on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());

-- ---- CLIENTS ----
-- Directorio compartido del equipo: todos los autenticados lo ven y
-- pueden dar de alta/editar. Borrar, solo quien lo creó.
drop policy if exists clients_select on public.clients;
create policy clients_select on public.clients
  for select to authenticated using (true);

drop policy if exists clients_insert on public.clients;
create policy clients_insert on public.clients
  for insert to authenticated with check (owner_id = auth.uid());

drop policy if exists clients_update on public.clients;
create policy clients_update on public.clients
  for update to authenticated using (true) with check (true);

drop policy if exists clients_delete on public.clients;
create policy clients_delete on public.clients
  for delete to authenticated using (owner_id = auth.uid());

-- ---- TASKS ----
-- Cada quien ve SOLO sus tareas + aquellas donde es responsable.
drop policy if exists tasks_select on public.tasks;
create policy tasks_select on public.tasks
  for select to authenticated
  using (owner_id = auth.uid() or auth.uid() = any(assignee_ids));

-- Crear: la tarea queda a nombre de quien la crea.
drop policy if exists tasks_insert on public.tasks;
create policy tasks_insert on public.tasks
  for insert to authenticated with check (owner_id = auth.uid());

-- Editar/mover: el dueño o cualquier responsable.
drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (owner_id = auth.uid() or auth.uid() = any(assignee_ids))
  with check (owner_id = auth.uid() or auth.uid() = any(assignee_ids));

-- Borrar: SOLO el dueño (quien la creó).
drop policy if exists tasks_delete on public.tasks;
create policy tasks_delete on public.tasks
  for delete to authenticated using (owner_id = auth.uid());

-- ============================================================
-- PERFIL AUTOMÁTICO al registrarse
-- ============================================================
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, name, email, role)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'name', split_part(new.email, '@', 1)),
    new.email,
    'member'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ============================================================
-- LISTO. Después de registrarte en la app, si quieres marcarte
-- como OWNER (administrador), corre esto cambiando el correo:
--
--   update public.profiles set role = 'owner'
--   where email = 'TU_CORREO_AQUI';
-- ============================================================
