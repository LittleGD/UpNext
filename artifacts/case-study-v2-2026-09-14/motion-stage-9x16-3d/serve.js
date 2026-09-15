// tiny static server for the stage folder (ES modules need http, not file://)
const http=require('http'),fs=require('fs'),path=require('path');
const types={'.html':'text/html','.js':'text/javascript','.mjs':'text/javascript','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.woff2':'font/woff2','.m4a':'audio/mp4','.glb':'model/gltf-binary','.json':'application/json'};
module.exports=function serve(root){return new Promise(res=>{const srv=http.createServer((rq,rs)=>{const p=path.join(root,decodeURIComponent(rq.url.split('?')[0]));fs.readFile(p,(e,d)=>{if(e){rs.writeHead(404);rs.end();return;}rs.writeHead(200,{'Content-Type':types[path.extname(p)]||'application/octet-stream'});rs.end(d);});});srv.listen(0,'127.0.0.1',()=>res({srv,port:srv.address().port}));});};
