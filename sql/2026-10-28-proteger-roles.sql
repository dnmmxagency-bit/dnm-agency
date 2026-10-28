-- ============================================================
-- DNM Agency Management — Proteger el campo "role" de profiles
-- Pega esto en Supabase > SQL Editor y presiona "Run".
-- Es seguro correrlo varias veces.
--
-- Problema que corrige: la política profiles_update solo revisa que
-- edites TU propio perfil, no QUÉ columna cambias. Cualquier usuario
-- registrado podía ponerse role = 'owner' desde la consola.
--
-- Reglas que aplica este trigger (sin tocar las políticas existentes):
--   - Nadie que no sea admin/owner puede cambiar un rol (ni el suyo).
--   - Solo un owner puede dar o quitar el rol 'owner'.
--   - Al crear un perfil, si quien lo crea no es admin, el rol
--     'admin'/'owner' se baja a 'editor'.
--   - El SQL Editor y las funciones con service role (auth.uid() nulo)
--     no tienen restricción, para que puedas administrar a mano.
-- ============================================================

-- is_admin() ya existe en producción y la usan otras políticas; solo se
-- crea si falta (por ejemplo, en una base nueva) para no cambiarla.
do $$
begin
  if to_regprocedure('public.is_admin()') is null then
    execute $f$
      create function public.is_admin()
      returns boolean
      language sql
      stable
      security definer
      set search_path = public
      as $b$
        select exists (
          select 1 from public.profiles
          where id = auth.uid() and role in ('admin', 'owner')
        );
      $b$;
    $f$;
  end if;
end;
$$;

create or replace function public.is_owner()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner'
  );
$$;

create or replace function public.protect_profile_role()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- SQL Editor / service role: sin restricción
  if auth.uid() is null then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.role in ('admin', 'owner') and not public.is_admin() then
      new.role := 'editor';
    end if;
    return new;
  end if;

  -- UPDATE
  if new.role is distinct from old.role then
    if not public.is_admin() then
      raise exception 'Solo un administrador puede cambiar roles'
        using errcode = '42501';
    end if;
    if (new.role = 'owner' or old.role = 'owner') and not public.is_owner() then
      raise exception 'Solo el owner puede asignar o quitar el rol owner'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_profile_role on public.profiles;
create trigger protect_profile_role
  before insert or update on public.profiles
  for each row execute function public.protect_profile_role();
