import { test } from 'node:test';
import assert from 'node:assert/strict';
import { templates, saveTemplate, removeTemplate, findTemplate, fillTemplate, isSaveTemplateCommand, templateRef, isSendCommand } from '../js/logic/templates.js';

const mem = () => { const m = {}; return { setting: (k, v) => { if (v === undefined) return m[k]; m[k] = v; } }; };

test('templates are saved, found loosely, filled with the name, and removed', () => {
  const s = mem();
  assert.deepEqual(templates(s), []);
  saveTemplate(s, 'סיור', 'היי היי {שם}, מה שלומך? אשמח לתאם סיור באולם ובחדר לדוגמה. תודה רבה!');
  saveTemplate(s, 'סיור', 'היי היי {שם}, נתאם סיור? תודה רבה!');
  assert.equal(templates(s).length, 1);
  assert.equal(findTemplate(templates(s), 'הסיור').name, 'סיור');
  assert.equal(findTemplate(templates(s), 'תזכורת'), null);
  assert.equal(fillTemplate(findTemplate(templates(s), 'סיור').text, { name: 'אורי שגב' }), 'היי היי אורי, נתאם סיור? תודה רבה!');
  assert.equal(fillTemplate('{event} ב{date} ב{place}', { event: 'סמינר', date: '19/10/2026', place: 'הרצליה' }), 'סמינר ב19/10/2026 בהרצליה');
  removeTemplate(s, 'סיור'); assert.deepEqual(templates(s), []);
});

test('the spoken forms', () => {
  assert.equal(isSaveTemplateCommand('שמרי את ההודעה כתבנית סיור'), 'סיור');
  assert.equal(isSaveTemplateCommand('שמרי כתבנית: תזכורת עדינה'), 'תזכורת עדינה');
  assert.equal(isSaveTemplateCommand('save as template tour'), 'tour');
  assert.equal(isSaveTemplateCommand('enregistre comme modèle visite'), 'visite');
  assert.equal(isSaveTemplateCommand('שמרי את הטלפון של דנה 052'), null);
  assert.equal(templateRef('את תבנית הסיור'), 'הסיור');
  assert.equal(templateRef('the template tour'), 'tour');
  assert.equal(templateRef('מגיעה ב-10'), null);
  assert.ok(isSendCommand('תשלחי')); assert.ok(isSendCommand('send it')); assert.ok(isSendCommand('envoie'));
  assert.ok(!isSendCommand('תשלחי לדנה')); assert.ok(!isSendCommand('send a message to Roy'));
});
