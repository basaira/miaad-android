const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const manifest=require('./compat-manifest.json');
const repoRoot=path.resolve(__dirname,'..');
const apk=path.resolve(process.argv[2]||path.join(repoRoot,'app/build/outputs/apk/debug/app-debug.apk'));
const generatedRoot=path.resolve(process.env.MIAAD_ASSET_ROOT||path.join(repoRoot,'app/build/generated/compatAssets'));
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const files=['index.html',...manifest.shippingScripts];
const verified=[];
for(const file of files){
  const generated=fs.readFileSync(path.join(generatedRoot,file));
  const packaged=execFileSync('unzip',['-p',apk,`assets/${file}`],{maxBuffer:20*1024*1024});
  if(!packaged.length)throw new Error(`APK is missing assets/${file}`);
  const generatedHash=hash(generated),apkHash=hash(packaged);
  if(generatedHash!==apkHash)throw new Error(`APK asset mismatch for ${file}: generated=${generatedHash} apk=${apkHash}`);
  verified.push({file,bytes:generated.length,sha256:generatedHash});
}
const auditDir=path.join(repoRoot,'audit');fs.mkdirSync(auditDir,{recursive:true});
fs.writeFileSync(path.join(auditDir,'apk-compat-assets.json'),JSON.stringify({apk:path.relative(repoRoot,apk),verified},null,2)+'\n');
console.log(`APK compatibility asset verification PASS: ${verified.length} generated delivery assets exactly match APK contents.`);
