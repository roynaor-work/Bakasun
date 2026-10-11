// Run with PGLITE_MODULE=work/sql-check/node_modules/@electric-sql/pglite/dist/index.js
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
const moduleUrl = process.env.PGLITE_MODULE ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href : import.meta.resolve('@electric-sql/pglite');
const { PGlite } = await import(moduleUrl);
const pgcrypto = { name: 'pgcrypto', setup: async () => ({ bundlePath: new URL('pgcrypto.tar.gz', moduleUrl) }) };
const db = new PGlite({ extensions: { pgcrypto } });
const secret = 'local-fake-signing-secret-at-least-32-characters';
try {
  await db.exec(`
    create role anon; create role authenticated;
    create role sql_editor nologin bypassrls; -- ordinary migration owner, not a superuser
    grant create on database postgres to sql_editor;
    create schema storage; create schema extensions; create schema vault;
    create extension pgcrypto with schema extensions;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id text primary key, bucket_id text, name text, updated_at timestamptz default now(), metadata jsonb);
    alter table storage.objects enable row level security;
    create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
    grant usage on schema storage, public to anon, authenticated;
    grant all on storage.objects to anon, authenticated;
    grant usage, create on schema public to sql_editor;
    grant usage on schema storage, extensions, vault to sql_editor;
    grant select on storage.objects, vault.decrypted_secrets to sql_editor;
    create policy unrelated_broad_policy on storage.objects for all to public using (true) with check (true);
  `);
  await db.query(`insert into vault.decrypted_secrets values ('kidfit_vids_jwt_secret', $1)`, [secret]);
  await db.exec(await readFile(new URL('../../supabase/family.sql', import.meta.url), 'utf8'));
  await db.exec(`insert into storage.buckets values ('kidfit-vids','kidfit-vids',true,62914560,array['video/*','image/*']);`);
  // Exact SQL supplied by Roy: the state already running in Supabase.
  await db.exec(`begin;
    update storage.buckets set public = false where id = 'kidfit-vids';
    drop policy if exists kidfit_vids_select on storage.objects;
    drop policy if exists kidfit_vids_insert on storage.objects;
    drop policy if exists kidfit_vids_update on storage.objects;
    drop policy if exists kidfit_vids_delete on storage.objects;
    drop policy if exists kidfit_vids_private on storage.objects;
    create policy kidfit_vids_private on storage.objects as restrictive for all to anon, authenticated
      using (bucket_id <> 'kidfit-vids') with check (bucket_id <> 'kidfit-vids');
    commit;`);
  const snapshot = async () => ({ policies: (await db.query(`select * from pg_policies where schemaname='storage' order by policyname`)).rows,
    buckets: (await db.query(`select * from storage.buckets order by id`)).rows });
  const before = await snapshot();
  const migration = await readFile(new URL('../../supabase/vids-signed.sql', import.meta.url), 'utf8');
  for (let run = 0; run < 2; run++) {
    await db.exec('set role sql_editor');
    const result = await db.exec(migration);
    await db.exec('reset role');
    assert.equal(result.at(-1).rows[0].status, 'vids signed ok');
    assert.deepEqual(await snapshot(), before);
  }
  await db.exec(`select public.family_register('TESTAAAA'); select public.family_register('TESTBBBB');
    insert into storage.buckets(id,name,public) values ('receipts','receipts',false);
    insert into storage.objects(id,bucket_id,name,updated_at,metadata) values
      ('legacy','kidfit-vids','TESTAAAA/squats','2026-10-11','{"mimetype":"video/mp4"}'),
      ('older','kidfit-vids','TESTAAAA/squats.90','2026-10-10','{"mimetype":"video/webm"}'),
      ('new','kidfit-vids','TESTAAAA/squats.100','2026-10-09','{"mimetype":"image/jpeg"}'),
      ('jump','kidfit-vids','TESTAAAA/jumping-jacks','2026-10-01','{}'),
      ('foreign','kidfit-vids','TESTBBBB/squats.200','2026-10-11','{}'),
      ('junk','kidfit-vids','TESTAAAA/nested/file','2026-10-11','{}'),
      ('bad-suffix','kidfit-vids','TESTAAAA/squats.mp4','2026-10-11','{}'),
      ('other','receipts','synthetic/file','2026-10-11','{}');`);
  const asRole = async (role, fn) => { await db.exec('set role ' + role); try { return await fn(); } finally { await db.exec('reset role'); } };
  for (const role of ['anon', 'authenticated']) await asRole(role, async () => {
    assert.equal((await db.query(`select * from storage.objects where bucket_id='kidfit-vids'`)).rows.length, 0);
    assert.equal((await db.query(`select * from storage.objects where bucket_id='receipts'`)).rows.length, 1);
    assert.equal((await db.query(`update storage.objects set metadata='{}' where bucket_id='kidfit-vids' returning id`)).rows.length, 0);
    assert.equal((await db.query(`delete from storage.objects where bucket_id='kidfit-vids' returning id`)).rows.length, 0);
    await assert.rejects(db.query(`insert into storage.objects(id,bucket_id,name) values ('denied','kidfit-vids','TESTAAAA/squats.300')`), /row-level security/);
    const catalog = (await db.query(`select * from public.kidfit_vids_catalog('TESTAAAA')`)).rows;
    assert.deepEqual(catalog.map(r => [r.id, r.path, r.mime]), [
      ['jumping-jacks','TESTAAAA/jumping-jacks',''], ['squats','TESTAAAA/squats.100','image/jpeg']]);
    assert.ok(catalog.every(row => row.updated));
    await assert.rejects(db.query(`select * from public.kidfit_vids_catalog('WRONGXXX')`), /unknown family code/);
    await assert.rejects(db.query(`select * from public.kidfit_vids_catalog(null)`), /unknown family code/);
    for (const action of ['download','upload']) {
      await assert.rejects(db.query(`select public.kidfit_vids_access('WRONGXXX','WRONGXXX/squats.300',$1)`, [action]), /unknown family code/);
      for (const path of ['TESTBBBB/squats.200','TESTAAAA/../squats','TESTAAAA/squats.mp4','TESTAAAA/%2e%2e','TESTAAAA/squats.1/extra',null]) {
        await assert.rejects(db.query(`select public.kidfit_vids_access('TESTAAAA',$1,$2)`, [path,action]), /invalid family path/);
      }
    }
    await assert.rejects(db.query(`select public.kidfit_vids_access('TESTAAAA','TESTAAAA/squats.100','upload')`), /already exists/);
    await assert.rejects(db.query(`select public.kidfit_vids_access('TESTAAAA','TESTAAAA/new-id','upload')`), /Unix-seconds suffix/);
    await assert.rejects(db.query(`select public.kidfit_vids_access('TESTAAAA','TESTAAAA/missing','download')`), /video not found/);
    for (const action of ['delete','update',null]) await assert.rejects(db.query(`select public.kidfit_vids_access('TESTAAAA','TESTAAAA/squats',$1)`, [action]), /invalid video action/);
    await assert.rejects(db.query(`select kidfit_private.sign('{}')`), /permission denied/);
    await assert.rejects(db.query(`select * from vault.decrypted_secrets`), /permission denied/);
    for (const [action,path] of [['download','TESTAAAA/squats'],['download','TESTAAAA/squats.100'],['upload','TESTAAAA/squats.300']]) {
      const granted = (await db.query(`select public.kidfit_vids_access('TESTAAAA',$1,$2) as grant`, [path,action])).rows[0].grant;
      const url = new URL(granted.path, 'https://example.test');
      assert.equal(url.pathname, `/storage/v1/object/${action==='upload'?'upload/sign':'sign'}/kidfit-vids/${path}`);
      const [header,payload,signature] = url.searchParams.get('token').split('.');
      assert.deepEqual(JSON.parse(Buffer.from(header,'base64url')), { alg:'HS256',typ:'JWT' });
      assert.equal(signature, createHmac('sha256',secret).update(header+'.'+payload).digest('base64url'));
      const claims = JSON.parse(Buffer.from(payload,'base64url'));
      assert.equal(claims.url, 'kidfit-vids/'+path); assert.equal(claims.scope, action);
      assert.equal(claims.exp-claims.iat, 120); assert.equal(granted.expires, claims.exp);
      assert.ok(Math.abs(claims.iat - Date.now()/1000) < 5);
      assert.equal(claims.role, undefined);
      if (action==='upload') assert.equal(claims.upsert, false);
    }
  });
  // A mistaken bootstrap rerun must not reopen the live bucket or remove its fence.
  const fence = (await db.query(`select * from pg_policies where policyname='kidfit_vids_private'`)).rows;
  for (let run=0;run<2;run++) await db.exec(await readFile(new URL('../../supabase/vids.sql', import.meta.url), 'utf8'));
  assert.equal((await db.query(`select public from storage.buckets where id='kidfit-vids'`)).rows[0].public, false);
  assert.deepEqual((await db.query(`select * from pg_policies where policyname='kidfit_vids_private'`)).rows, fence);
  const count = (await db.query(`select count(*)::integer as n from storage.objects`)).rows[0].n;
  assert.equal(count, 8);
  await db.exec(`delete from vault.decrypted_secrets`);
  await assert.rejects(asRole('anon', () => db.query(`select public.kidfit_vids_access('TESTAAAA','TESTAAAA/squats','download')`)), /secret missing/);
  console.log('PGlite: non-superuser migration twice, unchanged Storage policies, RLS, RPC rejection, latest versions, HS256, 120s expiry and private bootstrap passed');
} finally { await db.close(); }
