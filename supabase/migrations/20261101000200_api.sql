-- Ponte: funzioni chiamate dall'app (unica via per scrivere).
-- Tutte SECURITY DEFINER con search_path vuoto: ogni nome è qualificato e ogni controllo di ruolo è esplicito.

-- ---------------------------------------------------------------- utilità

-- campi di una scheda che il client può scrivere (id, numero e tempi del server restano del server)
create or replace function ponte_private.job_keys() returns text[]
language sql immutable as $$
  select array[
    'createdAt', 'status', 'history',
    'plate', 'plateCountry', 'vin', 'make', 'model', 'km', 'dueDate',
    'client', 'company', 'owner', 'phone', 'wa',
    'services', 'tyres', 'request', 'notes', 'workers', 'photoIds',
    'items', 'deposit', 'vatRate', 'vatIncl', 'billing', 'invoiced', 'invoicedAt', 'invoiceNo',
    'paid', 'paidAt', 'paidAmount', 'payMethod', 'warrantyMonths', 'warrantyNote',
    'closedAt', 'deliveredAt', 'demo', 'quick'
  ]
$$;

-- impostazioni dell'officina condivise (le preferenze del singolo dispositivo restano sul dispositivo)
create or replace function ponte_private.settings_keys() returns text[]
language sql immutable as $$
  select array['shop', 'shopAddr', 'shopVat', 'shopPhone', 'prefix', 'warranty', 'vat', 'accent', 'logo', 'workers', 'laborRate']
$$;

create or replace function ponte_private.only_keys(p jsonb, p_keys text[]) returns jsonb
language sql immutable as $$
  select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) from jsonb_each(p) e where e.key = any (p_keys)
$$;

-- controlli di forma sui campi che contano: un client difettoso non deve poter rovinare una scheda
create or replace function ponte_private.job_patch_error(p jsonb) returns text
language plpgsql immutable as $$
declare
  k text;
begin
  if p ? 'status' and (p ->> 'status') not in ('accettato', 'diagnosi', 'ricambi', 'lavorazione', 'pronto', 'consegnato') then return 'status'; end if;
  foreach k in array array['history', 'services', 'workers', 'photoIds', 'items'] loop
    if p ? k and jsonb_typeof(p -> k) <> 'array' then return k; end if;
  end loop;
  if p ? 'items' and jsonb_array_length(p -> 'items') > 500 then return 'items'; end if;
  if p ? 'history' and jsonb_array_length(p -> 'history') > 500 then return 'history'; end if;
  if p ? 'company' and jsonb_typeof(p -> 'company') <> 'object' then return 'company'; end if;
  foreach k in array array['deposit', 'vatRate', 'warrantyMonths', 'createdAt'] loop
    if p ? k and jsonb_typeof(p -> k) <> 'number' then return k; end if;
  end loop;
  foreach k in array array['plate', 'vin', 'owner', 'phone', 'make', 'model', 'km', 'dueDate', 'invoiceNo', 'payMethod'] loop
    if p ? k and (jsonb_typeof(p -> k) <> 'string' or char_length(p ->> k) > 200) then return k; end if;
  end loop;
  foreach k in array array['wa', 'vatIncl', 'invoiced', 'paid', 'demo', 'quick'] loop
    if p ? k and jsonb_typeof(p -> k) <> 'boolean' then return k; end if;
  end loop;
  return null;
end $$;

create or replace function ponte_private.settings_patch_error(p jsonb) returns text
language plpgsql immutable as $$
begin
  if p ? 'logo' and (jsonb_typeof(p -> 'logo') <> 'string' or char_length(p ->> 'logo') > 400000) then return 'logo'; end if;
  if p ? 'workers' and (jsonb_typeof(p -> 'workers') <> 'array' or jsonb_array_length(p -> 'workers') > 100) then return 'workers'; end if;
  if p ? 'shop' and (jsonb_typeof(p -> 'shop') <> 'string' or char_length(p ->> 'shop') > 120) then return 'shop'; end if;
  return null;
end $$;

