import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseMailLink, parseUrlHash, pickEmail } from '../js/logic/cloudLink.js';

test('the sign-in link from the mail gives the token hash, the app URL hash gives the session', () => {
  const link = 'https://ckfezrtrmfyqepozdzzp.supabase.co/auth/v1/verify?token=7ac7240bff70b20f2f6c9afe73ba4cb0c3053ebff6435c376fdbb65d&type=magiclink&redirect_to=http://localhost:3000';
  assert.deepEqual(parseMailLink('היי, הנה הקישור: ' + link), { tokenHash: '7ac7240bff70b20f2f6c9afe73ba4cb0c3053ebff6435c376fdbb65d', type: 'magiclink' });
  assert.equal(parseMailLink('סתם טקסט בלי קישור'), null);
  assert.deepEqual(parseUrlHash('#access_token=abc.def&expires_in=3600&refresh_token=r1&token_type=bearer&type=magiclink'), { accessToken: 'abc.def', refreshToken: 'r1', type: 'magiclink' });
  assert.equal(parseUrlHash('#/settings'), null);
  assert.equal(pickEmail('  ', 'info.virpro@gmail.com'), 'info.virpro@gmail.com');
  assert.equal(pickEmail('roy@x.co', 'info.virpro@gmail.com'), 'roy@x.co');
});
