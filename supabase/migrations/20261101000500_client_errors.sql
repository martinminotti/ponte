-- Errori dell'app nelle officine in prova: arrivano qui (solo da chi ha l'account), per sistemarli prima che
-- qualcuno debba telefonare. Niente dati delle schede: messaggio, punto del codice, versione, dispositivo.

create table public.client_errors (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  user_id uuid default auth.uid(),
  workshop_id uuid,
  app_version text check (char_length(app_version) <= 40),
  platform text check (char_length(platform) <= 20),
  kind text not null check (char_length(kind) <= 40),
  message text not null check (char_length(message) <= 1000),
  stack text check (char_length(stack) <= 4000),
  context jsonb check (pg_column_size(context) < 8000)
);
create index client_errors_created_idx on public.client_errors (created_at desc);
alter table public.client_errors enable row level security;
revoke all on public.client_errors from anon, authenticated;

-- al massimo 60 errori l'ora per persona: un errore in un ciclo non riempie il database
create or replace function public.report_errors(p_items jsonb) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := auth.uid();
  room integer;
  n integer := 0;
  it jsonb;
begin
  if me is null or jsonb_typeof(p_items) <> 'array' then return 0; end if;
  room := 60 - (select count(*) from public.client_errors where user_id = me and created_at > now() - interval '1 hour');
  for it in select value from jsonb_array_elements(p_items) limit greatest(least(room, 20), 0) loop
    insert into public.client_errors (user_id, workshop_id, app_version, platform, kind, message, stack, context)
    values (
      me,
      case when (it ->> 'workshop') ~ '^[0-9a-f-]{36}$' and ponte_private.is_member((it ->> 'workshop')::uuid) then (it ->> 'workshop')::uuid end,
      left(it ->> 'version', 40), left(it ->> 'platform', 20), left(coalesce(it ->> 'kind', 'error'), 40),
      left(coalesce(it ->> 'message', ''), 1000), left(it ->> 'stack', 4000),
      case when jsonb_typeof(it -> 'context') = 'object' and pg_column_size(it -> 'context') < 8000 then it -> 'context' end
    );
    n := n + 1;
  end loop;
  return n;
end $$;

revoke execute on function public.report_errors(jsonb) from public, anon;
grant execute on function public.report_errors(jsonb) to authenticated;
