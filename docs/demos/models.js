export const clampStep = (step, length) => Math.max(0, Math.min(length - 1, step));
export const integer = value => Number.isInteger(Number(value)) && Number(value)>=-10 && Number(value)<=10;

export function decoratorCode(x, order) {
  const outer=order==='double-first'?'double':'plus_three';
  const inner=outer==='double'?'plus_three':'double';
  return `def double(func):\n    def wrapper(x):\n        return 2 * func(x)\n    return wrapper\n\ndef plus_three(func):\n    def wrapper(x):\n        return func(x) + 3\n    return wrapper\n\n@${outer}\n@${inner}\ndef f(x):\n    return x + 1\n\nresult = f(${x})`;
}
export function decoratorFrames(x, order) {
  const outer=order==='double-first'?'double':'plus_three';
  const inner=outer==='double'?'plus_three':'double';
  const apply=(name,value)=>name==='double'?2*value:value+3;
  const base=x+1, middle=apply(inner,base), result=apply(outer,middle);
  return [
    {line:0,stack:[],value:'—',text:'Определены функции. Декораторы ещё не применены к f.'},
    {line:12,stack:[],value:'—',text:`Сначала применяется нижний @${inner}: создана обёртка ${inner}(f).`},
    {line:11,stack:[],value:'—',text:`Затем верхний @${outer}. Имя f теперь указывает на ${outer}(${inner}(исходная f)).`},
    {line:outer==='double'?3:8,stack:[outer],value:'—',text:`Вызов f(${x}) входит во внешнюю обёртку ${outer}. Она ждёт результат внутренней.`},
    {line:inner==='double'?3:8,stack:[outer,inner],value:'—',text:`Внутри вызывается ${inner}; теперь обе обёртки ждут исходную функцию.`},
    {line:14,stack:[outer,inner,'f'],value:base,text:`Исходная f возвращает ${x} + 1 = ${base}.`},
    {line:inner==='double'?3:8,stack:[outer],value:middle,text:`Внутренняя ${inner} преобразует ${base} в ${middle} и возвращает значение внешней.`},
    {line:16,stack:[],value:result,text:`Внешняя ${outer} возвращает ${result}. Создание обёрток шло снизу вверх, вход при вызове — снаружи внутрь.`}
  ];
}
export function mockCode(value,expected,scenario){
  const sequence=scenario==='success'?`[{"value": ${value}}]`:scenario==='retry'?`[TimeoutError(), {"value": ${value}}]`:'[TimeoutError(), TimeoutError()]';
  return `from unittest.mock import Mock\napi = Mock(side_effect=${sequence})\n\ndef load_value():\n    for attempt in range(2):\n        try:\n            return api()["value"]\n        except TimeoutError:\n            if attempt == 1:\n                raise\n\nassert load_value() == ${expected}`;
}
export function mockFrames(value,expected,scenario){
  const frames=[],calls=[];
  const push=(text,line=0,actual='—',outcome='pending')=>frames.push({text,line,actual,outcome,calls:calls.map(c=>({...c}))});
  push('Mock подготовлен. Вместо сети используются заданные ответы; вызовов пока нет.',2);
  const attempts=scenario==='success'?1:2;
  for(let i=1;i<=attempts;i++){
    calls.push({attempt:i,result:'выполняется'});push(`Попытка ${i}: вызывается api().`,7);
    const failed=scenario==='error'||(scenario==='retry'&&i===1);
    calls.at(-1).result=failed?'TimeoutError':`{"value": ${value}}`;
    if(failed){
      push(`Попытка ${i} выбрасывает TimeoutError.`,8);
      if(i===1)push('Лимит ещё не достигнут: цикл переходит ко второй попытке.',5);
      else push('Вторая попытка тоже неудачна: исключение пробрасывается. До сравнения результата выполнение не доходит.',10,'TimeoutError','fail');
    }else{
      push(`Из словаря ответа извлечено value = ${value}.`,7,value);
      push(value===expected?`${value} == ${expected}: утверждение истинно, тест прошёл.`:`${value} != ${expected}: assert вызывает AssertionError, тест упал.`,12,value,value===expected?'pass':'fail');
    }
  }
  return frames;
}
export function pandasSelection(fixture,mode,choice){
  return fixture.selections[`${mode}|${choice}`];
}
export function pandasFilter(fixture,threshold,city,aggregate){
  return fixture.filters[`${threshold}|${city}|${aggregate}`];
}
export function regexResult(fixture,patternId,textIndex,method){
  return fixture.find(p=>p.id===patternId).cases[String(textIndex)][method];
}
export function previousState(history,current,next){
  return {history:[...history,structuredClone(current)],state:structuredClone(next)};
}
