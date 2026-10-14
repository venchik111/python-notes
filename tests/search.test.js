import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createIndex, search, normalize, excerpt} from '../docs/search.js';

const data=JSON.parse(readFileSync(new URL('../docs/data/lessons.json',import.meta.url)));
const index=createIndex(data);
test('all lessons, sources and topic IDs are consistent',()=>{
  assert.equal(data.lessons.length,14);
  assert.equal(data.lessons.filter(l=>l.kind==='practice').length,2);
  assert.equal(new Set(data.lessons.map(l=>l.id)).size,data.lessons.length);
  for(const l of data.lessons){
    assert(data.modules.some(m=>m.id===l.moduleId));
    assert(l.sources.length>0);assert(l.topics.length>0);
    assert.equal(new Set(l.topics.map(t=>t.id)).size,l.topics.length);
    for(const t of l.topics){
      for(const key of ['id','title','when','rule','code','error'])assert(t[key],`${l.id}/${t.id}: ${key}`);
      assert(Array.isArray(t.details));assert(Array.isArray(t.terms));
    }
  }
});
test('practical queries find expected topics across lessons',()=>{
  for(const [query,id] of [['pytest','tests'],['yield','yield'],['git reset','undo'],['datetime','datetime'],
    ['декорат','decorator'],['генератор','expression'],['poetry shell','poetry'],['фикстур','fixtures'],
    ['list comprehension','comprehension']]){
    assert(search(index,query).some(r=>r.topic.id===id),query);
  }
  assert.equal(search(index,'git reset')[0].topic.id,'undo');
  assert(search(index,'git reset')[0].snippet.includes('git reset'));
});
test('case, ё/е, partial words and whitespace are normalized',()=>{
  assert.equal(normalize('СЧЁТЧИК'),'счетчик');
  assert.deepEqual(search(index,'СЧЁТЧИК').map(r=>r.topic.id),search(index,'счетчик').map(r=>r.topic.id));
  assert.deepEqual(search(index,' git   reset ').map(r=>r.topic.id),search(index,'git reset').map(r=>r.topic.id));
  assert(search(index,'  PYTEST ').length>0);
});
test('hidden explanations and code punctuation remain searchable',()=>{
  assert(search(index,'поэзии-нет').length===0);
  assert(search(index,'poetry-plugin-shell').some(r=>r.topic.id==='poetry'));
  assert(search(index,'capsys.readouterr().out').some(r=>r.topic.id==='decorator-tests'));
  assert(search(index,'однократ').some(r=>r.topic.id==='expression'));
});
test('empty and arbitrary input do not return all topics or throw',()=>{
  assert.deepEqual(search(index,''),[]);assert.deepEqual(search(index,'   '),[]);
  for(const q of ['[.*+?','<script>alert(1)</script>','zzzz-no-such-topic'])assert.deepEqual(search(index,q),[]);
});
test('snippet includes a match buried in a long explanation',()=>{
  const text='начало '.repeat(100)+'poetry-plugin-shell'+' конец'.repeat(100);
  assert(excerpt(text,'poetry-plugin-shell').includes('poetry-plugin-shell'));
});
