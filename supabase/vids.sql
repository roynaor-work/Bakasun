-- Private bucket bootstrap only. Use vids-signed.sql for family video access;
-- see ../NOTES.md. Never run the old public-bucket version of this file.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kidfit-vids', 'kidfit-vids', false, 62914560, array['video/*', 'image/*'])
on conflict (id) do update set public = false,
  file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Remove only the old permissive policies; preserve the live restrictive fence.
drop policy if exists kidfit_vids_select on storage.objects;
drop policy if exists kidfit_vids_insert on storage.objects;
drop policy if exists kidfit_vids_update on storage.objects;
drop policy if exists kidfit_vids_delete on storage.objects;
select 'vids ok' as status;
