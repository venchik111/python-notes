import {normalize, tokens, createIndex, search} from './search.js';

const content = document.querySelector('#content');
const nav = document.querySelector('#lesson-nav');
const input = document.querySelector('#search');
const sidebar = document.querySelector('#sidebar');
const menuButton = document.querySelector('#menu-button');
const closeButton = document.querySelector('#close-menu');
const backdrop = document.querySelector('#backdrop');
const announcer = document.querySelector('#announcer');
const mobile = matchMedia('(max-width: 680px)');
let data, index, searchTimer;

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function counted(number, forms) {
  const tail = number % 100;
  const form = tail >= 11 && tail <= 14 ? forms[2]
    : number % 10 === 1 ? forms[0] : number % 10 >= 2 && number % 10 <= 4 ? forms[1] : forms[2];
  return `${number} ${form}`;
}
function url(lesson, topic, q) {
  const params = new URLSearchParams();
  if (lesson) params.set('lesson', lesson);
  if (topic) params.set('topic', topic);
  if (q) params.set('q', q);
  return `#${params}`;
}
function link(text, href, className) {
  const node = el('a', className, text); node.href = href; return node;
}
function highlighted(tag, className, text, query) {
  const node = el(tag, className);
  const folded = normalize(text);
  const intervals = [];
  for (const word of tokens(query)) {
    for (let at = folded.indexOf(word); at !== -1; at = folded.indexOf(word, at + word.length)) {
      intervals.push([at, at + word.length]);
    }
  }
  intervals.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of intervals) {
    const prev = merged.at(-1);
    if (prev && range[0] <= prev[1]) prev[1] = Math.max(prev[1], range[1]);
    else merged.push([...range]);
  }
  let cursor = 0;
  for (const [start, end] of merged) {
    node.append(document.createTextNode(text.slice(cursor, start)), el('mark', '', text.slice(start, end)));
    cursor = end;
  }
  node.append(document.createTextNode(text.slice(cursor)));
  return node;
}
function codeBlock(code, language, query) {
  const block = el('div', 'code-block');
  const header = el('div', 'code-header');
  const button = el('button', 'copy-button', 'Копировать'); button.type = 'button';
  button.setAttribute('aria-label', 'Копировать пример');
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(code);
      button.textContent = 'Скопировано';
      announcer.textContent = 'Пример скопирован';
    } catch {
      button.textContent = 'Выдели код вручную';
      announcer.textContent = 'Буфер обмена недоступен. Выдели и скопируй код вручную.';
    }
    setTimeout(() => {button.textContent = 'Копировать';}, 2000);
  });
  header.append(el('span', '', language), button);
  const pre = el('pre'); pre.tabIndex = 0; pre.setAttribute('aria-label', `Пример: ${language}`);
  pre.append(highlighted('code', '', code, query)); block.append(header, pre); return block;
}
function references(items, className = 'references') {
  const box = el('div', className);
  for (const item of items) {
    try {
      const source = new URL(item.url);
      if (!['https:', 'http:'].includes(source.protocol)) continue;
      const a = link(item.title, source.href); a.target = '_blank'; a.rel = 'noopener noreferrer';
      box.append(a);
    } catch { /* A malformed source link must not break the lesson. */ }
  }
  return box;
}
function menu(open, restoreFocus = true) {
  const isOpen = open && mobile.matches;
  sidebar.classList.toggle('open', isOpen);
  backdrop.hidden = !isOpen;
  menuButton.setAttribute('aria-expanded', String(isOpen));
  document.body.classList.toggle('menu-open', isOpen);
  sidebar.inert = mobile.matches && !isOpen;
  if (isOpen) closeButton.focus();
  else if (restoreFocus && mobile.matches) menuButton.focus();
}
menuButton.addEventListener('click', () => menu(!sidebar.classList.contains('open')));
closeButton.addEventListener('click', () => menu(false));
backdrop.addEventListener('click', () => menu(false));
mobile.addEventListener('change', () => menu(false, false));
nav.addEventListener('click', e => {if (e.target.closest('a')) menu(false, false);});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape' && sidebar.classList.contains('open')) {e.preventDefault();menu(false);return;}
  if (e.key === 'Tab' && sidebar.classList.contains('open')) {
    const controls = [...sidebar.querySelectorAll('a,button')];
    if (e.shiftKey && document.activeElement === controls[0]) {e.preventDefault();controls.at(-1).focus();}
    else if (!e.shiftKey && document.activeElement === controls.at(-1)) {e.preventDefault();controls[0].focus();}
  }
  if (e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey &&
      !e.target.closest('input,textarea,[contenteditable="true"]')) {
    e.preventDefault();input.focus();
  }
});
input.addEventListener('input', () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const query = input.value.trim();
    history.replaceState(null, '', url(null, null, query));
    render({scroll: true, keepSearch: true});
  }, 100);
});
input.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    clearTimeout(searchTimer);input.value = '';
    history.replaceState(null, '', '#');render({scroll: true});
  }
});
window.addEventListener('hashchange', () => {
  clearTimeout(searchTimer);
  if (location.hash === '#content') {content.focus(); return;}
  render({scroll: true, focus: true});
});

