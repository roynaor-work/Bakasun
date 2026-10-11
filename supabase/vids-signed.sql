-- Run after family.sql and the private-bucket fence already applied on 11/10/2026.
-- Vault setup: ../NOTES.md. This migration changes no Storage table or policy.
begin;
create schema if not exists kidfit_private;
revoke all on schema kidfit_private from public, anon, authenticated;

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
  return message || '.' || kidfit_private.base64url(
    extensions.hmac(convert_to(message, 'UTF8'), convert_to(secret, 'UTF8'), 'sha256'));
end $$;
create or replace function kidfit_private.check_path(code text, path text)
returns text language plpgsql security definer set search_path = '' as $$
begin
  if not public.family_known(code) then
    raise exception 'unknown family code' using errcode = '28000';
  end if;
  -- Legacy exercise IDs have no dot. New names add one Unix-seconds suffix.
  -- No subfolders, URLs, escaping, traversal or another family's path.
  if path is null or path !~ '^[A-Z0-9]{8,12}/[a-z0-9][a-z0-9-]{0,79}(\.[0-9]{1,20})?$'
    or split_part(path, '/', 1) <> public.family_norm(code) then
    raise exception 'invalid family path' using errcode = '42501';
  end if;
  return path;
end $$;
revoke all on function kidfit_private.sign(jsonb), kidfit_private.base64url(bytea),
  kidfit_private.check_path(text, text) from public, anon, authenticated;

create or replace function public.kidfit_vids_catalog(code text)
returns table (id text, path text, updated timestamptz, mime text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if not public.family_known(code) then
    raise exception 'unknown family code' using errcode = '28000';
  end if;
  return query
    select distinct on (split_part(split_part(o.name, '/', 2), '.', 1))
      split_part(split_part(o.name, '/', 2), '.', 1), o.name, o.updated_at,
      coalesce(o.metadata->>'mimetype', '')
    from storage.objects o
    where o.bucket_id = 'kidfit-vids'
      and split_part(o.name, '/', 1) = public.family_norm(code)
      and o.name ~ '^[A-Z0-9]{8,12}/[a-z0-9][a-z0-9-]{0,79}(\.[0-9]{1,20})?$'
    order by split_part(split_part(o.name, '/', 2), '.', 1),
      nullif(split_part(split_part(o.name, '/', 2), '.', 2), '')::numeric desc nulls last,
      o.updated_at desc nulls last, o.name desc;
end $$;
create or replace function public.kidfit_vids_access(code text, path text, action text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare object_path text; claims jsonb; issued bigint;
begin
  object_path := kidfit_private.check_path(code, path);
  if action is null or action not in ('download', 'upload') then
    raise exception 'invalid video action' using errcode = '22023';
  end if;
  if action = 'upload' then
    if exists (select 1 from storage.objects o where o.bucket_id = 'kidfit-vids' and o.name = object_path) then
      raise exception 'video already exists' using errcode = '23505';
    end if;
    if object_path !~ '\.[0-9]{1,20}$' then
      raise exception 'new video requires Unix-seconds suffix' using errcode = '22023';
    end if;
  elsif not exists (select 1 from storage.objects o where o.bucket_id = 'kidfit-vids' and o.name = object_path) then
    raise exception 'video not found' using errcode = 'P0002';
  end if;
  issued := floor(extract(epoch from clock_timestamp()));
  claims := jsonb_build_object('url', 'kidfit-vids/' || object_path,
    'scope', action, 'iat', issued, 'exp', issued + 120);
  if action = 'upload' then
    -- Two simultaneous grants cannot overwrite the object that arrives first.
    claims := claims || jsonb_build_object('upsert', false);
  end if;
  return jsonb_build_object('path', '/storage/v1/object/' ||
    case when action = 'upload' then 'upload/sign/' else 'sign/' end ||
    'kidfit-vids/' || object_path || '?token=' || kidfit_private.sign(claims),
    'expires', issued + 120);
end $$;
revoke all on function public.kidfit_vids_catalog(text), public.kidfit_vids_access(text, text, text) from public;
grant execute on function public.kidfit_vids_catalog(text), public.kidfit_vids_access(text, text, text) to anon, authenticated;
notify pgrst, 'reload schema';
commit;
select 'vids signed ok' as status;
