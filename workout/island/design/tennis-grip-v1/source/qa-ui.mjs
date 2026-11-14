// SPDX-License-Identifier: CC0-1.0
// Local controls for the upstream diagnostic HTML. No scoring code runs here.
const $=id=>document.getElementById(id),body=$('clipTable')?.tBodies[0];
if(body){
 const rows=[...body.rows];
 const update=()=>{
  const term=($('search')?.value??'').trim().toLowerCase(),library=$('libraryFilter')?.value,sort=$('sort')?.value;
  rows.sort((a,b)=>sort==='score-desc'?Number(b.dataset.score)-Number(a.dataset.score):sort==='name'?a.cells[0].textContent.localeCompare(b.cells[0].textContent):sort==='library'?a.dataset.library.localeCompare(b.dataset.library):Number(a.dataset.score)-Number(b.dataset.score));
  let visible=0;for(const row of rows){row.hidden=Boolean(library&&row.dataset.library!==library)||!row.dataset.search.toLowerCase().includes(term);if(!row.hidden)visible++;body.append(row);}
  if($('visibleCount'))$('visibleCount').textContent=visible+' קליפים';if($('empty'))$('empty').hidden=visible!==0;
 };
 for(const id of ['search','libraryFilter','sort'])$(id)?.addEventListener('input',update);update();
}
