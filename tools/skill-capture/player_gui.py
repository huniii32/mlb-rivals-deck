"""Player mode setup and review UI, sharing the existing skill capture window."""
import json
from pathlib import Path
import re
import threading
import time
import tkinter as tk
from tkinter import messagebox, ttk
from PIL import Image, ImageTk
from core import StopCapture, crop, save_json
from player_core import METADATA, card_identity, validate_player_config, export_players, safe_path, strict_stat
from player_ocr import process_players

MODE_LABELS={'스킬 설명 수집':'skills','선수 기본 능력치 수집':'stats','선수 미페 수집':'portrait','선수 정보 + 능력치 + 미페':'all'}


class PlayerCaptureMixin:
    def setup_player_controls(self, frame):
        self.mode=tk.StringVar(value='스킬 설명 수집')
        row=ttk.Frame(frame); row.pack(fill='x',pady=(0,10))
        ttk.Label(row,text='실행할 기능',width=17).pack(side='left')
        self.mode_combo=ttk.Combobox(row,state='readonly',textvariable=self.mode,values=list(MODE_LABELS),width=40)
        self.mode_combo.pack(side='left',fill='x',expand=True)
        self.mode_combo.bind('<<ComboboxSelected>>',lambda _:self.mode_changed())
        self.scope=tk.StringVar(value='')
        self.stat_names=tk.StringVar(value='')
        self.max_cards=tk.StringVar(value='5000')
        self.auto_ocr=tk.BooleanVar(value=True)

    def mode_changed(self):
        if self.busy:return
        player=MODE_LABELS[self.mode.get()]!='skills'
        self.config=self.folder=None
        self.profile.set(('선수도감-' if player else '스킬도감-')+time.strftime('%Y-%m-%d'))
        self.update_mode_help()

    def update_mode_help(self):
        player=MODE_LABELS[self.mode.get()]!='skills'
        if player:
            self.skill_controls.pack_forget()
            self.player_controls.pack(fill='x',before=self.actions,pady=8)
            self.heading.config(text='선수 상세 화면 → 현재 카드 저장 → 다음 화살표 → 반복')
            self.preparation.config(text='준비: 선수도감에서 원하는 구단·등급 필터를 정한 뒤 첫 선수 상세 화면을 여세요. 능력치는 도감 기본값으로 저장합니다.')
        else:
            self.player_controls.pack_forget()
            self.skill_controls.pack(fill='x',before=self.actions,pady=8)
            self.heading.config(text='기본 S 저장 → 상위 레벨 저장 → >> 다음 스킬 → 다음 탭')
            self.preparation.config(text='준비: 메인 → 구단관리 → 선수도감 → 스킬. 설명창을 닫은 스킬 탭 화면에서 시작하세요.')

    def calibrate_player(self):
        try:
            profile=self.profile.get().strip(); mode=MODE_LABELS[self.mode.get()]
            scope=self.scope.get().strip()
            if not profile or not scope:raise ValueError('프로필 이름과 현재 도감 필터 설명을 입력하세요. 예: NYY / 모먼트 / 정렬 기본')
            names=[n.strip() for n in self.stat_names.get().split(',') if n.strip()]
            if mode in ('stats','all') and (not names or len(names)>20 or len(set(names))!=len(names)):
                raise ValueError('화면에 표시된 기본 능력치 이름을 쉼표로 입력하세요. 예: 파워,정확,선구 (수집할 항목을 모두 입력)')
            maximum=int(self.max_cards.get())
            if not 1<=maximum<=10000:raise ValueError('최대 카드 수는 1~10,000입니다.')
            slug=re.sub(r'[<>:"/\\|?*\x00-\x1f]','_',profile).rstrip('. ')
            folder=Path(self.base.get()).expanduser()/('profile-'+slug)
            if (folder/'state.json').exists():raise ValueError('이미 수집 기록이 있습니다. 이어서는 프로필을 불러오고, 새 설정은 다른 이름을 사용하세요.')
            backend,title,exe=self.backend();self.root.withdraw();backend.focus();screen=backend.screenshot()
            steps=[('neutral_point','point','마우스를 둘 빈 공간. 버튼과 카드 이미지 위는 피하세요.'),
                   ('detail_anchor','rect','선수 상세 화면임을 확인할 고정 제목/버튼 영역. 선수마다 변하는 이름·이미지·숫자는 제외하세요.'),
                   ('detail_box','rect','선수명·구단·등급·연도/테마·기본 능력치를 포함한 상세 화면 전체'),
                   ('name_box','rect','선수 이름 글자만'),
                   ('identity_box','rect','같은 선수를 구분할 구단·등급·연도·테마 등의 고정 카드 정보 영역. 움직이는 미페와 이펙트는 제외하세요.'),
                   ('team','optional_rect','구단 이름/코드 글자 영역. 없으면 선택 없이 Enter'),
                   ('grade','optional_rect','카드 등급/종류 글자 영역. 없으면 선택 없이 Enter'),
                   ('year','optional_rect','연도 글자 영역. 연도가 없는 카드라면 선택 없이 Enter'),
                   ('theme','optional_rect','테마 이름 글자 영역. 없는 카드라면 선택 없이 Enter')]
            if mode in ('stats','all'):
                steps.append(('stats_box','rect','기본 능력치 표 전체 (이름과 숫자 포함)'))
                steps += [(f'stat:{i}','rect',f'{name}의 기본 능력치 숫자만. 항목 이름·OVR·다른 숫자는 제외하세요.') for i,name in enumerate(names)]
            if mode in ('portrait','all'):steps.append(('portrait_box','rect','저장할 선수 미페 영역. 현재 화면에 보이는 이미지 그대로 잘라 저장합니다.'))
            steps.append(('next_point','point','상세 화면에서 다음 선수로 이동하는 화살표'))
            values=self.select(screen,steps)
            config={'schema':'players-v1','capture_mode':mode,'profile':profile,'scope':scope,'window_title':title,'executable':exe,'window_size':list(screen.size),'navigation':'next','max_cards':maximum,'metadata_boxes':{},'stat_boxes':[]}
            for key in ('neutral_point','detail_anchor','detail_box','name_box','identity_box','stats_box','portrait_box','next_point'):
                if key in values:config[key]=values[key]
            config['metadata_boxes']={k:values[k] for k in METADATA if values.get(k) is not None}
            if mode in ('stats','all'):config['stat_boxes']=[{'name':name,'box':values[f'stat:{i}']} for i,name in enumerate(names)]
            config['first_fingerprint']=card_identity(screen,config)
            validate_player_config(config)
            dest=folder/'calibration';dest.mkdir(parents=True,exist_ok=True)
            crop(screen,config['detail_anchor']).save(dest/'detail_anchor.png')
            crop(screen,config['detail_box']).save(dest/'first-card.png')
            save_json(folder/'profile.json',config)
            self.config,self.folder=config,folder
            self.log(f'선수 수집 설정 완료: {folder}\n첫 카드 상세 화면에서 1개 테스트 후 원본·기본 능력치·미페 영역을 확인하세요.')
        except Exception as error:messagebox.showerror('선수 위치 설정',str(error),parent=self.root)
        finally:self.root.deiconify()

    def read_players(self):
        if self.busy:return
        if not self.config or self.config.get('schema')!='players-v1' or not (self.folder/'state.json').exists():
            messagebox.showinfo('문자 인식','선수 수집 결과 프로필을 먼저 불러오세요.');return
        self.stop.clear();self.set_busy(True);folder=self.folder
        def worker():
            try:process_players(folder,self.stop,lambda s:self.events.put(('log',s)))
            except Exception as e:self.events.put(('log',str(e)))
            finally:self.events.put(('done','문자 인식 작업 종료. 원본과 결과 검토에서 값을 확인하세요.'))
        threading.Thread(target=worker,daemon=True).start()

    def review_players(self):
        if self.busy:return
        if not self.config or self.config.get('schema')!='players-v1' or not (self.folder/'state.json').exists():
            messagebox.showinfo('결과 검토','먼저 선수 정보를 수집하세요.');return
        try:PlayerReview(self.root,self.folder)
        except Exception as e:messagebox.showerror('결과 검토',str(e))


