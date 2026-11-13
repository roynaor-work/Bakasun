// SPDX-License-Identifier: CC0-1.0 — local report filtering; no renderer or network dependencies.
const table=document.querySelector('#clipTable'),search=document.querySelector('#search'),library=document.querySelector('#libraryFilter'),sort=document.querySelector('#sort');
if(table){
 const body=table.tBodies[0],rows=[...body.rows],count=document.querySelector('#visibleCount'),empty=document.querySelector('#empty');
 function update(){
  const query=(search?.value??'').trim().toLocaleLowerCase(),selected=library?.value??'',order=sort?.value??'score-asc';
  const name=row=>row.cells[0].textContent.trim();
  rows.sort((a,b)=>order==='score-desc'?Number(b.dataset.score)-Number(a.dataset.score):order==='name'?name(a).localeCompare(name(b)):order==='library'?a.dataset.library.localeCompare(b.dataset.library)||name(a).localeCompare(name(b)):Number(a.dataset.score)-Number(b.dataset.score));
  let visible=0;
  for(const row of rows){row.hidden=!!((selected&&row.dataset.library!==selected)||(query&&!row.dataset.search.toLocaleLowerCase().includes(query)));if(!row.hidden)visible++;body.append(row);}
  if(count)count.textContent=`${visible} קליפים`;if(empty)empty.hidden=visible!==0;
 }
 search?.addEventListener('input',update);library?.addEventListener('change',update);sort?.addEventListener('change',update);update();
}
const regressions=document.querySelector('#regressionsOnly');
regressions?.addEventListener('change',()=>{for(const row of document.querySelectorAll('#compareTable tbody tr[data-delta]'))row.hidden=regressions.checked&&!(Number(row.dataset.delta)<0);});
