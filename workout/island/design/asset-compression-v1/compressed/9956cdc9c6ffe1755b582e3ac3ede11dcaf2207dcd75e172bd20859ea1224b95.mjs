/** Missing translations are observable errors, including in browser regressions. */
export function createTranslator(strings,report=id=>console.error(`Missing translation: ${id}`)) {
  return (id,values={})=>{
    if(!Object.hasOwn(strings,id)){report(id);return '…';}
    return Object.entries(values).reduce((s,[key,value])=>s.replaceAll(`{${key}}`,String(value)),strings[id]);
  };
}
