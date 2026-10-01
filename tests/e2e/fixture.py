"""Fictional starting data for the browser tests: the app's own seed lives in the private cloud bucket, never in the repo."""
import json, os
HERE = os.path.dirname(os.path.abspath(__file__))
FIXTURE = json.load(open(os.path.join(HERE, 'fixture.json'), encoding='utf-8'))

async def seed(pg, base='http://localhost:8765/'):
    """Loads the fixture into the app's store (merging into what is there) and reloads the page."""
    await pg.goto(base + '#/settings'); await pg.wait_for_timeout(400)
    await pg.evaluate("""fx => { const K = 'bakasun.v1'; let st = {}; try { st = JSON.parse(localStorage.getItem(K) || '{}'); } catch (e) {}
      st.settings = st.settings || {}; for (const k of Object.keys(fx)) { const have = new Set((st[k] || []).map(x => x.id)); st[k] = (st[k] || []).concat(fx[k].filter(x => !have.has(x.id))); }
      localStorage.setItem(K, JSON.stringify(st)); }""", FIXTURE)
    await pg.reload(); await pg.wait_for_timeout(600)
