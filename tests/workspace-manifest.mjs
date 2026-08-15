import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const root=path.resolve(process.argv[2]??'.');

function relativeFiles(directory,current=directory,result=[]){
  for(const entry of fs.readdirSync(current,{withFileTypes:true})){
    const absolute=path.join(current,entry.name);
    if(entry.isDirectory())relativeFiles(directory,absolute,result);
    else if(entry.isFile())result.push(path.relative(directory,absolute).split(path.sep).join('/'));
  }
  return result;
}

const files=relativeFiles(root).sort();
let bytes=0;
const rows=files.map(relative=>{
  const content=fs.readFileSync(path.join(root,...relative.split('/')));
  bytes+=content.length;
  return `${crypto.createHash('sha256').update(content).digest('hex')}  ${relative}\n`;
}).join('');
const sha256=crypto.createHash('sha256').update(rows).digest('hex');

console.log(JSON.stringify({
  algorithm:'sha256 of UTF-8 rows sorted by relative path',
  rowFormat:'<file_sha256><two spaces><relative_path>\\n',
  root,
  sha256,
  files:files.length,
  bytes,
},null,2));