class PlayerReview(tk.Toplevel):
    def __init__(self,master,folder):
        super().__init__(master);self.title('선수 수집 결과 검토 — 기본 능력치 / 미페');self.geometry('1100x820')
        self.folder=Path(folder);self.state=json.loads((self.folder/'state.json').read_text(encoding='utf-8'))
        self.records=list(self.state['cards'].values());self.current=None;self.variables={}
        bar=ttk.Frame(self,padding=10);bar.pack(fill='x')
        ttk.Label(bar,text='원본을 보고 수정한 뒤 저장하세요. OCR 숫자는 자동 확정하지 않습니다.').pack(side='left')
        ttk.Button(bar,text='선택 카드 저장',command=self.save).pack(side='right')
        body=ttk.Panedwindow(self,orient='horizontal');body.pack(fill='both',expand=True,padx=10,pady=10)
        left=ttk.Frame(body);right=ttk.Frame(body);body.add(left,weight=1);body.add(right,weight=4)
        self.tree=ttk.Treeview(left,columns=('name','status'),show='tree headings',height=25)
        self.tree.heading('#0',text='카드');self.tree.column('#0',width=110);self.tree.heading('name',text='선수');self.tree.column('name',width=130);self.tree.heading('status',text='검토');self.tree.column('status',width=70)
        scroll=ttk.Scrollbar(left,orient='vertical',command=self.tree.yview);self.tree.configure(yscrollcommand=scroll.set);scroll.pack(side='right',fill='y');self.tree.pack(fill='both',expand=True)
        self.picture=ttk.Label(right);self.picture.pack(fill='x')
        self.form=ttk.Frame(right,padding=8);self.form.pack(fill='x')
        self.reviewed=tk.BooleanVar(value=False)
        ttk.Checkbutton(right,text='원본과 이름·구단·카드 종류·기본 능력치를 대조했습니다',variable=self.reviewed).pack(anchor='w',pady=8)
        self.info=ttk.Label(right,wraplength=650);self.info.pack(anchor='w')
        for i,r in enumerate(self.records):self.tree.insert('', 'end',iid=str(i),text=r['id'],values=(r['fields'].get('name',{}).get('value') or '인식 대기',r['review_status']))
        self.tree.bind('<<TreeviewSelect>>',self.select)
        if self.records:self.tree.selection_set('0');self.select()
        self.grab_set()

    def select(self,_=None):
        if not self.tree.selection():return
        self.current=self.records[int(self.tree.selection()[0])]
        for child in self.form.winfo_children():child.destroy()
        self.variables={};r=self.current
        with Image.open(safe_path(self.folder,r['files']['detail'])) as original:
            preview=original.copy();preview.thumbnail((650,330));self.photo=ImageTk.PhotoImage(preview)
        self.picture.configure(image=self.photo)
        fields=[('fields',k,label) for k,label in METADATA.items()]+[('stats',k,'기본 '+k) for k in r['stats']]
        for i,(group,key,label) in enumerate(fields):
            field=r[group].get(key,{})
            value=tk.StringVar(value='' if field.get('value') is None else str(field['value']));self.variables[(group,key)]=value
            row=i//2;col=(i%2)*2
            ttk.Label(self.form,text=label).grid(row=row,column=col,sticky='w',padx=5,pady=3)
            ttk.Entry(self.form,textvariable=value,width=22).grid(row=row,column=col+1,sticky='ew',padx=5,pady=3)
        self.reviewed.set(r['review_status']=='reviewed')
        self.info.configure(text=f'식별자 {r["id"]} · {r["scope"]}\n미페: {r["files"].get("portrait","수집 안 함")}\n빈 수치는 미확인으로 유지됩니다. 카드별 수정 후 저장하세요.')

    def save(self):
        if not self.current:return
        try:
            updates={}
            for (group,key),variable in self.variables.items():
                raw=variable.get().strip();value=strict_stat(raw) if group=='stats' and raw else raw or None
                if group=='stats' and raw and value is None:raise ValueError(f'{key}: 0~999 정수 또는 빈칸으로 입력하세요.')
                updates[(group,key)]=value
            if self.reviewed.get() and (any(not updates.get(('fields',k)) for k in ('name','team','grade')) or any(v is None for (g,_),v in updates.items() if g=='stats')):
                raise ValueError('검토 완료에는 이름·구단·카드 종류와 수집한 모든 기본 능력치가 필요합니다.')
            for (group,key),value in updates.items():self.current[group].setdefault(key,{}).update(value=value,status='manual' if value is not None else 'needs_review')
            self.current['review_status']='reviewed' if self.reviewed.get() else 'needs_review'
            save_json(self.folder/'state.json',self.state);export_players(self.folder,self.state)
            selected=self.tree.selection()[0];self.tree.item(selected,values=(self.current['fields']['name']['value'] or '미확인',self.current['review_status']))
            self.info.configure(text='저장 완료 · players.json / players.csv에 반영했습니다.')
        except Exception as e:messagebox.showerror('검토 저장',str(e),parent=self)
