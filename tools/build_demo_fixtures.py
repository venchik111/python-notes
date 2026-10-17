"""Build deterministic teaching examples using real Python, pandas and temporary Git repos."""
import argparse
import inspect
import json
import re
import subprocess
import tempfile
from pathlib import Path
from unittest.mock import Mock
import pandas as pd

DEST=Path(__file__).resolve().parents[1]/'docs/data/demo-fixtures.json'

def countdown(n):
    while n > 0:
        yield n
        n -= 1

def generator_cases():
    cases={}
    for n in range(5):
        gen=countdown(n);values=[]
        frames=[dict(state=inspect.getgeneratorstate(gen),locals=dict(gen.gi_frame.f_locals),values=[],line=6,result='—')]
        while True:
            try:
                value=next(gen);values.append(value)
                frames.append(dict(state=inspect.getgeneratorstate(gen),locals=dict(gen.gi_frame.f_locals),values=values.copy(),line=gen.gi_frame.f_lineno-countdown.__code__.co_firstlineno+1,result=value))
            except StopIteration:
                frames.append(dict(state=inspect.getgeneratorstate(gen),locals={},values=values.copy(),line=0,result='StopIteration'));break
        cases[str(n)]=frames
    return cases

class Repo:
    def __init__(self,path):
        self.path=Path(path);self.known={}
        self.git('init','--initial-branch=main','--quiet')
        for key,value in [('user.name','Teaching Example'),('user.email','example@example.com'),('commit.gpgsign','false'),('core.autocrlf','false')]:self.git('config',key,value)
    def git(self,*args,ok=True):
        return subprocess.run(['git','-c','core.hooksPath=/dev/null',*args],cwd=self.path,text=True,capture_output=True,check=ok).stdout.strip()
    def write(self,file,text): (self.path/file).write_text(text+'\n')
    def commit(self,id):
        self.git('commit','-m',id,'--quiet');sha=self.git('rev-parse','HEAD');self.known[sha]=id
    def snapshot(self,command,explanation):
        work={p.name:p.read_text().strip() for p in sorted(self.path.glob('*.txt'))}
        files=self.git('ls-files').splitlines();staged={p:self.git('show',':'+p) for p in files}
        head_files=self.git('ls-tree','--name-only','HEAD').splitlines();head_data={p:self.git('show','HEAD:'+p) for p in head_files}
        nodes=[]
        for sha,id in self.known.items():
            parents=self.git('show','--format=%P','--no-patch',sha).split()
            nodes.append(dict(id=id,parents=[self.known[p] for p in parents]))
        refs={name:self.known[sha] for name,sha in (line.split('|') for line in self.git('for-each-ref','--format=%(refname:short)|%(objectname)','refs/heads').splitlines())}
        return dict(command=command,explanation=explanation,working=work,index=staged,headFiles=head_data,
                    head=self.known[self.git('rev-parse','HEAD')],branch=self.git('branch','--show-current'),refs=refs,nodes=nodes,
                    reachable=[self.known[sha] for sha in self.git('rev-list','HEAD').splitlines()])

def git_cases():
    out={}
    with tempfile.TemporaryDirectory(prefix='notes-git-fixtures-') as temp:
        root=Path(temp)
        def repo(name):
            p=root/name;p.mkdir();return Repo(p)
        r=repo('workflow');r.write('note.txt','v1');r.git('add','.');r.commit('A')
        frames=[r.snapshot('Начальное состояние','В коммите A, индексе и рабочей папке одинаковая версия v1.')]
        r.write('note.txt','v2');frames.append(r.snapshot('Изменить note.txt → v2','Редактирование меняет только рабочий файл.'))
        r.git('add','note.txt');frames.append(r.snapshot('git add note.txt','В индекс скопирована версия v2.'))
        r.write('note.txt','v3');frames.append(r.snapshot('Изменить note.txt → v3','В индексе по-прежнему v2, а на диске уже v3.'))
        r.commit('B');frames.append(r.snapshot('git commit -m B','Коммит B содержит v2 из индекса. Незакоммиченная v3 остаётся на диске.'))
        r.git('add','note.txt');frames.append(r.snapshot('git add note.txt','Теперь подготовлена версия v3.'))
        r.commit('C');frames.append(r.snapshot('git commit -m C','Все три слоя совпадают с коммитом C: v3.'))
        out['workflow']=frames
        for mode in ['soft','mixed','hard','revert']:
            r=repo(mode)
            for id,value in [('A','v1'),('B','v2'),('C','v3')]:r.write('note.txt',value);r.git('add','.');r.commit(id)
            if mode!='revert':
                r.write('note.txt','staged');r.git('add','.');r.write('note.txt','draft')
            frames=[r.snapshot('До отмены','Для reset индекс содержит staged, рабочий файл — draft.' if mode!='revert' else 'Для revert рабочая папка чистая: HEAD, индекс и файлы содержат v3.')]
            if mode=='revert':
                r.git('revert','--no-commit','HEAD');r.commit('R')
                command='git revert HEAD'
                explanation='Создан R после C. Изменение C компенсировано: файл снова v2, история A → B → C → R сохранена.'
            else:
                r.git('reset','--'+mode,'HEAD~1')
                command='git reset --'+mode+' HEAD~1'
                explanation={'soft':'HEAD у B, но индекс staged и рабочий draft сохранены.','mixed':'HEAD у B, индекс стал v2, рабочий draft сохранён.','hard':'HEAD, индекс и рабочий файл приведены к B (v2). Отслеживаемые незакоммиченные правки отброшены.'}[mode]
            frames.append(r.snapshot(command,explanation));out[mode]=frames
        r=repo('merge');r.write('note.txt','v1');r.git('add','.');r.commit('A')
        frames=[r.snapshot('Начальное состояние','main указывает на A.')]
        r.git('switch','-c','feature');frames.append(r.snapshot('git switch -c feature','Обе ветки у A; текущая — feature.'))
        r.write('feature.txt','новая возможность');r.git('add','.');r.commit('F');frames.append(r.snapshot('git add .; git commit -m F','Коммит F передвинул только feature.'))
        r.git('switch','main');frames.append(r.snapshot('git switch main','HEAD снова у main/A. Файл feature.txt отсутствует в этой версии.'))
        r.write('note.txt','v2');r.git('add','.');r.commit('M');frames.append(r.snapshot('git add .; git commit -m M','Истории разошлись от A: main у M, feature у F.'))
        r.git('merge','--no-ff','--no-commit','feature');r.commit('R');frames.append(r.snapshot('git merge feature','Создан коммит R с родителями M и F. Изменения разных файлов объединились без конфликта.'))
        out['merge']=frames
    return out

