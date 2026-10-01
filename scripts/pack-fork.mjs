// Distribution-only change: the upstream source/package layout remains intact.
import { cpSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { execFileSync } from 'node:child_process';
const output = resolve(process.argv[2] ?? '/tmp/json-tree-artifacts');
mkdirSync(output, {recursive:true});
const stage = mkdtempSync(join(tmpdir(),'json-tree-pack-'));
const manifest = JSON.parse(readFileSync('package/package.json','utf8'));
manifest.name='@vorm-labs/mantine-json-tree';
manifest.version=process.argv[3] ?? '3.4.3-vorm.1';
manifest.repository='https://github.com/vorm-labs/mantine-json-tree.git';
manifest.files=['dist','LICENSE','README.md','UPSTREAM-NOTE.md'];
writeFileSync(join(stage,'package.json'),JSON.stringify(manifest,null,2)+'\n');
cpSync('package/dist',join(stage,'dist'),{recursive:true});
for(const file of ['LICENSE','README.md','UPSTREAM-NOTE.md'])cpSync(file,join(stage,file));
process.stdout.write(execFileSync('npm',['pack','--json','--pack-destination',output],{cwd:stage,env:{...process.env,npm_config_cache:join(tmpdir(),'json-tree-npm-cache')}}));
