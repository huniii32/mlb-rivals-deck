import {spawnSync} from 'node:child_process';
import {copyFileSync,existsSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve,relative} from 'node:path';
import {loadEnv} from 'vite';
import {buildEventPreviewGuard} from './build-event-preview-guard.mjs';

const root=fileURLToPath(new URL('../',import.meta.url));
process.chdir(root);
const env={...loadEnv('production',root,'VITE_'),...process.env};
const privatePreview=!!env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== 'main';
// Before Access is configured, upload only a locked notice: not even static
// fallback (for example a Pages Functions quota failure) can expose the demo.
if(privatePreview && !(env.EVENT_ACCESS_TEAM_DOMAIN && env.EVENT_ACCESS_AUD && env.EVENT_ACCESS_EMAIL)){
  rmSync(resolve(root,'dist'),{recursive:true,force:true});
  await buildEventPreviewGuard(root);
  const locked='<!doctype html><html lang="ko"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex,nofollow"><title>운영자 전용 미리보기</title><h1>운영자 전용 미리보기</h1><p>접근 보호 설정을 준비하고 있습니다.</p></html>';
  writeFileSync(resolve(root,'dist/index.html'),locked);
  writeFileSync(resolve(root,'dist/404.html'),locked);
  console.log('비공개 미리보기: Access 설정 전에는 잠금 안내만 배포합니다.');
  process.exit(0);
}
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
  cwd:root,stdio:'inherit',env:{...env,VITE_BASE:'/',
    // Cloudflare supplies the Git branch for each deployment; local release builds default to production.
    VITE_DEPLOYMENT_CONTEXT: env.CF_PAGES_BRANCH && env.CF_PAGES_BRANCH !== 'main' ? 'preview' : 'production',
  },
});
if(result.error)throw result.error;
if(result.status!==0)process.exit(result.status??1);

// A branch preview includes a standalone, browser-only event walkthrough.
// It has no Supabase URL/key and is excluded from production/main builds.
if(privatePreview){
  const demo=spawnSync(process.execPath,['scripts/build-event-web-demo.mjs'],{cwd:root,stdio:'inherit',env});
  if(demo.error)throw demo.error;
  if(demo.status!==0)process.exit(demo.status??1);
  await buildEventPreviewGuard(root);
}

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