create or replace function ponte_private.ms(t timestamptz) returns bigint
language sql immutable as $$ select (extract(epoch from t) * 1000)::bigint $$;

-- codice d'invito: 8 caratteri dall'alfabeto senza ambiguità, da 16 byte casuali (uuid v4)
create or replace function ponte_private.new_code() returns text
language plpgsql volatile as $$
declare
  alphabet constant text := 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  b bytea := uuid_send(gen_random_uuid());
  out text := '';
  i int;
begin
  for i in 0..7 loop
    out := out || substr(alphabet, (get_byte(b, i) % 31) + 1, 1);
  end loop;
  return out;
end $$;

create or replace function ponte_private.require_user() returns uuid
language plpgsql stable as $$
begin
  if auth.uid() is null then
    raise exception 'not_authenticated' using errcode = '28000';
  end if;
  return auth.uid();
end $$;

create or replace function ponte_private.require_role(p_workshop uuid, p_owner boolean default false) returns public.member_role
language plpgsql stable security definer set search_path = '' as $$
declare
  r public.member_role;
begin
  perform ponte_private.require_user();
  r := ponte_private.role_in(p_workshop);
  if r is null then
    raise exception 'not_member' using errcode = '42501';
  end if;
  if p_owner and r <> 'owner' then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  return r;
end $$;

-- ---------------------------------------------------------------- chi sono

create or replace function public.me() returns jsonb
language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'user', auth.uid(),
    'workshops', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'name', w.name, 'role', m.role, 'displayName', m.display_name) order by m.created_at)
      from public.members m join public.workshops w on w.id = m.workshop_id
      where m.user_id = auth.uid() and m.removed_at is null and w.deleted_at is null
    ), '[]'::jsonb)
  )
$$;

-- ---------------------------------------------------------------- officina

create or replace function public.create_workshop(p_display_name text, p_settings jsonb default '{}'::jsonb) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := ponte_private.require_user();
  w uuid;
  s jsonb := ponte_private.only_keys(coalesce(p_settings, '{}'::jsonb), ponte_private.settings_keys());
  err text := ponte_private.settings_patch_error(s);
begin
  if err is not null then
    raise exception 'bad_field:%', err using errcode = '22023';
  end if;
  -- un account crea al massimo poche officine (abusi, errori ripetuti)
  if (select count(*) from public.members m join public.workshops x on x.id = m.workshop_id
      where m.user_id = me and m.role = 'owner' and m.removed_at is null and x.deleted_at is null) >= 3 then
    raise exception 'too_many_workshops' using errcode = '54000';
  end if;
  insert into public.workshops (settings, created_by) values (s, me) returning id into w;
  insert into public.members (workshop_id, user_id, role, display_name) values (w, me, 'owner', left(coalesce(p_display_name, ''), 80));
  return w;
end $$;

