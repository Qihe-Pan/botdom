/* Lightweight reading layer. The original tour and its replay stay in place. */
(()=>{
 const zh=document.documentElement.lang==='zh-CN';
 const label=(en,cn)=>zh?cn:en;
 const kicker=document.querySelector('[data-i18n=\"hero.eyebrow\"]');if(kicker)kicker.textContent=label('Different agents. One team.','不同的 Agent，同一个团队。');
 const title=document.getElementById('hero-title'),lede=document.querySelector('.mu-hero .mu-lede'),heroCopy=document.querySelector('.mu-hero-copy');
 if(title)title.textContent=label('Your AI work team.','你的 AI 工作团队。');
 if(lede)lede.textContent=label('Research, write, plan and deliver. Give the lead a goal, let your team work together, and review the results.','研究、写作、策划、交付。把目标交给主管，让团队协作完成，再由你核对成果。');
 if(heroCopy){
  heroCopy.classList.add('light-hero-copy');const pills=document.createElement('div');pills.className='light-hero-tools';pills.setAttribute('aria-label',label('Supported execution tools','支持的执行工具'));
  ['Codex','OpenCode','DeepSeek Harness','Claude Code','CodeBuddy Code'].forEach(name=>{const p=document.createElement('span');p.className='light-tool';p.textContent=name;pills.append(p)});
  const more=document.createElement('a');more.className='light-tools-more';more.href='#harnesses';more.textContent=label('Setup and tested connections →','查看连接方式与验证情况 →');
  heroCopy.append(pills,more);
 }
 const replay=document.getElementById('replay'),transcript=replay?.querySelector('.mu-transcript');
 if(replay&&transcript){
  replay.classList.add('light-show-all');
  const toggle=document.createElement('button');toggle.type='button';toggle.className='light-transcript-toggle';toggle.setAttribute('aria-expanded','false');
  const words=document.createElement('span'),chevron=document.createElement('span');chevron.className='light-toggle-chevron';chevron.setAttribute('aria-hidden','true');chevron.textContent='⌄';
  const update=()=>{const open=replay.classList.contains('light-show-all');toggle.setAttribute('aria-expanded',String(open));words.textContent=open?label('Show current message','只看当前消息'):label('Show all messages','查看完整对话')};
  toggle.append(words,chevron);toggle.addEventListener('click',()=>{replay.classList.toggle('light-show-all');update()});const block=document.createElement('div');block.className='light-transcript-block';transcript.before(block);block.append(transcript,toggle);update();
 }
 const stepShort=[['Say what you want to make.','告诉主管你想完成什么。'],['The lead makes a plan and assigns the work.','主管制定计划，安排成员。'],['Members share files and hand off work.','成员交流并交接文件。'],['Check the result and its status.','查看成果与实际状态。']];
 document.querySelectorAll('#meeting .mu-step').forEach((step,i)=>{
  const original=step.querySelector(':scope > p:not(.mu-step-note)');if(!original||!stepShort[i])return;
  const short=document.createElement('p');short.className='light-short';short.textContent=label(...stepShort[i]);
  const detail=document.createElement('details');detail.className='light-detail';detail.open=true;const summary=document.createElement('summary');summary.textContent=label('More detail','了解更多');
  original.before(short,detail);detail.append(summary,original);
 });
 const notes=document.querySelector('#harnesses .mu-notes');if(notes){const detail=document.createElement('details');detail.className='light-detail light-detail--notes';const summary=document.createElement('summary');summary.textContent=label('Connection details and test notes','连接细节与测试说明');notes.before(detail);detail.append(summary,notes)}
 document.querySelectorAll('#more .mu-feature').forEach(card=>{
  const p=card.querySelector(':scope > p');if(!p)return;const detail=document.createElement('details');detail.className='light-detail';const summary=document.createElement('summary');summary.textContent=label('What it does','功能说明');p.before(detail);detail.append(summary,p);
 });
 document.documentElement.classList.add('light-ready');
})();
