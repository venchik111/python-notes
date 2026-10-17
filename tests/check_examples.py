"""Compile every Python example; execute local examples and pytest demonstrations."""
import ast
import contextlib
import io
import json
import os
import tempfile
from pathlib import Path

ROOT=Path(__file__).resolve().parents[1]
data=json.loads((ROOT/'docs/data/lessons.json').read_text())
compiled=executed=test_files=0

with tempfile.TemporaryDirectory(prefix='python-notes-check-') as scratch:
    previous=Path.cwd()
    os.chdir(scratch)
    try:
        for lesson in data['lessons']:
            for topic in lesson['topics']:
              examples=[dict(topic,original=True)]+[b for b in topic.get('blocks',[]) if b['type']=='example']
              if topic.get('demo',{}).get('language')=='python':
                examples.append(dict(language='python',code=topic['demo']['code'],check='run'))
              for example_index,example in enumerate(examples):
                if example['language']!='python':continue
                label=f"{lesson['id']}/{topic['id']}/{example_index}"
                ast.parse(example['code'],filename=label)
                compiled+=1
                code=(lesson.get('setup','') if example.get('original') else '')+'\n'+example['code']
                if example['check']=='run':
                    namespace={}
                    output=io.StringIO()
                    with contextlib.redirect_stdout(output),contextlib.redirect_stderr(io.StringIO()):
                        exec(compile(code,label,'exec'),namespace)
                    executed+=1
                    if 'output' in example:assert output.getvalue()==example['output'],f"{label}: {output.getvalue()!r} != {example['output']!r}"
                    if not example.get('original'):continue
                    if topic['id']=='expression':
                        assert namespace['first']==0 and namespace['rest']==[1,4] and namespace['empty']==[]
                    if topic['id']=='pipeline':assert namespace['result']==[20,40]
                    if topic['id']=='closure':assert namespace['result']==10
                    if topic['id']=='parameters':assert namespace['scale'](3)(lambda x:x+1)(2)==9
                    if topic['id']=='decorator':
                        def f(x):return x+2
                        decorated=namespace['traced'](f)
                        assert decorated(3)==5 and decorated.__name__=='f'
                    if topic['id']=='datetime':assert namespace['iso']=='2026-10-14'
                    if topic['id']=='selection':assert namespace['first_price']==100 and len(namespace['first_two'])==2
                    if topic['id']=='filter':assert namespace['df'].loc[2,'price']==250
                    if topic['id']=='statistics':assert namespace['totals'].tolist()==[200,200,900]
                    if topic['id']=='groups':assert namespace['result'].loc['Москва','total']==400
                    if topic['id']=='boundaries':assert namespace['result']==['','pop']
                    if topic['id']=='sequence':assert namespace['result']==[0,1,1,2,3,5]
                    if topic['id']=='regex':assert namespace['valid'] is not None and namespace['found']==['Два','слова']
                    if topic['id']=='re-methods':assert namespace['number']=='120' and namespace['count']==2
                    if topic['id']=='counter':assert namespace['top']==[('a',3)]
                    if topic['id']=='text-processing':assert namespace['leaders']==['а']
                    if topic['id']=='analysis':assert namespace['survival'].loc[1]==0.5
                elif example['check']=='pytest':
                    Path(f"test_{lesson['id']}_{topic['id'].replace('-','_')}_{example_index}.py").write_text(code)
                    test_files+=1
        import pytest
        status=pytest.main(['-q','--disable-warnings',scratch])
        if status!=0:raise SystemExit(status)
    finally:os.chdir(previous)
print(f'{compiled} Python examples compiled; {executed} executed; {test_files} pytest examples verified.')
