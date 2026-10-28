-- ============================================================
-- DNM Agency Management — Ajustes de reglas de acceso (RLS)
-- Correr DESPUÉS de 2026-10-28-proteger-roles.sql.
-- Pega esto en Supabase > SQL Editor y presiona "Run".
-- Es seguro correrlo varias veces.
--
-- Estado encontrado en producción (28 oct 2026):
--   - tasks tenía DOS políticas de lectura: "tasks_select" (true) y
--     "tasks_select_own_or_admin". En Postgres las políticas se suman
--     con OR, así que la de "true" anulaba la privacidad: cualquier
--     miembro podía leer todas las tareas (la app solo las ocultaba
--     en pantalla, app.js loadTasks).
--   - tasks_update era "true": cualquier miembro podía editar
--     cualquier tarea, aunque no la viera.
--   - client_files_delete era "true": cualquiera borraba cualquier
--     archivo de cliente.
-- ============================================================

-- ---------- TAREAS: ver y editar solo las propias / asignadas ----------
drop policy if exists tasks_select on public.tasks;

drop policy if exists tasks_update on public.tasks;
create policy tasks_update on public.tasks
  for update to authenticated
  using (
    owner_id = auth.uid()
    or to_jsonb(assignee_ids) ? (auth.uid())::text
    or public.is_admin()
  )
  -- with check abierto: quien puede editar la tarea puede reasignarla
  -- a otra persona (aunque deje de verla después).
  with check (true);

-- ---------- ARCHIVOS DE CLIENTE: borrar solo quien subió o un admin ----------
drop policy if exists cf_delete on public.client_files;
create policy cf_delete on public.client_files
  for delete to authenticated
  using (uploaded_by = auth.uid() or public.is_admin());