-- il titolare chiude l'officina: sparisce subito per tutti; i dati si cancellano poi definitivamente
create or replace function public.delete_workshop(p_workshop uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform ponte_private.require_role(p_workshop, true);
  update public.workshops set deleted_at = now() where id = p_workshop;
end $$;

-- ---------------------------------------------------------------- inviti e membri

create or replace function public.create_invite(p_workshop uuid, p_display_name text default '', p_role public.member_role default 'staff') returns text
language plpgsql security definer set search_path = '' as $$
declare
  c text;
begin
  perform ponte_private.require_role(p_workshop, true);
  if (select count(*) from public.invites where workshop_id = p_workshop and used_at is null and revoked_at is null and expires_at > now()) >= 20 then
    raise exception 'too_many_invites' using errcode = '54000';
  end if;
  loop
    c := ponte_private.new_code();
    exit when not exists (select 1 from public.invites where code = c);
  end loop;
  insert into public.invites (code, workshop_id, role, display_name, created_by)
  values (c, p_workshop, coalesce(p_role, 'staff'), left(coalesce(p_display_name, ''), 80), auth.uid());
  return c;
end $$;

create or replace function public.revoke_invite(p_code text) returns void
language plpgsql security definer set search_path = '' as $$
declare
  w uuid;
begin
  select workshop_id into w from public.invites where code = upper(p_code);
  if w is null then return; end if;
  perform ponte_private.require_role(w, true);
  update public.invites set revoked_at = now() where code = upper(p_code) and used_at is null;
end $$;

create table if not exists ponte_private.join_attempts (
  user_id uuid not null,
  at timestamptz not null default now()
);
create index if not exists join_attempts_idx on ponte_private.join_attempts (user_id, at);

-- entra in un'officina con il codice d'invito; null se il codice non vale (sbagliato, scaduto, già usato, revocato)
create or replace function public.join_workshop(p_code text, p_display_name text default '') returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := ponte_private.require_user();
  inv public.invites%rowtype;
  v_code text := upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g'));
begin
  -- tentativi a vuoto limitati: i codici non si indovinano per tentativi
  if (select count(*) from ponte_private.join_attempts where user_id = me and at > now() - interval '1 hour') >= 20 then
    raise exception 'too_many_attempts' using errcode = '54000';
  end if;
  select * into inv from public.invites i where i.code = v_code for update;
  if not found or inv.revoked_at is not null or inv.used_at is not null or inv.expires_at < now()
     or exists (select 1 from public.workshops w where w.id = inv.workshop_id and w.deleted_at is not null) then
    -- niente eccezione: annullerebbe anche la registrazione del tentativo. null = codice non valido
    insert into ponte_private.join_attempts (user_id) values (me);
    return null;
  end if;
  insert into public.members (workshop_id, user_id, role, display_name)
  values (inv.workshop_id, me, inv.role, left(coalesce(nullif(p_display_name, ''), inv.display_name, ''), 80))
  on conflict (workshop_id, user_id) do update
    set removed_at = null,
        role = case when public.members.role = 'owner' then 'owner'::public.member_role else excluded.role end,
        display_name = case when excluded.display_name <> '' then excluded.display_name else public.members.display_name end;
  update public.invites set used_by = me, used_at = now() where invites.code = inv.code;
  return inv.workshop_id;
end $$;

create or replace function ponte_private.owners_left(p_workshop uuid, p_without uuid) returns integer
language sql stable security definer set search_path = '' as $$
  select count(*)::int from public.members where workshop_id = p_workshop and role = 'owner' and removed_at is null and user_id <> p_without
$$;

create or replace function public.remove_member(p_workshop uuid, p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform ponte_private.require_role(p_workshop, true);
  if p_user = auth.uid() then
    raise exception 'use_leave' using errcode = '22023';
  end if;
  update public.members set removed_at = now() where workshop_id = p_workshop and user_id = p_user and removed_at is null;
end $$;

create or replace function public.set_member(p_workshop uuid, p_user uuid, p_role public.member_role default null, p_display_name text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare
  my public.member_role := ponte_private.require_role(p_workshop);
begin
  -- il nome lo cambia il titolare o la persona stessa; il ruolo solo il titolare
  if my <> 'owner' and (p_user <> auth.uid() or p_role is not null) then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_role = 'staff' and ponte_private.owners_left(p_workshop, p_user) = 0 then
    raise exception 'last_owner' using errcode = '22023';
  end if;
  update public.members
     set role = coalesce(p_role, role),
         display_name = coalesce(left(p_display_name, 80), display_name)
   where workshop_id = p_workshop and user_id = p_user and removed_at is null;
end $$;

create or replace function public.leave_workshop(p_workshop uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare
  my public.member_role := ponte_private.require_role(p_workshop);
begin
  if my = 'owner' and ponte_private.owners_left(p_workshop, auth.uid()) = 0
     and exists (select 1 from public.members where workshop_id = p_workshop and removed_at is null and user_id <> auth.uid()) then
    raise exception 'last_owner' using errcode = '22023';
  end if;
  update public.members set removed_at = now() where workshop_id = p_workshop and user_id = auth.uid();
  -- l'ultimo che esce chiude l'officina
  if not exists (select 1 from public.members where workshop_id = p_workshop and removed_at is null) then
    update public.workshops set deleted_at = now() where id = p_workshop;
  end if;
end $$;

-- ---------------------------------------------------------------- sincronizzazione: invio

-- numero progressivo: quello chiesto dal client se libero (schede portate da un archivio esistente), altrimenti il prossimo
create or replace function ponte_private.take_number(p_workshop uuid, p_wanted integer) returns integer
language plpgsql security definer set search_path = '' as $$
declare
  n integer;
begin
  insert into ponte_private.counters (workshop_id) values (p_workshop) on conflict (workshop_id) do nothing;
  if p_wanted is not null and p_wanted >= 1
     and not exists (select 1 from public.jobs where workshop_id = p_workshop and number = p_wanted) then
    update ponte_private.counters set next_number = greatest(next_number, p_wanted + 1) where workshop_id = p_workshop;
    return p_wanted;
  end if;
  loop
    update ponte_private.counters set next_number = next_number + 1 where workshop_id = p_workshop returning next_number - 1 into n;
    exit when not exists (select 1 from public.jobs where workshop_id = p_workshop and number = n);
  end loop;
  return n;
end $$;

create or replace function ponte_private.job_out(j public.jobs) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', j.id, 'number', j.number, 'doc', j.doc,
    'createdAt', coalesce((j.doc ->> 'createdAt')::bigint, ponte_private.ms(j.created_at)),
    'updatedAt', ponte_private.ms(j.updated_at),
    'deleted', j.deleted_at is not null
  )
$$;

create or replace function ponte_private.photo_out(p public.photos) returns jsonb
language sql stable as $$
  select jsonb_build_object(
    'id', p.id, 'jobId', p.job_id, 'path', p.path, 'w', p.w, 'h', p.h,
    'createdAt', ponte_private.ms(p.created_at), 'deleted', p.deleted_at is not null
  )
$$;

/*
  push(officina, modifiche) — applica una serie di modifiche nell'ordine in cui sono state fatte sul dispositivo.
  Ogni modifica: { t: 'job' | 'photo' | 'workshop', id, op: 'put' | 'del', patch: {...}, number? }
  Risponde per ognuna: { t, id, ok, number? } oppure { t, id, ok: false, error, row } con la versione del server,
  così il dispositivo si riallinea invece di riprovare all'infinito.
*/
create or replace function public.push(p_workshop uuid, p_changes jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  my public.member_role := ponte_private.require_role(p_workshop);
  c jsonb;
  t text;
  rid text;
  op text;
  patch jsonb;
  err text;
  num integer;
  j public.jobs%rowtype;
  ph public.photos%rowtype;
  had boolean;
  results jsonb := '[]'::jsonb;
begin
  if jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) > 200 then
    raise exception 'bad_batch' using errcode = '22023';
  end if;
  for c in select value from jsonb_array_elements(p_changes) loop
    t := c ->> 't';
    rid := c ->> 'id';
    op := coalesce(c ->> 'op', 'put');
    patch := coalesce(c -> 'patch', '{}'::jsonb);
    num := null;
    begin
      if jsonb_typeof(patch) <> 'object' then raise exception 'bad_patch'; end if;
      if op not in ('put', 'del') then raise exception 'bad_op'; end if;

      if t = 'job' then
        select * into j from public.jobs where id = rid for update;
        had := found;
        if had and j.workshop_id <> p_workshop then raise exception 'not_found'; end if;
        if op = 'del' then
          if my <> 'owner' then raise exception 'owner_only'; end if;
          update public.jobs set deleted_at = coalesce(deleted_at, now()) where id = rid and workshop_id = p_workshop;
          update public.photos set deleted_at = coalesce(deleted_at, now()) where job_id = rid and workshop_id = p_workshop;
          num := j.number;
        else
          patch := ponte_private.only_keys(patch, ponte_private.job_keys());
          err := ponte_private.job_patch_error(patch);
          if err is not null then raise exception 'bad_field:%', err; end if;
          if not had then
            num := ponte_private.take_number(p_workshop, nullif(c ->> 'number', '')::integer);
            insert into public.jobs (id, workshop_id, number, doc, created_by)
            values (rid, p_workshop, num, jsonb_build_object('status', 'accettato') || patch, auth.uid());
          else
            -- una scheda tolta e poi ripristinata (annulla) torna in vita con le sue foto
            update public.jobs set doc = doc || patch, deleted_at = null where id = rid;
            if j.deleted_at is not null then
              update public.photos set deleted_at = null where job_id = rid and deleted_at >= j.deleted_at - interval '5 seconds';
            end if;
            num := j.number;
          end if;
        end if;

      elsif t = 'photo' then
        select * into ph from public.photos where id = rid for update;
        had := found;
        if had and ph.workshop_id <> p_workshop then raise exception 'not_found'; end if;
        if op = 'del' then
          update public.photos set deleted_at = coalesce(deleted_at, now()) where id = rid and workshop_id = p_workshop;
        elsif not had then
          if not exists (select 1 from public.jobs where id = patch ->> 'jobId' and workshop_id = p_workshop) then raise exception 'no_job'; end if;
          insert into public.photos (id, workshop_id, job_id, path, w, h, created_by)
          values (rid, p_workshop, patch ->> 'jobId', p_workshop::text || '/' || (patch ->> 'jobId') || '/' || rid || '.jpg',
                  coalesce((patch ->> 'w')::int, 0), coalesce((patch ->> 'h')::int, 0), auth.uid());
        else
          update public.photos set deleted_at = null where id = rid;
        end if;

      elsif t = 'workshop' then
        if rid <> p_workshop::text then raise exception 'not_found'; end if;
        if my <> 'owner' then raise exception 'owner_only'; end if;
        patch := ponte_private.only_keys(patch, ponte_private.settings_keys());
        err := ponte_private.settings_patch_error(patch);
        if err is not null then raise exception 'bad_field:%', err; end if;
        update public.workshops set settings = settings || patch where id = p_workshop;

      else
        raise exception 'bad_table';
      end if;
      results := results || jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('t', t, 'id', rid, 'ok', true, 'number', num)));
    exception when others then
      results := results || jsonb_build_array(jsonb_build_object(
        't', t, 'id', rid, 'ok', false, 'error', sqlerrm,
        'row', case
          when t = 'job' then (select ponte_private.job_out(x) from public.jobs x where x.id = rid and x.workshop_id = p_workshop)
          when t = 'photo' then (select ponte_private.photo_out(x) from public.photos x where x.id = rid and x.workshop_id = p_workshop)
          else null end
      ));
    end;
  end loop;
  return jsonb_build_object('results', results);
end $$;

-- ---------------------------------------------------------------- sincronizzazione: ricezione

/*
  pull(officina, segno, limite) — le novità dopo il segno, in ordine (xid, id).
  Si restituiscono solo le righe scritte da transazioni già tutte concluse (xid sotto l'orizzonte xmin della
  fotografia attuale): una transazione lenta, ancora in corso, non può comparire "dietro" il segno e andare persa.
  Il segno (cursor) è opaco per il client: lo rimanda tale e quale alla chiamata successiva.
  more = true: ci sono altre righe, richiamare subito con il nuovo segno.
*/
create or replace function public.pull(p_workshop uuid, p_cursor jsonb default '{}'::jsonb, p_limit integer default 500) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  horizon xid8 := pg_snapshot_xmin(pg_current_snapshot());
  lim integer := least(greatest(coalesce(p_limit, 500), 1), 1000);
  cur jsonb := coalesce(p_cursor, '{}'::jsonb);
  jx xid8 := coalesce(cur #>> '{j,0}', '0')::xid8;
  ji text := coalesce(cur #>> '{j,1}', '');
  px xid8 := coalesce(cur #>> '{p,0}', '0')::xid8;
  pi text := coalesce(cur #>> '{p,1}', '');
  wx xid8 := coalesce(cur #>> '{w,0}', '0')::xid8;
  mx xid8 := coalesce(cur #>> '{m,0}', '0')::xid8;
  mi text := coalesce(cur #>> '{m,1}', '');
  jobs jsonb;
  photos jsonb;
  members jsonb;
  ws jsonb;
  jl jsonb;
  pl jsonb;
  ml jsonb;
  more boolean := false;
begin
  perform ponte_private.require_role(p_workshop);

  select coalesce(jsonb_agg(ponte_private.job_out(x) order by x.xid, x.id), '[]'::jsonb),
         (array_agg(jsonb_build_array(x.xid::text, x.id) order by x.xid desc, x.id desc))[1],
         count(*) = lim
    into jobs, jl, more
    from (select * from public.jobs
           where workshop_id = p_workshop and xid < horizon and (xid, id) > (jx, ji)
           order by xid, id limit lim) x;

  select coalesce(jsonb_agg(ponte_private.photo_out(x) order by x.xid, x.id), '[]'::jsonb),
         (array_agg(jsonb_build_array(x.xid::text, x.id) order by x.xid desc, x.id desc))[1],
         more or count(*) = lim
    into photos, pl, more
    from (select * from public.photos
           where workshop_id = p_workshop and xid < horizon and (xid, id) > (px, pi)
           order by xid, id limit lim) x;

  select coalesce(jsonb_agg(jsonb_build_object('userId', x.user_id, 'role', x.role, 'displayName', x.display_name, 'removed', x.removed_at is not null) order by x.xid, x.user_id), '[]'::jsonb),
         (array_agg(jsonb_build_array(x.xid::text, x.user_id::text) order by x.xid desc, x.user_id desc))[1]
    into members, ml
    from (select * from public.members
           where workshop_id = p_workshop and xid < horizon and (xid, user_id::text) > (mx, mi)
           order by xid, user_id) x;

  select jsonb_build_object('id', w.id, 'settings', w.settings, 'deleted', w.deleted_at is not null, 'x', w.xid::text)
    into ws
    from public.workshops w
   where w.id = p_workshop and w.xid < horizon and w.xid > wx;

  return jsonb_build_object(
    'jobs', jobs,
    'photos', photos,
    'members', members,
    'workshop', ws,
    'more', more,
    'cursor', jsonb_strip_nulls(jsonb_build_object(
      'j', coalesce(jl, cur -> 'j'),
      'p', coalesce(pl, cur -> 'p'),
      'm', coalesce(ml, cur -> 'm'),
      'w', case when ws is null then cur -> 'w' else jsonb_build_array(ws ->> 'x') end
    ))
  );
end $$;

-- ---------------------------------------------------------------- account

-- officine di cui la persona è titolare, e se ne è l'unico titolare (da chiudere con l'account). Solo il server.
create or replace function public.account_workshops(p_user uuid) returns table (workshop_id uuid, sole_owner boolean)
language sql stable security definer set search_path = '' as $$
  select m.workshop_id, ponte_private.owners_left(m.workshop_id, p_user) = 0
  from public.members m
  join public.workshops w on w.id = m.workshop_id and w.deleted_at is null
  where m.user_id = p_user and m.removed_at is null and m.role = 'owner'
$$;

-- ---------------------------------------------------------------- permessi sulle funzioni

revoke execute on all functions in schema public from public, anon;
grant execute on function
  public.me(),
  public.create_workshop(text, jsonb),
  public.delete_workshop(uuid),
  public.create_invite(uuid, text, public.member_role),
  public.revoke_invite(text),
  public.join_workshop(text, text),
  public.remove_member(uuid, uuid),
  public.set_member(uuid, uuid, public.member_role, text),
  public.leave_workshop(uuid),
  public.push(uuid, jsonb),
  public.pull(uuid, jsonb, integer)
to authenticated;
revoke execute on function public.account_workshops(uuid) from authenticated;
grant execute on function public.account_workshops(uuid) to service_role;
revoke all on all tables in schema ponte_private from public, anon, authenticated;
revoke execute on all functions in schema ponte_private from public, anon, authenticated;
grant execute on function ponte_private.role_in(uuid), ponte_private.is_member(uuid), ponte_private.my_workshops() to authenticated;
