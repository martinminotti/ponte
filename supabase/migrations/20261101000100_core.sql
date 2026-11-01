-- Ponte: officine, membri, inviti, schede, foto.
--
-- Principi
--  * Ogni riga appartiene a un'officina (workshop_id). Si legge solo da membro di quell'officina (RLS).
--  * I client non scrivono mai direttamente nelle tabelle: passano dalle funzioni push / create_workshop /
--    join_workshop …, che controllano ruolo, campi ammessi e dimensioni. Le tabelle concedono solo SELECT.
--  * Sincronizzazione: ogni scrittura registra l'id della transazione (xid8). Il client chiede "tutto quello che è
--    cambiato dopo il mio segno" e riceve le righe in ordine (xid, id): nessuna modifica persa, nessun doppione.
--  * Le schede sono documenti JSON (doc) uniti campo per campo: due dispositivi che cambiano campi diversi della
--    stessa scheda non si pestano i piedi; sullo stesso campo vince l'ultima modifica arrivata al server.
--  * Niente cancellazioni fisiche dal client: deleted_at (le altre copie lo ricevono con la sincronizzazione).

create schema if not exists ponte_private;
revoke all on schema ponte_private from public;

-- ---------------------------------------------------------------- tipi

do $$ begin
  create type public.member_role as enum ('owner', 'staff');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- tabelle

create table public.workshops (
  id uuid primary key default gen_random_uuid(),
  -- impostazioni dell'officina condivise da tutti i dispositivi (nome, indirizzo, P.IVA, aliquote, logo, operai…)
  settings jsonb not null default '{}'::jsonb,
  name text generated always as (coalesce(settings ->> 'shop', '')) stored,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  xid xid8 not null default pg_current_xact_id(),
  deleted_at timestamptz,
  constraint workshops_settings_object check (jsonb_typeof(settings) = 'object'),
  constraint workshops_settings_size check (pg_column_size(settings) < 600000)
);

-- contatore dei numeri di scheda: a parte, così assegnare un numero non "tocca" l'officina (che altrimenti
-- tornerebbe a ogni dispositivo a ogni scheda nuova)
create table ponte_private.counters (
  workshop_id uuid primary key references public.workshops (id) on delete cascade,
  next_number integer not null default 1 check (next_number >= 1)
);

create table public.members (
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'staff',
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid,
  xid xid8 not null default pg_current_xact_id(),
  removed_at timestamptz,
  primary key (workshop_id, user_id)
);
create index members_user_idx on public.members (user_id) where removed_at is null;

create table public.invites (
  -- 8 caratteri senza quelli che si confondono (0/O, 1/I/L): si detta a voce o si scrive a mano
  code text primary key check (code ~ '^[A-HJ-KM-NP-Z2-9]{8}$'),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  role public.member_role not null default 'staff',
  display_name text not null default '' check (char_length(display_name) <= 80),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references auth.users (id) on delete set null,
  used_at timestamptz,
  revoked_at timestamptz
);
create index invites_workshop_idx on public.invites (workshop_id);

create table public.jobs (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{4,64}$'),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  number integer check (number >= 1),
  doc jsonb not null,
  status text generated always as (doc ->> 'status') stored,
  plate text generated always as (upper(coalesce(doc ->> 'plate', ''))) stored,
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  xid xid8 not null default pg_current_xact_id(),
  deleted_at timestamptz,
  constraint jobs_doc_object check (jsonb_typeof(doc) = 'object'),
  constraint jobs_doc_size check (pg_column_size(doc) < 400000),
  constraint jobs_status_known check (doc ->> 'status' in ('accettato', 'diagnosi', 'ricambi', 'lavorazione', 'pronto', 'consegnato')),
  constraint jobs_number_unique unique (workshop_id, number)
);
create index jobs_sync_idx on public.jobs (workshop_id, xid, id);
create index jobs_plate_idx on public.jobs (workshop_id, plate);

create table public.photos (
  id text primary key check (id ~ '^[A-Za-z0-9_-]{4,64}$'),
  workshop_id uuid not null references public.workshops (id) on delete cascade,
  job_id text not null references public.jobs (id) on delete cascade,
  -- percorso nel bucket "photos": <officina>/<scheda>/<foto>.jpg (lo decide il server)
  path text not null,
  w integer not null default 0 check (w between 0 and 20000),
  h integer not null default 0 check (h between 0 and 20000),
  created_at timestamptz not null default now(),
  created_by uuid,
  updated_at timestamptz not null default now(),
  updated_by uuid,
  xid xid8 not null default pg_current_xact_id(),
  deleted_at timestamptz
);
create index photos_sync_idx on public.photos (workshop_id, xid, id);
create index photos_job_idx on public.photos (job_id);

-- ---------------------------------------------------------------- tempi e segno di sincronizzazione

create or replace function ponte_private.touch() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  new.xid := pg_current_xact_id();
  new.updated_by := auth.uid();
  return new;
end $$;

create trigger workshops_touch before insert or update on public.workshops for each row execute function ponte_private.touch();
create trigger members_touch before insert or update on public.members for each row execute function ponte_private.touch();
create trigger jobs_touch before insert or update on public.jobs for each row execute function ponte_private.touch();
create trigger photos_touch before insert or update on public.photos for each row execute function ponte_private.touch();

-- ---------------------------------------------------------------- appartenenza

create or replace function ponte_private.role_in(p_workshop uuid) returns public.member_role
language sql stable security definer set search_path = '' as $$
  select m.role from public.members m
  join public.workshops w on w.id = m.workshop_id and w.deleted_at is null
  where m.workshop_id = p_workshop and m.user_id = auth.uid() and m.removed_at is null
$$;

create or replace function ponte_private.is_member(p_workshop uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select ponte_private.role_in(p_workshop) is not null
$$;

create or replace function ponte_private.my_workshops() returns setof uuid
language sql stable security definer set search_path = '' as $$
  select m.workshop_id from public.members m
  join public.workshops w on w.id = m.workshop_id and w.deleted_at is null
  where m.user_id = auth.uid() and m.removed_at is null
$$;

grant usage on schema ponte_private to authenticated;
grant execute on function ponte_private.role_in(uuid), ponte_private.is_member(uuid), ponte_private.my_workshops() to authenticated;

-- ---------------------------------------------------------------- accesso (sola lettura per i client)

alter table public.workshops enable row level security;
alter table public.members enable row level security;
alter table public.invites enable row level security;
alter table public.jobs enable row level security;
alter table public.photos enable row level security;

revoke all on public.workshops, public.members, public.invites, public.jobs, public.photos from anon, authenticated;
grant select on public.workshops, public.members, public.invites, public.jobs, public.photos to authenticated;

create policy workshops_read on public.workshops for select to authenticated
  using (id in (select ponte_private.my_workshops()));
create policy members_read on public.members for select to authenticated
  using (workshop_id in (select ponte_private.my_workshops()));
create policy invites_read on public.invites for select to authenticated
  using (ponte_private.role_in(workshop_id) = 'owner');
create policy jobs_read on public.jobs for select to authenticated
  using (workshop_id in (select ponte_private.my_workshops()));
create policy photos_read on public.photos for select to authenticated
  using (workshop_id in (select ponte_private.my_workshops()));

-- avvisi in tempo reale: i dispositivi sentono che qualcosa è cambiato e chiedono le novità con pull()
do $$ begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.jobs, public.photos, public.workshops, public.members;
  end if;
end $$;
