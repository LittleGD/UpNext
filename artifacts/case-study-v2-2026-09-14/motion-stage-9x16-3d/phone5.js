// Low-poly phone: chamfered (faceted) rounded rect, single-segment bevel, flat shading.
import * as THREE from 'three';
export function chamferRect(w,hh,rad,seg=3){const s=new THREE.Shape();const x=-w/2,y=-hh/2;const pts=[];const corner=(cx,cy,a0)=>{for(let i=0;i<=seg;i++){const a=a0+(Math.PI/2)*(i/seg);pts.push([cx+rad*Math.cos(a),cy+rad*Math.sin(a)]);}};
 corner(x+w-rad,y+hh-rad,0);corner(x+rad,y+hh-rad,Math.PI/2);corner(x+rad,y+rad,Math.PI);corner(x+w-rad,y+rad,1.5*Math.PI);
 s.moveTo(pts[0][0],pts[0][1]);for(const p of pts.slice(1))s.lineTo(p[0],p[1]);s.closePath();return s;}
export function flatRect(w,hh,rad,seg=3){const geo=new THREE.ShapeGeometry(chamferRect(w,hh,rad,seg),1);const uv=geo.attributes.uv,pos=geo.attributes.position;for(let i=0;i<uv.count;i++){uv.setXY(i,(pos.getX(i)+w/2)/w,(pos.getY(i)+hh/2)/hh);}return geo;}
export function makeLowPolyPhone(tex0,opts={}){
 const W=752,H=1620,R=112,SEG=opts.seg||3,DEPTH=26,BEV=10;
 const g=new THREE.Group();
 const bodyMat=new THREE.MeshStandardMaterial({color:opts.color||0x2a2a30,roughness:.42,metalness:.62,flatShading:true,envMapIntensity:1.1});
 const body=new THREE.Mesh(new THREE.ExtrudeGeometry(chamferRect(W,H,R,SEG),{depth:DEPTH,bevelEnabled:true,bevelThickness:BEV,bevelSize:BEV,bevelSegments:1,curveSegments:1}),bodyMat);
 body.geometry.translate(0,0,-DEPTH/2);g.add(body);
 const zf=DEPTH/2+BEV; // front face z
 const bezel=new THREE.Mesh(flatRect(W-18,H-18,R-8,SEG),new THREE.MeshBasicMaterial({color:0x050505}));bezel.position.z=zf+0.3;g.add(bezel);
 const scr=new THREE.Mesh(flatRect(716,1560,R-16,SEG),new THREE.MeshBasicMaterial({map:tex0,toneMapped:false}));scr.position.z=zf+0.6;g.add(scr);
 const gloss=new THREE.Mesh(flatRect(716,1560,R-16,SEG),new THREE.MeshPhysicalMaterial({color:0xffffff,transparent:true,opacity:.05,roughness:.12,metalness:0,clearcoat:1}));gloss.position.z=zf+0.9;g.add(gloss);
 // side buttons (flat shaded boxes)
 const btn=(x,y,len)=>{const m=new THREE.Mesh(new THREE.BoxGeometry(10,len,18),bodyMat);m.position.set(x,y,0);g.add(m);};
 btn(-W/2-2,520,90);btn(-W/2-2,380,120);btn(-W/2-2,220,120);btn(W/2+2,430,200);
 // back camera island (seen only at steep angles)
 const isl=new THREE.Mesh(new THREE.ExtrudeGeometry(chamferRect(230,230,40,2),{depth:10,bevelEnabled:true,bevelThickness:4,bevelSize:4,bevelSegments:1}),bodyMat);isl.rotation.y=Math.PI;isl.position.set(-W/2+160,H/2-160,-zf);g.add(isl);
 const lensMat=new THREE.MeshStandardMaterial({color:0x0b0b10,roughness:.2,metalness:.8,flatShading:true});
 [[-45,45],[45,-45],[-45,-45]].forEach(([dx,dy])=>{const l=new THREE.Mesh(new THREE.CylinderGeometry(34,34,8,6),lensMat);l.rotation.x=Math.PI/2;l.position.set(-W/2+160+dx,H/2-160+dy,-zf-14);g.add(l);});
 return {g,scr,zf};
}
