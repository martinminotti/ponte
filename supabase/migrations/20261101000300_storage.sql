-- Foto delle schede: bucket privato "photos", percorsi <officina>/<scheda>/<foto>.jpg.
-- Si legge solo da membri dell'officina; si carica solo un file già annunciato con push() (la riga in public.photos
-- esiste e ha esattamente quel percorso): niente file estranei nello spazio dell'officina.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('photos', 'photos', false, 5242880, array['image/jpeg'])
on conflict (id) do update
  set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

create policy photos_object_read on storage.objects for select to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] in (select w::text from ponte_private.my_workshops() w));

create policy photos_object_insert on storage.objects for insert to authenticated
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.photos p
      where p.path = name and p.deleted_at is null and p.workshop_id in (select ponte_private.my_workshops())
    )
  );

-- caricamento ripetuto dopo un'interruzione (upsert)
create policy photos_object_update on storage.objects for update to authenticated
  using (bucket_id = 'photos' and (storage.foldername(name))[1] in (select w::text from ponte_private.my_workshops() w))
  with check (
    bucket_id = 'photos'
    and exists (
      select 1 from public.photos p
      where p.path = name and p.deleted_at is null and p.workshop_id in (select ponte_private.my_workshops())
    )
  );
