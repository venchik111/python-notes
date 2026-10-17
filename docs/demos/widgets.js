import {clampStep, integer, decoratorCode, decoratorFrames, mockCode, mockFrames, pandasSelection, pandasFilter, regexResult} from './models.js';
import {normalize,tokens} from '../search.js';

let fixturePromise, sequence=0;
const node=(tag,cls,text)=>{const e=document.createElement(tag);if(cls)e.className=cls;if(text!==undefined)e.textContent=text;return e;};
const button=(text,fn)=>{const b=node('button','demo-button',text);b.type='button';b.addEventListener('click',fn);return b;};
function highlight(root,query){
  const words=tokens(query);if(!words.length)return;
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),texts=[];
  while(walker.nextNode())if(!walker.currentNode.parentElement.closest('mark,option,button,.demo-line-number'))texts.push(walker.currentNode);
  for(const text of texts){
    const value=text.textContent,folded=normalize(value),ranges=[];
    for(const word of words)for(let at=folded.indexOf(word);at!==-1;at=folded.indexOf(word,at+word.length))ranges.push([at,at+word.length]);
    if(!ranges.length)continue;ranges.sort((a,b)=>a[0]-b[0]);const merged=[];
    for(const range of ranges){const last=merged.at(-1);if(last&&range[0]<=last[1])last[1]=Math.max(last[1],range[1]);else merged.push([...range]);}
    const fragment=document.createDocumentFragment();let at=0;
    for(const [start,end]of merged){fragment.append(document.createTextNode(value.slice(at,start)),node('mark','',value.slice(start,end)));at=end;}
    fragment.append(document.createTextNode(value.slice(at)));text.replaceWith(fragment);
  }
}
function select(box,label,options,value,change){
  const field=node('label','demo-field');field.append(node('span','',label));
  const input=node('select');input.id=`demo-field-${++sequence}`;input.setAttribute('aria-label',label);
  options.forEach(([key,text])=>{const o=node('option','',text);o.value=key;input.append(o);});
  input.value=String(value);input.addEventListener('change',()=>change(input.value));field.append(input);box.append(field);return input;
}
function number(box,label,value,change){
  const field=node('label','demo-field');field.append(node('span','',label));
  const input=node('input');input.setAttribute('aria-label',label);input.type='number';input.min='-10';input.max='10';input.step='1';input.value=String(value);
  input.addEventListener('input',()=>{if(input.value!==''&&integer(input.value)){input.setCustomValidity('');change(Number(input.value));}else input.setCustomValidity('Введи целое число от −10 до 10.');input.reportValidity();});
  field.append(input);box.append(field);return input;
}
function table(headers,rows,selected=[]){
  const wrap=node('div','table-scroll');wrap.tabIndex=0;wrap.setAttribute('role','region');wrap.setAttribute('aria-label','Таблица данных');
  const t=node('table','rich-table demo-table'),head=node('thead'),tr=node('tr');
  headers.forEach(h=>{const th=node('th','',h);th.scope='col';tr.append(th);});head.append(tr);const body=node('tbody');
  rows.forEach((cells,i)=>{const r=node('tr',selected.includes(i)?'demo-selected':'');cells.forEach(c=>r.append(node('td','',c===null?'None':String(c))));if(selected.includes(i)){const mark=node('span','selection-check','✓ ');mark.setAttribute('aria-label','Строка выбрана');r.firstChild.prepend(mark);}body.append(r);});
  t.append(head,body);wrap.append(t);return wrap;
}
function code(text,line=0){
  const pre=node('pre','demo-code');pre.tabIndex=0;pre.setAttribute('aria-label','Код примера. Текущая строка выделена.');
  text.split('\n').forEach((text,i)=>{const row=node('span',`demo-code-line${line===i+1?' active':''}`);const num=node('span','demo-line-number',`${line===i+1?'→':' '} ${i+1}`);num.setAttribute('aria-hidden','true');row.append(num,node('code','',text||' '));pre.append(row);});return pre;
}
function panel(title,value){const box=node('div','demo-value');box.append(node('h4','',title));if(value instanceof Node)box.append(value);else box.append(node('p','',String(value)));return box;}
function status(box,text){const p=node('p','demo-explanation',text);p.setAttribute('role','status');p.setAttribute('aria-live','polite');box.append(p);}
function shell(host,spec){
  host.replaceChildren();host.append(node('span','eyebrow','Интерактивный разбор'),node('h3','demo-title',spec.title),node('p','demo-intro',spec.intro));
  const controls=node('div','demo-controls'),view=node('div','demo-view'),actions=node('div','demo-actions');
  host.append(controls,actions,view);return {controls,view,actions,query:spec.query};
}
function stepper(shell,getFrames,draw){
  let at=0;
  const previous=button('Назад',()=>{at--;render();}),next=button('Следующий шаг',()=>{at++;render();}),reset=button('Сброс',()=>{at=0;render();});
  const count=node('span','demo-step');shell.actions.append(previous,next,reset,count);
  function render(){const frames=getFrames();at=clampStep(at,frames.length);shell.view.replaceChildren();draw(frames[at],shell.view,at);highlight(shell.view,shell.query);previous.disabled=at===0;next.disabled=at===frames.length-1;count.textContent=`Шаг ${at+1} из ${frames.length}`;}
  return {render,restart(){at=0;render();}};
}
function generator(s,fixtures){
  let n=3,step;
  select(s.controls,'Начальное n',Array.from({length:5},(_,i)=>[i,String(i)]),n,value=>{n=Number(value);step.restart();});
  step=stepper(s,()=>fixtures.generators[n],(f,view)=>{
    status(view,f.state==='GEN_CREATED'?'Генератор создан. Аргумент n сохранён, но тело ещё не выполнялось.':f.state==='GEN_CLOSED'?'Условие цикла стало ложным. Генератор завершён; следующий next() также вызовет StopIteration.':`next() дошёл до yield и выдал ${f.result}. Выполнение приостановлено; локальное n сохранено.`);
    view.append(code(`def countdown(n):\n    while n > 0:\n        yield n\n        n -= 1\n\ngen = countdown(${n})\n# Далее нажимаем next(gen)`,f.line));
    const values=node('div','demo-values');values.append(panel('Состояние',f.state.replace('GEN_','')),panel('Локальная n',f.locals.n??'Кадр закрыт'),panel('Результат next()',f.result));
    view.append(values,panel('Уже выдано',JSON.stringify(f.values)));
  });step.render();
}
function decorators(s){
  let x=2,order='double-first',step;
  number(s.controls,'Аргумент x (−10…10)',x,value=>{x=value;step.restart();});
  select(s.controls,'Порядок сверху вниз',[['double-first','@double → @plus_three'],['plus-first','@plus_three → @double']],order,value=>{order=value;step.restart();});
  step=stepper(s,()=>decoratorFrames(x,order),(f,view)=>{
    status(view,f.text);view.append(code(decoratorCode(x,order),f.line));
    const stack=node('ol','demo-stack');f.stack.forEach(name=>stack.append(node('li','',name)));
    if(!f.stack.length)stack.append(node('li','','Нет активных вызовов'));
    const values=node('div','demo-values');values.append(panel('Стек: внешний → внутренний',stack),panel('Возвращаемое значение',f.value));view.append(values);
  });step.render();
}
function graph(frame){
  const wrap=node('div','demo-graph');wrap.tabIndex=0;wrap.setAttribute('role','img');
  wrap.setAttribute('aria-label',`Граф коммитов. HEAD: ${frame.head}. Ветки: ${Object.entries(frame.refs).map(([k,v])=>k+' у '+v).join(', ')}.`);
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.setAttribute('viewBox','0 0 520 148');svg.setAttribute('aria-hidden','true');
  const branching=frame.nodes.some(n=>n.id==='F');
  const locations=branching?{A:[45,75],F:[185,35],M:[185,111],R:[345,75]}:Object.fromEntries(frame.nodes.map((n,i)=>[n.id,[45+i*130,75]]));
  for(const item of frame.nodes){for(const parent of item.parents){const p=document.createElementNS(svg.namespaceURI,'path');const a=locations[parent],b=locations[item.id];p.setAttribute('d',`M ${a[0]} ${a[1]} L ${b[0]} ${b[1]}`);p.setAttribute('class','demo-edge');svg.append(p);}}
  for(const item of frame.nodes){
    const [x,y]=locations[item.id],g=document.createElementNS(svg.namespaceURI,'g');
    g.setAttribute('class',frame.reachable.includes(item.id)?'demo-node':'demo-node inactive');
    const circle=document.createElementNS(svg.namespaceURI,'circle');circle.setAttribute('cx',x);circle.setAttribute('cy',y);circle.setAttribute('r','16');g.append(circle);
    const text=document.createElementNS(svg.namespaceURI,'text');text.setAttribute('x',x);text.setAttribute('y',y+5);text.textContent=item.id;g.append(text);
    const refs=Object.entries(frame.refs).filter(([,id])=>id===item.id).map(([name])=>name);
    if(frame.head===item.id)refs.push('HEAD');
    const label=document.createElementNS(svg.namespaceURI,'text');label.setAttribute('x',x<80?14:x);label.setAttribute('text-anchor',x<80?'start':'middle');label.setAttribute('y',y<60?y+36:y-26);label.setAttribute('class','demo-ref');label.textContent=refs.join(' · ');g.append(label);svg.append(g);
  }
  wrap.append(svg);return wrap;
}
function git(s,fixtures,spec){
  let scenario=spec.scenario||'workflow',mode='soft',step;
  const modeBox=node('div');
  select(s.controls,'Сценарий',[['workflow','Рабочая папка → индекс → коммит'],['undo','Отмена: reset / revert'],['merge','Ветки и слияние']],scenario,value=>{scenario=value;modeBox.hidden=scenario!=='undo';step.restart();});
  s.controls.append(modeBox);select(modeBox,'Способ отмены',[['soft','reset --soft'],['mixed','reset --mixed'],['hard','reset --hard'],['revert','revert']],mode,value=>{mode=value;step.restart();});modeBox.hidden=scenario!=='undo';
  step=stepper(s,()=>fixtures.git[scenario==='undo'?mode:scenario],(f,view)=>{
    status(view,f.explanation);view.append(node('p','demo-command',f.command),graph(f));
    const names=[...new Set([...Object.keys(f.working),...Object.keys(f.index),...Object.keys(f.headFiles)])];
    view.append(table(['Файл','Рабочая папка','Индекс','HEAD'],names.map(name=>[name,f.working[name]??'нет файла',f.index[name]??'нет файла',f.headFiles[name]??'нет файла'])));
    if(scenario==='undo'&&mode!=='revert')view.append(node('p','when','Бледный коммит остаётся объектом Git, но больше не входит в текущую ветку.'));
  });step.render();
}
const dfCode='import pandas as pd\ndf = pd.DataFrame({\n    "city": ["Москва", "Казань", "Москва", "Казань"],\n    "price": [100, 200, 300, 400], "qty": [2, 1, 3, 2]\n}, index=[10, 20, 30, 40])';
function pandas(s,fixtures){
  const f=fixtures.pandas,initial={mode:'selection',axis:'loc',choice:'one20',threshold:'150',city:'all',aggregate:'sum'};
  let state={...initial},history=[];const fields={};
  const changed=(key,value)=>{history.push({...state});state={...state,[key]:value};render();};
  fields.mode=select(s.controls,'Операция',[['selection','Индексирование'],['filter','Фильтрация'],['group','Группировка']],state.mode,v=>changed('mode',v));
  const sel=node('div','demo-controls'),filters=node('div','demo-controls');s.controls.append(sel,filters);
  fields.axis=select(sel,'Способ выбора',[['loc','loc — метки'],['iloc','iloc — позиции']],state.axis,v=>changed('axis',v));
  fields.choice=select(sel,'Аргумент',f.choices.map(c=>[c.id,c.label]),state.choice,v=>changed('choice',v));
  fields.threshold=select(filters,'Цена не меньше',[0,150,250,450].map(n=>[n,n]),state.threshold,v=>changed('threshold',v));
  fields.city=select(filters,'Город',[['all','Все'],['Москва','Москва'],['Казань','Казань']],state.city,v=>changed('city',v));
  const agg=node('div');filters.append(agg);fields.aggregate=select(agg,'Агрегация',[['sum','sum — сумма'],['mean','mean — среднее']],state.aggregate,v=>changed('aggregate',v));
  const back=button('Назад',()=>{if(history.length){state=history.pop();render();}}),reset=button('Сброс',()=>{state={...initial};history=[];render();});s.actions.append(back,reset);
  function render(){
    for(const [key,field]of Object.entries(fields))field.value=state[key];
    sel.hidden=state.mode!=='selection';filters.hidden=state.mode==='selection';agg.hidden=state.mode!=='group';back.disabled=!history.length;s.view.replaceChildren();
    let result,query;
    if(state.mode==='selection'){
      result=pandasSelection(f,state.axis,state.choice);const choice=f.choices.find(c=>c.id===state.choice);
      const arg='value'in choice?String(choice.value):`${choice.start}:${choice.end}`;
      query=`df.${state.axis}[${arg}]`;
      status(s.view,result.error?`${query} → ${result.error}. ${state.axis==='loc'?'Такой метки нет в индексе.':'Такой позиции нет: допустимы позиции 0–3.'}`:state.axis==='loc'?'loc выбирает по меткам. У среза конечная метка включается.':'iloc выбирает по позициям от нуля. Конец среза не включается.');
    }else{
      result=pandasFilter(f,state.threshold,state.city,state.aggregate);
      query=`mask = df["price"] >= ${state.threshold}`+(state.city==='all'?'':`\nmask = mask & (df["city"] == "${state.city}")`)+`\nselected = df.loc[mask]`+(state.mode==='group'?`\nresult = selected.groupby("city")["price"].${state.aggregate}()`:'\nresult = selected');
      status(s.view,`Условию соответствуют ${result.rows.length} из ${f.rows.length} строк.`+(state.mode==='group'?' Сначала выполняется фильтрация, затем агрегация по городу.':''));
    }
    const selected=f.rows.map((r,i)=>result.rows.some(x=>x.index===r.index)?i:-1).filter(i=>i>=0);
    s.view.append(panel('Исходная таблица (выбранные строки выделены)',table(['index','city','price','qty'],f.rows.map(r=>Object.values(r)),selected)),code(dfCode+'\n\n'+query));
    if(state.mode==='group')s.view.append(panel('Результат группировки',result.groups.length?table(['city',`price · ${state.aggregate}`],result.groups.map(r=>[r.city,r.price])):node('p','','Пустая таблица: нет подходящих строк.')));
    else s.view.append(panel('Результат',result.error?node('p','demo-error',result.error):result.rows.length?table(['index','city','price','qty'],result.rows.map(r=>Object.values(r))):node('p','','Пустая таблица: нет подходящих строк.')));
    highlight(s.view,s.query);
  }render();
}
function regex(s,fixtures){
  const patterns=fixtures.regex,initial={pattern:'digits',text:'0',method:'search'};let state={...initial},history=[];
  const fields={};const changed=(key,value)=>{history.push({...state});state={...state,[key]:value};if(key==='pattern')state.text='0';render();};
  fields.pattern=select(s.controls,'Шаблон',patterns.map(p=>[p.id,p.label]),state.pattern,v=>changed('pattern',v));
  fields.text=select(s.controls,'Строка',patterns[0].texts.map((t,i)=>[i,t||'(пустая строка)']),state.text,v=>changed('text',v));
  fields.method=select(s.controls,'Метод',[['search','search — где угодно'],['match','match — с начала'],['fullmatch','fullmatch — вся строка']],state.method,v=>changed('method',v));
  const back=button('Назад',()=>{if(history.length){state=history.pop();render();}}),reset=button('Сброс',()=>{state={...initial};history=[];render();});s.actions.append(back,reset);
  function render(){
    const p=patterns.find(p=>p.id===state.pattern);fields.pattern.value=state.pattern;
    fields.text.replaceChildren();p.texts.forEach((t,i)=>{const option=node('option','',t||'(пустая строка)');option.value=i;fields.text.append(option);});fields.text.value=state.text;fields.method.value=state.method;back.disabled=!history.length;
    const text=p.texts[Number(state.text)],result=regexResult(patterns,state.pattern,state.text,state.method);s.view.replaceChildren();
    status(s.view,result?`${state.method} нашёл совпадение. Границы [${result.span[0]}, ${result.span[1]}) считаются по символам Python; правая граница не входит.`:`${state.method} не нашёл совпадения: результат None.`);
    const line=node('p','demo-match');
    if(result){const chars=[...text];line.append(document.createTextNode(chars.slice(0,result.span[0]).join('')),node('mark','',chars.slice(...result.span).join('')),document.createTextNode(chars.slice(result.span[1]).join('')));}else line.textContent=text||'(пустая строка)';
    s.view.append(panel('Исходная строка и совпадение',line),code(`import re\ntext = ${JSON.stringify(text)}\nm = re.${state.method}(r"${p.pattern}", text)\nprint(m.group(0) if m else None)`));
    s.view.append(panel('group(0)',result?result.text:'None'));
    if(result?.groups.length)s.view.append(table(['Группа','Значение'],result.groups.map((value,i)=>[i+1,value])));
    if(result&&Object.keys(result.named).length)s.view.append(panel('Именованные группы',JSON.stringify(result.named)));
    s.view.append(node('p','when','Подготовленные примеры рассчитаны Python re. Шаблон даты проверяет форму записи; календарную корректность проверяй отдельно.'));
    highlight(s.view,s.query);
  }render();
}
function mocks(s){
  let value=2,expected=2,scenario='success',step;
  number(s.controls,'Значение ответа (−10…10)',value,v=>{value=v;step.restart();});number(s.controls,'Ожидается в тесте',expected,v=>{expected=v;step.restart();});
  select(s.controls,'Ответ API',[['success','Успех сразу'],['error','Две ошибки TimeoutError'],['retry','Ошибка → успешная попытка']],scenario,v=>{scenario=v;step.restart();});
  step=stepper(s,()=>mockFrames(value,expected,scenario),(f,view)=>{
    status(view,f.text);view.append(code(mockCode(value,expected,scenario),f.line));
    view.append(panel('Вызовы Mock',f.calls.length?table(['Попытка','Ответ'],f.calls.map(c=>[c.attempt,c.result])):node('p','','Вызовов пока нет.')));
    const values=node('div','demo-values');values.append(panel('Фактическое значение',f.actual),panel('Ожидаемое',expected),panel('Проверка',f.outcome==='pending'?'Ещё не завершена':f.outcome==='pass'?'Тест прошёл':'Тест упал'));view.append(values);
  });step.render();
}
export async function mountDemo(host,spec){
  fixturePromise??=fetch(new URL('../data/demo-fixtures.json',import.meta.url)).then(r=>{if(!r.ok)throw new Error('Fixtures unavailable');return r.json();}).catch(e=>{fixturePromise=undefined;throw e;});
  const fixtures=await fixturePromise;if(!host.isConnected)return;
  const build={generator,decorators,git,pandas,regex,mocks}[spec.type];if(!build)throw new Error('Unknown demo');
  const s=shell(host,spec);build(s,fixtures,spec);highlight(host,spec.query);
}
