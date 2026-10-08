import {PNG} from 'pngjs';
export const SIZE=512;
export function largestFilled(bits,w,h,keepAll=false){
 const visited=new Uint8Array(bits.length);let best=[];
 for(let start=0;start<bits.length;start++){if(!bits[start]||visited[start])continue;let q=[start];visited[start]=1;for(let i=0;i<q.length;i++){const k=q[i],x=k%w;for(const n of [x?k-1:-1,x<w-1?k+1:-1,k-w,k+w])if(n>=0&&n<bits.length&&bits[n]&&!visited[n]){visited[n]=1;q.push(n);}}if(q.length>best.length)best=q;}
 if(best.length<100)throw Error('No meaningful head silhouette');const result=new Uint8Array(bits.length);if(keepAll)result.set(bits);else best.forEach(k=>result[k]=1);
 const outside=new Uint8Array(bits.length),q=[];function add(k){if(!result[k]&&!outside[k]){outside[k]=1;q.push(k);}}
 for(let x=0;x<w;x++){add(x);add((h-1)*w+x);}for(let y=0;y<h;y++){add(y*w);add(y*w+w-1);}for(let i=0;i<q.length;i++){const k=q[i],x=k%w;for(const n of [x?k-1:-1,x<w-1?k+1:-1,k-w,k+w])if(n>=0&&n<bits.length)add(n);}for(let i=0;i<result.length;i++)if(!outside[i])result[i]=1;
 return {bits:result,width:w,height:h,disconnectedPixels:bits.reduce((a,b)=>a+b,0)-best.length};
}
export function segment(png,roi,threshold=30,keepAll=false){
 const [x0,y0,w,h]=roi;if(x0<0||y0<0||x0+w>png.width||y0+h>png.height)throw Error('ROI outside image');const bits=new Uint8Array(w*h);
 for(let y=0;y<h;y++){let left=[0,0,0],right=[0,0,0];for(let i=0;i<6;i++)for(let c=0;c<3;c++){left[c]+=png.data[((y+y0)*png.width+x0+i)*4+c]/6;right[c]+=png.data[((y+y0)*png.width+x0+w-i-1)*4+c]/6;}for(let x=0;x<w;x++){const k=((y+y0)*png.width+x0+x)*4;let distance=0;for(let c=0;c<3;c++){const bg=left[c]+(right[c]-left[c])*x/(w-1);distance+=(png.data[k+c]-bg)**2;}bits[y*w+x]=+(png.data[k+3]>128&&Math.sqrt(distance)>threshold);}}
 return largestFilled(bits,w,h,keepAll);
}
export function polygon(points){const minX=Math.floor(Math.min(...points.map(p=>p[0])))-3,minY=Math.floor(Math.min(...points.map(p=>p[1])))-3,w=Math.ceil(Math.max(...points.map(p=>p[0])))-minX+4,h=Math.ceil(Math.max(...points.map(p=>p[1])))-minY+4;const bits=new Uint8Array(w*h);for(let y=0;y<h;y++)for(let x=0;x<w;x++){let inside=false,px=x+minX+.5,py=y+minY+.5;for(let i=0,j=points.length-1;i<points.length;j=i++){let a=points[i],b=points[j];if((a[1]>py)!==(b[1]>py)&&px<(b[0]-a[0])*(py-a[1])/(b[1]-a[1])+a[0])inside=!inside;}bits[y*w+x]=+inside;}return largestFilled(bits,w,h);}
export function normalize(mask){const {bits,width:w,height:h}=mask;let minX=w,minY=h,maxX=0,maxY=0;for(let i=0;i<bits.length;i++)if(bits[i]){minX=Math.min(minX,i%w);maxX=Math.max(maxX,i%w);minY=Math.min(minY,Math.floor(i/w));maxY=Math.max(maxY,Math.floor(i/w));}const scale=440/(maxY-minY+1),center=(minX+maxX)/2,out=new Uint8Array(SIZE*SIZE);for(let y=0;y<SIZE;y++)for(let x=0;x<SIZE;x++){const sx=Math.round((x-SIZE/2)/scale+center),sy=Math.floor((y-36)/scale+minY);if(sx>=0&&sx<w&&sy>=0&&sy<h)out[y*SIZE+x]=bits[sy*w+sx];}return {bits:out,width:SIZE,height:SIZE,bounds:[minX,minY,maxX,maxY],aspect:(maxX-minX+1)/(maxY-minY+1)};}
export function pngMask(mask){const p=new PNG({width:mask.width,height:mask.height});for(let i=0;i<mask.bits.length;i++){p.data[i*4]=p.data[i*4+1]=p.data[i*4+2]=mask.bits[i]?30:245;p.data[i*4+3]=255;}return PNG.sync.write(p);}
export function iou(a,b){let intersection=0,union=0;for(let i=0;i<a.bits.length;i++){intersection+=a.bits[i]&&b.bits[i]?1:0;union+=a.bits[i]||b.bits[i]?1:0;}return intersection/union;}
