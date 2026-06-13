-- ============================================================
-- Migrația 18 (Sprint 3 — Availability Blocks, UX):
--   RPC bulk_remove_blocks — elimină în masă blocajele care ating un interval,
--   pe camerele selectate. Un singur DELETE (set-based); audit-ul per blocaj
--   vine gratis din trigger-ul room_blocks_audit (block_removed per rând).
--   SECURITY INVOKER: RLS pe room_blocks autorizează.
-- ============================================================

create function public.bulk_remove_blocks(
  p_unit_ids uuid[],
  p_start    date,
  p_end      date
) returns int
language plpgsql set search_path = ''
as $$
declare
  v_count int;
begin
  if p_end <= p_start then raise exception 'INVALID_DATES'; end if;
  if p_unit_ids is null or array_length(p_unit_ids, 1) is null then return 0; end if;
  if array_length(p_unit_ids, 1) > 500 then raise exception 'TOO_MANY_UNITS'; end if;

  delete from public.room_blocks
   where unit_id = any(p_unit_ids)
     and period && daterange(p_start, p_end, '[)');
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.bulk_remove_blocks from anon, public;
