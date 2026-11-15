/* Presentation-only relay and graph light flow. No model or workspace operations. */
(function (global) {
  'use strict';
  const names={you:'You',captain:'Lead',research:'Researcher',writer:'Writer',reviewer:'Reviewer',delivery:'You'};
  const colors={you:'#8b74b8',captain:'#8b74b8',research:'#678e7b',writer:'#b38868',reviewer:'#758bb1',delivery:'#678e7b'};
  const playbackRate=1.5;
  const atSpeed=milliseconds=>Math.round(milliseconds/playbackRate);
  const flight=atSpeed(3200);
  const flightEasing='cubic-bezier(0.76, 0, 0.24, 1)';
  const trailLengths=[26,18,11,5,1.5];
  const durationFor=step=>atSpeed(step===4?9000:6000);
  function routesFor(step,scenario='launch') {
    const packets={
      launch:['Checked sources + open questions','Draft + Visual concept'],
      research:['Evidence list + unverified items','Research outline + argument structure'],
      plan:['Requirements + project constraints','Launch plan + deliverables']
    }[scenario]||['Source list','Draft'];
    return [
      [{from:'you',to:'captain',payload:'Brief and acceptance criteria'}],
      [{from:'captain',to:'research',payload:'Source research'},{from:'captain',to:'writer',payload:'Outline task'}],
      [{from:'research',to:'writer',payload:packets[0]}],
      [{from:'writer',to:'reviewer',payload:packets[1]}],
      [{from:'reviewer',to:'captain',payload:'Review feedback'},{from:'captain',to:'delivery',payload:'Final results and open questions'}]
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
    const cards={},work={captain:step===4?'Organizing results':'Confirm goal',research:'Checking sources',writer:step===1?'Preparing outline':'Combining sources',reviewer:'Reviewing draft',delivery:'Result ready'};
    const offer=(id,phase,status,detail,priority,route)=>{
      if(!cards[id]||priority>=cards[id].priority)cards[id]={phase,status,detail,priority,route};
    };
    routesFor(step,scenario).forEach((route,index)=>{
      const phase=phases[index]||'ready';
      if(phase==='sending'){
        offer(route.from,'sending',route.from==='captain'&&step===1?'Assigning':'Sending','To '+names[route.to],2,route);
        offer(route.to,'receiving','Receiving','From '+names[route.from],2,route);
      }else if(phase==='received'){
        offer(route.from,'sent','Sent','Handed to '+names[route.to],1,route);
        offer(route.to,route.to==='delivery'?'delivered':'processing',work[route.to]+(route.to==='delivery'?'':''),'✓ Received · '+work[route.to],1,route);
      }else{
        offer(route.from,'ready-send',null,'Will hand off to '+names[route.to],0,route);
        offer(route.to,'ready-receive',null,'Waiting for '+names[route.from],0,route);
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
      if(role==='you'||role==='delivery'){const person=element('span','relay-person','You');person.setAttribute('aria-hidden','true');return person}
      const face=element('span','face small '+role);face.append(element('i',''));face.setAttribute('aria-hidden','true');return face;
    }
    function endpoint(role,destination) {
      const end=element('div','relay-endpoint '+(destination?'relay-destination':'relay-origin'));
      const picture=element('span','relay-avatar');picture.append(avatar(role));
      if(destination){const check=element('span','relay-check','✓');check.setAttribute('aria-hidden','true');picture.append(check)}
      const caption=element('span','relay-role');caption.append(element('strong','',names[role]),element('small','relay-action',destination?'Recipient':'Sender'));
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
      lane.sourceAction.textContent=phase==='sending'?'Sending':phase==='received'?'Sent':phase==='queued'?'To be consolidated':'Sender';
      lane.targetAction.textContent=phase==='received'?'Received':phase==='sending'?'Receiving':'Recipient';
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
        if(detail)detail.textContent=state?.detail||'Tasks and handoffs ↗';
        if(id==='delivery'&&current.step===4)$('#deliveryState').textContent=state?.phase==='delivered'?'Received · open sample file':state?.phase==='receiving'?'Receiving results · sample available':'Waiting for lead · sample available';
        if(id!=='you')node.setAttribute('title',state?names[state.route.from]+' to '+names[state.route.to]+': '+state.route.payload+' · open task details':'open task details');
      });
    }
    function explain() {
      $('#transferNumber').textContent=['Confirm goal','Parallel assignments','source handoff','Send for review','Report and deliver'][current.step];
      $('#transferMode').textContent=preference.matches?'Static demo · reduced motion':completed?'Handoff complete':running?(current.step===1?'Two tasks sent together':'Handoff in progress'):paused?'Paused · replay this step':'Press play to watch the handoff';
      $('#transferHint').textContent=[
        'The goal, materials and acceptance criteria first go to the lead. ',
        'Research checks evidence, writing prepares the outline. Independent tasks can run in parallel. ',
        'The writer receives the checked sources, and continues with open questions. ',
        'The draft goes to the reviewer, checks it against the goal and evidence. ',
        'Review feedback returns to the lead, who gives you the consolidated result. '
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
