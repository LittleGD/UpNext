const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execSync}=require('child_process');
const dur=parseFloat(process.env.DUR||'16'), sub=parseInt(process.env.SUB||'3'), fps=30, out=process.env.OUT||'out.mp4', stage=process.env.STAGE||'stage3.html', W=1080,H=1920;
(async()=>{
 const dir=path.join(__dirname,'frames'); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir);
 const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:W,height:H},deviceScaleFactor:1});
 await pg.goto('file://'+path.join(__dirname,stage)); await pg.waitForFunction('window.__ready===true'); await pg.evaluate(()=>document.fonts.ready);
 // overflow / clipping check for text elements at sample times
 const times=await pg.evaluate(()=>window.__checkTimes||[]);
 for(const t of times){await pg.evaluate((t)=>window.__seek(t),t);const bad=await pg.evaluate(()=>{const out=[];for(const el of document.querySelectorAll('.h,.cap,.intro span,.logo .t,.end .n,.end .s')){const st=getComputedStyle(el);let vis=true,p=el;while(p&&p!==document.body){if(parseFloat(getComputedStyle(p).opacity)<0.5){vis=false;break;}p=p.parentElement;}if(!vis)continue;const r=el.getBoundingClientRect();if(r.width===0)continue;if(r.left<40||r.right>1040||r.top<60||r.bottom>1860)out.push(`${el.className||el.tagName} "${el.textContent.trim().slice(0,24)}" box=${Math.round(r.left)},${Math.round(r.top)},${Math.round(r.right)},${Math.round(r.bottom)}`);}return out;});if(bad.length)console.log('OVERFLOW t='+t.toFixed(2),bad.join(' | '));}
 const n=Math.round(dur*fps*sub); const t0=Date.now();
 for(let i=0;i<n;i++){const t=i/(fps*sub); await pg.evaluate((t)=>window.__seek(t),t); await pg.screenshot({path:path.join(dir,`f${String(i).padStart(5,'0')}.jpg`),type:'jpeg',quality:92});}
 console.log('frames',n,'in',((Date.now()-t0)/1000).toFixed(1)+'s'); await b.close();
 const w=Array(sub).fill('1').join(' ');
 execSync(`ffmpeg -loglevel error -y -framerate ${fps*sub} -i ${dir}/f%05d.jpg -vf "tmix=frames=${sub}:weights='${w}',select='not(mod(n\\,${sub}))',setpts=N/${fps}/TB" -r ${fps} -c:v libx264 -crf 18 -pix_fmt yuv420p ${out}`,{stdio:'inherit'});
 console.log('wrote',out);
})();
