// Chunked, resumable renderer: relaunches headless Chromium every CHUNK frames (software GL leaks memory over long runs).
const {chromium}=require('playwright');
// Playwright traps SIGTERM (closes the browser) and the loop would relaunch it; exit for real so a killed render stays dead.
for(const sig of ['SIGTERM','SIGINT'])process.on(sig,()=>{console.log('stopped by',sig);process.exit(1);});const fs=require('fs');const path=require('path');const {execSync}=require('child_process');const serve=require('./serve.js');
const dur=parseFloat(process.env.DUR||'16'), outFps=parseInt(process.env.FPS||'30'), sub=parseInt(process.env.SUB||'1'), out=process.env.OUT||'out.mp4', stage=process.env.STAGE||'stage4.html', W=1080,H=1920, CHUNK=parseInt(process.env.CHUNK||'150'), RESUME=process.env.RESUME==='1';
const dir=path.join(__dirname,'frames'); if(!RESUME){fs.rmSync(dir,{recursive:true,force:true});} fs.mkdirSync(dir,{recursive:true});
const n=Math.round(dur*outFps*sub); const fname=i=>path.join(dir,`f${String(i).padStart(5,'0')}.jpg`);
async function openPage(port){const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--disable-dev-shm-usage']});const pg=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});pg.on('pageerror',e=>console.log('pageerror:',e.message));await pg.goto(`http://127.0.0.1:${port}/${stage}`);await pg.waitForFunction('window.__ready===true',{timeout:180000});await pg.evaluate(()=>document.fonts.ready);return {b,pg};}
(async()=>{
 const {srv,port}=await serve(__dirname); const t0=Date.now();
 let start=0; while(start<n&&fs.existsSync(fname(start)))start++; if(start>0)console.log('resuming at',start);
 let checked=false;
 while(start<n){
  let b,pg; try{({b,pg}=await openPage(port));}catch(e){console.log('launch failed',e.message);continue;}
  if(!checked){const times=await pg.evaluate(()=>window.__checkTimes||[]);for(const t of times){await pg.evaluate((t)=>window.__seek(t),t);const bad=await pg.evaluate(()=>{const out=[];for(const el of document.querySelectorAll('.h .w,.intro span,.wm,.sub,.cta,.badges img,.soon')){let vis=true,p=el;while(p&&p!==document.body){const st=getComputedStyle(p);if(st.display==='none'||parseFloat(st.opacity)<0.5){vis=false;break;}p=p.parentElement;}if(!vis)continue;const r=el.getBoundingClientRect();if(r.width===0)continue;if(r.left<40||r.right>1040||r.top<60||r.bottom>1860)out.push(`${el.className} "${el.textContent.trim().slice(0,24)}" ${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);}return out;});if(bad.length)console.log('OVERFLOW t='+t.toFixed(2),bad.join(' | '));}checked=true;}
  const end=Math.min(n,start+CHUNK); let ok=true;
  try{for(let i=start;i<end;i++){const t=i/(outFps*sub);await pg.evaluate((t)=>window.__seek(t),t);await pg.screenshot({path:fname(i),type:'jpeg',quality:92});}}catch(e){console.log('chunk failed at',start,e.message.split('\n')[0]);ok=false;}
  try{await b.close();}catch(e){}
  if(ok){start=end;console.log('frames',start,'/',n,((Date.now()-t0)/1000).toFixed(0)+'s');} else {while(start<n&&fs.existsSync(fname(start)))start++;}
 }
 srv.close();
 if(sub>1){const w=Array(sub).fill('1').join(' ');execSync(`ffmpeg -loglevel error -y -framerate ${outFps*sub} -i ${dir}/f%05d.jpg -vf "tmix=frames=${sub}:weights='${w}',select='not(mod(n\\,${sub}))',setpts=N/${outFps}/TB" -r ${outFps} -c:v libx264 -crf 18 -pix_fmt yuv420p ${out}`,{stdio:'inherit'});}
 else{execSync(`ffmpeg -loglevel error -y -framerate ${outFps} -i ${dir}/f%05d.jpg -c:v libx264 -crf 18 -pix_fmt yuv420p ${out}`,{stdio:'inherit'});}
 console.log('wrote',out);
})().catch(e=>{console.log('ERR',e.stack||e.message);process.exit(1);});
