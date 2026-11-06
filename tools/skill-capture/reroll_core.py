"""Verified foreground UI rerolls, restricted to slots 2/3 with slot 1 already locked."""
import hashlib
import json
from pathlib import Path
import re
import time
import unicodedata
from PIL import Image
from core import StopCapture, LayoutMismatch, crop, identity, save_json


def name_key(value):
    return re.sub(r'\s+', '', unicodedata.normalize('NFKC', value)).casefold()


def matches_pair(names, fixed, candidates):
    if len(names) != 2:return False
    a,b=map(name_key,names);fixed=name_key(fixed);allowed={name_key(n) for n in candidates}
    return a != b and ((a==fixed and b in allowed) or (b==fixed and a in allowed))


def parse_balance(text):
    text=text.strip()
    if not re.fullmatch(r'(?:[0-9]{1,9}|[0-9]{1,3}(?:,[0-9]{3}){1,2})',text):return None
    return int(text.replace(',',''))


def config_signature(config):
    return hashlib.sha256(json.dumps(config,sort_keys=True,ensure_ascii=False).encode()).hexdigest()


def validate_reroll_config(c):
    if c.get('schema')!='reroll-v1' or c.get('card_kind') not in ('moment','signature'):raise ValueError('모먼트/시그니처 자동 변경 프로필이 필요합니다.')
    if not c.get('profile','').strip() or not c.get('locked_confirmed'):raise ValueError('게임에서 첫 줄 잠금을 준비하고 확인하세요.')
    fixed=c.get('fixed','');candidates=c.get('candidates',[])
    if not isinstance(fixed,str) or not name_key(fixed) or not isinstance(candidates,list) or not 1<=len(candidates)<=30 or not all(isinstance(n,str) and name_key(n) for n in candidates):raise ValueError('고정 스킬과 후보 스킬 1~30개를 지정하세요.')
    keys=[name_key(n) for n in candidates]
    if name_key(fixed) in keys or len(set(keys))!=len(keys):raise ValueError('고정 스킬과 후보 스킬은 중복될 수 없습니다.')
    if type(c.get('max_changes')) is not int or not 1<=c['max_changes']<=10000:raise ValueError('최대 변경 횟수는 1~10,000입니다.')
    if not isinstance(c.get('known_names'),list) or not all(isinstance(n,str) and name_key(n) for n in c['known_names']):raise ValueError('스킬 인식 목록을 확인하세요.')
    width,height=c['window_size']
    for key in ['result_box','player_box','ready_box','button_box','lock_box','first_box','second_box','third_box']+(['balance_box'] if c.get('balance_box') else []):
        b=c[key]
        if len(b)!=4 or not all(type(n) is int for n in b) or not (0<=b[0]<b[2]<=width and 0<=b[1]<b[3]<=height):raise ValueError('게임창 안의 영역을 지정하세요.')
    for key in ('change_point','neutral_point'):
        p=c[key]
        if len(p)!=2 or not all(type(n) is int for n in p) or not (0<=p[0]<width and 0<=p[1]<height):raise ValueError('클릭 위치를 확인하세요.')
    if not (c['button_box'][0]<=c['change_point'][0]<c['button_box'][2] and c['button_box'][1]<=c['change_point'][1]<c['button_box'][3]):raise ValueError('변경 버튼 클릭 위치는 지정한 버튼 영역 안에 있어야 합니다.')
    if c.get('confirmation')!='none':raise ValueError('현재 모드는 확인창 없이 바로 변경되는 화면만 지원합니다.')


