const fs=require('node:fs');const os=require('node:os');const path=require('node:path');const {spawnSync}=require('node:child_process');const esbuild=require('esbuild');
const temp=fs.mkdtempSync(path.join(os.tmpdir(),'rivals-check-'));
try{for(const file of fs.readdirSync(__dirname).filter(x=>/^verify-.*\.ts$/.test(x)).sort()){
 const out=path.join(temp,file.replace(/\.ts$/,'.cjs'));
 esbuild.buildSync({entryPoints:[path.join(__dirname,file)],outfile:out,bundle:true,platform:'node',format:'cjs',define:{'import.meta.env':'{}'},logLevel:'warning'});
 const r=spawnSync(process.execPath,[out],{stdio:'inherit'});if(r.error)throw r.error;if(r.status!==0)process.exitCode=r.status||1;
}if(process.exitCode)throw Error('검증 실패');}finally{fs.rmSync(temp,{recursive:true,force:true});}
