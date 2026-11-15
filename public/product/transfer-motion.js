/* Presentation-only relay and graph light flow. No model or workspace operations. */
(function (global) {
  'use strict';
  const names={you:'你',captain:'主管',research:'资料研究员',writer:'内容创作者',reviewer:'质量审阅员',delivery:'你'};
  const colors={you:'#8b74b8',captain:'#8b74b8',research:'#678e7b',writer:'#b38868',reviewer:'#758bb1',delivery:'#678e7b'};
  const playbackRate=1.5;
  const atSpeed=milliseconds=>Math.round(milliseconds/playbackRate);
  const flight=atSpeed(3200);
  const flightEasing='cubic-bezier(0.76, 0, 0.24, 1)';
  const trailLengths=[26,18,11,5,1.5];
  const durationFor=step=>atSpeed(step===4?9000:6000);
  function routesFor(step,scenario='launch') {
    const packets={
      launch:['已核查资料 + 待确认项','内容初稿 + 配图方案'],
      research:['证据清单 + 待验证项','研究提纲 + 论证结构'],
      plan:['需求清单 + 项目约束','启动计划 + 交付清单']
    }[scenario]||['资料清单','内容初稿'];
    return [
      [{from:'you',to:'captain',payload:'目标简报与交付标准'}],
      [{from:'captain',to:'research',payload:'资料核查任务'},{from:'captain',to:'writer',payload:'内容结构任务'}],
      [{from:'research',to:'writer',payload:packets[0]}],
      [{from:'writer',to:'reviewer',payload:packets[1]}],
      [{from:'reviewer',to:'captain',payload:'审阅意见与核对结果'},{from:'captain',to:'delivery',payload:'汇总成果与待确认项'}]
    ][step]||[];
  }
  const timelineFor=(step,scenario)=>routesFor(step,scenario).map((route,index)=>({...route,delay:step===4?index*atSpeed(3800):0,duration:flight,easing:flightEasing}));
  const routeKey=route=>route.from+'-'+route.to;

  // Wires and light strokes share one path; no floating text follows the graph.
  function graphPoints(boxes,width) {
    const top=b=>[b.x+b.width/2,b.y],bottom=(b,ratio=.5)=>[b.x+b.width*ratio,b.y+b.height];
    const cap=boxes.captain,branch=(bottom(cap)[1]+boxes.writer.y)/2;
    const lower=Math.max(...['research','writer','reviewer'].map(id=>bottom(boxes[id])[1]))+32;
    const points={'you-captain':[bottom(boxes.you),top(cap)]};
    ['research','writer','reviewer'].forEach((id,index)=>{
      const source=bottom(cap,.2+index*.3),target=top(boxes[id]);
      points['captain-'+id]=Math.abs(target[0]-source[0])<1?[source,target]:[source,[source[0],branch],[target[0],branch],target];
    });
    for(const [from,to] of [['research','writer'],['writer','reviewer']]){
      // Incoming and outgoing peer routes have separate ports, never a shared junction.
      const a=bottom(boxes[from],.65),b=bottom(boxes[to],.35);
      points[from+'-'+to]=[a,[a[0],lower],[b[0],lower],b];
    }
    points['reviewer-captain']=[...points['captain-reviewer']].reverse();
    const d=boxes.delivery,rail=width-20,cy=cap.y+cap.height/2,dy=d.y+d.height/2;
    points['captain-delivery']=[[cap.x+cap.width,cy],[rail,cy],[rail,dy],[d.x+d.width,dy]];
    return points;
  }
  function pathFor(points,cornerRadius=9) {
    let path='M '+points[0].join(' ');
    for(let i=1;i<points.length;i++){
      const p=points[i],prev=points[i-1],next=points[i+1];
      if(!next){path+=' L '+p.join(' ');continue}
      const before=Math.hypot(p[0]-prev[0],p[1]-prev[1]),after=Math.hypot(next[0]-p[0],next[1]-p[1]);
      const radius=Math.min(cornerRadius,before/2,after/2);
      const enter=[p[0]+(prev[0]-p[0])*radius/before,p[1]+(prev[1]-p[1])*radius/before];
      const leave=[p[0]+(next[0]-p[0])*radius/after,p[1]+(next[1]-p[1])*radius/after];
      path+=' L '+enter.join(' ')+' Q '+p.join(' ')+' '+leave.join(' ');
    }
    return path;
  }
  function graphPaths(boxes,width,style='beam') {
    return Object.fromEntries(Object.entries(graphPoints(boxes,width)).map(([key,points])=>{
      if(style==='ports')return [key,pathFor(points)];
      const a=points[0],b=points.at(-1);
      if(key==='captain-delivery')return [key,pathFor(points,24)];
      const peer=key==='research-writer'||key==='writer-reviewer';
      const bend=peer?44:(b[1]-a[1])*.62;
      const c=[a[0],a[1]+bend],d=[b[0],peer?b[1]+bend:b[1]-bend];
      return [key,'M '+a.join(' ')+' C '+c.join(' ')+' '+d.join(' ')+' '+b.join(' ')];
    }));
  }
  function cardStatesFor(step,scenario,phases) {
    const cards={},work={captain:step===4?'整理成果':'确认目标',research:'核查资料',writer:step===1?'准备结构':'整合资料',reviewer:'核对初稿',delivery:'成果就绪'};
    const offer=(id,phase,status,detail,priority,route)=>{
      if(!cards[id]||priority>=cards[id].priority)cards[id]={phase,status,detail,priority,route};
    };
    routesFor(step,scenario).forEach((route,index)=>{
      const phase=phases[index]||'ready';
      if(phase==='sending'){
        offer(route.from,'sending',route.from==='captain'&&step===1?'分工中':'发送中','发给 '+names[route.to],2,route);
        offer(route.to,'receiving','接收中','来自 '+names[route.from],2,route);
      }else if(phase==='received'){
        offer(route.from,'sent','已发送','已交给 '+names[route.to],1,route);
        offer(route.to,route.to==='delivery'?'delivered':'processing',work[route.to]+(route.to==='delivery'?'':'中'),'✓ 已接收 · '+work[route.to],1,route);
      }else{
        offer(route.from,'ready-send',null,'将交给 '+names[route.to],0,route);
        offer(route.to,'ready-receive',null,'等待 '+names[route.from],0,route);
      }
    });
    return cards;
  }

  function create(root) {
    const $=selector=>root.querySelector(selector),pane=$('#flowPane');
    const nodes={you:$('.graph-goal'),captain:$('.leader-card'),research:$('#node-research'),writer:$('#node-writer'),reviewer:$('#node-reviewer'),delivery:$('#deliveryCard')};
    const preference=matchMedia('(prefers-reduced-motion: reduce)');
    let current=null,lanes=[],timers=[],running=false,completed=false,paused=false,baseStates={},paths={},wireStyle='beam';
    pane.dataset.wireStyle=wireStyle;
    const element=(tag,className,text)=>{
      const node=document.createElement(tag);node.className=className;
      if(text)node.textContent=text;return node;
    };
    const svgElement=(tag,attrs={})=>{
      const node=document.createElementNS('http://www.w3.org/2000/svg',tag);
      Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,value));return node;
    };
    const svg=svgElement('svg',{'class':'graph-connections','aria-hidden':'true'});
    const wires=svgElement('g'),active=svgElement('g'),ports=svgElement('g',{'class':'graph-ports'});
    svg.append(wires,active,ports);pane.append(svg);
    const baseEdges=['you-captain','captain-research','captain-writer','captain-reviewer','research-writer','writer-reviewer','captain-delivery'];
    const wireNodes=Object.fromEntries(baseEdges.map(key=>{
      const line=svgElement('path',{'class':'graph-wire'+(key==='captain-delivery'?' graph-output-wire':''),'data-route':key});
      wires.append(line);return [key,line];
    }));
    Object.entries(nodes).forEach(([id,node])=>node.style.setProperty('--card-tone',colors[id]));
    function layout() {
      const bounds=pane.getBoundingClientRect();if(!bounds.width||!bounds.height)return;
      const boxes=Object.fromEntries(Object.entries(nodes).map(([id,node])=>{
        const b=node.getBoundingClientRect();return [id,{x:b.left-bounds.left,y:b.top-bounds.top,width:b.width,height:b.height}];
      }));
      const points=graphPoints(boxes,bounds.width);
      paths=graphPaths(boxes,bounds.width,wireStyle);
      svg.setAttribute('viewBox','0 0 '+bounds.width+' '+bounds.height);
      Object.entries(wireNodes).forEach(([key,node])=>node.setAttribute('d',paths[key]));
      ports.replaceChildren(...baseEdges.flatMap(key=>[points[key][0],points[key].at(-1)].map(point=>svgElement('circle',{
        'class':'graph-port'+(key==='captain-delivery'?' graph-output-wire':''),cx:point[0],cy:point[1],r:3.2
      }))));
      lanes.forEach(lane=>{
        const path=paths[routeKey(lane.route)];
        lane.line.setAttribute('d',path);
        lane.streaks.forEach(streak=>streak.setAttribute('d',path));
      });
    }
    function avatar(role) {
      if(role==='you'||role==='delivery'){const person=element('span','relay-person','你');person.setAttribute('aria-hidden','true');return person}
      const face=element('span','face small '+role);face.append(element('i',''));face.setAttribute('aria-hidden','true');return face;
    }
    function endpoint(role,destination) {
      const end=element('div','relay-endpoint '+(destination?'relay-destination':'relay-origin'));
      const picture=element('span','relay-avatar');picture.append(avatar(role));
      if(destination){const check=element('span','relay-check','✓');check.setAttribute('aria-hidden','true');picture.append(check)}
      const caption=element('span','relay-role');caption.append(element('strong','',names[role]),element('small','relay-action',destination?'接收方':'发送方'));
      end.append(picture,caption);return end;
    }
    function makeLane(route) {
      const row=element('div','relay-lane');
      row.dataset.phase='ready';
      const tone=colors[route.from==='captain'&&route.to!=='delivery'?route.to:route.from];
      row.style.setProperty('--relay-color',tone);row.style.setProperty('--flight-duration',route.duration+'ms');
      row.style.setProperty('--flight-easing',route.easing);
      const source=endpoint(route.from,false),target=endpoint(route.to,true),channel=element('div','relay-channel');
      const track=element('div','relay-track');track.setAttribute('aria-hidden','true');
      const documentIcon=element('span','relay-document');documentIcon.append(element('i',''),element('i',''),element('i',''));track.append(documentIcon);
      const payload=element('span','relay-payload',route.payload);payload.setAttribute('title',route.payload);
      channel.append(track,payload);row.append(source,channel,target);
      const line=svgElement('path',{'class':'graph-active-wire','data-route':routeKey(route)});
      line.dataset.phase='ready';
      const stream=svgElement('g',{'class':'graph-stream','data-route':routeKey(route),'aria-hidden':'true'});
      const streaks=trailLengths.map(length=>{
        const streak=svgElement('path',{'class':'flow-streak',pathLength:'100','stroke-dasharray':length+' 200'});
        stream.append(streak);return streak;
      });
      active.append(line,stream);
      return {route,row,line,stream,streaks,sourceAction:source.querySelector('.relay-action'),targetAction:target.querySelector('.relay-action'),animations:[]};
    }
    function setPhase(lane,phase) {
      lane.row.dataset.phase=phase;lane.line.dataset.phase=phase;lane.stream.dataset.phase=phase;
      lane.sourceAction.textContent=phase==='sending'?'正在发送':phase==='received'?'已发送':phase==='queued'?'稍后汇总':'发送方';
      lane.targetAction.textContent=phase==='received'?'已接收':phase==='sending'?'接收中':'接收方';
      if(phase!=='sending'){lane.animations.forEach(animation=>animation.cancel());lane.animations=[]}
    }
    function clearTimers(){timers.forEach(clearTimeout);timers=[]}
    function rebuild() {
      lanes.forEach(lane=>lane.animations.forEach(animation=>animation.cancel()));
      active.replaceChildren();
      lanes=timelineFor(current.step,current.scenario).map(makeLane);
      $('#transferRoutes').replaceChildren(...lanes.map(lane=>lane.row));
      pane.dataset.stage=String(current.step);layout();
    }
    function syncCards() {
      const cards=cardStatesFor(current.step,current.scenario,lanes.map(lane=>lane.row.dataset.phase));
      Object.entries(nodes).forEach(([id,node])=>{
        const state=cards[id],badge=node.querySelector('.node-state'),detail=node.querySelector('.agent-detail');
        node.dataset.cardPhase=state?.phase||'idle';
        if(badge)badge.textContent=state?.status||baseStates[id]||badge.textContent;
        if(detail)detail.textContent=state?.detail||'任务与交接 ↗';
        if(id==='delivery'&&current.step===4)$('#deliveryState').textContent=state?.phase==='delivered'?'已接收 · 点击查看示例文件':state?.phase==='receiving'?'正在接收汇总成果 · 可预览样例':'等待主管交付 · 可预览样例';
        if(id!=='you')node.setAttribute('title',state?names[state.route.from]+' 交给 '+names[state.route.to]+'：'+state.route.payload+' · 点击查看任务详情':'点击查看任务详情');
      });
    }
    function explain() {
      $('#transferNumber').textContent=['目标确认','并行分工','资料交接','送交审阅','回报与交付'][current.step];
      $('#transferMode').textContent=preference.matches?'静态演示 · 已减少动态效果':completed?'本步交接完成':running?(current.step===1?'两份任务同步发出':'沿连线传递中'):paused?'已暂停 · 可重看本步':'点击播放，沿连线查看交接';
      $('#transferHint').textContent=[
        '目标、材料和交付标准，先交给主管。',
        '研究核查依据，创作准备结构。独立的工作可以并行。',
        '创作者接过核查资料，连同待确认项一起继续工作。',
        '初稿交给审阅员，按目标与证据逐项核对。',
        '审阅意见先回到主管，再把汇总成果交给你。'
      ][current.step];
    }
    function begin() {
      if(!current)return;
      clearTimers();running=!preference.matches;completed=false;paused=false;rebuild();
      lanes.forEach(lane=>setPhase(lane,'ready'));
      if(preference.matches){syncCards();explain();return}
      lanes.forEach(lane=>{
        const start=()=>{
          setPhase(lane,'sending');
          lane.animations=lane.streaks.map((streak,index)=>streak.animate([
            {strokeDashoffset:trailLengths[index]+'px'},
            // The light head reaches the endpoint at receipt, not before it.
            {strokeDashoffset:(trailLengths[index]-100)+'px'}
          ],{duration:lane.route.duration,easing:lane.route.easing,fill:'both'}));
          syncCards();
        };
        if(lane.route.delay){setPhase(lane,'queued');timers.push(setTimeout(start,lane.route.delay))}else start();
        timers.push(setTimeout(()=>{
          setPhase(lane,'received');
          if(lanes.every(item=>item.row.dataset.phase==='received')){running=false;completed=true;explain()}
          syncCards();
        },lane.route.delay+lane.route.duration));
      });
      syncCards();explain();
    }
    function stop() {
      clearTimers();
      if(running){paused=true;lanes.forEach(lane=>{if(lane.row.dataset.phase!=='received')setPhase(lane,'ready')})}
      running=false;
      if(current){current.playing=false;syncCards();explain()}
    }
    function update(step,scenario,playing) {
      const first=!current,changed=first||step!==current.step||scenario!==current.scenario,starts=playing&&!current?.playing;
      current={step,scenario,playing};
      baseStates=Object.fromEntries(Object.entries(nodes).map(([id,node])=>[id,node.querySelector('.node-state')?.textContent]));
      if(changed){clearTimers();completed=false;paused=false;running=false;rebuild();lanes.forEach(lane=>setPhase(lane,'ready'));syncCards()}
      if(starts||(changed&&!first))begin();
      else if(!playing)stop();
      else {syncCards();explain()}
      layout();
    }
    function setStyle(next) {
      if(!['beam','ports'].includes(next)||next===wireStyle)return false;
      wireStyle=next;pane.dataset.wireStyle=wireStyle;
      // Both candidates replay the same current stage with identical timing.
      if(current)begin();else layout();
      return true;
    }
    new ResizeObserver(layout).observe(pane);
    preference.addEventListener('change',()=>{stop();if(current){completed=false;paused=false;lanes.forEach(lane=>setPhase(lane,'ready'));syncCards();explain()}});
    window.addEventListener('pagehide',stop);
    return {update,replay:begin,stop,setStyle};
  }
  const api={routesFor,timelineFor,cardStatesFor,graphPoints,graphPaths,pathFor,durationFor,create};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;
  if(global)global.LunaTransferMotion=api;
})(typeof window==='undefined'?null:window);
