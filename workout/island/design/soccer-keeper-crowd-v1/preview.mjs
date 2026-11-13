// SPDX-License-Identifier: CC0-1.0. Original controls for the unchanged QA report's local HTML.
const byId=id=>document.getElementById(id),body=byId('clipTable')?.tBodies[0];
if(body){const rows=[...body.rows];const update=()=>{
 const term=(byId('search')?.value??'').trim().toLowerCase(),library=byId('libraryFilter')?.value??'',sort=byId('sort')?.value??'score-asc';
 rows.sort((a,b)=>sort==='score-desc'?Number(b.dataset.score)-Number(a.dataset.score):sort==='name'?a.cells[0].textContent.localeCompare(b.cells[0].textContent):sort==='library'?a.dataset.library.localeCompare(b.dataset.library):Number(a.dataset.score)-Number(b.dataset.score));
 let visible=0;for(const row of rows){row.hidden=Boolean(library&&row.dataset.library!==library)||Boolean(term&&!row.dataset.search.toLowerCase().includes(term));if(!row.hidden)visible++;body.append(row);}
 if(byId('visibleCount'))byId('visibleCount').textContent=`${visible} קליפים`;if(byId('empty'))byId('empty').hidden=visible!==0;
};for(const id of['search','libraryFilter','sort'])byId(id)?.addEventListener('input',update);update();}
byId('regressionsOnly')?.addEventListener('change',()=>{for(const row of byId('compareTable')?.tBodies[0]?.rows??[])row.hidden=byId('regressionsOnly').checked&&!(row.dataset.delta!==''&&Number(row.dataset.delta)<0);});