function renderNav(active) {
  nav.replaceChildren();
  const all = link('Все уроки', '#', `all-lessons${!active ? ' active' : ''}`);
  if (!active) all.setAttribute('aria-current', 'page');
  nav.append(all);
  for (const module of data.modules) {
    const section = el('section', 'nav-module');
    section.append(el('h2', '', `${String(module.number).padStart(2, '0')} / ${module.title}`));
    for (const lesson of data.lessons.filter(l => l.moduleId === module.id)) {
      const a = link('', url(lesson.id), `lesson-link${lesson.id === active ? ' active' : ''}`);
      a.append(el('span', 'lesson-number', lesson.number || 'ПР'), el('span', '', lesson.title));
      if (lesson.id === active) a.setAttribute('aria-current', 'page');
      section.append(a);
    }
    nav.append(section);
  }
}
function overview() {
  content.append(el('span', 'eyebrow', 'Личный справочник'), el('h1', '', 'Python под рукой'),
    el('p', 'lead', 'Найди нужную тему, вспомни правило, посмотри пример. Уроки — в порядке курса, поиск — по всей базе.'));
  const stats = el('div', 'stats-line');
  stats.append(el('span', '', `${data.lessons.length} занятий`),el('span', '', `${index.length} тем`),
    el('span', '', `Обновлено ${data.updatedAt.split('-').reverse().join('.')}`));
  content.append(stats);
  for (const module of data.modules) {
    const section = el('section', 'overview-module');
    const heading = el('h2'); heading.append(el('span', 'module-num', String(module.number).padStart(2,'0')),
      document.createTextNode(module.title)); section.append(heading);
    for (const lesson of data.lessons.filter(l => l.moduleId === module.id)) {
      const a = link('', url(lesson.id), 'lesson-row');
      const body = el('span');body.append(el('span','row-title',lesson.title),el('span','row-description',lesson.summary));
      a.append(el('span','row-number',lesson.number || 'ПР'),body,el('span','row-count',counted(lesson.topics.length,['тема','темы','тем'])));
      section.append(a);
    }
    content.append(section);
  }
  document.title = 'Python · заметки';
}
function results(query) {
  const found = search(index, query);
  content.append(el('span','eyebrow','По всей базе'),el('h1','','Результаты поиска'),
    el('p','result-count',`${counted(found.length,['совпадение','совпадения','совпадений'])} по запросу «${query}»`));
  announcer.textContent = `Найдено тем: ${found.length}`;
  if (!found.length) {
    const empty = el('div','empty-state');empty.append(el('h2','','Ничего не нашлось'),
      el('p','','Попробуй короткий термин: «генератор», «pytest», «git reset» или «дата». Можно искать часть слова.'));
    content.append(empty);
  }
  for (const hit of found) {
    const a = link('', url(hit.lesson.id, hit.topic.id, query), 'search-result');
    const module = data.modules.find(m=>m.id===hit.lesson.moduleId);
    a.append(el('span','result-path',`${module.title} / ${hit.lesson.number || 'Практика'} ${hit.lesson.title}`),
      highlighted('h2','',hit.topic.title,query),highlighted('p','result-snippet',hit.snippet,query));
    content.append(a);
  }
  document.title = `Поиск: ${query} · Python заметки`;
}
function lessonPage(lesson, query) {
  const module = data.modules.find(m=>m.id===lesson.moduleId);
  if (query) content.append(link('← Вернуться к результатам',url(null,null,query),'back-results'));
  const crumb = el('div','breadcrumb');crumb.append(el('span','',module.title),el('span','','/'),
    el('span','',lesson.number ? `Урок ${lesson.number}` : 'Дополнительная практика'));
  content.append(crumb,el('h1','',lesson.title),el('p','lead',lesson.summary));
  const outline = el('nav','topics-nav');outline.setAttribute('aria-label','Темы урока');
  for (const topic of lesson.topics) outline.append(link(topic.title,url(lesson.id,topic.id,query)));
  content.append(outline);
  if (lesson.setup) {
    const setup = el('details','setup');setup.append(el('summary','','Данные для примеров в этом уроке'),
      el('p','when','Примеры с df используют эту таблицу. Выполни её создание перед выбранным примером.'),codeBlock(lesson.setup,'python',query));
    content.append(setup);
  }
  lesson.topics.forEach((topic, position) => {
    const section = el('section','topic');section.id = `topic-${topic.id}`;
    const heading = el('div','topic-heading');
    const title = el('h2'); const a = link('',url(lesson.id,topic.id,query));
    a.append(highlighted('span','',topic.title,query));title.append(a);
    heading.append(el('span','topic-index',String(position+1).padStart(2,'0')),title);
    section.append(heading,highlighted('p','when',topic.when,query),highlighted('p','rule',topic.rule,query),
      codeBlock(topic.code,topic.language,query));
    const error = el('p','pitfall');error.append(el('strong','','Частая ошибка.'),document.createTextNode(' '),highlighted('span','',topic.error,query));section.append(error);
    if (topic.details.length) {
      const details = el('details');details.append(el('summary','','Пояснения и нюансы'));
      const body = el('div','details-body');
      topic.details.forEach(text=>body.append(highlighted('p','',text,query)));
      details.open = tokens(query).some(word=>normalize(topic.details.join(' ')).includes(word));
      details.append(body);section.append(details);
    }
    if (topic.references.length) section.append(references(topic.references));
    content.append(section);
  });
  const footer = el('footer','source-footer');
  footer.append(el('span','','Подготовлено по материалам урока Skypro. Исходные материалы:'),references(lesson.sources));
  content.append(footer);
  document.title = `${lesson.number} ${lesson.title} · Python заметки`.trim();
}
function render(options = {}) {
  if (!data) return;
  const params = new URLSearchParams(location.hash.slice(1));
  const query = params.get('q') || '';
  const lessonId = params.get('lesson');
  const topicId = params.get('topic');
  if (!options.keepSearch) input.value = query;
  content.replaceChildren();content.setAttribute('aria-busy','false');
  const lesson = data.lessons.find(l=>l.id===lessonId);
  renderNav(lesson?.id);
  if (lessonId && !lesson) {
    content.append(el('h1','','Урок не найден'),el('p','lead','Ссылка могла устареть. Открой нужный урок из списка.'),link('Все уроки','#'));
    document.title='Урок не найден · Python заметки';
  } else if (lesson) lessonPage(lesson,query);
  else if (query.trim()) results(query);
  else overview();
  if (options.scroll) window.scrollTo({top:0,behavior:'instant'});
  if (options.focus) content.focus({preventScroll:true});
  if (lesson && topicId) {
    const target = document.getElementById(`topic-${topicId}`);
    if (target) requestAnimationFrame(()=>target.scrollIntoView({block:'start',behavior:'instant'}));
    else announcer.textContent='Тема не найдена. Показан урок целиком.';
  }
  menu(false,false);
}
async function load() {
  content.setAttribute('aria-busy','true');
  try {
    const response = await fetch(new URL('./data/lessons.json',import.meta.url),{cache:'no-cache'});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const next = await response.json();
    if (next.version !== 1 || !Array.isArray(next.lessons) || !Array.isArray(next.modules)) throw new Error('Invalid data');
    data = next;index = createIndex(data);
    document.querySelector('#base-count').textContent=`${data.lessons.length} занятий · ${index.length} тем`;
    render();
  } catch {
    content.setAttribute('aria-busy','false');content.replaceChildren(el('h1','','Не удалось загрузить памятки'),
      el('p','lead','Проверь соединение и попробуй ещё раз.'));
    const button = el('button','retry-button','Повторить загрузку');button.type='button';
    button.addEventListener('click',()=>{button.disabled=true;load();});content.append(button);
    announcer.textContent='Ошибка загрузки базы знаний';
  }
}
menu(false,false);
load();
