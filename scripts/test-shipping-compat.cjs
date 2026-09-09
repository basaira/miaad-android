const path=require('node:path');
const fs=require('node:fs');
const {auditRoot}=require('./audit-js-compat.cjs');
const manifest=require('./compat-manifest.json');
const repoRoot=path.resolve(__dirname,'..');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(repoRoot,'app/build/generated/compatAssets'));
const report=auditRoot(root,{parserVersion:2019});
if(!report.orderMatches)throw new Error('Generated index.html changed classic script execution order.');
if(report.unresolvedRuntime.length)throw new Error(`Unshimmed WebView 69 runtime APIs: ${JSON.stringify(report.unresolvedRuntime)}`);
for(const file of manifest.shippingScripts){
  const code=fs.readFileSync(path.join(root,file),'utf8');
  if(!code.startsWith(`/* GENERATED FOR ${manifest.runtime.syntaxTarget.toUpperCase()} BY ${manifest.tooling.transformer}. EDIT SOURCE, NOT THIS FILE. */`))throw new Error(`Missing generated boundary marker in ${file}`);
}
console.log(`Shipping compatibility gate PASS: ${manifest.shippingScripts.length} generated scripts parse as ECMAScript 2019 classic scripts, preserve load order, and expose no known unshimmed post-WebView-69 runtime APIs.`);
