// SPDX-License-Identifier: CC0-1.0
// Original table controls and local-link adapters. No scores or metric data are changed.
const $=id=>document.getElementById(id),body=$('clipTable')?.tBodies[0];
if(body){
  const rows=Array.from(body.rows);
  function update(){
    const query=($('search')?.value??'').trim().toLowerCase(),library=$('libraryFilter')?.value??'',order=$('sort')?.value??'score-asc';
    const sorted=rows.slice().sort((a,b)=>order==='score-desc'?Number(b.dataset.score)-Number(a.dataset.score):order==='name'?a.cells[0].textContent.localeCompare(b.cells[0].textContent):order==='library'?a.dataset.library.localeCompare(b.dataset.library):Number(a.dataset.score)-Number(b.dataset.score));
    for(const row of sorted){row.hidden=Boolean(query&&!row.dataset.search.toLowerCase().includes(query))||Boolean(library&&row.dataset.library!==library);body.append(row);}
    const count=rows.filter(r=>!r.hidden).length;if($('visibleCount'))$('visibleCount').textContent=`${count} קליפים`;if($('empty'))$('empty').hidden=count!==0;
  }
  for(const id of ['search','libraryFilter','sort'])$(id)?.addEventListener('input',update);update();
}
$('regressionsOnly')?.addEventListener('change',()=>{for(const row of $('compareTable').tBodies[0].rows)row.hidden=$('regressionsOnly').checked&&!(row.dataset.delta!==''&&Number(row.dataset.delta)<0);});
for(const link of document.querySelectorAll('a[href]')){
  const url=new URL(link.href);
  if(url.pathname.endsWith('/verification/preview.html')){
    const target=new URL('../preview.html',import.meta.url),clip=url.searchParams.get('clip');if(clip)target.searchParams.set('clip',clip.split('--').at(-1));link.href=target.href;
  }else if(/\/verification\/(README|REPORT|LICENSES)\.md$/.test(url.pathname))link.href=new URL(url.pathname.endsWith('LICENSES.md')?'../LICENSES.md':'../REPORT.md',import.meta.url).href;
}
