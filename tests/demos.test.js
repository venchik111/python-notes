import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {clampStep,decoratorFrames,mockFrames,pandasSelection,pandasFilter,regexResult} from '../docs/demos/models.js';
const f=JSON.parse(readFileSync(new URL('../docs/data/demo-fixtures.json',import.meta.url)));
test('generator: not started, yields, exhaustion and zero-length input',()=>{
  for(const n of [0,1,2,3,4]){
    const frames=f.generators[n];
    assert.equal(frames[0].state,'GEN_CREATED');assert.deepEqual(frames[0].values,[]);
    assert.equal(frames.at(-1).state,'GEN_CLOSED');assert.equal(frames.at(-1).result,'StopIteration');
    assert.deepEqual(frames.at(-1).values,Array.from({length:n},(_,i)=>n-i));
    assert.equal(clampStep(-1,frames.length),0);assert.equal(clampStep(100,frames.length),frames.length-1);
  }
});
test('decorator order agrees with execution of Python decorators',()=>{
  for(const [key,expected]of Object.entries(f.decorators)){
    const [order,x]=key.split('|');const frames=decoratorFrames(Number(x),order);
    assert.equal(frames.at(-1).value,expected,key);
    assert.equal(frames[1].text.includes(order==='double-first'?'plus_three':'double'),true);
    assert.deepEqual(frames[5].stack,order==='double-first'?['double','plus_three','f']:['plus_three','double','f']);
  }
  assert.equal(decoratorFrames(2,'double-first').at(-1).value,12);
  assert.equal(decoratorFrames(2,'plus-first').at(-1).value,9);
});
test('Git snapshots distinguish index, working files and history',()=>{
  const workflow=f.git.workflow;
  assert.equal(workflow[3].working['note.txt'],'v3');assert.equal(workflow[3].index['note.txt'],'v2');
  assert.equal(workflow[4].headFiles['note.txt'],'v2');assert.equal(workflow[4].working['note.txt'],'v3');
  for(const [mode,staged,working]of [['soft','staged','draft'],['mixed','v2','draft'],['hard','v2','v2']]){
    const frame=f.git[mode].at(-1);assert.equal(frame.head,'B');assert.equal(frame.index['note.txt'],staged);assert.equal(frame.working['note.txt'],working);assert(!frame.reachable.includes('C'));
  }
  const reverted=f.git.revert.at(-1);assert.deepEqual(reverted.reachable,['R','C','B','A']);
  assert.equal(reverted.headFiles['note.txt'],'v2');
  const merged=f.git.merge.at(-1);assert.deepEqual(merged.nodes.find(n=>n.id==='R').parents,['M','F']);
  assert.equal(merged.headFiles['feature.txt'],'новая возможность');assert.equal(merged.headFiles['note.txt'],'v2');
});
test('pandas labels, positions, empty selection and groups',()=>{
  assert.deepEqual(pandasSelection(f.pandas,'loc','one20').rows.map(r=>r.index),[20]);
  assert.equal(pandasSelection(f.pandas,'iloc','one20').error,'IndexError');
  assert.equal(pandasSelection(f.pandas,'loc','one1').error,'KeyError');
  assert.deepEqual(pandasSelection(f.pandas,'iloc','slice02').rows.map(r=>r.index),[10,20]);
  assert.deepEqual(pandasSelection(f.pandas,'loc','slice1030').rows.map(r=>r.index),[10,20,30]);
  assert.deepEqual(pandasFilter(f.pandas,450,'all','sum').rows,[]);
  assert.deepEqual(pandasFilter(f.pandas,0,'all','mean').groups,[{city:'Казань',price:300},{city:'Москва',price:200}]);
});
test('regex uses Python semantics, complete match, groups and Unicode spans',()=>{
  assert.equal(regexResult(f.regex,'digits',0,'match'),null);
  assert.equal(regexResult(f.regex,'digits',2,'fullmatch'),null);
  assert.equal(regexResult(f.regex,'digits',4,'search').text,'١٢٣');
  assert.deepEqual(regexResult(f.regex,'date',1,'fullmatch').groups,['17','10','2026']);
  assert.deepEqual(regexResult(f.regex,'word',1,'search').span,[1,6]);
  assert.equal(regexResult(f.regex,'word',3,'search'),null);
});
test('mock attempts and terminal outcomes agree with Python Mock',()=>{
  for(const [key,reference]of Object.entries(f.mocks)){
    const [scenario,number]=key.split('|');const value=Number(number);
    const good=mockFrames(value,value,scenario).at(-1);
    assert.equal(good.calls.length,reference.calls,key);
    assert.equal(good.outcome,reference.error?'fail':'pass',key);
    assert.equal(good.actual,reference.error||reference.actual,key);
    if(!reference.error)assert.equal(mockFrames(value,value+1,scenario).at(-1).outcome,'fail');
  }
});
