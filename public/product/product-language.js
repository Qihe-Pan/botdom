/* Translate the static product illustration before its interactive script runs. */
(()=>{
  let locale;
  try{locale=localStorage.getItem('luna.locale')}catch{}
  if(locale!=='zh-CN'||!window.MusterProductZh)return;
  document.documentElement.lang='zh-CN';
  const copy=window.MusterProductZh;
  const lookup=value=>Object.prototype.hasOwnProperty.call(copy,value)?copy[value]:value;
  const walker=document.createTreeWalker(document.body,NodeFilter.SHOW_TEXT);
  const texts=[];
  while(walker.nextNode()){
    const node=walker.currentNode;
    if(node.parentElement?.closest('script,style,noscript'))continue;
    texts.push(node);
  }
  for(const node of texts){
    const value=node.nodeValue,trimmed=value.trim();
    if(trimmed&&Object.prototype.hasOwnProperty.call(copy,trimmed))node.nodeValue=value.replace(trimmed,lookup(trimmed));
  }
  for(const element of document.querySelectorAll('*'))for(const attr of [...element.attributes]){
    if(attr.name==='aria-label'||attr.name==='title'||attr.name==='alt'||attr.name==='placeholder'||attr.name.startsWith('data-msg-')){
      if(Object.prototype.hasOwnProperty.call(copy,attr.value))element.setAttribute(attr.name,lookup(attr.value));
    }
  }
  document.title=lookup(document.title);
  const description=document.querySelector('meta[name="description"]');
  if(description)description.content=lookup(description.content);
})();
