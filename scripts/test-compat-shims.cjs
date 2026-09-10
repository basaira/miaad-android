const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
let acorn;
try{acorn=require('acorn')}catch{acorn=null}

const repoRoot=path.resolve(__dirname,'..');
const root=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(repoRoot,'app/src/main/assets'));
const compatPath=path.join(root,'app-compat.js');
const compat=fs.readFileSync(compatPath,'utf8');

if(/\beval\s*\(|\bFunction\s*\(/.test(compat))throw new Error('Compatibility shim must not use eval/Function CSP workarounds.');

const sandbox={console};
const context=vm.createContext(sandbox);
vm.runInContext(`
this.window=this;
Object.defineProperty(Array.prototype,'at',{configurable:true,writable:true,value:undefined});
Object.defineProperty(Object,'fromEntries',{configurable:true,writable:true,value:undefined});
Object.defineProperty(String.prototype,'replaceAll',{configurable:true,writable:true,value:undefined});
delete this.globalThis;
`,context);
vm.runInContext(compat,context,{filename:compatPath});
const semantics=vm.runInContext(`(function(){
 const arr=[10,20,30];
 const at={positive:arr.at(1)===20,negative:arr.at(-1)===30,oobPositive:arr.at(3)===undefined,oobNegative:arr.at(-4)===undefined};
 const global={sameWindow:globalThis===window,sameClassicGlobal:globalThis===this};
 const ordered=Object.fromEntries([['beta',2],['alpha',1]]);
 const duplicate=Object.fromEntries([['k',1],['k',2]]);
 const proto=Object.fromEntries([['__proto__',{polluted:true}],['safe',1]]);
 const fromEntries={
  strings:ordered.beta===2&&ordered.alpha===1,
  ordering:Object.keys(ordered).join(',')==='beta,alpha',
  duplicateLastWins:duplicate.k===2,
  protoOwn:Object.prototype.hasOwnProperty.call(proto,'__proto__'),
  prototypeIntact:Object.getPrototypeOf(proto)===Object.prototype,
  noPrototypePollution:Object.prototype.polluted===undefined&&({}).polluted===undefined,
  protoValue:proto.__proto__&&proto.__proto__.polluted===true
 };
 let nonGlobalThrows=false;
 try{'aba'.replaceAll(/a/,'x')}catch(error){nonGlobalThrows=error instanceof TypeError}
 const replaceAll={
  literal:'a"b"'.replaceAll('"','""')==='a""b""',
  empty:'ab'.replaceAll('','-')==='-a-b-',
  replacementToken:'aba'.replaceAll('a','[$&]')==='[a]b[a]',
  globalRegexp:'aba'.replaceAll(/a/g,'x')==='xbx',
  nonGlobalRegexpThrows:nonGlobalThrows
 };
 return {at,global,fromEntries,replaceAll};
})()`,context);

for(const [group,checks] of Object.entries(semantics))for(const [name,ok] of Object.entries(checks))if(!ok)throw new Error(`Compatibility shim semantic failure: ${group}.${name}`);

let usages=[];
if(acorn){
 const manifest=require(path.join(repoRoot,'scripts/compat-manifest.json'));
 function walk(node){
  if(!node||typeof node!=='object')return;
  if(node.type==='CallExpression'&&node.callee&&node.callee.type==='MemberExpression'&&!node.callee.computed&&node.callee.property&&node.callee.property.name==='replaceAll'){
   const arg=node.arguments[0];
   usages.push(arg&&arg.type==='Literal'&&typeof arg.value==='string'?{kind:'literal-string',value:arg.value}:{kind:arg&&arg.regex?'regexp':arg?arg.type:'missing'});
  }
  for(const value of Object.values(node)){
   if(Array.isArray(value)){for(const child of value)if(child&&typeof child.type==='string')walk(child)}
   else if(value&&typeof value.type==='string')walk(value);
  }
 }
 for(const file of manifest.shippingScripts){
  const code=fs.readFileSync(path.join(root,file),'utf8');
  walk(acorn.parse(code,{ecmaVersion:'latest',sourceType:'script',allowAwaitOutsideFunction:true}));
 }
 const unsupported=usages.filter(x=>x.kind!=='literal-string');
 if(unsupported.length)throw new Error(`replaceAll usage escaped reviewed literal-string subset: ${JSON.stringify(unsupported)}`);
}

const mode=root.includes(`${path.sep}generated${path.sep}`)?'shipping':'source';
const auditDir=path.join(repoRoot,'audit');fs.mkdirSync(auditDir,{recursive:true});
const report={mode,root:path.relative(repoRoot,root),semantics,replaceAllProjectUsages:usages};
fs.writeFileSync(path.join(auditDir,`compat-shim-semantics-${mode}.json`),JSON.stringify(report,null,2)+'\n');
console.log(`Compatibility shim semantics ${mode} PASS: Array.at, globalThis, Object.fromEntries prototype safety, replaceAll behavior; reviewed replaceAll calls=${usages.length}.`);
