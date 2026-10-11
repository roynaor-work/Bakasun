// Optional PostgreSQL/RLS verification; see NOTES.md for the pinned PGlite setup.
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const moduleUrl = process.env.PGLITE_MODULE
  ? pathToFileURL(resolve(process.env.PGLITE_MODULE)).href
  : import.meta.resolve('@electric-sql/pglite');
const { PGlite } = await import(moduleUrl);
import { readFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
const pgcrypto = { name: 'pgcrypto', setup: async () => ({ bundlePath: new URL('pgcrypto.tar.gz', moduleUrl) }) };
const db = new PGlite({ extensions: { pgcrypto } });
await db.exec(`
create role anon; create role authenticated; create role authenticator; create role supabase_storage_admin;
create schema storage; create schema auth; create schema extensions; create schema vault;
create extension pgcrypto with schema extensions;
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id text primary key, bucket_id text, name text, updated_at timestamptz default now(), metadata jsonb);
alter table storage.objects enable row level security;
alter table storage.buckets enable row level security;
create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
create function auth.jwt() returns jsonb language sql stable as $$ select coalesce(nullif(current_setting('request.jwt.claims', true),''),'{}')::jsonb $$;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('kidfit_vids_jwt_secret','local-fake-signing-secret-at-least-32-characters');
grant usage on schema storage, public, auth to anon, authenticated;
grant all on storage.objects, storage.buckets to anon, authenticated;
create policy unrelated_broad_policy on storage.objects for all to public using (true) with check (true);
create policy unrelated_broad_bucket_policy on storage.buckets for all to public using (true) with check (true);
`);
for (const file of ['family.sql','vids.sql','vids-private.sql','vids-private.sql']) await db.exec(await readFile(new URL('../../supabase/' + file, import.meta.url),'utf8'));
await db.exec(`select public.family_register('TESTAAAA'); select public.family_register('TESTBBBB');
insert into storage.buckets (id,name,public) values ('receipts','receipts',false);
insert into storage.objects (id,bucket_id,name,metadata) values
 ('a','kidfit-vids','TESTAAAA/squat','{"mimetype":"video/mp4"}'),
 ('b','kidfit-vids','TESTBBBB/squat','{"mimetype":"video/mp4"}'),
 ('r','receipts','receipt-test/file', '{}');`);
async function asRole(role, callback) { await db.exec('set role ' + role); try { return await callback(); } finally { await db.exec('reset role'); } }
for (const role of ['anon','authenticated']) await asRole(role, async () => {
  assert.equal((await db.query(`select * from storage.objects where bucket_id='kidfit-vids'`)).rows.length, 0);
  assert.equal((await db.query(`select * from storage.objects where bucket_id='receipts'`)).rows.length, 1);
  assert.equal((await db.query(`update storage.objects set metadata='{}' where bucket_id='kidfit-vids' returning id`)).rows.length, 0);
  assert.equal((await db.query(`delete from storage.objects where bucket_id='kidfit-vids' returning id`)).rows.length, 0);
  await assert.rejects(db.query(`insert into storage.objects(id,bucket_id,name) values ('bad','kidfit-vids','TESTAAAA/jump')`), /row-level security/);
  assert.equal((await db.query(`update storage.buckets set public=true where id='kidfit-vids' returning id`)).rows.length, 0);
  assert.equal((await db.query(`select public.kidfit_vids_catalog('TESTAAAA')`)).rows.length, 1);
  await assert.rejects(db.query(`select public.kidfit_vids_catalog('WRONGXXX')`), /unknown family code/);
  for (const action of ['download','upload','delete']) {
    await assert.rejects(db.query(`select public.kidfit_vids_access('TESTAAAA','TESTBBBB/squat',$1)`,[action]), /invalid family path/);
    await assert.rejects(db.query(`select public.kidfit_vids_access('WRONGXXX','WRONGXXX/squat',$1)`,[action]), /unknown family code/);
  }
  await assert.rejects(db.query(`select public.kidfit_vids_access('TESTAAAA','TESTAAAA/squat','upload')`), /already exists/);
  await assert.rejects(db.query(`select kidfit_private.sign('{}')`), /permission denied/);
});
const grant = async action => (await asRole('anon', () => db.query(`select public.kidfit_vids_access('TESTAAAA',$1,$2) as grant`,[action==='upload'?'TESTAAAA/jump':'TESTAAAA/squat',action]))).rows[0].grant;
for (const action of ['download','upload','delete']) {
  const g=await grant(action), token=g.token || new URL(g.path,'https://example.test').searchParams.get('token');
  const [header,payload,signature]=token.split('.');
  assert.equal(signature, createHmac('sha256','local-fake-signing-secret-at-least-32-characters').update(header+'.'+payload).digest('base64url'));
  const claims=JSON.parse(Buffer.from(payload,'base64url').toString());
  assert.equal(claims.scope,action); assert.equal(claims.exp-claims.iat,120);
  if (action==='upload') assert.equal(claims.upsert,false);
  if (action==='delete') {
    await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify(claims)]);
    await asRole('kidfit_vids_delete', async () => {
      for (const operation of ['storage.object.list','storage.object.list_v2','storage.object.get_authenticated','storage.object.sign','']) {
        await db.query(`select set_config('storage.operation',$1,false)`,[operation]);
        assert.equal((await db.query(`select * from storage.objects`)).rows.length,0);
      }
      await db.query(`select set_config('storage.operation','storage.object.delete',false)`);
      assert.deepEqual((await db.query(`select id from storage.objects`)).rows.map(r=>r.id),['a']);
      assert.equal((await db.query(`delete from storage.objects where id='b' returning id`)).rows.length,0);
      const expired={...claims,exp:1}; await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify(expired)]);
      assert.equal((await db.query(`select * from storage.objects`)).rows.length,0);
      await db.query(`select set_config('request.jwt.claims',$1,false)`,[JSON.stringify(claims)]);
      assert.equal((await db.query(`delete from storage.objects where id='a' returning id`)).rows.length,1);
    });
  }
}
assert.equal((await db.query(`select public from storage.buckets where id='kidfit-vids'`)).rows[0].public,false);
console.log('PostgreSQL/PGlite: migration, repeat run, RPC, RLS, broad-policy fences, HMAC and expiry passed');
await db.close();
