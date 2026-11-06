"""Direct reroll mode; setup and test never click a consumable action."""
import json
from pathlib import Path
import re
import threading
import time
import tkinter as tk
from tkinter import messagebox,ttk
from core import StopCapture,crop,save_json
from reroll_core import RerollController,validate_reroll_config,name_key
from ocr_session import OcrSession


def load_names():return json.loads(Path(__file__).with_name('skill_names.json').read_text(encoding='utf-8'))

class RerollMixin:
    def setup_reroll_controls(self,frame):
        self.reroll_controls=ttk.Frame(frame)
        self.reroll_card=tk.StringVar(value='모먼트');self.reroll_kind=tk.StringVar(value='타자')
        self.reroll_fixed=tk.StringVar();self.reroll_candidates=tk.StringVar();self.reroll_extra=tk.StringVar()
        self.reroll_max=tk.StringVar(value='100');self.reroll_locked=tk.BooleanVar(value=False)
        row=ttk.Frame(self.reroll_controls);row.pack(fill='x',pady=3)
        for label,var,values in [('카드',self.reroll_card,['모먼트','시그니처']),('선수',self.reroll_kind,['타자','투수'])]:
            ttk.Label(row,text=label).pack(side='left',padx=5);combo=ttk.Combobox(row,textvariable=var,values=values,state='readonly',width=13);combo.pack(side='left',padx=4)
            combo.bind('<<ComboboxSelected>>',lambda _:self.update_reroll_names())
        row=ttk.Frame(self.reroll_controls);row.pack(fill='x',pady=3)
        ttk.Label(row,text='고정 스킬 1개',width=17).pack(side='left')
        self.fixed_combo=ttk.Combobox(row,textvariable=self.reroll_fixed);self.fixed_combo.pack(fill='x',expand=True)
        self.entry(self.reroll_controls,'짝 스킬 / 후보들',self.reroll_candidates)
        self.entry(self.reroll_controls,'최대 변경 횟수',self.reroll_max)
        self.entry(self.reroll_controls,'인식명 추가(선택)',self.reroll_extra)
        ttk.Label(self.reroll_controls,text='짝 스킬 1개면 두 스킬 고정, 여러 개면 쉼표로 입력합니다. 2·3번째 순서는 무관합니다. 스킬 이름은 게임 화면 표기대로 입력하세요.',wraplength=880).pack(anchor='w')
        ttk.Checkbutton(self.reroll_controls,text='게임에서 원하는 첫 스킬을 확보하고 첫 줄 잠금을 완료했습니다',variable=self.reroll_locked).pack(anchor='w',pady=3)
        ttk.Label(self.reroll_controls,text='실제 변경권을 사용합니다. 먼저 「읽기 테스트」로 인식 결과를 확인하세요. 잠금/변경권 종류 변경·구매·충전은 자동으로 하지 않습니다.',wraplength=880).pack(anchor='w')
        self.update_reroll_names()

    def update_reroll_names(self):
        self.fixed_combo['values']=load_names()['pitcher' if self.reroll_kind.get()=='투수' else 'batter']

    def reroll_values(self):
        def split(var):return [s.strip() for s in var.get().split(',') if s.strip()]
        return {'card_kind':'moment' if self.reroll_card.get()=='모먼트' else 'signature','player_kind':'pitcher' if self.reroll_kind.get()=='투수' else 'batter','fixed':self.reroll_fixed.get().strip(),'candidates':split(self.reroll_candidates),'extra_names':split(self.reroll_extra),'max_changes':int(self.reroll_max.get()),'locked_confirmed':self.reroll_locked.get()}

    def calibrate_reroll(self):
        try:
            values=self.reroll_values();profile=self.profile.get().strip()
            if not profile or not values['locked_confirmed']:raise ValueError('첫 스킬을 잠근 게임 화면을 준비하고 잠금 완료 항목을 선택하세요.')
            if not values['fixed'] or not values['candidates']:raise ValueError('고정 스킬과 짝 스킬/후보를 입력하세요.')
            if not 1<=values['max_changes']<=10000:raise ValueError('최대 변경 횟수는 1~10,000입니다.')
            slug=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',profile).rstrip('. ');folder=Path(self.base.get()).expanduser()/('profile-'+slug)
            if (folder/'state.json').exists():raise ValueError('진행 기록이 있습니다. 목표/좌표 변경은 새 프로필 이름을 사용하세요.')
            backend,title,exe=self.backend();self.root.withdraw();backend.focus();im=backend.screenshot()
            points=self.select(im,[('neutral_point','point','마우스를 둘 빈 공간. 버튼 위는 피하세요.'),
                ('result_box','rect','결과 증거로 저장할 선수·잠금·스킬·변경권 영역 전체'),
                ('player_box','rect','대상 선수 이름/카드 식별 정보. 움직이는 미페·OVR·시간 등은 제외하세요.'),
                ('ready_box','rect','스킬 변경 화면의 고정 제목. 애니메이션이나 확인창이 없어야 합니다.'),
                ('button_box','rect','클릭 가능한 스킬변경 버튼 전체. 남은 수량이 버튼 안에서 변하면 숫자를 제외한 고정 부분을 선택하세요.'),
                ('change_point','point','지정한 스킬변경 버튼 영역 안의 클릭 위치'),
                ('lock_box','rect','첫 번째 스킬이 잠겼음을 보여주는 아이콘/표시만. 반드시 실제 잠금 상태에서 지정하세요.'),
                ('first_box','rect','잠긴 첫 번째 스킬의 이름 글자만'),
                ('second_box','rect','두 번째 스킬 이름만. S 레벨·아이콘·효과 설명은 제외하세요.'),
                ('third_box','rect','세 번째 스킬 이름만. S 레벨·아이콘·효과 설명은 제외하세요.'),
                ('balance_box','optional_rect','현재 변경권의 남은 수량 숫자만 (권장). 보이지 않으면 선택 없이 Enter. 생략 시 같은 조합이 다시 나오면 중단합니다.')])
            config={'schema':'reroll-v1','profile':profile,'window_title':title,'executable':exe,'window_size':list(im.size),'confirmation':'none',**values,**points}
            config['known_names']=load_names()[values['player_kind']]+values['extra_names']
            validate_reroll_config(config);dest=folder/'calibration';dest.mkdir(parents=True,exist_ok=True)
            for key in ('player_box','ready_box','button_box','lock_box','first_box'):crop(im,config[key]).save(dest/(key+'.png'))
            save_json(folder/'profile.json',config);self.config,self.folder=config,folder
            self.log('자동 변경 위치 설정 완료. 읽기 테스트는 버튼을 누르지 않습니다. 로그의 2·3번째 이름과 저장된 latest.png의 잠금 상태를 확인하세요.')
        except Exception as e:messagebox.showerror('자동 변경 설정',str(e),parent=self.root)
        finally:self.root.deiconify()

    def load_reroll(self,config):
        self.reroll_card.set('모먼트' if config['card_kind']=='moment' else '시그니처');self.reroll_kind.set('투수' if config['player_kind']=='pitcher' else '타자')
        self.reroll_fixed.set(config['fixed']);self.reroll_candidates.set(', '.join(config['candidates']));self.reroll_extra.set(', '.join(config['extra_names']));self.reroll_max.set(str(config['max_changes']));self.reroll_locked.set(config['locked_confirmed']);self.update_reroll_names()
        self.log('자동 변경 프로필 불러옴. 동일한 선수·첫 스킬·잠금·변경권 종류의 화면에서 시작하세요. 누적 최대 요청 횟수는 유지됩니다.')

    def run_reroll(self,test):
        if self.busy:return
        try:
            if not self.config or self.config.get('schema')!='reroll-v1':raise ValueError('먼저 자동 변경 위치 설정 또는 프로필 불러오기를 진행하세요.')
            if any(self.config[k]!=v for k,v in self.reroll_values().items()):raise ValueError('목표/횟수/잠금 확인 설정이 바뀌었습니다. 새 프로필로 설정하세요.')
            delay=float(self.delay.get())
            if not 0.2<=delay<=3:raise ValueError('대기 시간은 0.2~3초입니다.')
            backend,title,exe=self.backend()
            if self.config['window_title']!=title or self.config['executable'] and self.config['executable']!=exe:raise ValueError('설정한 게임창과 다릅니다.')
            config,folder=self.config,self.folder;self.stop.clear();self.set_busy(True)
            self.log('3초 뒤 '+('화면 읽기 테스트 (변경권 사용 없음)' if test else f'실제 스킬 변경 시작 · 프로필 누적 최대 {config["max_changes"]}회 요청'))
            def worker():
                session=None
                try:
                    for _ in range(30):
                        if self.stop.is_set():raise StopCapture('시작을 취소했습니다.')
                        time.sleep(0.1)
                    backend.focus();session=OcrSession();log=lambda s:self.events.put(('log',s))
                    controller=RerollController(backend,config,folder,self.stop,session.recognize,log,delay=delay,read_only=test)
                    controller.run();self.events.put(('log',controller.state.get('message','작업 종료')))
                except Exception as e:self.events.put(('log','추가 클릭 없이 중단: '+str(e)))
                finally:
                    if session:session.close()
                    self.events.put(('done','자동 변경 종료. 목표/중단 화면과 요청 기록은 결과 폴더에 저장했습니다.'))
            threading.Thread(target=worker,daemon=True).start()
        except Exception as e:self.set_busy(False);messagebox.showerror('자동 변경',str(e))
