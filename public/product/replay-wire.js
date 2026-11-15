/* Each message takes its own route, avoiding the central message and seat labels. */
function replaySegmentHits(a,b,r){
  let low=0,high=1;
  for(const [start,delta,min,max] of [[a.x,b.x-a.x,r.left,r.right],[a.y,b.y-a.y,r.top,r.bottom]]){
    if(Math.abs(delta)<1e-8){if(start<=min||start>=max)return false;continue}
    const x=(min-start)/delta,y=(max-start)/delta;
    low=Math.max(low,Math.min(x,y));high=Math.min(high,Math.max(x,y));
    if(low>=high-1e-8)return false;
  }
  return high>1e-8&&low<1-1e-8;
}
function replayRoute(from,to,{obstacles=[],width=Infinity,height=Infinity}={}){
  const inside=(p,r)=>p.x>r.left&&p.x<r.right&&p.y>r.top&&p.y<r.bottom;
  // Corners stand clear of each rectangle; rounded turns cannot cut into text.
  const candidates=obstacles.flatMap(r=>[
    {x:r.left-2,y:r.top-2},{x:r.right+2,y:r.top-2},
    {x:r.left-2,y:r.bottom+2},{x:r.right+2,y:r.bottom+2}
  ]).filter(p=>p.x>=0&&p.x<=width&&p.y>=0&&p.y<=height&&!obstacles.some(r=>inside(p,r)));
  const points=[from,to,...candidates],dist=points.map(()=>Infinity),prev=points.map(()=>-1),done=new Set();dist[0]=0;
  while(done.size<points.length){
    let current=-1;
    for(let i=0;i<points.length;i++)if(!done.has(i)&&(current<0||dist[i]<dist[current]))current=i;
    if(current<0||!Number.isFinite(dist[current])||current===1)break;
    done.add(current);
    for(let i=0;i<points.length;i++){
      if(i===current||done.has(i)||obstacles.some(r=>replaySegmentHits(points[current],points[i],r)))continue;
      const cost=dist[current]+Math.hypot(points[i].x-points[current].x,points[i].y-points[current].y);
      if(cost<dist[i]){dist[i]=cost;prev[i]=current}
    }
  }
  if(!Number.isFinite(dist[1]))return []; // Never draw through an obstacle if the layout is too tight.
  const corners=[];for(let i=1;i>=0;i=prev[i]){corners.unshift(points[i]);if(i===0)break}
  const samples=[corners[0]];
  // The visibility graph stays outside padded obstacles; soften each turn.
  for(let i=1;i<corners.length-1;i++){
    const a=corners[i-1],b=corners[i],c=corners[i+1];
    const d1=Math.hypot(b.x-a.x,b.y-a.y),d2=Math.hypot(c.x-b.x,c.y-b.y),radius=Math.min(5,d1/3,d2/3);
    const before={x:b.x+(a.x-b.x)*radius/d1,y:b.y+(a.y-b.y)*radius/d1};
    const after={x:b.x+(c.x-b.x)*radius/d2,y:b.y+(c.y-b.y)*radius/d2};
    samples.push(before);
    for(let n=1;n<=4;n++){const t=n/4;samples.push({x:(1-t)**2*before.x+2*(1-t)*t*b.x+t*t*after.x,y:(1-t)**2*before.y+2*(1-t)*t*b.y+t*t*after.y})}
  }
  samples.push(corners.at(-1));return samples;
}
function createReplayWire({wire, packet, reduced, request, cancel}) {
  let frame=0,active=null;
  const show=(element,value)=>element?.setAttribute('visibility',value?'visible':'hidden');
  const clear=()=>{if(frame)cancel(frame);frame=0;active=null;show(wire,false);show(packet,false)};
  const finish=()=>{const callback=active?.complete;clear();callback?.()};
  const paint=()=>{
    if(!active||active.points.length<2)return;
    const points=active.points,lengths=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y));
    const total=lengths.reduce((a,b)=>a+b,0);let left=total*active.progress;
    let current=points[0],d=`M ${current.x.toFixed(1)} ${current.y.toFixed(1)}`;
    for(let i=0;i<lengths.length;i++){
      const length=lengths[i],next=points[i+1],fraction=length?Math.min(1,left/length):1;
      current={x:points[i].x+(next.x-points[i].x)*fraction,y:points[i].y+(next.y-points[i].y)*fraction};
      d+=` L ${current.x.toFixed(1)} ${current.y.toFixed(1)}`;left-=length;
      if(fraction<1)break;
    }
    wire.setAttribute('d',d);wire.setAttribute('opacity',String(active.opacity));
    if(packet){packet.setAttribute('cx',current.x.toFixed(1));packet.setAttribute('cy',current.y.toFixed(1));show(packet,active.progress<1)}
  };
  return (from,to,route,animate)=>{
    if(!wire||!from||!to){if(animate)route?.onComplete?.();return}
    if(!animate){if(active){active.points=replayRoute(from,to,route);if(!active.points.length)finish();else paint()}return}
    clear();if(reduced()){route?.onComplete?.();return}
    const points=replayRoute(from,to,route);if(!points.length){route?.onComplete?.();return}
    active={points,progress:0,opacity:1,complete:route?.onComplete};paint();show(wire,true);show(packet,true);
    let started=null;
    const tick=time=>{
      if(reduced()){finish();return}
      if(started===null)started=time;
      const elapsed=time-started,t=Math.min(1,elapsed/1050);
      active.progress=t*t*(3-2*t);active.opacity=elapsed<1050?1:Math.max(0,1-(elapsed-1050)/180);
      if(elapsed>=1230){finish();return}
      paint();frame=request(tick);
    };
    frame=request(tick);
  };
}
if(typeof window!=='undefined')window.createReplayWire=createReplayWire;
if(typeof module!=='undefined'){module.exports=createReplayWire;module.exports.replayRoute=replayRoute;module.exports.replaySegmentHits=replaySegmentHits}
