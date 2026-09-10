const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const compat=require('./compat-manifest.json');
const repoRoot=path.resolve(__dirname,'..');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(repoRoot,'app/build/generated/compatAssets'));
const output=process.argv[2]?path.resolve(process.argv[2]):null;
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');

if(!fs.existsSync(root)||!fs.statSync(root).isDirectory())throw new Error(`Missing generated compatibility asset tree: ${root}`);
function walk(dir){
 const out=[];
 for(const name of fs.readdirSync(dir).sort()){
  const full=path.join(dir,name),stat=fs.statSync(full);
  if(stat.isDirectory())out.push(...walk(full));
  else if(stat.isFile())out.push(full);
 }
 return out;
}
const files=walk(root).map(full=>{
 const data=fs.readFileSync(full);
 return {path:path.relative(root,full).split(path.sep).join('/'),bytes:data.length,sha256:sha256(data)};
});
const canonical=files.map(x=>`${x.path}\0${x.bytes}\0${x.sha256}\n`).join('');
const index=fs.readFileSync(path.join(root,'index.html'),'utf8');
const scriptOrder=[...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*><\/script>/g)].map(x=>x[1]);
if(JSON.stringify(scriptOrder)!==JSON.stringify(compat.shippingScripts))throw new Error('Generated asset manifest found script-order drift.');
const report={root:path.relative(repoRoot,root),treeSha256:sha256(canonical),fileCount:files.length,totalBytes:files.reduce((n,x)=>n+x.bytes,0),scriptOrder,files};
if(output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n')}
console.log(report.treeSha256);
