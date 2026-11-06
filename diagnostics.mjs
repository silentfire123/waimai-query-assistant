import fs from 'node:fs/promises';
import path from 'node:path';
export {diagnosticSummary} from './diagnostic-core.mjs';
export async function saveDiagnostic(dir,summary) {
 try {
  await fs.mkdir(dir,{recursive:true});
  const filename=Date.now()+'-'+summary.queryId+'.json';
  await fs.writeFile(path.join(dir,filename),JSON.stringify(summary,null,2));
  const names=(await fs.readdir(dir)).filter(n=>n.endsWith('.json')).sort().reverse();
  for(const name of names.slice(20))await fs.unlink(path.join(dir,name));
  return true;
 }catch{return false;}
}
