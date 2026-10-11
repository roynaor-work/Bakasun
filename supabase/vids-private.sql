-- Run AFTER family.sql and vids.sql. See ../NOTES.md for Vault setup and verification.
-- No service_role key. The legacy HS256 JWT secret stays in Supabase Vault only.
begin;

update storage.buckets set public = false where id = 'kidfit-vids';

drop policy if exists kidfit_vids_select on storage.objects;
drop policy if exists kidfit_vids_insert on storage.objects;
drop policy if exists kidfit_vids_update on storage.objects;
drop policy if exists kidfit_vids_delete on storage.objects;

-- A dedicated NOLOGIN role: a signed deletion capability is NOT an anon session.
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'kidfit_vids_delete') then
    create role kidfit_vids_delete nologin noinherit;
  end if;
end $$;
grant kidfit_vids_delete to authenticator, supabase_storage_admin;
grant usage on schema storage, public to kidfit_vids_delete;
grant select, delete on storage.objects to kidfit_vids_delete;
grant select on storage.buckets to kidfit_vids_delete;

-- Only Storage's DELETE route may read a row as part of deletion. Listing,
-- direct SQL/REST, download, signing, copying and UPDATE get no permission.
create or replace function public.kidfit_vids_delete_allowed(object_name text)
returns boolean language sql stable set search_path = '' as $$
  with claims as (
    select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb as jwt
  )
  select coalesce(
    current_setting('storage.operation', true) in ('storage.object.delete', 'object.delete')
    and (jwt->>'role') = 'kidfit_vids_delete'
    and (jwt->>'scope') = 'delete'
    and (jwt->>'kidfit_path') = object_name
    and (jwt->>'exp')::bigint > extract(epoch from now()), false) from claims;
$$;
revoke all on function public.kidfit_vids_delete_allowed(text) from public;
-- The restrictive PUBLIC policy can evaluate this predicate for any role.
-- It exposes no data and returns false unless the signed deletion claims match.
grant execute on function public.kidfit_vids_delete_allowed(text) to public;

-- Restrictive fences also block unknown/broad pre-existing policies, including
-- ones addressed to PUBLIC. They affect this bucket only; receipts is unchanged.
drop policy if exists kidfit_vids_private on storage.objects;
create policy kidfit_vids_private on storage.objects as restrictive for all to public
  using (bucket_id <> 'kidfit-vids' or
    (current_user = 'kidfit_vids_delete' and public.kidfit_vids_delete_allowed(name)))
  with check (bucket_id <> 'kidfit-vids');
-- The dedicated role must never inherit access to another bucket via a PUBLIC
-- policy. Its capabilities authorize only the exact signed video path.
drop policy if exists kidfit_vids_delete_scope on storage.objects;
create policy kidfit_vids_delete_scope on storage.objects as restrictive for all to kidfit_vids_delete
  using (bucket_id = 'kidfit-vids' and public.kidfit_vids_delete_allowed(name))
  with check (false);
drop policy if exists kidfit_vids_delete_capability on storage.objects;
create policy kidfit_vids_delete_capability on storage.objects for select to kidfit_vids_delete
  using (bucket_id = 'kidfit-vids' and public.kidfit_vids_delete_allowed(name));
drop policy if exists kidfit_vids_delete_object on storage.objects;
create policy kidfit_vids_delete_object on storage.objects for delete to kidfit_vids_delete
  using (bucket_id = 'kidfit-vids' and public.kidfit_vids_delete_allowed(name));
drop policy if exists kidfit_vids_delete_bucket on storage.buckets;
create policy kidfit_vids_delete_bucket on storage.buckets for select to kidfit_vids_delete
  using (id = 'kidfit-vids');
drop policy if exists kidfit_vids_delete_bucket_scope on storage.buckets;
create policy kidfit_vids_delete_bucket_scope on storage.buckets as restrictive for select to kidfit_vids_delete
  using (id = 'kidfit-vids');
-- Prevent the browser from making the bucket public again under a broad policy.
drop policy if exists kidfit_vids_bucket_private on storage.buckets;
create policy kidfit_vids_bucket_private on storage.buckets as restrictive for update to public
  using (id <> 'kidfit-vids') with check (id <> 'kidfit-vids');

-- Private helpers are outside the exposed public schema and cannot be called
-- through PostgREST. No caller-controlled payload or expiry reaches the signer.
create schema if not exists kidfit_private;
revoke all on schema kidfit_private from public, anon, authenticated, kidfit_vids_delete;
create or replace function kidfit_private.base64url(value bytea)
returns text language sql immutable set search_path = '' as $$
  select rtrim(translate(replace(encode(value, 'base64'), E'\n', ''), '+/', '-_'), '=');
