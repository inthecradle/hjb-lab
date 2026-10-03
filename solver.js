(function (root) {
  'use strict';
  const NX=65, NY=49, XMAX=10, YMAX=7.5, DT=0.25;
  const directions=Array.from({length:16},(_,i)=>({x:Math.cos(i*Math.PI/8),y:Math.sin(i*Math.PI/8),angle:i*22.5}));
  directions.unshift({x:0,y:0,angle:null});
  const defaults={T:6,lambda:12,beta:0.32,barrier:2.6,radius:0.65,target:'region',gx:8,gy:5.6,sx:1.7,sy:2.1,speed:1.6};
  class Model {
    constructor(config={}) { this.p={...defaults,...config}; this.N=Math.round(this.p.T/DT); this.W=Array(this.N+1).fill(null); this.P=Array(this.N).fill(null); this.front=this.N; this.W[this.N]=new Float64Array(NX*NY); for(let j=0;j<NY;j++)for(let i=0;i<NX;i++)this.W[this.N][j*NX+i]=this.terminal(i*XMAX/(NX-1),j*YMAX/(NY-1)); }
    distance(x,y){return Math.max(0,Math.hypot(x-this.p.gx,y-this.p.gy)-(this.p.target==='region'?this.p.radius:0));}
    terminal(x,y){return this.p.lambda*this.distance(x,y)**2;}
    cost(x,y){return 0.06+0.016*((x-1.7)**2+(y-2.1)**2)+this.p.barrier*Math.exp(-((x-5.1)**2/0.65+(y-3.65)**2/1.35));}
    drift(x,y,t){const b=this.p.beta*(0.7+0.3*Math.cos(2*Math.PI*t/this.p.T));return {x:-0.32*b*(y-3.75),y:0.32*b*(x-5)};}
    control(a){return {x:directions[a].x*this.p.speed,y:directions[a].y*this.p.speed};}
    dynamics(x,y,a,t){const b=this.drift(x,y,t),u=this.control(a);return{x:b.x+u.x,y:b.y+u.y};}
    sample(arr,x,y){
      if(!arr||x < -1e-9||x > XMAX+1e-9||y < -1e-9||y > YMAX+1e-9)return Infinity;
      const xx=Math.max(0,Math.min(NX-1,x/XMAX*(NX-1))),yy=Math.max(0,Math.min(NY-1,y/YMAX*(NY-1)));
      const i=Math.min(NX-2,Math.floor(xx)),j=Math.min(NY-2,Math.floor(yy)),a=xx-i,b=yy-j,n=j*NX+i;
      return (1-b)*((1-a)*arr[n]+a*arr[n+1])+b*((1-a)*arr[n+NX]+a*arr[n+NX+1]);
    }
    candidates(x,y,k){
      if(k>=this.N||!this.W[k+1])return [];
      const stage=DT*this.cost(x,y);
      return directions.map((_,a)=>{const u=this.control(a),b=this.drift(x,y,k*DT),f={x:u.x+b.x,y:u.y+b.y},next={x:x+DT*f.x,y:y+DT*f.y};const future=this.sample(this.W[k+1],next.x,next.y);return {a,u,b,f,next,stage,future,q:stage+future};}).sort((a,b)=>a.q-b.q||a.a-b.a);
    }
    step(){
      if(this.front===0)return false;
      const k=this.front-1,w=new Float64Array(NX*NY),p=new Uint8Array(NX*NY),next=this.W[k+1],t=k*DT;
      for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){
        const x=i*XMAX/(NX-1),y=j*YMAX/(NY-1),b=this.drift(x,y,t),stage=DT*this.cost(x,y);let best=Infinity,action=0;
        for(let a=0;a<directions.length;a++){const u=this.control(a),v=stage+this.sample(next,x+DT*(b.x+u.x),y+DT*(b.y+u.y));if(v<best-1e-12){best=v;action=a;}}
        w[j*NX+i]=best;p[j*NX+i]=action;
      }
      this.W[k]=w;this.P[k]=p;this.front=k;return true;
    }
    solve(){while(this.step()){}return this;}
    rollout(start={x:this.p.sx,y:this.p.sy}){
      if(this.front>0)return [];
      let x=start.x,y=start.y,total=0;const path=[];
      for(let k=0;k<this.N;k++){const best=this.candidates(x,y,k)[0];path.push({x,y,k,cost:total,...best});total+=best.stage;x=best.next.x;y=best.next.y;}
      path.push({x,y,k:this.N,cost:total,terminal:this.terminal(x,y)});return path;
    }
    gradient(x,y,k){const h=XMAX/(NX-1),ax=Math.max(0,x-h),bx=Math.min(XMAX,x+h),ay=Math.max(0,y-h),by=Math.min(YMAX,y+h);return{x:(this.sample(this.W[k],bx,y)-this.sample(this.W[k],ax,y))/(bx-ax),y:(this.sample(this.W[k],x,by)-this.sample(this.W[k],x,ay))/(by-ay)};}
  }
  const api={Model,defaults,directions,NX,NY,XMAX,YMAX,DT};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.HJBSolver=api;
})(typeof window!=='undefined'?window:globalThis);
