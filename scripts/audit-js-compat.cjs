const fs=require('node:fs');
const path=require('node:path');
let acorn;
try{acorn=require('acorn')}catch(error){
  console.error('Missing acorn. Install the pinned Phase 0.5 parser with: npm install --no-save --package-lock=false acorn@8.18.0');
  throw error;
}
const manifest=require('./compat-manifest.json');
const repoRoot=path.resolve(__dirname,'..');

const runtimeRules=[
  ['Array.prototype.at',/\.at\s*\(/g,false],
  ['Object.fromEntries',/\bObject\.fromEntries\s*\(/g,false],
  ['Object.hasOwn',/\bObject\.hasOwn\s*\(/g,false],
  ['String.prototype.replaceAll',/\.replaceAll\s*\(/g,false],
  ['Promise.allSettled',/\bPromise\.allSettled\s*\(/g,false],
  ['Promise.any',/\bPromise\.any\s*\(/g,false],
  ['globalThis',/\bglobalThis\b/g,false],
  ['structuredClone',/\bstructuredClone\s*\(/g,false],
  ['crypto.randomUUID',/\bcrypto\.randomUUID\s*\(/g,false],
  ['Intl.RelativeTimeFormat',/\bIntl\.RelativeTimeFormat\b/g,false],
  ['Intl.ListFormat',/\bIntl\.ListFormat\b/g,false],
  ['Intl.Segmenter',/\bIntl\.Segmenter\b/g,false],
  ['WeakRef',/\bWeakRef\s*\(/g,false],
  ['FinalizationRegistry',/\bFinalizationRegistry\s*\(/g,false],
  ['Array.prototype.findLast',/\.findLast\s*\(/g,false],
  ['Array.prototype.findLastIndex',/\.findLastIndex\s*\(/g,false],
  ['Array.prototype.toSorted',/\.toSorted\s*\(/g,false],
  ['Array.prototype.toReversed',/\.toReversed\s*\(/g,false],
  ['Array.prototype.toSpliced',/\.toSpliced\s*\(/g,false]
];

function count(re,code){re.lastIndex=0;let n=0;while(re.exec(code))n++;return n}
function namesFromPattern(node,out=[]){
  if(!node)return out;
  if(node.type==='Identifier')out.push(node.name);
  else if(node.type==='ObjectPattern')for(const p of node.properties)namesFromPattern(p.value||p.argument,out);
  else if(node.type==='ArrayPattern')for(const e of node.elements)namesFromPattern(e,out);
  else if(node.type==='RestElement'||node.type==='AssignmentPattern')namesFromPattern(node.argument||node.left,out);
  return out;
}
function walk(node,fn,parent=null,functionDepth=0){
  if(!node||typeof node!=='object')return;
  fn(node,parent,functionDepth);
  const nextDepth=functionDepth+((/^Function/.test(node.type)||node.type==='ArrowFunctionExpression')?1:0);
  for(const [key,value] of Object.entries(node)){
    if(key==='parent'||key==='start'||key==='end'||key==='loc')continue;
    if(Array.isArray(value)){for(const child of value)if(child&&typeof child.type==='string')walk(child,fn,node,nextDepth)}
    else if(value&&typeof value.type==='string')walk(value,fn,node,nextDepth);
  }
}
function syntaxInventory(ast){
  const syntax={optionalChaining:0,nullishCoalescing:0,logicalAssignment:0,classFields:0,privateFields:0,asyncGenerators:0,staticClassBlocks:0,topLevelAwait:0,newerRegexp:[]};
  walk(ast,(node,parent,depth)=>{
    if(node.type==='ChainExpression')syntax.optionalChaining++;
    if(node.type==='LogicalExpression'&&node.operator==='??')syntax.nullishCoalescing++;
    if(node.type==='AssignmentExpression'&&['&&=','||=','??='].includes(node.operator))syntax.logicalAssignment++;
    if(node.type==='PropertyDefinition'||node.type==='FieldDefinition')syntax.classFields++;
    if(node.type==='PrivateIdentifier')syntax.privateFields++;
    if((/^Function/.test(node.type)||node.type==='ArrowFunctionExpression')&&node.async&&node.generator)syntax.asyncGenerators++;
    if(node.type==='StaticBlock')syntax.staticClassBlocks++;
    if(node.type==='AwaitExpression'&&depth===0)syntax.topLevelAwait++;
    if(node.type==='Literal'&&node.regex){const {pattern,flags}=node.regex;if(flags.includes('d')||flags.includes('v'))syntax.newerRegexp.push(`/${pattern}/${flags}`)}
  });
  return syntax;
}
function globalInventory(ast){
  const declared=[],assigned=[],windowWrites=[];
  for(const node of ast.body){
    if(node.type==='FunctionDeclaration'||node.type==='ClassDeclaration'){if(node.id)declared.push(node.id.name)}
    if(node.type==='VariableDeclaration')for(const d of node.declarations)namesFromPattern(d.id,declared);
  }
  walk(ast,node=>{
    if(node.type!=='AssignmentExpression')return;
    if(node.left.type==='Identifier')assigned.push(node.left.name);
    if(node.left.type==='MemberExpression'&&!node.left.computed&&node.left.object?.type==='Identifier'&&node.left.object.name==='window'&&node.left.property?.type==='Identifier')windowWrites.push(node.left.property.name);
  });
  return{declared:[...new Set(declared)],assigned:[...new Set(assigned)],windowWrites:[...new Set(windowWrites)]};
}
function runtimeInventory(code){
  const found=[];
  for(const [name,re] of runtimeRules){const occurrences=count(re,code);if(occurrences)found.push({name,occurrences,polyfill:manifest.runtimePolyfills[name]||null})}
  return found;
}
function auditRoot(root,{parserVersion='latest'}={}){
  const indexPath=path.join(root,'index.html');
  if(!fs.existsSync(indexPath))throw new Error(`Missing index.html in ${root}`);
  const index=fs.readFileSync(indexPath,'utf8');
  const loaded=[...index.matchAll(/<script\b[^>]*\bsrc=["']([^"']+\.js)["'][^>]*><\/script>/g)].map(m=>m[1]);
  const orderMatches=JSON.stringify(loaded)===JSON.stringify(manifest.shippingScripts);
  const files=[];
  for(const file of manifest.shippingScripts){
    const code=fs.readFileSync(path.join(root,file),'utf8');
    const ast=acorn.parse(code,{ecmaVersion:parserVersion,sourceType:'script',allowAwaitOutsideFunction:true});
    files.push({file,bytes:Buffer.byteLength(code),syntax:syntaxInventory(ast),runtime:runtimeInventory(code),globals:globalInventory(ast)});
  }
  const unresolvedRuntime=files.flatMap(f=>f.runtime.filter(r=>!r.polyfill).map(r=>({file:f.file,...r})));
  return{root:path.relative(repoRoot,root),parserVersion,loaded,orderMatches,files,unresolvedRuntime};
}

function main(){
  const mode=process.argv.includes('--shipping')?'shipping':'source';
  const rootArg=process.env.MIAAD_ASSET_ROOT|| (mode==='shipping'?path.join(repoRoot,'app/build/generated/compatAssets'):path.join(repoRoot,'app/src/main/assets'));
  const parserVersion=mode==='shipping'?2019:'latest';
  const report=auditRoot(path.resolve(rootArg),{parserVersion});
  for(const file of report.files){
    const syntax=Object.entries(file.syntax).filter(([,v])=>Array.isArray(v)?v.length:v).map(([k,v])=>`${k}:${Array.isArray(v)?v.length:v}`).join(',')||'legacy-safe';
    const runtime=file.runtime.map(r=>`${r.name}${r.polyfill?'[shim]':''}`).join(',')||'none';
    console.log(`${file.file} | syntax=${syntax} | runtime=${runtime} | globals=${file.globals.declared.length} declared/${file.globals.assigned.length} assigned/${file.globals.windowWrites.length} window writes`);
  }
  if(!report.orderMatches)throw new Error(`index.html script order diverges from manifest: ${JSON.stringify(report.loaded)}`);
  const auditDir=path.join(repoRoot,'audit');fs.mkdirSync(auditDir,{recursive:true});
  fs.writeFileSync(path.join(auditDir,`js-compat-${mode}.json`),JSON.stringify(report,null,2)+'\n');
  if(mode==='shipping'&&report.unresolvedRuntime.length)throw new Error(`Unshimmed WebView 69 runtime APIs: ${JSON.stringify(report.unresolvedRuntime)}`);
  console.log(`JS compatibility ${mode} audit PASS (${report.files.length} shipping scripts, parser=${parserVersion}).`);
}
if(require.main===module)main();
module.exports={auditRoot,runtimeRules};
