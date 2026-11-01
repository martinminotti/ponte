-- Uso dell'assistente vocale AI per officina e giorno: la chiave del modello sta sul server (funzione "ai"),
-- quindi il server tiene il conto e mette un tetto giornaliero per officina (costi sotto controllo, abusi fermati).

create table public.ai_usage (
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  day date not null default current_date,
  requests integer not null default 0,
  input_tokens bigint not null default 0,
  output_tokens bigint not null default 0,
  primary key (workshop_id, day)
);
alter table public.ai_usage enable row level security;
revoke all on public.ai_usage from anon, authenticated;
-- il titolare può vedere quanto si usa (per curiosità o per decidere un piano)
grant select on public.ai_usage to authenticated;
create policy ai_usage_owner_read on public.ai_usage for select to authenticated using (ponte_private.role_in(workshop_id) = 'owner');

-- conta una richiesta; false se l'officina ha già raggiunto il tetto di oggi. Solo il server (service_role).
create or replace function public.ai_take(p_workshop uuid, p_user uuid, p_limit integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  if not exists (
    select 1 from public.members m join public.workshops w on w.id = m.workshop_id and w.deleted_at is null
    where m.workshop_id = p_workshop and m.user_id = p_user and m.removed_at is null
  ) then
    raise exception 'not_member' using errcode = '42501';
  end if;
  insert into public.ai_usage (workshop_id, day, requests) values (p_workshop, current_date, 1)
  on conflict (workshop_id, day) do update set requests = public.ai_usage.requests + 1
  returning requests into n;
  return n <= p_limit;
end $$;

create or replace function public.ai_tokens(p_workshop uuid, p_in integer, p_out integer) returns void
language sql security definer set search_path = '' as $$
  update public.ai_usage set input_tokens = input_tokens + greatest(p_in, 0), output_tokens = output_tokens + greatest(p_out, 0)
  where workshop_id = p_workshop and day = current_date
$$;

revoke execute on function public.ai_take(uuid, uuid, integer), public.ai_tokens(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.ai_take(uuid, uuid, integer), public.ai_tokens(uuid, integer, integer) to service_role;
