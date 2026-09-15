// Renders stage.html to frames at high temporal rate for motion blur, then ffmpeg blends to 30fps.
const {chromium}=require('playwright');const fs=require('fs');const path=require('path');const {execSync}=require('child_process');
const dur=parseFloat(process.env.DUR||'11.0'), sub=parseInt(process.env.SUB||'4'), fps=30, out=process.env.OUT||'out.mp4';
(async()=>{
 const dir=path.join(__dirname,'frames'); fs.rmSync(dir,{recursive:true,force:true}); fs.mkdirSync(dir);
 const b=await chromium.launch(); const pg=await b.newPage({viewport:{width:1080,height:1080},deviceScaleFactor:1});
 await pg.goto('file://'+path.join(__dirname,'stage.html')); await pg.waitForFunction('window.__ready===true'); await pg.evaluate(()=>document.fonts.ready);
 const n=Math.round(dur*fps*sub); const t0=Date.now();
 for(let i=0;i<n;i++){const t=i/(fps*sub); await pg.evaluate((t)=>window.__seek(t),t); await pg.screenshot({path:path.join(dir,`f${String(i).padStart(5,'0')}.jpg`),type:'jpeg',quality:92});}
 console.log('frames',n,'in',((Date.now()-t0)/1000).toFixed(1)+'s'); await b.close();
 execSync(`ffmpeg -loglevel error -y -framerate ${fps*sub} -i ${dir}/f%05d.jpg -vf "tmix=frames=${sub}:weights='1 1 1 1',select='not(mod(n\\,${sub}))',setpts=N/${fps}/TB" -r ${fps} -c:v libx264 -crf 18 -pix_fmt yuv420p ${out}`,{stdio:'inherit'});
 console.log('wrote',out);
})();
