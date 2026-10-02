// Refresh only the generated native dependency; keep all Pocket bootstrap/security hooks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {execFileSync} from 'node:child_process';
const source=path.resolve(process.argv[2]||'.qa/pirate');
const expected='19e16f452519b60fe87b2ac70bdd4c85ead8139e';
const previous='baaeb9aec1dfb365104578582f3808a5f236f2a9';
const actual=execFileSync('git',['-c',`safe.directory=${source.replaceAll('\\','/')}`,'-C',source,'rev-parse','HEAD'],{encoding:'utf8'}).trim();
assert.equal(actual,expected,'native dependency must be the reviewed Pirate commit');
// รับ artifact จาก runner ได้โดยไม่ build เกมบน VPS
const dist=path.resolve(process.argv[3]||path.join(source,'client/dist'));
const target=path.resolve('pirate-fruit-offline');
const html=fs.readFileSync(path.join(dist,'index.html'),'utf8');
const entry=html.match(/<script\b[^>]*src="\.\/assets\/(index-[^"]+\.js)"/);
assert.ok(entry,'nested Vite entry must use a relative base');
const vendor=html.match(/href="\.\/assets\/(vendor-three-[^"]+\.js)"/);
assert.ok(vendor,'native build must retain the Three vendor boundary');
const bootstrapPath=path.join(target,'pocket-bootstrap.mjs');
const bootstrap=fs.readFileSync(bootstrapPath,'utf8');
assert.match(bootstrap,/await installPirateSaveSandbox\(\);/);
assert.equal([...bootstrap.matchAll(/await import\('\.\/assets\/index-[^']+\.js'\)/g)].length,1);
// ป้องกันทับassetชื่อเดิมที่มีbytesต่างกัน: รับเฉพาะเนื้อหาเดิมหรือชื่อhashใหม่
for(const relative of fs.readdirSync(path.join(dist,'assets'),{recursive:true})) {
  const incoming=path.join(dist,'assets',relative);
  const existing=path.join(target,'assets',relative);
  if(!fs.statSync(incoming).isFile()||!fs.existsSync(existing)) continue;
  assert.ok(fs.statSync(existing).isFile()&&fs.readFileSync(incoming).equals(fs.readFileSync(existing)),`asset collision: ${relative}`);
}
// Keep independent, exact pins in acceptance tests and post-deploy verifier.
// Only the already-reviewed old digest may be replaced, and all changes are staged
// with the new bytes in one commit, never by loosening source/hash assertions.
const pinFiles=[['tests/v90-pirate-fruit-player.mjs',3],['scripts/verify-live-v9-deployment.mjs',1]];
for(const [file,count] of pinFiles){
  const text=fs.readFileSync(file,'utf8');
  const oldCount=text.split(previous).length-1;
  const newCount=text.split(expected).length-1;
  assert.ok(oldCount===count||oldCount===0&&newCount===count,`unexpected independent source pin in ${file}`);
  fs.writeFileSync(file,text.replaceAll(previous,expected));
}
fs.cpSync(path.join(dist,'assets'),path.join(target,'assets'),{recursive:true});
fs.writeFileSync(bootstrapPath,bootstrap.replace(/await import\('\.\/assets\/index-[^']+\.js'\)/,`await import('./assets/${entry[1]}')`));
const indexPath=path.join(target,'index.html');
const index=fs.readFileSync(indexPath,'utf8');
assert.match(index,/pocket-bootstrap\.mjs\?v=16/);
fs.writeFileSync(indexPath,index.replace(/\.\/assets\/vendor-three-[^"']+\.js/,`./assets/${vendor[1]}`).replace('pocket-bootstrap.mjs?v=16','pocket-bootstrap.mjs?v=17'));
const sourcePath=path.join(target,'SOURCE.json');
const provenance=JSON.parse(fs.readFileSync(sourcePath,'utf8'));
provenance.ref=expected;provenance.commit=expected;
provenance.pocketPresentation.artifact=`github-actions/shader-cache-${expected.slice(0,8)}`;
provenance.artifactWorkflowRun=Number(process.env.PIRATE_ARTIFACT_WORKFLOW_RUN)||null;
assert.ok(Number.isSafeInteger(provenance.artifactWorkflowRun) && provenance.artifactWorkflowRun > 0, 'verified source artifact workflow run is required');
provenance.integrations.originalWorld.candidateOnly=true;
provenance.integrations.originalWorld.vitalsContract='pirate-vitals/1';
provenance.integrations.originalWorld.productionActivation='Requires the authenticated host and compatible server snapshot; no feature flags are enabled by this refresh.';
fs.writeFileSync(sourcePath,JSON.stringify(provenance,null,2)+'\n');
execFileSync('git',['add','--',...pinFiles.map(([file])=>file)]);
console.log(JSON.stringify({nativeSource:actual,entry:entry[1],vendor:vendor[1],bootstrapPreserved:true,independentPinsUpdated:pinFiles.map(([file])=>file)}));
