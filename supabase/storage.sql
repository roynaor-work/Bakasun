-- גם מסמכי החברה (<org>/papers/*) ונתוני ההתחלה (<org>/seed/seed.json) יושבים כאן, פרטיים, רק לחברי הארגון.
-- הצילומים של החשבוניות והקבלות: דלי פרטי "receipts". כל עסק רואה רק את התיקייה שלו (org_id/חודש/קובץ).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('receipts', 'receipts', false, 15728640, array['image/jpeg','image/png','image/webp','application/pdf','application/json','text/csv','text/plain','text/markdown','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
on conflict (id) do nothing;

drop policy if exists receipts_read on storage.objects;
drop policy if exists receipts_write on storage.objects;
drop policy if exists receipts_update on storage.objects;
drop policy if exists receipts_delete on storage.objects;
create policy receipts_read on storage.objects for select using (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
create policy receipts_write on storage.objects for insert with check (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
create policy receipts_update on storage.objects for update using (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
create policy receipts_delete on storage.objects for delete using (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
select 'ok' as status;