def regex_cases():
    patterns=[dict(id='digits',label='Цифры: \\d+',pattern=r'\d+',texts=['Номер 123, ещё 45','123','123abc','Нет цифр','Заказ ١٢٣']),
              dict(id='word',label='Слово и именованная группа',pattern=r'(?P<word>\w+)',texts=['Привет, мир!','🙂код42','abc','']),
              dict(id='date',label='Дата и три группы',pattern=r'(\d{2})\.(\d{2})\.(\d{4})',texts=['Дата 17.10.2026','17.10.2026','99.99.2026','Дата неизвестна'])]
    for p in patterns:
        p['cases']={}
        for i,text in enumerate(p['texts']):
            p['cases'][str(i)]={}
            for method in ['search','match','fullmatch']:
                m=getattr(re,method)(p['pattern'],text)
                p['cases'][str(i)][method]=None if m is None else dict(span=list(m.span()),text=m.group(),groups=list(m.groups()),named=m.groupdict())
    return patterns

def pandas_cases():
    df=pd.DataFrame({'city':['Москва','Казань','Москва','Казань'],'price':[100,200,300,400],'qty':[2,1,3,2]},index=[10,20,30,40])
    def records(frame):return frame.reset_index(names='index').to_dict(orient='records')
    choices=[dict(id='one20',label='Одна строка: 20',value=20),dict(id='one1',label='Одна строка: 1',value=1),dict(id='one4',label='Одна строка: 4',value=4),dict(id='slice02',label='Срез: 0:2',start=0,end=2),dict(id='slice1030',label='Срез: 10:30',start=10,end=30)]
    selections={}
    for mode in ['loc','iloc']:
        for choice in choices:
            key=mode+'|'+choice['id']
            try:
                axis=getattr(df,mode)
                value=axis[choice['start']:choice['end']] if 'start' in choice else axis[[choice['value']]]
                selections[key]=dict(rows=records(value),error=None)
            except (KeyError,IndexError) as exc:selections[key]=dict(rows=[],error=type(exc).__name__)
    filters={}
    for threshold in [0,150,250,450]:
        for city in ['all','Москва','Казань']:
            mask=df.price>=threshold
            if city!='all':mask=mask & (df.city==city)
            selected=df.loc[mask]
            for agg in ['sum','mean']:
                groups=selected.groupby('city',sort=True)['price'].agg(agg).reset_index().to_dict(orient='records')
                filters[f'{threshold}|{city}|{agg}']=dict(rows=records(selected),groups=groups,mask=mask.tolist())
    return dict(rows=records(df),choices=choices,selections=selections,filters=filters)

def mock_cases():
    out={}
    for mode in ['success','error','retry']:
        for value in range(-10,11):
            call=Mock()
            call.side_effect=[{'value':value}] if mode=='success' else [TimeoutError(),{'value':value}] if mode=='retry' else [TimeoutError(),TimeoutError()]
            actual=None;error=None
            for _ in range(2):
                try:actual=call()['value'];break
                except TimeoutError:error='TimeoutError'
            if actual is not None:error=None
            out[f'{mode}|{value}']=dict(actual=actual,error=error,calls=call.call_count)
    return out

def decorator_cases():
    def double(func):
        def wrapper(x):return 2*func(x)
        return wrapper
    def plus_three(func):
        def wrapper(x):return func(x)+3
        return wrapper
    def f(x):return x+1
    functions={'double-first':double(plus_three(f)),'plus-first':plus_three(double(f))}
    return {f'{mode}|{x}':func(x) for mode,func in functions.items() for x in range(-10,11)}

def build():
    return dict(generators=generator_cases(),decorators=decorator_cases(),git=git_cases(),regex=regex_cases(),pandas=pandas_cases(),mocks=mock_cases())

if __name__=='__main__':
    parser=argparse.ArgumentParser();parser.add_argument('--check',action='store_true');args=parser.parse_args()
    value=build()
    if args.check:
        assert value==json.loads(DEST.read_text()),'Fixtures differ from actual Python/pandas/Git results'
        print('All reference scenarios agree with Python, pandas and Git.')
    else:
        DEST.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n');print(DEST)
