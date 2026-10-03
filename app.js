(() => {
 'use strict';
 const {Model,defaults,directions,NX,NY,XMAX,YMAX,DT}=window.HJBSolver;
 const $=id=>document.getElementById(id), $$=s=>Array.from(document.querySelectorAll(s));
 const fmt=(v,n=2)=>Number.isFinite(v)?v.toFixed(n):'不可';
 const pair=v=>`(${fmt(v.x)}, ${fmt(v.y)})`;
 const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
 let model=new Model(),mode='terminal',k=model.N,layer='value',edit='inspect',running=false,lastTick=0;
 let selected={x:Math.round(defaults.sx/(XMAX/(NX-1)))*XMAX/(NX-1),y:Math.round(defaults.sy/(YMAX/(NY-1)))*YMAX/(NY-1)};
 let selectedAction=null,showAll=false,path=[],progress=0,focus='',candidates=[],active=null,frame=0;
 const canvas=$('map'),ctx=canvas.getContext('2d'),base=document.createElement('canvas'),bctx=base.getContext('2d');
 let backgroundKey='',geom=null,view='2d',yaw=-0.6,pitch=0.65,surface=null,surfaceKey='',surfaceModel=null;
 let cameraDrag=null,cameraFrame=0,suppressMapClick=false;
 const colors={mint:'#65e6d0',gold:'#ffcc66',lavender:'#8da7ff',text:'#e8eef5',muted:'#8296a9',line:'#334956'};
 function point(){return mode==='forward'&&path.length?path[k]:selected;}
 function displayTitle(){return mode==='terminal'?'未来の評価を、地形にする':mode==='backward'?'次の価値から、いまの最善手へ':'計算した方策で、現在から進む';}
 function stop(){running=false;progress=0;cancelAnimationFrame(frame);frame=0;}
 function setMode(next){
  stop();selectedAction=null;mode=next;
  if(next==='terminal')k=model.N;
  if(next==='backward'){if(model.front===model.N)model.step();k=model.front;}
  if(next==='forward'){model.solve();path=model.rollout();k=0;}
  render();
 }
 function restart(){stop();model=new Model(model.p);mode='terminal';k=model.N;path=[];selectedAction=null;backgroundKey='';render();}
 function backward(){
  if(mode!=='backward')mode='backward';
  if(model.front>0){model.step();k=model.front;}else k=0;
  if(model.front===0){setMode('forward');return;}
  selectedAction=null;render();
 }
 function forward(){if(k<model.N){k++;selectedAction=null;}else stop();render();}
 function tick(now){
  if(!running)return;
  const elapsed=now-lastTick,delay=Number($('speed').value);
  if(elapsed>=delay){lastTick=now;if(mode==='forward')forward();else backward();}
  if(running){if(mode==='forward'){progress=clamp((now-lastTick)/delay,0,1);draw();}frame=requestAnimationFrame(tick);}
 }
 function play(){
  if(running){stop();render();return;}
  if(mode==='terminal'){mode='backward';backward();}
  if(mode==='backward'&&model.front===0){model=new Model(model.p);k=model.N;backward();}
  if(mode==='forward'&&k===model.N)k=0;
  running=true;lastTick=performance.now();render();frame=requestAnimationFrame(tick);
 }
 function complete(){setMode('forward');}
 function configFromUI(){return{...model.p,T:+$('horizon').value,lambda:+$('weight').value,beta:+$('drift').value,barrier:+$('barrier').value,radius:+$('radius').value,target:$('target').value};}
 function updateControls(){
  const p=model.p;
  $('horizonOut').value=fmt(p.T,1);$('weightOut').value=fmt(p.lambda,1);$('driftOut').value=fmt(p.beta);$('barrierOut').value=fmt(p.barrier,1);$('radiusOut').value=fmt(p.radius);
  $('radius').disabled=p.target==='point';
 }
 function render(){
  const p=point(),isEnd=k===model.N;
  $('mapTitle').textContent=displayTitle();$('timeNow').textContent=`t = ${fmt(k*DT)}`;
  $('pointLabel').textContent=`x = ${pair(p)}`;
  $$('[data-step]').forEach(el=>{if(el.dataset.step===mode)el.setAttribute('aria-current','step');else el.removeAttribute('aria-current');});
  $('terminalEquation').classList.toggle('hidden',!isEnd);$('bellmanEquation').classList.toggle('hidden',isEnd);
  $('terminalDetail').classList.toggle('hidden',!isEnd);$('candidateDetail').classList.toggle('hidden',isEnd);
  $('firstStep').classList.toggle('hidden',mode==='forward');
  $('terminalValue').textContent=fmt(model.terminal(p.x,p.y));$('distanceValue').textContent=fmt(model.distance(p.x,p.y));$('lambdaValue').textContent=fmt(model.p.lambda,1);
  $('inspectTitle').textContent=isEnd?'この地点を、未来から評価':mode==='forward'?'現在地で、次の操作を選ぶ':'この地点なら、どの一手？';
  $('equationHint').textContent=isEnd?'終端では、目標までの距離だけを採点します。':'候補 u ごとに合計を比べ、最小の操作を選びます。';
  if(!isEnd)renderCandidates(p);else{candidates=[];active=null;}
  $('inspectorNote').textContent=isEnd?(mode==='forward'?'ここで期限 T に到達。終端コストを加えて評価します。':'この評価を、ひとつ前の時刻の判断に使います。'):selectedAction!==null&&active&&active.a!==candidates[0].a?'別の候補を表示中。方策には、合計が最小の操作が採用されます。':'今の地点の V₀Δt は全候補で共通。選択の差は、その先の価値から生まれます。';
  $('play').textContent=running?'Ⅱ 一時停止':mode==='forward'?'▶ 方策を実行':'▶ 逆算を再生';
  $('single').textContent=mode==='forward'?'1手進む →':'← 1手戻す';
  $('single').disabled=mode==='forward'?k===model.N:mode==='backward'&&model.front===0;
  $('complete').textContent=mode==='forward'?'終端まで進む':'現在まで計算';
  $('complete').disabled=mode==='forward'?k===model.N:mode==='backward'&&model.front===0;
  $('directionLabel').textContent=mode==='forward'?'実行の向き　0 → T':'計算の向き　T → 0';
  $('endLabel').textContent=`T = ${fmt(model.p.T,1)}`;
  $('mapBadge').textContent=mode==='forward'?(k===model.N?'期限 T に到達':k===0&&!running?'方策の準備完了：現在から実行':`方策 π${sub(k)} を実行中`):isEnd?'終端 T：この先はない':`t = ${fmt((k+1)*DT)} の価値から t = ${fmt(k*DT)} を計算`;
  $('mapHint').textContent=mode==='forward'?'実線：実行済みの軌跡 ／ 破線：この方策での予定経路':edit==='goal'?'クリックでゴールを移動。新しい終端条件から逆算します。':edit==='start'?'クリックで初期状態 x₀ を移動':isEnd?'地点をクリックして、終端コストを確認':'地点をクリックして、各操作の行き先とコストを比較';
  updateViewLabels();
  $('allCandidates').textContent=showAll?'上位5候補':'全17候補';
  renderTimeline();renderStory(p);updateControls();draw();
 }
 function sub(n){return String(n).split('').map(x=>'₀₁₂₃₄₅₆₇₈₉'[+x]).join('');}
 function actionLabel(a){if(a===0)return '○ 操作なし';const d=directions[a];const arrows=['→','↗','↑','↖','←','↙','↓','↘'];return `${arrows[Math.round(d.angle/45)%8]} ${fmt(d.angle,1).replace('.0','')}°`;}
 function renderCandidates(p){
  candidates=model.candidates(p.x,p.y,k);
  active=candidates.find(c=>c.a===selectedAction)||candidates[0];
  let rows=showAll?candidates:candidates.slice(0,5);
  if(!showAll&&!rows.includes(active))rows=[...rows.slice(0,4),active];
  const max=Math.max(...rows.filter(c=>Number.isFinite(c.q)).map(c=>c.q),.01);
  $('candidates').innerHTML=rows.map(c=>`<button class="candidate ${c.a===active.a?'active ':''}${c.q<=candidates[0].q+1e-9?'best':''}" data-action="${c.a}" aria-pressed="${c.a===active.a}" ${!Number.isFinite(c.q)?'disabled':''}><span>${actionLabel(c.a)}</span><span class="bar"><i style="width:${Number.isFinite(c.q)?Math.max(2,c.q/max*100):100}%"></i></span><span class="val">${fmt(c.q,3)}</span><span class="mark">${c.q<=candidates[0].q+1e-9?'最小':Number.isFinite(c.q)?'':'領域外'}</span></button>`).join('');
  $('stageValue').textContent=fmt(active.stage,3);$('futureValue').textContent=fmt(active.future,3);$('qValue').textContent=fmt(active.q,3);
  $('qLabel').textContent=active.q<=candidates[0].q+1e-9?'最小値 Wₖ':'この候補の Q';
  $('uValue').textContent=pair(active.u);$('bValue').textContent=pair(active.b);$('fValue').textContent=pair(active.f);
  $('nextState').textContent=`x′ = x + 0.25 f = ${pair(active.next)}`;
  drawVector(active);
 }
 function drawVector(c){
  const origin={x:78,y:78},scale=30;const xy=v=>({x:origin.x+v.x*scale,y:origin.y-v.y*scale});
  const u=xy(c.u),b=xy(c.b),f=xy(c.f);
  function arr(a,b,col,dash=false){return`<path d="M${a.x},${a.y} L${b.x},${b.y}" fill="none" stroke="${col}" stroke-width="2" ${dash?'stroke-dasharray="3 3"':''} marker-end="url(#v${col.slice(1)})"/>`;}
  const defs=Object.values({a:colors.mint,b:colors.gold,c:colors.lavender}).map(c=>`<marker id="v${c.slice(1)}" markerWidth="5" markerHeight="5" refX="4" refY="2.5" orient="auto"><path d="M0,0L5,2.5L0,5" fill="${c}"/></marker>`).join('');
  $('vector').innerHTML=`<defs>${defs}</defs><path d="M10 78H161M78 10V135" stroke="#2f404e" stroke-width="1"/><circle cx="78" cy="78" r="48" fill="none" stroke="#263745" stroke-dasharray="2 5"/>${arr(origin,u,colors.lavender)}${arr(origin,b,colors.gold)}${arr(b,f,colors.lavender,true)}${arr(origin,f,colors.mint)}<circle cx="78" cy="78" r="3" fill="#e8eef5"/><text x="8" y="13" fill="#a0adbb" font-size="10">速度ベクトル</text><text x="${clamp(f.x+6,6,163)}" y="${clamp(f.y-5,15,130)}" fill="${colors.mint}" font-size="13">f</text>`;
 }
 function renderTimeline(){
  $('timeline').style.gridTemplateColumns=`repeat(${model.N+1},minmax(0,1fr))`;
  $('timeline').innerHTML=Array.from({length:model.N+1},(_,i)=>`<button data-time="${i}" class="${model.W[i]?'known ':''}${i===model.N?'future ':''}${i===k?'current ':''}${mode==='forward'&&i<=k?'trajectory-time':''}" ${!model.W[i]?'disabled':''} aria-label="時刻 ${fmt(i*DT)}${model.W[i]?'、計算済み':'、未計算'}" ${i===k?'aria-current="true"':''} title="t = ${fmt(i*DT)}">${i===k?'●':''}</button>`).join('');
  $('progressText').textContent=mode==='forward'?(k===0&&!running?'逆算完了。「方策を実行」で開始':`実行 ${k} / ${model.N} 手`):`${model.N-model.front} / ${model.N} 手を計算`;
  $('timelineInstruction').textContent=mode==='forward'?'計算済みの方策を使い、時刻を右へ進める':'右端の終端条件から、左へ一層ずつ計算';
 }
 function renderStory(p){
  if(mode==='terminal'){
   $('storyEyebrow').textContent='TERMINAL CONDITION';$('storyTitle').textContent='未来の「評価基準」を先に置く';
   $('storyText').textContent=model.p.target==='region'?'TCZ(G) の内側は終端コストが 0。外側は距離の2乗でコストが増えます。この評価を、ひとつ前の時刻の判断に使います。':'点 G で終端コストが 0。離れるほど距離の2乗で増えます。G を動かすと、いま選ぶべき操作も変わり得ます。';
   $('liveStatus').textContent=`D = ${model.p.target==='region'?'TCZ(G)':'{G}'}　／　G = (${fmt(model.p.gx)}, ${fmt(model.p.gy)})`;
  }else if(mode==='backward'){
   $('storyEyebrow').textContent='BELLMAN BACKUP';$('storyTitle').textContent=model.front===0?'現在までの方策が、そろいました':'一手の選択を、全地点で計算する';
   $('storyText').textContent=model.front===0?'各時刻・各地点の「最善手」が得られました。「03 現在から実行」で、初期状態 x₀ から方策に沿って進んでみましょう。':'次の時刻の価値 Wₖ₊₁ は、すでに計算済み。各操作の行き先を f で求め、今の負荷とその先の最小コストを足して比べます。';
   $('liveStatus').textContent=`表示中の価値 W(x, ${fmt(k*DT)}) = ${fmt(model.sample(model.W[k],p.x,p.y),3)}　／　Δt = 0.25`;
  }else{
   const d=model.distance(p.x,p.y),last=path[path.length-1];
   $('storyEyebrow').textContent='FORWARD EXECUTION';$('storyTitle').textContent=k===model.N?(d<1e-8?'期限 T で目標内に到達':'期限 T での残り距離を確認'):'未来の評価が、いまの操作になる';
   $('storyText').textContent=k===model.N?'有限のペナルティなので、距離ゼロは強制されません。期限 T、終端の重み λ、環境の流れを変え、到達の仕方を比べられます。':'現在の座標と時刻を使って操作を選び、f に従って一手進みます。各地点の方策が先に計算されているため、初期状態を移しても進めます。';
   $('liveStatus').textContent=`目標まで ${fmt(d,3)}　／　累積負荷 ${fmt(p.cost,3)}${k===model.N?` ＋ 終端 ${fmt(last.terminal,3)} ＝ ${fmt(last.cost+last.terminal,3)}`:''}`;
  }
 }
 function updateViewLabels(){
  const quantity=layer==='value'?'W':'V₀';
  canvas.dataset.view=view;
  $('colorLabel').textContent=view==='3d'?`${quantity} の色・高さ`:layer==='value'?'W の相対色（時刻ごと）':'V₀ の相対色';
  $('cameraTools').classList.toggle('hidden',view!=='3d');
  $('heightNote').classList.toggle('hidden',view!=='3d');
  $('heightNote').textContent=`高さ：${quantity}（対数圧縮・時刻間で共通尺度）`;
  canvas.setAttribute('aria-label',`状態空間の${view==='3d'?'3D地形':'2D等高線'}。${view==='3d'?`高さは${quantity}。ドラッグで視点を回転。`:''}矢印キーで地点を移動。図をクリックして候補操作を比較できます。`);
 }
 function geometry(){
  const rect=canvas.getBoundingClientRect(),w=rect.width,h=rect.height,dpr=window.devicePixelRatio||1;
  if(canvas.width!==Math.round(w*dpr)||canvas.height!==Math.round(h*dpr)){canvas.width=Math.round(w*dpr);canvas.height=Math.round(h*dpr);backgroundKey='';}
  if(view==='3d'){
   const key=[k,layer,w,h,yaw,pitch].join('|');
   if(surfaceModel!==model||surfaceKey!==key){
    const costValues=Float64Array.from({length:NX*NY},(_,n)=>model.cost((n%NX)*XMAX/(NX-1),Math.floor(n/NX)*YMAX/(NY-1)));
    const maxCost=Math.max(...costValues);
    const maxValue=layer==='value'?Math.max(...model.W[model.N])+model.p.T*maxCost:maxCost;
    surface=window.HJBSurface.create({width:w,height:h,values:layer==='value'?model.W[k]:costValues,nx:NX,ny:NY,xmax:XMAX,ymax:YMAX,maxValue,yaw,pitch});
    surfaceKey=key;surfaceModel=model;backgroundKey='';
   }
   return {...surface,w,h,dpr};
  }
  const scale=Math.min((w-64)/XMAX,(h-46)/YMAX),pw=scale*XMAX,ph=scale*YMAX;
  const g={w,h,dpr,scale,x:43+(w-64-pw)/2,y:13,pw,ph};g.to=(x,y)=>({x:g.x+x*scale,y:g.y+(YMAX-y)*scale});return g;
 }
 function heat(v,max){const z=clamp(Math.log1p(v)/Math.log1p(Math.max(.001,max)),0,1),stops=[[15,47,59],[29,88,98],[78,125,122],[151,151,104],[205,159,95]],at=z*(stops.length-1),i=Math.min(stops.length-2,Math.floor(at)),t=at-i;return stops[i].map((c,j)=>Math.round(c+(stops[i+1][j]-c)*t));}
 function buildBackground(g){
  const key=[view,yaw,pitch,k,layer,g.w,g.h,model.p.T,model.p.lambda,model.p.gx,model.p.gy,model.p.radius,model.p.target,model.p.beta,model.p.barrier].join('|');
  if(backgroundKey===key)return;
  backgroundKey=key;base.width=canvas.width;base.height=canvas.height;bctx.setTransform(g.dpr,0,0,g.dpr,0,0);
  bctx.fillStyle='#0c141e';bctx.fillRect(0,0,g.w,g.h);
  if(view==='3d'){g.draw(bctx,heat,layer==='value'?'W':'V₀');return;}
  const values=layer==='value'?model.W[k]:Float64Array.from({length:NX*NY},(_,n)=>model.cost((n%NX)*XMAX/(NX-1),Math.floor(n/NX)*YMAX/(NY-1)));
  const max=Math.max(...values),imgCanvas=document.createElement('canvas');imgCanvas.width=NX;imgCanvas.height=NY;const ic=imgCanvas.getContext('2d'),img=ic.createImageData(NX,NY);
  for(let j=0;j<NY;j++)for(let i=0;i<NX;i++){const col=heat(values[j*NX+i],max),at=((NY-1-j)*NX+i)*4;img.data[at]=col[0];img.data[at+1]=col[1];img.data[at+2]=col[2];img.data[at+3]=220;}
  ic.putImageData(img,0,0);bctx.imageSmoothingEnabled=true;bctx.drawImage(imgCanvas,g.x,g.y,g.pw,g.ph);
  bctx.save();bctx.beginPath();bctx.rect(g.x,g.y,g.pw,g.ph);bctx.clip();
  const levels=[.035,.075,.14,.25,.42,.65,.85].map(z=>Math.expm1(z*Math.log1p(max)));
  bctx.strokeStyle='#d5ede929';bctx.lineWidth=.7;
  for(const threshold of levels){bctx.beginPath();for(let j=0;j<NY-1;j++)for(let i=0;i<NX-1;i++){
    const pts=[[i,j],[i+1,j],[i+1,j+1],[i,j+1]],vs=pts.map(([xx,yy])=>values[yy*NX+xx]),cuts=[];
    for(let e=0;e<4;e++){const n=(e+1)%4;if((vs[e]<threshold)!==(vs[n]<threshold)){const a=(threshold-vs[e])/(vs[n]-vs[e]);cuts.push(g.to((pts[e][0]+a*(pts[n][0]-pts[e][0]))*XMAX/(NX-1),(pts[e][1]+a*(pts[n][1]-pts[e][1]))*YMAX/(NY-1)));}}
    for(let e=0;e+1<cuts.length;e+=2){bctx.moveTo(cuts[e].x,cuts[e].y);bctx.lineTo(cuts[e+1].x,cuts[e+1].y);}
  }bctx.stroke();}
  bctx.strokeStyle='#c7dfec13';bctx.lineWidth=1;
  for(let x=0;x<=XMAX;x++){const a=g.to(x,0),b=g.to(x,YMAX);bctx.beginPath();bctx.moveTo(a.x,a.y);bctx.lineTo(b.x,b.y);bctx.stroke();}
  for(let y=0;y<=YMAX;y++){const a=g.to(0,y),b=g.to(XMAX,y);bctx.beginPath();bctx.moveTo(a.x,a.y);bctx.lineTo(b.x,b.y);bctx.stroke();}
  bctx.restore();bctx.strokeStyle='#526876';bctx.strokeRect(g.x,g.y,g.pw,g.ph);
  bctx.font='11px -apple-system,sans-serif';bctx.fillStyle='#a0adbb';bctx.textAlign='center';
  for(let x=0;x<=10;x+=2){const p=g.to(x,0);bctx.fillText(String(x),p.x,p.y+17);}
  bctx.textAlign='right';for(let y=0;y<=7;y+=2){const p=g.to(0,y);bctx.fillText(String(y),p.x-10,p.y+4);}
  bctx.fillText('x₁',g.x+g.pw+20,g.y+g.ph+16);bctx.fillText('x₂',g.x-15,g.y+9);
 }
 function arrow(c,a,b,color,width=1,head=4){
  const dx=b.x-a.x,dy=b.y-a.y,len=Math.hypot(dx,dy);if(len<1.2)return;
  const angle=Math.atan2(dy,dx),h=Math.min(head,len*.45);c.strokeStyle=color;c.fillStyle=color;c.lineWidth=width;c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.beginPath();c.moveTo(b.x,b.y);c.lineTo(b.x-h*Math.cos(angle-.5),b.y-h*Math.sin(angle-.5));c.lineTo(b.x-h*Math.cos(angle+.5),b.y-h*Math.sin(angle+.5));c.closePath();c.fill();
 }
 function label(text,x,y,color=colors.text){
  ctx.font='12px -apple-system,sans-serif';ctx.textAlign='left';const width=ctx.measureText(text).width+13;
  x=clamp(x,geom.x+3,geom.x+geom.pw-width-2);y=clamp(y,geom.y+17,geom.y+geom.ph-5);
  ctx.fillStyle='#0b121ce8';ctx.fillRect(x-4,y-13,width,19);ctx.fillStyle=color;ctx.fillText(text,x+2,y);
 }
 function draw(){
  geom=geometry();const g=geom;if(g.w<1)return;buildBackground(g);
  ctx.setTransform(g.dpr,0,0,g.dpr,0,0);ctx.clearRect(0,0,g.w,g.h);ctx.drawImage(base,0,0,g.w,g.h);
  ctx.save();ctx.beginPath();ctx.rect(g.x,g.y,g.pw,g.ph);ctx.clip();
  if($('field').checked&&k<model.N&&model.P[k]){
   for(let j=2;j<NY-2;j+=4)for(let i=2;i<NX-2;i+=4){const x=i*XMAX/(NX-1),y=j*YMAX/(NY-1),a=model.P[k][j*NX+i],f=model.dynamics(x,y,a,k*DT),pos=g.to(x,y),end=g.to(x+f.x*.16,y+f.y*.16);arrow(ctx,pos,end,'#9beddd7c',.9,3);}
  }
  const goal=g.to(model.p.gx,model.p.gy),radius=model.p.target==='region'&&view==='2d'?model.p.radius*g.scale:5;
  ctx.fillStyle='#65e6d021';ctx.strokeStyle=colors.mint;ctx.lineWidth=focus==='goal'?3:1.6;ctx.beginPath();
  if(view==='3d'&&model.p.target==='region'){
   for(let i=0;i<=64;i++){const a=i*Math.PI/32,q=g.to(model.p.gx+model.p.radius*Math.cos(a),model.p.gy+model.p.radius*Math.sin(a));if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);}
   ctx.closePath();
  }else ctx.arc(goal.x,goal.y,radius,0,2*Math.PI);
  ctx.fill();ctx.stroke();
  ctx.fillStyle=colors.mint;ctx.beginPath();ctx.arc(goal.x,goal.y,3,0,2*Math.PI);ctx.fill();
  label(model.p.target==='region'?'TCZ(G)':'G',goal.x+8,goal.y-radius-10,colors.mint);
  const start=g.to(model.p.sx,model.p.sy);ctx.strokeStyle='#e8eef5';ctx.lineWidth=1.2;ctx.beginPath();ctx.arc(start.x,start.y,5,0,2*Math.PI);ctx.stroke();label('x₀',start.x-19,start.y+23);
  if(mode==='forward'&&path.length){
   ctx.beginPath();path.forEach((p,i)=>{const q=g.to(p.x,p.y);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);});ctx.setLineDash([4,5]);ctx.strokeStyle='#ccefe277';ctx.lineWidth=1.6;ctx.stroke();ctx.setLineDash([]);
   ctx.beginPath();for(let i=0;i<=k;i++){const q=g.to(path[i].x,path[i].y);if(i===0)ctx.moveTo(q.x,q.y);else ctx.lineTo(q.x,q.y);}
   if(running&&k<model.N){const now=path[k],next=path[k+1],q=g.to(now.x+(next.x-now.x)*progress,now.y+(next.y-now.y)*progress);ctx.lineTo(q.x,q.y);}
   ctx.strokeStyle=colors.mint;ctx.lineWidth=2.6;ctx.stroke();
  }
  const p=point(),location=mode==='forward'&&running&&k<model.N?{x:p.x+(path[k+1].x-p.x)*progress,y:p.y+(path[k+1].y-p.y)*progress}:p,cp=g.to(location.x,location.y);
  if(active&&k<model.N){
   const origin=g.to(p.x,p.y);
   candidates.filter(c=>Number.isFinite(c.q)).forEach(c=>{const end=g.to(c.next.x,c.next.y);arrow(ctx,origin,end,c.a===candidates[0].a?'#65e6d0':'#d9e7f346',c.a===candidates[0].a?2:1,4);});
   const end=g.to(active.next.x,active.next.y);arrow(ctx,origin,end,active.a===candidates[0].a?colors.mint:colors.gold,2.4,5);
   ctx.strokeStyle=active.a===candidates[0].a?colors.mint:colors.gold;ctx.beginPath();ctx.arc(end.x,end.y,4,0,Math.PI*2);ctx.stroke();label('x + Δt f',end.x+7,end.y-11,colors.mint);
  }
  ctx.strokeStyle=focus==='x'?colors.gold:'#f3f8ff';ctx.lineWidth=1.8;ctx.beginPath();ctx.arc(cp.x,cp.y,8,0,2*Math.PI);ctx.stroke();ctx.fillStyle='#f5faff';ctx.beginPath();ctx.arc(cp.x,cp.y,3,0,2*Math.PI);ctx.fill();
  if(mode==='forward')label(`x(${fmt(k*DT)})`,cp.x-32,cp.y+31);
  ctx.restore();
 }
 function mapSelect(event){
  if(!geom)return;const r=canvas.getBoundingClientRect();
  const hit=view==='3d'?geom.pick(event.clientX-r.left,event.clientY-r.top):{x:(event.clientX-r.left-geom.x)/geom.scale,y:YMAX-(event.clientY-r.top-geom.y)/geom.scale};
  if(!hit)return;const {x,y}=hit;
  if(x<0||x>XMAX||y<0||y>YMAX)return;stop();
  if(edit==='goal'){const margin=model.p.target==='region'?model.p.radius:.15;model.p.gx=clamp(x,margin,XMAX-margin);model.p.gy=clamp(y,margin,YMAX-margin);restart();}
  else if(edit==='start'){model.p.sx=clamp(x,.05,XMAX-.05);model.p.sy=clamp(y,.05,YMAX-.05);if(model.front===0)path=model.rollout();if(mode==='forward')k=0;selected={x:Math.round(x/(XMAX/(NX-1)))*XMAX/(NX-1),y:Math.round(y/(YMAX/(NY-1)))*YMAX/(NY-1)};selectedAction=null;render();}
  else {if(mode==='forward'){mode='backward';}selected={x:Math.round(x/(XMAX/(NX-1)))*XMAX/(NX-1),y:Math.round(y/(YMAX/(NY-1)))*YMAX/(NY-1)};selectedAction=null;focus='x';document.body.dataset.focus='x';render();}
 }
 $('play').addEventListener('click',play);$('firstStep').addEventListener('click',()=>{stop();backward();});
 $('single').addEventListener('click',()=>{stop();if(mode==='forward')forward();else backward();});
 $('complete').addEventListener('click',()=>{if(mode==='forward'){stop();k=model.N;selectedAction=null;render();}else complete();});
 $('reset').addEventListener('click',restart);
 $$('[data-step]').forEach(b=>b.addEventListener('click',()=>setMode(b.dataset.step)));
 $$('[data-layer]').forEach(b=>b.addEventListener('click',()=>{layer=b.dataset.layer;$$('[data-layer]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));draw();updateViewLabels();}));
 $$('[data-view]').forEach(b=>b.addEventListener('click',()=>{
  finishCameraDrag();view=b.dataset.view;backgroundKey='';
  $$('[data-view]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));
  updateViewLabels();draw();
 }));
 $$('[data-camera]').forEach(b=>b.addEventListener('click',()=>{
  if(b.dataset.camera==='left')yaw-=Math.PI/12;
  if(b.dataset.camera==='right')yaw+=Math.PI/12;
  if(b.dataset.camera==='up')pitch=clamp(pitch+0.12,0.35,1.15);
  if(b.dataset.camera==='down')pitch=clamp(pitch-0.12,0.35,1.15);
  if(b.dataset.camera==='reset'){yaw=-0.6;pitch=0.65;}
  draw();
 }));
 $$('[data-edit]').forEach(b=>b.addEventListener('click',()=>{edit=b.dataset.edit;$$('[data-edit]').forEach(el=>el.setAttribute('aria-pressed',String(el===b)));render();}));
 function finishCameraDrag(event){
  if(!cameraDrag||(event&&event.pointerId!==cameraDrag.id))return;
  const id=cameraDrag.id;cameraDrag=null;
  canvas.classList.remove('rotating');
  if(canvas.hasPointerCapture(id))canvas.releasePointerCapture(id);
  if(cameraFrame){cancelAnimationFrame(cameraFrame);cameraFrame=0;draw();}
 }
 canvas.addEventListener('pointerdown',event=>{
  if(!event.isPrimary||event.button!==0)return;
  suppressMapClick=false;
  if(view!=='3d')return;
  cameraDrag={id:event.pointerId,x:event.clientX,y:event.clientY,yaw,pitch,moved:false};
  canvas.setPointerCapture(event.pointerId);
 });
 canvas.addEventListener('pointermove',event=>{
  if(!cameraDrag||event.pointerId!==cameraDrag.id)return;
  const dx=event.clientX-cameraDrag.x,dy=event.clientY-cameraDrag.y;
  if(!cameraDrag.moved&&Math.hypot(dx,dy)<5)return;
  cameraDrag.moved=true;suppressMapClick=true;
  canvas.classList.add('rotating');
  yaw=cameraDrag.yaw+dx*0.008;
  pitch=clamp(cameraDrag.pitch-dy*0.006,0.35,1.15);
  if(!cameraFrame)cameraFrame=requestAnimationFrame(()=>{cameraFrame=0;draw();});
 });
 canvas.addEventListener('pointerup',finishCameraDrag);
 canvas.addEventListener('pointercancel',event=>{if(cameraDrag&&event.pointerId===cameraDrag.id)suppressMapClick=true;finishCameraDrag(event);});
 canvas.addEventListener('lostpointercapture',finishCameraDrag);
 window.addEventListener('blur',()=>{if(cameraDrag)suppressMapClick=true;finishCameraDrag();});
 $('field').addEventListener('change',draw);
 canvas.addEventListener('click',event=>{
  if(suppressMapClick){suppressMapClick=false;return;}
  mapSelect(event);
 });
 canvas.addEventListener('keydown',e=>{
  const directions={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,1],ArrowDown:[0,-1]};if(!directions[e.key])return;e.preventDefault();stop();const [dx,dy]=directions[e.key];
  if(edit==='goal'){model.p.gx=clamp(model.p.gx+dx*XMAX/(NX-1),model.p.radius,XMAX-model.p.radius);model.p.gy=clamp(model.p.gy+dy*YMAX/(NY-1),model.p.radius,YMAX-model.p.radius);restart();return;}
  if(edit==='start'){model.p.sx=clamp(model.p.sx+dx*XMAX/(NX-1),0,XMAX);model.p.sy=clamp(model.p.sy+dy*YMAX/(NY-1),0,YMAX);if(model.front===0)path=model.rollout();if(mode==='forward')k=0;render();return;}
  if(mode==='forward')mode='backward';selected={x:clamp(selected.x+dx*XMAX/(NX-1),0,XMAX),y:clamp(selected.y+dy*YMAX/(NY-1),0,YMAX)};selectedAction=null;render();
 });
 $('candidates').addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(b){stop();selectedAction=+b.dataset.action;render();}});
 $('allCandidates').addEventListener('click',()=>{showAll=!showAll;render();});
 $('timeline').addEventListener('click',e=>{const b=e.target.closest('[data-time]');if(!b||b.disabled)return;stop();k=+b.dataset.time;if(mode!=='forward')mode=k===model.N?'terminal':'backward';selectedAction=null;render();});
 ['horizon','weight','drift','barrier','radius','target'].forEach(id=>$(id).addEventListener('input',()=>{model.p=configFromUI();const r=model.p.target==='region'?model.p.radius:.05;model.p.gx=clamp(model.p.gx,r,XMAX-r);model.p.gy=clamp(model.p.gy,r,YMAX-r);restart();}));
 $$('[data-focus]').forEach(b=>b.addEventListener('click',()=>{focus=focus===b.dataset.focus?'':b.dataset.focus;document.body.dataset.focus=focus;$$('[data-focus]').forEach(t=>t.classList.toggle('active',t.dataset.focus===focus));if(focus==='cost'){layer='cost';$$('[data-layer]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.layer===layer)));}if(focus==='value'){layer='value';$$('[data-layer]').forEach(el=>el.setAttribute('aria-pressed',String(el.dataset.layer===layer)));}render();}));
 new ResizeObserver(()=>draw()).observe(canvas);
 render();
 // Optional structured access to the same visible experiment.
 if(document.modelContext?.registerTool){
  const lifecycle=new AbortController();
  const tool={name:'hjb_run_experiment',title:'HJB 実験を操作',description:'表示中の実験で終端から逆算する、または計算済み方策を前向きに実行する。',inputSchema:{type:'object',properties:{action:{type:'string',enum:['reset','backward_step','solve','forward_start','forward_step']},steps:{type:'integer',minimum:1,maximum:36}},required:['action'],additionalProperties:false},annotations:{readOnlyHint:false,untrustedContentHint:false},execute(input){
   if(!input||!['reset','backward_step','solve','forward_start','forward_step'].includes(input.action)||Object.keys(input).some(key=>!['action','steps'].includes(key)))throw new Error('不正な実験操作です。');
   const n=input.steps??1;if(!Number.isInteger(n)||n<1||n>36)throw new Error('steps は 1〜36 の整数です。');
   if(input.action==='forward_step'&&mode!=='forward')throw new Error('先に forward_start を実行してください。');
   stop();if(input.action==='reset')restart();if(input.action==='solve')complete();if(input.action==='forward_start')setMode('forward');
   if(input.action==='backward_step')for(let i=0;i<n;i++)backward();if(input.action==='forward_step')for(let i=0;i<n;i++)forward();
   return {mode,time:k*DT,computedSteps:model.N-model.front,totalSteps:model.N,state:{x:point().x,y:point().y}};
  }};
  try{Promise.resolve(document.modelContext.registerTool(tool,{signal:lifecycle.signal})).catch(()=>{});}catch{}
  window.addEventListener('pagehide',()=>lifecycle.abort(),{once:true});
 }
})();
