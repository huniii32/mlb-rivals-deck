import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,readFileSync,readdirSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {loadEnv} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const env={...loadEnv('production',root,'VITE_'),...process.env};
// A deployed site must not silently fall back to a device-only ranking.
const url=env.VITE_SUPABASE_URL,key=env.VITE_SUPABASE_ANON_KEY;
if(!url||!key)throw new Error('Cloudflare 빌드 환경에 VITE_SUPABASE_URL과 VITE_SUPABASE_ANON_KEY를 설정하세요. 값은 출력하지 않습니다.');
if(new URL(url).protocol!=='https:')throw new Error('VITE_SUPABASE_URL에는 HTTPS 주소를 사용하세요.');
let publicKey=key.startsWith('sb_publishable_');
if(!publicKey){
  try{publicKey=JSON.parse(Buffer.from(key.split('.')[1],'base64url').toString()).role==='anon';}catch{/* Reject non-public keys. */}
}
if(!publicKey)throw new Error('브라우저용 publishable 또는 anon 키만 사용하세요. service_role/secret 키는 사용할 수 없습니다.');

const result=spawnSync(process.platform==='win32'?'npm.cmd':'npm',['run','build'],{
  cwd:root,stdio:'inherit',env:{...env,VITE_BASE:'/'},
});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);

const dist=resolve(root,'dist');
const html=readFileSync(resolve(dist,'index.html'),'utf8');
if(!html.includes('src="/assets/')||html.includes('/mlb-rivals-deck/assets/'))throw new Error('Cloudflare 루트 경로 빌드를 확인하세요.');
function checkFiles(dir){
  for(const file of readdirSync(dir,{withFileTypes:true})){
    const path=resolve(dir,file.name);
    if(file.isDirectory())checkFiles(path);
    else if(/\.(exe|zip|py)$/i.test(file.name)||/^\.env(?:\.|$)/.test(file.name))throw new Error(`웹 배포 대상이 아닌 파일: ${relative(dist,path)}`);
  }
}
checkFiles(dist);
if(existsSync(resolve(dist,'downloads')))throw new Error('개인용 프로그램 다운로드 폴더를 배포할 수 없습니다.');
copyFileSync(resolve(root,'deployment/cloudflare/_headers'),resolve(dist,'_headers'));
console.log('Cloudflare Pages 준비 완료: dist/ · 루트 주소 · 공개 Supabase 키 · 개인용 프로그램 제외');
