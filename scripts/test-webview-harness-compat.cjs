const fs=require('node:fs');
const path=require('node:path');
const {execFileSync}=require('node:child_process');
const acorn=require('acorn');
const repoRoot=path.resolve(__dirname,'..');
const harness=path.join(repoRoot,'scripts/ui_capture.py');
const extractor=String.raw`
import ast,json,sys
source=open(sys.argv[1],encoding='utf-8').read()
tree=ast.parse(source,filename=sys.argv[1])

def render(node):
    if isinstance(node,ast.Constant) and isinstance(node.value,str):
        return node.value
    if isinstance(node,ast.JoinedStr):
        out=[]
        for value in node.values:
            if isinstance(value,ast.Constant) and isinstance(value.value,str):
                out.append(value.value)
            elif isinstance(value,ast.FormattedValue):
                out.append('"__MIAAD_HARNESS_PLACEHOLDER__"')
            else:
                return None
        return ''.join(out)
    return None

snippets=[]
for node in ast.walk(tree):
    if isinstance(node,ast.Call) and isinstance(node.func,ast.Name) and node.func.id=='evaluate' and len(node.args)>=2:
        code=render(node.args[1])
        if code is not None:
            snippets.append({'line':node.lineno,'code':code})
print(json.dumps(sorted(snippets,key=lambda x:x['line'])))
`;
const snippets=JSON.parse(execFileSync('python3',['-c',extractor,harness],{encoding:'utf8'}));
if(!snippets.length)throw new Error('No WebView-injected Runtime.evaluate scripts found; harness extraction gate is stale.');
const checked=[];
for(const snippet of snippets){
  try{acorn.parse(snippet.code,{ecmaVersion:2019,sourceType:'script',allowAwaitOutsideFunction:false})}
  catch(error){throw new Error(`WebView69 harness syntax gate failed at ui_capture.py:${snippet.line}: ${error.message}`)}
  if(/\beval\s*\(|\bFunction\s*\(/.test(snippet.code))throw new Error(`Unsafe eval/Function in injected WebView harness script at ui_capture.py:${snippet.line}`);
  checked.push({line:snippet.line,bytes:Buffer.byteLength(snippet.code)});
}
const auditDir=path.join(repoRoot,'audit');fs.mkdirSync(auditDir,{recursive:true});
fs.writeFileSync(path.join(auditDir,'webview69-harness-syntax.json'),JSON.stringify({target:'ECMAScript 2019 classic script',role:'static supplemental gate; API26 WebView runtime remains authoritative',checked},null,2)+'\n');
console.log(`WebView69 injected-harness syntax gate PASS: ${checked.length} Runtime.evaluate scripts parse as ECMAScript 2019 classic scripts; no eval/Function workaround.`);
