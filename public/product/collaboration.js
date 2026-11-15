'use strict';
(() => {
  const root=document.getElementById('collaborationApp');
  const scenarios={
    launch:{name:'产品发布小组',goal:'为 Botdom 准备第一条产品介绍',brief:'面向个人创作者，介绍多 Agent 协作。先核实功能，再给我文案和配图方案；不要直接发布。',research:'核对产品能力与边界',creative:'准备首发文案与配图方案',review:'检查事实、表达与交付',file:'Botdom-首发内容包-演示.md',output:'## 首发文案\n把一个目标交给一支 AI 团队。主管理清方向，研究员核查资料，创作者整理表达，审阅员检查交付。Botdom 让分工、交接和成果留在同一个工作空间。\n\n## 配图方案\n用户目标 → 主管分工 → 研究与创作 → 审阅 → 汇总交付。使用不同颜色区分角色。\n\n## 发布前确认\n产品名称、公开功能边界、发布平台与账号授权。此演示没有执行发布。'},
    research:{name:'研究与写作小组',goal:'准备一份有依据的研究选题提纲',brief:'围绕多 Agent 协作整理研究问题，区分已知证据与待验证假设，交付提纲；不要把预测写成实验结果。',research:'建立资料与证据清单',creative:'整理问题与论证提纲',review:'检查来源和假设边界',file:'研究选题提纲-演示.md',output:'## 研究问题\n角色分工与信息交接会怎样影响复杂任务的可追溯性？\n\n## 提纲结构\n1. 问题定义与使用情境\n2. 相关研究的检索计划\n3. 角色与交接机制\n4. 待验证假设和评价方式\n\n## 待补证据\n此文件为概念演示，没有执行文献检索或实验。来源、数据与结论需要在真实研究中核实。'},
    plan:{name:'项目策划小组',goal:'把一个新项目拆成可执行的启动计划',brief:'先梳理目标用户和限制，整理工作安排，再检查依赖与遗漏。输出启动清单，不执行外部操作。',research:'梳理需求与约束',creative:'编排阶段与交付清单',review:'核对依赖与待确认项',file:'项目启动清单-演示.md',output:'## 启动清单\n- 确认目标用户、项目范围和交付标准\n- 收集可用资料与约束\n- 为每项工作指定负责角色\n- 标出前置依赖与验收要求\n- 汇总风险与待确认事项\n\n## 当前边界\n本文件只是演示样例，没有承诺真实排期、预算或执行结果。'}
  };
  const steps=['交代目标','拆解与并行','成果交接','审阅核对','汇总交付'];
  const roles=[{id:'captain',name:'主管',label:'协调目标与分工',color:'captain'},{id:'research',name:'资料研究员',label:'核实资料，整理依据',color:'research'},{id:'writer',name:'内容创作者',label:'组织内容，形成表达',color:'writer'},{id:'reviewer',name:'质量审阅员',label:'检查事实与交付标准',color:'reviewer'}];
  let scenario='launch',step=0,playing=false,timer=null,view='flow';
  const face=(r,small='')=>'<span class="face '+r.color+' '+small+'" aria-hidden="true"><i></i></span>';
  root.innerHTML=`<aside class="demo-sidebar"><a class="brand" href="index.html"><img src="assets/muster-mark.svg" width="27" height="27" alt="">Botdom</a><p class="sidebar-eyebrow">我的工作空间</p><label for="demoScenario">切换演示场景</label><select id="demoScenario"><option value="launch">产品发布小组</option><option value="research">研究与写作小组</option><option value="plan">项目策划小组</option></select><div class="team-label">团队成员 <span>4</span></div><div class="sidebar-members">${roles.map(r=>'<button data-role="'+r.id+'">'+face(r,'small')+'<span>'+r.name+'<small>'+r.label+'</small></span></button>').join('')}</div><div class="sidebar-foot"><span class="dot"></span> 演示工作空间<small>不连接真实任务</small></div></aside>
  <div class="demo-main"><header class="demo-head"><div class="workspace-title"><span class="group-icon" aria-hidden="true">☷</span><div><h3 id="demoGroup"></h3><span>专属主管 · 3 位协作成员</span></div></div><span class="demo-badge">概念演示</span></header><div class="demo-toolbar"><div class="demo-tabs" role="group" aria-label="协作视图"><button data-view="flow" aria-pressed="true">协作画布</button><button data-view="chat" aria-pressed="false">团队对话</button><button data-view="files" aria-pressed="false">交付成果</button></div><div class="flow-style-picker" role="group" aria-label="连线版本对比"><button data-wire-style="beam" aria-pressed="true" title="参考 Magic UI：柔和曲线与光流">A · 柔光曲线</button><button data-wire-style="ports" aria-pressed="false" title="参考 React Flow：独立端口与圆角折线">B · 端口折线</button></div><span class="stage-status" id="stageStatus" role="status"></span></div>
  <div class="demo-content"><section class="demo-workarea"><div class="task-brief"><span>共同目标</span><h4 id="demoGoal"></h4><p id="demoBrief"></p></div><section class="transfer-explainer" aria-label="本步信息传递"><header><strong id="transferNumber"></strong><span id="transferMode"></span></header><div id="transferRoutes" aria-live="polite"></div><p id="transferHint"></p></section><div id="flowPane" class="flow-pane"><span class="graph-goal">你的目标</span><div class="leader-row"><button class="leader-card" data-role="captain">${face(roles[0])}<span><strong>主管</strong><small id="leaderTask"></small></span><span class="node-state" id="leaderState"></span></button></div><div class="branch-lines" aria-hidden="true"><span></span><span></span><span></span></div><div class="team-grid">${roles.slice(1).map(r=>'<button class="agent-card" data-role="'+r.id+'" id="node-'+r.id+'"><div class="agent-identity">'+face(r)+'<span class="status-dot" id="dot-'+r.id+'"></span></div><strong>'+r.name+'</strong><p id="task-'+r.id+'"></p><span class="node-state" id="state-'+r.id+'"></span><span class="agent-detail">任务与交接 ↗</span></button>').join('')}</div><button class="delivery-card" id="deliveryCard" disabled><span class="file-symbol">MD</span><span><strong id="deliveryName"></strong><small id="deliveryState"></small></span><span class="delivery-arrow">↗</span></button></div><div class="chat-pane" id="chatPane" hidden></div><div class="files-pane" id="filesPane" hidden></div></section><aside class="event-panel"><header><h4>协作动态</h4><span>示例事件</span></header><ol id="eventList"></ol><div class="event-note">分工、咨询、交接与回报<br>都应该有可核对的记录。</div></aside></div>
  <footer class="player"><div class="player-controls"><button id="playDemo" class="play-button">▶ 播放协作</button><button id="nextDemo" class="next-button" aria-label="下一步">下一步 →</button><button id="replayTransfer" class="replay-transfer" aria-label="重播当前信息传递">重看本步</button><button id="resetDemo" class="reset-button" aria-label="重新开始演示" title="重新开始">↺</button></div><div class="step-track" role="group" aria-label="选择演示阶段">${steps.map((s,i)=>'<button data-step="'+i+'" aria-label="第 '+(i+1)+' 步：'+s+'"><i></i><span>'+s+'</span></button>').join('')}</div></footer></div>
  <dialog class="role-dialog" id="roleDialog"><header><span class="small-label">任务与交接 · 演示</span><button id="closeRole" aria-label="关闭任务详情">×</button></header><div id="roleBody"></div></dialog>`;
  const $=id=>root.querySelector('#'+id);
  const transferMotion=window.LunaTransferMotion.create(root);
  function statuses(){return [
    [['确认目标','working'],['等待分工','idle'],['等待分工','idle'],['等待分工','idle']],
    [['协调中','working'],['核查资料中','working'],['准备结构中','working'],['等待初稿','waiting']],
    [['协调交接','working'],['已回报','done'],['整合依据中','working'],['等待初稿','waiting']],
    [['等待审阅','waiting'],['已回报','done'],['已交付初稿','done'],['核对交付中','working']],
    [['已汇总','done'],['已回报','done'],['已交付','done'],['已审阅','done']]
  ][step]}
  function events(){const s=scenarios[scenario];return [
    {who:'你',text:'提出目标，并明确交付标准与操作边界。'},
    {who:'主管',text:'安排资料核查与内容结构准备并行进行。'},
    {who:'资料研究员 → 内容创作者',text:'交接核对后的资料清单，并标出待确认项。'},
    {who:'内容创作者 → 质量审阅员',text:'交付初稿，按目标与证据逐项核对。'},
    {who:'主管 → 你',text:'汇总示例成果：'+s.file+'。由你决定下一步。'}
  ]}
  const leaderTasks=['接收目标，确认范围与交付标准','拆分目标，协调并行任务','核对前置资料，推进交接','收到初稿，安排质量检查','整合回报，列出待确认项'];
  function render(){
    const s=scenarios[scenario],states=statuses(),ev=events();
    $('demoGroup').textContent=s.name;$('demoGoal').textContent=s.goal;$('demoBrief').textContent=s.brief;
    $('leaderTask').textContent=leaderTasks[step];$('leaderState').textContent=states[0][0];$('leaderState').className='node-state '+states[0][1];
    roles.slice(1).forEach((r,i)=>{const state=states[i+1];$('state-'+r.id).textContent=state[0];$('state-'+r.id).className='node-state '+state[1];$('node-'+r.id).dataset.status=state[1];$('dot-'+r.id).className='status-dot '+state[1];$('task-'+r.id).textContent=s[{research:'research',writer:'creative',reviewer:'review'}[r.id]];});
    $('stageStatus').textContent=(step+1)+' / 5 · '+steps[step];
    $('deliveryName').textContent=step===4?s.file:'汇总交付物';$('deliveryState').textContent=step===4?'示例文件已就绪 · 点击查看':'待成员完成与主管汇总';$('deliveryCard').disabled=step!==4;
    $('eventList').replaceChildren(...ev.slice(0,step+1).map((e,i)=>{const li=document.createElement('li');li.innerHTML='<span class="event-dot"></span><small>阶段 '+(i+1)+'</small><strong></strong><p></p>';li.querySelector('strong').textContent=e.who;li.querySelector('p').textContent=e.text;return li}));
    $('chatPane').replaceChildren(...ev.slice(0,step+1).map(e=>{const el=document.createElement('article');el.innerHTML='<div class="chat-author"></div><p></p>';el.querySelector('div').textContent=e.who;el.querySelector('p').textContent=e.text;return el}));
    $('filesPane').innerHTML=step===4?'<div class="empty-file-icon">✓</div><h4>示例内容包预览</h4><p>固定演示样例，预览不表示交接完成，也不是真实模型运行结果。</p><button class="button dark" id="openOutput">查看示例成果 ↗</button>':'<div class="empty-file-icon">⌁</div><h4>成果还在路上</h4><p>推进到「汇总交付」，再查看示例内容包。</p><button class="button light" id="returnFlow">回到协作画布</button>';
    $('openOutput')?.addEventListener('click',openOutput);$('returnFlow')?.addEventListener('click',()=>setView('flow'));
    root.querySelectorAll('[data-step]').forEach(b=>{const i=Number(b.dataset.step);b.classList.toggle('passed',i<step);b.setAttribute('aria-pressed',String(i===step));});
    $('playDemo').textContent=playing?'Ⅱ 暂停演示':step===4?'↺ 重新播放':'▶ 播放协作';$('nextDemo').disabled=step===4;
    transferMotion.update(step,scenario,playing);
  }
  function setView(name){view=name;root.querySelector('.flow-style-picker').hidden=view!=='flow';root.querySelector('.transfer-explainer').hidden=view!=='flow';if(view!=='flow'){stop();render();}root.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)));$('flowPane').hidden=view!=='flow';$('chatPane').hidden=view!=='chat';$('filesPane').hidden=view!=='files';}
  function stop(){playing=false;clearTimeout(timer);timer=null;}
  function tick(){timer=setTimeout(()=>{if(step<4){step++;render();tick()}else{stop();render()}},window.LunaTransferMotion.durationFor(step))}
  function outputText(){const s=scenarios[scenario];return '# '+s.goal+'\n\n> Botdom 宣传交互演示样例。未调用模型，未执行外部操作。\n\n'+s.output+'\n\n---\n\n协作顺序：目标 → 分工与并行 → 资料交接 → 审阅 → 主管汇总。\n'}
  function download(){const url=URL.createObjectURL(new Blob([outputText()],{type:'text/markdown;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download=scenarios[scenario].file;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
  function showDialog(){if(!$('roleDialog').open)$('roleDialog').showModal()}
  function openOutput(){stop();render();const body=$('roleBody');body.innerHTML='<span class="file-symbol large">MD</span><h2>示例成果</h2><p class="dialog-description">文件内容只用于演示，可以下载后编辑。</p><pre class="output-preview"></pre><button class="button dark" id="downloadOutput">下载示例 .md ↓</button>';body.querySelector('pre').textContent=outputText();$('downloadOutput').onclick=download;showDialog()}
  function openRole(id){stop();render();const r=roles.find(x=>x.id===id),i=roles.indexOf(r),s=scenarios[scenario];const tasks={captain:s.goal,research:s.research,writer:s.creative,reviewer:s.review};const body=$('roleBody');body.innerHTML=face(r)+'<h2>'+r.name+'</h2><p class="dialog-description">'+r.label+'</p><dl><dt>当前状态</dt><dd id="roleStatus"></dd><dt>负责的工作</dt><dd id="roleTask"></dd><dt>输入与交接</dt><dd id="roleHandoff"></dd><dt>验收要求</dt><dd>依据清楚，待确认项明确。没有完成的事不能写成已交付。</dd></dl><p class="dialog-note">此面板为演示说明，不代表真实任务回执。</p>';
    $('roleStatus').textContent=statuses()[i][0];$('roleTask').textContent=tasks[id];$('roleHandoff').textContent={captain:'接收你的目标；安排成员；依据实际回报汇总。',research:'接收主管目标；把资料清单与未确定项交给内容创作者。',writer:'先准备结构，收到研究资料后整合初稿，再交给质量审阅员。',reviewer:'依据目标和材料检查初稿；将审阅意见回报主管。'}[id];showDialog();}
  $('demoScenario').onchange=e=>{stop();scenario=e.target.value;step=0;render();};
  $('playDemo').onclick=()=>{if(playing)stop();else{if(step===4)step=0;playing=true;tick();}render()};
  $('nextDemo').onclick=()=>{stop();step=Math.min(4,step+1);render()};
  $('replayTransfer').onclick=()=>{stop();render();transferMotion.replay()};
  $('resetDemo').onclick=()=>{stop();step=0;render()};
  root.querySelectorAll('[data-step]').forEach(b=>b.onclick=()=>{stop();step=Number(b.dataset.step);render()});
  root.querySelectorAll('.flow-style-picker button').forEach(b=>b.onclick=()=>{if(b.getAttribute('aria-pressed')==='true')return;stop();render();transferMotion.setStyle(b.dataset.wireStyle);root.querySelectorAll('.flow-style-picker button').forEach(button=>button.setAttribute('aria-pressed',String(button===b)));});
  root.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>setView(b.dataset.view));
  root.querySelectorAll('[data-role]').forEach(b=>b.onclick=()=>openRole(b.dataset.role));
  $('deliveryCard').onclick=openOutput;$('closeRole').onclick=()=>$('roleDialog').close();
  $('roleDialog').onclick=e=>{if(e.target===$('roleDialog'))$('roleDialog').close()};
  document.addEventListener('visibilitychange',()=>{if(document.hidden){stop();render()}});
  window.addEventListener('pagehide',stop);
  window.addEventListener('luna-product-paused',()=>{stop();render()});
  render();
})();

