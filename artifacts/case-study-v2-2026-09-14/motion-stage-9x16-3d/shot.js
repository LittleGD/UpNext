// one-off: seek to given times and save full-res PNGs (quick layout checks without a full render)
const {chromium}=require('playwright');const path=require('path');const serve=require('./serve.js');
(async()=>{const {srv,port}=await serve(__dirname);const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});const pg=await b.newPage({viewport:{width:1080,height:1920}});pg.on('pageerror',e=>console.log('pageerror:',e.message));await pg.goto(`http://127.0.0.1:${port}/${process.env.STAGE||'stage5.html'}`);await pg.waitForFunction('window.__ready===true',{timeout:180000});await pg.evaluate(()=>document.fonts.ready);
for(const t of process.argv.slice(2).map(Number)){await pg.evaluate(t=>window.__seek(t),t);await pg.screenshot({path:path.join(__dirname,`shot_${t}.png`)});}
await b.close();srv.close();})().catch(e=>{console.log('ERR',e.message);process.exit(1);});
