const fs=require('node:fs');
const path=require('node:path');
const crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const repoRoot=path.resolve(__dirname,'..');
const lockPath=path.join(__dirname,'compat-toolchain-lock.json');
const lock=JSON.parse(fs.readFileSync(lockPath,'utf8'));
const sha256=value=>crypto.createHash('sha256').update(value).digest('hex');
const observed=[];

function packagePath(name){return path.join(repoRoot,'node_modules',...name.split('/'),'package.json')}
for(const entry of lock.packages){
 if(entry.ciPlatform&&entry.ciPlatform!==`${process.platform}-${process.arch}`)continue;
 const file=packagePath(entry.name);
 if(!fs.existsSync(file))throw new Error(`Locked compatibility package not installed: ${entry.name}`);
 const pkg=JSON.parse(fs.readFileSync(file,'utf8'));
 if(pkg.version!==entry.version)throw new Error(`Compatibility tool version mismatch ${entry.name}: installed=${pkg.version} locked=${entry.version}`);
 const raw=execFileSync('npm',['view',`${entry.name}@${entry.version}`,'dist.integrity','--json'],{encoding:'utf8'}).trim();
 const registryIntegrity=JSON.parse(raw);
 if(registryIntegrity!==entry.integrity)throw new Error(`Compatibility tool integrity mismatch ${entry.name}: registry=${registryIntegrity} locked=${entry.integrity}`);
 observed.push({name:entry.name,version:pkg.version,integrity:entry.integrity});
}
const esbuild=require('esbuild');
const acornPkg=JSON.parse(fs.readFileSync(packagePath('acorn'),'utf8'));
if(esbuild.version!=='0.28.2'||acornPkg.version!=='8.18.0')throw new Error('Compatibility transformer/parser versions are not the Phase 0.5 contract.');
const auditDir=path.join(repoRoot,'audit');fs.mkdirSync(auditDir,{recursive:true});
const report={lockVersion:lock.lockVersion,lockSha256:sha256(fs.readFileSync(lockPath)),mechanism:lock.mechanism,platform:`${process.platform}-${process.arch}`,observed};
fs.writeFileSync(path.join(auditDir,'compat-toolchain-lock-verification.json'),JSON.stringify(report,null,2)+'\n');
console.log(`Compatibility toolchain lock PASS: esbuild ${esbuild.version}, acorn ${acornPkg.version}, repository SRI lock ${report.lockSha256}.`);