$$;
create or replace function kidfit_private.sign(claims jsonb)
returns text language plpgsql security definer set search_path = '' as $$
declare secret text; message text;
begin
  select decrypted_secret into secret from vault.decrypted_secrets
    where name = 'kidfit_vids_jwt_secret';
  if secret is null or length(secret) < 32 then
    raise exception 'Storage signing secret missing in Vault' using errcode = '55000';
  end if;
  message := kidfit_private.base64url(convert_to('{"alg":"HS256","typ":"JWT"}', 'UTF8'))
    || '.' || kidfit_private.base64url(convert_to(claims::text, 'UTF8'));
  return message || '.' || kidfit_private.base64url(extensions.hmac(convert_to(message, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'));
end $$;
revoke all on function kidfit_private.sign(jsonb), kidfit_private.base64url(bytea) from public, anon, authenticated, kidfit_vids_delete;

create or replace function kidfit_private.check_path(code text, path text)
returns text language plpgsql security definer set search_path = '' as $$
declare family text := public.family_norm(code);
begin
  -- family_known compares SHA256(code) to families.code_hash, not the folder name.
  if not public.family_known(code) then
    raise exception 'unknown family code' using errcode = '28000';
  end if;
  -- Exactly one family folder + one exercise id, no URLs, encoding or traversal.
  if path is null or path !~ '^[A-Z0-9]{8,12}/[a-z0-9][a-z0-9-]{0,79}$'
    or split_part(path, '/', 1) <> family then
    raise exception 'invalid family path' using errcode = '42501';
  end if;
  return path;
end $$;
revoke all on function kidfit_private.check_path(text, text) from public, anon, authenticated, kidfit_vids_delete;

-- Family-scoped metadata, never a Storage list call and never raw family codes
-- from another folder. Existing videos need no move or metadata backfill.
create or replace function public.kidfit_vids_catalog(code text)
returns table (id text, updated timestamptz, mime text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_known(code) then
    raise exception 'unknown family code' using errcode = '28000';
  end if;
  return query select split_part(o.name, '/', 2), o.updated_at,
    coalesce(o.metadata->>'mimetype', '')
    from storage.objects o where o.bucket_id = 'kidfit-vids'
    and split_part(o.name, '/', 1) = public.family_norm(code)
    and o.name ~ '^[A-Z0-9]{8,12}/[a-z0-9][a-z0-9-]{0,79}$'
    order by o.name;
end $$;

create or replace function public.kidfit_vids_access(code text, path text, action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare object_path text; claims jsonb; token text; issued bigint;
begin
  object_path := kidfit_private.check_path(code, path);
  if action is null or action not in ('download', 'upload', 'delete') then
    raise exception 'invalid video action' using errcode = '22023';
  end if;
  if action = 'upload' then
    if exists (select 1 from storage.objects o where o.bucket_id = 'kidfit-vids' and o.name = object_path) then
      raise exception 'video already exists; delete it explicitly first' using errcode = '23505';
    end if;
  elsif not exists (select 1 from storage.objects o where o.bucket_id = 'kidfit-vids' and o.name = object_path) then
    raise exception 'video not found' using errcode = 'P0002';
  end if;
  issued := floor(extract(epoch from clock_timestamp()));
  claims := jsonb_build_object('url', 'kidfit-vids/' || object_path,
    'scope', action, 'iat', issued, 'exp', issued + 120);
  if action = 'upload' then
    -- Storage's signed PUT uses this signed value, not the browser's x-upsert.
    -- Even two concurrent grants for the same path cannot overwrite a winner.
    claims := claims || jsonb_build_object('upsert', false);
  elsif action = 'delete' then
    claims := claims || jsonb_build_object('role', 'kidfit_vids_delete',
      'kidfit_path', object_path);
  end if;
  token := kidfit_private.sign(claims);
  if action = 'delete' then
    return jsonb_build_object('path', '/storage/v1/object/kidfit-vids/' || object_path,
      'token', token, 'expires', issued + 120);
  end if;
  return jsonb_build_object('path', '/storage/v1/object/' ||
    case when action = 'upload' then 'upload/sign/' else 'sign/' end ||
    'kidfit-vids/' || object_path || '?token=' || token, 'expires', issued + 120);
end $$;
revoke all on function public.kidfit_vids_catalog(text), public.kidfit_vids_access(text, text, text) from public;
grant execute on function public.kidfit_vids_catalog(text), public.kidfit_vids_access(text, text, text) to anon, authenticated;

-- Reload RPC signatures. The fence is effective even before Vault is configured.
notify pgrst, 'reload schema';
commit;
select 'vids private ok' as status;
