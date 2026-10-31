import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {soccerActionLabels,soccerRestartHint} from '../workout/island/minigames/soccer-session.mjs';
const config=JSON.parse(await readFile(new URL('../workout/island/data/config.json',import.meta.url),'utf8')).minigames.soccer;
const fixture=()=>({phase:'playing',role:'field',mode:'attack',controlled:0,ball:{owner:0,y:.22},players:[{id:0,role:'striker',hands:false}]});

test('restart controls explain the actual short/long actions through setup, preparation and release',()=>{
 for(const [type,short,long]of [['throwIn','חוץ קצר','חוץ ארוך'],['corner','מסירה קצרה','הרמה'],['goalKick','מסירה קצרה','בעיטה ארוכה']]){
  const s=fixture();s.restart={type};s.phase='restart';
  let labels=soccerActionLabels(s,config);assert.equal(labels.passText,short);assert.equal(labels.shotText,long);assert.equal(labels.icon,'pass');
  assert.match(soccerRestartHint(s),/מתארגנים/);
  s.phase='restartReady';assert.match(soccerRestartHint(s),/מסירה לקצרה/);
  s.restart.action={};assert.match(soccerRestartHint(s),/הכנה להוצאה/);
  s.phase='playing';s.restart=null;labels=soccerActionLabels(s,config);assert.equal(labels.passText,undefined);assert.equal(labels.shotText,undefined);assert.equal(soccerRestartHint(s),'');
 }
});

test('a keeper holding the ball gets separate hand and foot action names without changing outfield labels',()=>{
 const s=fixture();s.role='keeper';s.players[0].role='keeper';s.players[0].hands=true;
 let labels=soccerActionLabels(s,config);assert.equal(labels.passText,'זריקה ביד');assert.equal(labels.shotText,'בעיטה מהיד');assert.equal(labels.switchable,false);
 s.players[0].hands=false;s.ball.owner=null;s.mode='defense';labels=soccerActionLabels(s,config);
 assert.equal(labels.shot,'soccer.keeperDive');assert.equal(labels.shotText,undefined);
});
