-- רק המדיניות לדלי receipts, למקרה שיצירת הדלי עצמו נעשתה מלוח הבקרה (Storage ← New bucket ← receipts, Private).
-- מריצים אחרי שהדלי קיים. אותן הרשאות כמו ב-storage.sql.
drop policy if exists receipts_read on storage.objects;
drop policy if exists receipts_write on storage.objects;
drop policy if exists receipts_update on storage.objects;
drop policy if exists receipts_delete on storage.objects;
create policy receipts_read on storage.objects for select using (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
create policy receipts_write on storage.objects for insert with check (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
create policy receipts_update on storage.objects for update using (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
create policy receipts_delete on storage.objects for delete using (bucket_id = 'receipts' and (storage.foldername(name))[1] in (select my_orgs()::text));
select 'ok' as status;
