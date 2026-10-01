-- האימון שלי (workout/): סרטונים לתרגילים שרועי מצלם בטלפון שלו, ומגיעים לטלפון של הילד.
-- דלי ציבורי לקריאה (הנתיב סודי: <קוד משפחה>/<מזהה תרגיל>), כתיבה עם המפתח הציבורי (anon) רק לתיקייה של קוד משפחה
-- רשום (families, מ-family.sql; להריץ אותו קודם). מריצים פעם אחת ב-Supabase → SQL Editor → Run.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('kidfit-vids', 'kidfit-vids', true, 62914560, array['video/*', 'image/*'])
on conflict (id) do update set public = true, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists kidfit_vids_select on storage.objects;
drop policy if exists kidfit_vids_insert on storage.objects;
drop policy if exists kidfit_vids_update on storage.objects;
drop policy if exists kidfit_vids_delete on storage.objects;
create policy kidfit_vids_select on storage.objects for select to anon using (bucket_id = 'kidfit-vids');
create policy kidfit_vids_insert on storage.objects for insert to anon
  with check (bucket_id = 'kidfit-vids' and public.family_known((storage.foldername(name))[1]));
create policy kidfit_vids_update on storage.objects for update to anon
  using (bucket_id = 'kidfit-vids' and public.family_known((storage.foldername(name))[1]))
  with check (bucket_id = 'kidfit-vids' and public.family_known((storage.foldername(name))[1]));
create policy kidfit_vids_delete on storage.objects for delete to anon
  using (bucket_id = 'kidfit-vids' and public.family_known((storage.foldername(name))[1]));
select 'vids ok' as status;