class RerollController:
    def __init__(self,backend,config,folder,stop,recognize,log=print,delay=0.6,read_only=False,max_polls=30):
        validate_reroll_config(config)
        self.backend,self.config,self.folder,self.stop,self.recognize,self.log=backend,config,Path(folder),stop,recognize,log
        self.delay,self.read_only,self.max_polls=delay,read_only,max_polls
        self.folder.mkdir(parents=True,exist_ok=True);self.path=self.folder/'state.json'
        self.signature=config_signature(config)
        self.state=json.loads(self.path.read_text(encoding='utf-8')) if self.path.exists() else {'schema':'reroll-state-v1','signature':self.signature,'requested':0,'confirmed':0,'spent':0,'pending':None,'status':'ready'}
        if self.state.get('signature')!=self.signature or self.state.get('schema')!='reroll-state-v1':raise ValueError('설정 또는 목표가 바뀌었습니다. 새 프로필을 사용하세요.')
        self.templates={}
        for key in ('player_box','ready_box','button_box','lock_box','first_box'):
            with Image.open(self.folder/'calibration'/(key+'.png')) as im:self.templates[key]=identity(im)
        self.known={name_key(n):n for n in config['known_names']+[config['fixed']]+config['candidates']}
        self.last_image=None

    def check(self):
        if self.stop.is_set() or self.backend.escape_pressed():raise StopCapture('중지 요청으로 추가 클릭을 중단했습니다.')
        self.backend.guard()

    def wait(self):
        until=time.monotonic()+self.delay
        while time.monotonic()<until:self.check();time.sleep(min(0.05,max(0,until-time.monotonic())))

    def screenshot(self):
        self.check();im=self.backend.screenshot()
        if list(im.size)!=self.config['window_size']:raise LayoutMismatch('게임창 크기가 달라졌습니다.')
        self.last_image=im;return im

    def fingerprint(self,im,key):return identity(crop(im,self.config[key]))

    def ready(self,im):
        return all(self.fingerprint(im,k)==self.templates[k] for k in ('ready_box','button_box'))

    def guard_locked(self,im):
        for key,label in [('player_box','선수/카드'),('lock_box','첫 줄 잠금 표시'),('first_box','잠긴 첫 스킬')]:
            if self.fingerprint(im,key)!=self.templates[key]:raise LayoutMismatch(label+'가 설정 때와 다릅니다. 추가 클릭 없이 중단합니다.')

    def signature_of_view(self,im):
        keys=['second_box','third_box']+(['balance_box'] if self.config.get('balance_box') else [])
        return tuple(self.fingerprint(im,k) for k in keys)

    def read_ready(self):
        previous=None
        for _ in range(self.max_polls):
            self.check();im=self.screenshot()
            if not self.ready(im):previous=None;self.wait();continue
            self.guard_locked(im);signature=self.signature_of_view(im)
            if signature!=previous:previous=signature;self.wait();continue
            directory=self.folder/'ocr_live';directory.mkdir(exist_ok=True)
            keys=['second_box','third_box']+(['balance_box'] if self.config.get('balance_box') else [])
            paths=[]
            for key in keys:
                path=directory/(key+'.png');crop(im,self.config[key]).save(path);paths.append(path)
            results=self.recognize(paths,self.check)
            by_path={str(Path(r['path']).resolve()):r for r in results}
            texts=[]
            for path in paths:
                row=by_path.get(str(path.resolve()))
                if not row or row.get('error'):raise StopCapture('문자 인식을 확인할 수 없습니다. 추가 클릭 없이 중단합니다.')
                texts.append(row.get('text','').strip())
            names=[]
            for raw in texts[:2]:
                name=self.known.get(name_key(raw))
                if not name:raise StopCapture(f'스킬명 인식 확인 필요: {raw!r}. 인식 영역/목록을 수정한 새 프로필로 테스트하세요.')
                names.append(name)
            if name_key(names[0])==name_key(names[1]):raise StopCapture('2·3번째 스킬이 같은 이름으로 읽혔습니다. 영역을 확인하세요.')
            balance=parse_balance(texts[2]) if len(texts)>2 else None
            if len(texts)>2 and balance is None:raise StopCapture('남은 변경권 수를 확실히 읽지 못했습니다.')
            fresh=self.screenshot()
            if not self.ready(fresh):previous=None;self.wait();continue
            self.guard_locked(fresh)
            if self.signature_of_view(fresh)!=signature:previous=None;self.wait();continue
            return {'names':names,'balance':balance},fresh
        raise StopCapture('변경 가능한 결과 화면을 안정적으로 확인하지 못했습니다. 확인창·애니메이션·재화 부족 화면을 확인하세요.')

    def checkpoint(self,status,message=''):
        self.state.update(status=status,message=message,updated_at=time.strftime('%Y-%m-%d %H:%M:%S'));save_json(self.path,self.state)

    def evidence(self,name):
        if self.last_image is not None:crop(self.last_image,self.config['result_box']).save(self.folder/(name+'.png'))

    def settle_pending(self):
        before=self.state['pending']
        for _ in range(self.max_polls):
            observed,im=self.read_ready()
            if before['balance'] is not None:
                if observed['balance']>before['balance']:raise StopCapture('변경권 수가 예상과 다릅니다. 추가 클릭 없이 중단합니다.')
                changed=observed['balance']<before['balance']
            else:changed=[name_key(n) for n in observed['names']]!=[name_key(n) for n in before['names']]
            if changed:
                self.state['confirmed']+=1
                if before['balance'] is not None:self.state['spent']+=before['balance']-observed['balance']
                self.state['pending']=None;self.state['last_result']=observed
                self.checkpoint('running')
                with (self.folder/'changes.jsonl').open('a',encoding='utf-8') as f:f.write(json.dumps({'request':self.state['requested'],'confirmed':self.state['confirmed'],**observed},ensure_ascii=False)+'\n')
                self.log(f'확인 {self.state["confirmed"]}회 / 요청 {self.state["requested"]}회 · {" + ".join(observed["names"])}')
                return observed,im
            self.wait()
        raise StopCapture('변경 완료를 확인하지 못했습니다. 같은 결과/클릭 실패일 수 있어 자동 재시도하지 않습니다. 마지막 화면을 확인하세요.')

    def run(self):
        try:
            self.checkpoint('checking')
            current,im=self.read_ready()
            self.evidence('latest')
            if self.read_only:
                save_json(self.folder/'read-test.json',{'signature':self.signature,'names':current['names'],'balance':current['balance']})
                self.checkpoint('tested','읽기 테스트 통과: '+ ' + '.join(current['names'])+' · 변경 버튼은 누르지 않았습니다.');self.log(self.state['message']);return
            test=self.folder/'read-test.json'
            if not test.exists() or json.loads(test.read_text(encoding='utf-8')).get('signature')!=self.signature:raise StopCapture('먼저 읽기 테스트에서 2·3번째 인식 결과와 잠금 표시를 확인하세요.')
            if self.state['pending'] is not None:current,im=self.settle_pending()
            while True:
                self.check();self.guard_locked(im)
                if matches_pair(current['names'],self.config['fixed'],self.config['candidates']):
                    self.evidence('goal');self.checkpoint('goal','목표 조합 달성 · '+ ' + '.join(current['names']));self.log(self.state['message']);return
                if self.state['requested']>=self.config['max_changes']:self.checkpoint('limit','최대 변경 요청 횟수에 도달했습니다.');return
                if current['balance']==0:raise StopCapture('변경권이 0개입니다. 구매/충전 버튼은 누르지 않습니다.')
                fresh=self.screenshot()
                if not self.ready(fresh) or self.signature_of_view(fresh)!=self.signature_of_view(im):current,im=self.read_ready();continue
                self.guard_locked(fresh)
                self.state['requested']+=1;self.state['pending']=current
                self.checkpoint('pending','변경 결과 확인 전에는 다음 요청을 보내지 않습니다.')
                self.evidence('before-change');self.check();self.backend.click(self.config['change_point']);self.wait();self.backend.move(self.config['neutral_point']);self.wait()
                current,im=self.settle_pending();self.evidence('latest')
        except (StopCapture,RuntimeError) as error:
            self.checkpoint('paused',str(error));self.evidence('paused');self.log(str(error))
