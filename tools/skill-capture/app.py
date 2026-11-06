import json
import os
from pathlib import Path
import queue
import re
import sys
import threading
import time
import tkinter as tk
from tkinter import filedialog, messagebox, ttk
import zipfile
from PIL import Image, ImageTk
from core import Collector, CaptureOptions, StopCapture, crop, distance, save_json, validate_config, app_level
from windows_backend import Windows, enable_dpi_awareness, windows


class Selector(tk.Toplevel):
    """Select coordinates on a frozen screenshot, never on the live game."""
    def __init__(self, master, screenshot, steps):
        super().__init__(master)
        self.title('화면 위치 지정 — 실제 게임을 클릭하지 않습니다')
        self.steps, self.index, self.result, self.selection = steps, 0, None, []
        self.values = {}
        max_w, max_h = self.winfo_screenwidth() - 80, self.winfo_screenheight() - 220
        self.scale = min(1, max_w / screenshot.width, max_h / screenshot.height)
        self.picture = ImageTk.PhotoImage(screenshot.resize((round(screenshot.width * self.scale), round(screenshot.height * self.scale))))
        self.caption = ttk.Label(self, wraplength=max_w, font=('Malgun Gothic', 12))
        self.caption.pack(padx=12, pady=12)
        self.canvas = tk.Canvas(self, width=self.picture.width(), height=self.picture.height(), highlightthickness=0)
        self.canvas.pack()
        self.canvas.create_image(0, 0, anchor='nw', image=self.picture)
        controls = ttk.Frame(self)
        controls.pack(fill='x', padx=12, pady=12)
        ttk.Button(controls, text='다시 선택', command=self.reset).pack(side='left')
        ttk.Button(controls, text='취소', command=self.destroy).pack(side='left', padx=8)
        ttk.Button(controls, text='다음 (Enter)', command=self.next).pack(side='right')
        self.canvas.bind('<ButtonPress-1>', self.down)
        self.canvas.bind('<B1-Motion>', self.drag)
        self.canvas.bind('<ButtonRelease-1>', self.up)
        self.bind('<Return>', lambda _: self.next())
        self.bind('<Escape>', lambda _: self.destroy())
        self.current_instruction()
        self.grab_set()
        self.focus_force()
        self.wait_window()

    def current_instruction(self):
        key, mode, text = self.steps[self.index]
        suffix = '드래그로 사각형 선택' if mode == 'rect' else '각 항목을 위에서 아래로 클릭 후 Enter' if mode == 'points' else '한 번 클릭'
        self.caption.config(text=f'{self.index + 1}/{len(self.steps)} · {text}\n{suffix}')
        self.mode = mode
        self.reset()

    def reset(self):
        self.selection = []
        self.canvas.delete('selection')

    def coord(self, event):
        return (max(0, min(self.picture.width() - 1, event.x)), max(0, min(self.picture.height() - 1, event.y)))

    def down(self, event):
        point = self.coord(event)
        if self.mode == 'rect':
            self.reset(); self.start = point
        elif self.mode == 'point':
            self.reset(); self.selection = [point]; self.mark(point)
        else:
            self.selection.append(point); self.mark(point)

    def mark(self, point):
        x, y = point
        self.canvas.create_oval(x - 5, y - 5, x + 5, y + 5, outline='#ff365b', width=3, tags='selection')
        self.canvas.create_text(x + 12, y, text=str(len(self.selection)), fill='#ff365b', tags='selection', anchor='w')

    def drag(self, event):
        if self.mode == 'rect' and hasattr(self, 'start'):
            end = self.coord(event)
            self.canvas.delete('selection')
            self.canvas.create_rectangle(*self.start, *end, outline='#ff365b', width=3, tags='selection')

    def up(self, event):
        if self.mode == 'rect' and hasattr(self, 'start'):
            self.selection = [self.start, self.coord(event)]

    def next(self):
        key, mode, _ = self.steps[self.index]
        points = [[round(x / self.scale), round(y / self.scale)] for x, y in self.selection]
        if mode == 'rect':
            if len(points) != 2 or abs(points[0][0] - points[1][0]) < 8 or abs(points[0][1] - points[1][1]) < 8:
                messagebox.showinfo('영역 선택', '가로·세로가 있는 영역을 드래그하세요.', parent=self); return
            value = [min(p[0] for p in points), min(p[1] for p in points), max(p[0] for p in points), max(p[1] for p in points)]
        elif mode == 'points':
            if len(points) < 2 or any(b[1] <= a[1] for a, b in zip(points, points[1:])):
                messagebox.showinfo('항목 위치', '완전히 보이는 항목을 위에서 아래 순서로 최소 두 개 선택하세요.', parent=self); return
            value = points
        else:
            if len(points) != 1:
                messagebox.showinfo('위치 선택', '위치를 한 번 클릭하세요.', parent=self); return
            value = points[0]
        self.values[key] = value
        self.index += 1
        if self.index == len(self.steps):
            self.result = self.values
            self.destroy()
        else:
            self.current_instruction()


class App:
    def __init__(self, root):
        self.root = root
        root.title('Rivals 스킬 도감 캡처')
        root.geometry('760x640')
        self.events, self.stop = queue.Queue(), threading.Event()
        self.busy = False
        self.folder = None
        self.config = None
        self.window_choices = []
        self.profile = tk.StringVar(value='골드-타자')
        self.levels = tk.StringVar(value='S4,S3,S2,S1,S,A,B,C,D')
        self.base = tk.StringVar(value=str(Path.home() / 'Documents' / 'RivalsSkillCapture'))
        self.delay = tk.StringVar(value='0.45')
        frame = ttk.Frame(root, padding=16); frame.pack(fill='both', expand=True)
        ttk.Label(frame, text='스킬 도감만 열어 두면, 설명을 레벨별로 저장합니다.', font=('Malgun Gothic', 13, 'bold')).pack(anchor='w')
        ttk.Label(frame, text='한 프로필에는 같은 타자/투수·티어 필터를 사용하세요. 다른 필터는 새 프로필로 수집합니다.', wraplength=710).pack(anchor='w', pady=(5, 14))
        row = ttk.Frame(frame); row.pack(fill='x', pady=4)
        ttk.Label(row, text='게임창').pack(side='left', padx=(0, 10))
        self.combo = ttk.Combobox(row, state='readonly', width=65); self.combo.pack(side='left', fill='x', expand=True)
        ttk.Button(row, text='새로고침', command=self.refresh).pack(side='right', padx=6)
        self.entry(frame, '프로필 이름', self.profile)
        self.entry(frame, '캡처할 레벨', self.levels)
        ttk.Label(frame, text='현재 화면에 실제로 있는 레벨만 입력하세요. S가 앱의 S0입니다. 버튼이 없는 S3·S4는 추가하지 마세요.', wraplength=700).pack(anchor='w', pady=4)
        self.entry(frame, '저장 위치', self.base)
        self.entry(frame, '클릭 후 대기(초)', self.delay)
        actions = ttk.Frame(frame); actions.pack(fill='x', pady=12)
        ttk.Button(actions, text='① 위치 설정', command=self.calibrate).pack(side='left', padx=3)
        ttk.Button(actions, text='프로필 불러오기', command=self.load).pack(side='left', padx=3)
        ttk.Button(actions, text='② 1개 테스트', command=lambda: self.run(True)).pack(side='left', padx=3)
        ttk.Button(actions, text='③ 전체 수집 / 이어서', command=lambda: self.run(False)).pack(side='left', padx=3)
        ttk.Button(actions, text='중지', command=self.stop.set).pack(side='left', padx=3)
        ttk.Label(frame, text='중지: Esc를 누르거나 마우스를 화면 왼쪽 위로 이동. 다른 창으로 전환해도 자동 중단됩니다.', wraplength=710).pack(anchor='w')
        self.logbox = tk.Text(frame, height=13, wrap='word', state='disabled'); self.logbox.pack(fill='both', expand=True, pady=10)
        bottom = ttk.Frame(frame); bottom.pack(fill='x')
        ttk.Button(bottom, text='결과 폴더 열기', command=self.open_folder).pack(side='left')
        ttk.Button(bottom, text='공유용 ZIP 만들기', command=self.export).pack(side='left', padx=8)
        root.protocol('WM_DELETE_WINDOW', self.close)
        root.after(100, self.poll)
        self.refresh()
        self.log('준비: 게임을 창 모드로 기본 모니터에 배치 → 도감에서 한 필터 선택 → 목록 맨 위로 이동.')

    def entry(self, parent, label, variable):
        row = ttk.Frame(parent); row.pack(fill='x', pady=4)
        ttk.Label(row, text=label, width=17).pack(side='left')
        ttk.Entry(row, textvariable=variable).pack(side='left', fill='x', expand=True)

    def log(self, text):
        self.logbox.config(state='normal'); self.logbox.insert('end', text + '\n'); self.logbox.see('end'); self.logbox.config(state='disabled')

    def poll(self):
        try:
            while True:
                kind, value = self.events.get_nowait()
                if kind == 'done': self.busy = False
                self.log(value)
        except queue.Empty:
            pass
        self.root.after(100, self.poll)

    def refresh(self):
        if self.busy: return
        self.window_choices = windows()
        self.combo['values'] = [f'{title} [{exe}]' for _, title, exe in self.window_choices]
        if self.window_choices:
            index = next((i for i, (_, title, exe) in enumerate(self.window_choices) if re.search('rivals|라이벌', title + exe, re.I)), 0)
            self.combo.current(index)

    def backend(self):
        index = self.combo.current()
        if index < 0 or index >= len(self.window_choices): raise ValueError('게임창을 선택하세요.')
        hwnd, title, exe = self.window_choices[index]
        backend = Windows(hwnd)
        return backend, title, exe

    def calibrate(self):
        if self.busy: return
        try:
            profile = self.profile.get().strip()
            if not profile: raise ValueError('프로필 이름을 입력하세요.')
            labels = [s.strip().upper() for s in self.levels.get().split(',') if s.strip()]
            if not labels or len(labels) > 9 or any(s not in ('D','C','B','A','S','S0','S1','S2','S3','S4','SS','SS+') for s in labels):
                raise ValueError('게임에 표시된 레벨을 쉼표로 구분해 입력하세요.')
            slug = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', profile).rstrip('. ')
            folder = Path(self.base.get()).expanduser() / ('profile-' + slug)
            if (folder / 'state.json').exists():
                raise ValueError('이미 수집 기록이 있는 프로필입니다. 이어서 수집은 프로필 불러오기, 위치 재설정은 새 프로필 이름을 사용하세요.')
            backend, title, exe = self.backend()
            self.root.withdraw(); backend.focus()
            list_shot = backend.screenshot()
            values = Selector(self.root, list_shot, [
                ('filter_box','rect','선택한 티어·타자/투수 필터를 식별하는 고정 영역. 시간·재화·목록 항목은 제외하세요.'),
                ('list_box','rect','스킬 목록의 이름 열 전체. 아이콘·스크롤바·제목은 제외하고 위부터 아래까지 잡으세요.'),
                ('rows','points','완전히 보이는 각 스킬 행의 클릭 위치를 선택하세요. 잘린 첫/마지막 행은 제외하세요.'),
                ('neutral_point','point','마우스를 둘 빈 공간. 스킬 행·설명창·버튼 위는 피하세요.'),
            ]).result
            if values is None: return
            backend.focus(); backend.click(values['rows'][0]); time.sleep(0.6); backend.move(values['neutral_point']); time.sleep(0.2)
            detail_shot = backend.screenshot()
            steps = [
                ('detail_box','rect','저장할 설명창 전체. 스킬명·선택 레벨·효과 설명을 모두 포함하세요.'),
                ('name_box','rect','스킬명 글자만. 아이콘·레벨·설명·움직이는 효과는 제외하세요.'),
                ('level_box','rect','레벨 버튼 줄 전체. 선택 표시까지 포함하고 스킬명·설명은 제외하세요.'),
                ('close_point','point','설명창을 닫는 X 버튼'),
            ] + [(f'level:{label}','point',f'{label} 레벨 버튼 중앙') for label in labels]
            detail = Selector(self.root, detail_shot, steps).result
            if detail is None: return
            config = {'schema': 1, 'profile': profile, 'window_title': title, 'executable': exe,
                      'window_size': list(list_shot.size), **values,
                      **{k:v for k,v in detail.items() if not k.startswith('level:')},
                      'levels': labels, 'level_points': {label: detail[f'level:{label}'] for label in labels}}
            validate_config(config)
            backend.focus()
            templates = {}
            for label in labels:
                if backend.escape_pressed(): raise StopCapture('설정을 중지했습니다.')
                backend.click(config['level_points'][label]); time.sleep(0.5); backend.move(values['neutral_point']); time.sleep(0.2)
                image = crop(backend.screenshot(), config['level_box'])
                if any(distance(image, other) < 0.0025 for other in templates.values()):
                    raise ValueError(f'{label}의 선택 상태가 다른 레벨과 구분되지 않습니다. 버튼 위치/레벨 영역/존재하는 레벨을 다시 확인하세요.')
                templates[label] = image
            backend.click(config['close_point']); time.sleep(0.5)
            if distance(crop(backend.screenshot(), values['filter_box']), crop(list_shot, values['filter_box'])) > 0.045:
                raise ValueError('설명창을 닫은 뒤 목록 화면을 확인하지 못했습니다.')
            (folder / 'calibration').mkdir(parents=True, exist_ok=True)
            crop(list_shot, values['filter_box']).save(folder / 'calibration/filter.png')
            for label, image in templates.items(): image.save(folder / 'calibration' / f'level-{app_level(label)}.png')
            save_json(folder / 'profile.json', config)
            self.config, self.folder = config, folder
            self.log(f'위치 설정 완료: {folder}\n먼저 1개 테스트를 실행해 캡처를 확인하세요.')
        except Exception as error:
            messagebox.showerror('위치 설정', str(error), parent=self.root)
        finally:
            self.root.deiconify()

    def load(self):
        if self.busy: return
        filename = filedialog.askopenfilename(title='profile.json 선택', initialdir=self.base.get(), filetypes=[('프로필','profile.json')])
        if filename:
            try:
                config = json.loads(Path(filename).read_text(encoding='utf-8')); validate_config(config)
                self.config, self.folder = config, Path(filename).parent
                self.profile.set(config['profile']); self.levels.set(','.join(config['levels']))
                self.log('프로필 불러옴. 같은 필터·창 크기로 도감 목록 맨 위에서 시작하세요. 열린 설명창은 닫아 주세요.')
            except Exception as error: messagebox.showerror('프로필', str(error))

    def run(self, test):
        if self.busy: return
        try:
            if self.config is None: raise ValueError('먼저 위치 설정 또는 프로필 불러오기를 진행하세요.')
            delay = float(self.delay.get())
            if not 0.2 <= delay <= 3: raise ValueError('대기 시간은 0.2~3초로 지정하세요.')
            backend, title, exe = self.backend()
            if (self.config['executable'] and self.config['executable'] != exe) or self.config['window_title'] != title:
                raise ValueError('프로필을 만든 게임창과 현재 선택한 창이 다릅니다.')
            self.stop.clear(); self.busy = True
            options = CaptureOptions(delay=delay, test_only=test)
            config, folder = self.config, self.folder
            self.log('3초 뒤 시작합니다. 같은 필터의 목록 맨 위에 있고 설명창이 닫혔는지 확인하세요.')
            def worker():
                try:
                    for _ in range(30):
                        if self.stop.is_set(): raise StopCapture('시작을 취소했습니다.')
                        time.sleep(0.1)
                    backend.focus()
                    collector = Collector(backend, config, folder, self.stop, lambda s: self.events.put(('log',s)), options)
                    collector.run()
                    self.events.put(('log',collector.state.get('message','완료')))
                except Exception as error:
                    self.events.put(('log','중단: ' + str(error) + '\n이어서는 설명창을 닫고 같은 필터의 목록 맨 위에서 시작하세요.'))
                finally: self.events.put(('done','수집 작업 종료. 저장된 결과는 유지됩니다.'))
            threading.Thread(target=worker, daemon=True).start()
        except Exception as error:
            self.busy = False
            messagebox.showerror('수집 시작', str(error), parent=self.root)

    def open_folder(self):
        path = self.folder or Path(self.base.get())
        path.mkdir(parents=True, exist_ok=True); os.startfile(path)

    def export(self):
        if self.busy: return
        if not self.folder or not (self.folder / 'state.json').exists():
            messagebox.showinfo('결과 ZIP','먼저 한 개 이상의 스킬을 수집하세요.'); return
        filename = filedialog.asksaveasfilename(defaultextension='.zip', initialfile=self.folder.name + '.zip', filetypes=[('ZIP','*.zip')])
        if not filename: return
        target = Path(filename).resolve()
        with zipfile.ZipFile(target,'w',zipfile.ZIP_DEFLATED) as z:
            for path in self.folder.rglob('*'):
                if path.is_file() and path.resolve()!=target and path.suffix!='.zip': z.write(path, path.relative_to(self.folder))
        self.log(f'ZIP 저장: {target}')

    def close(self):
        if self.busy:
            self.stop.set(); self.log('중지 처리 후 창을 닫아 주세요.'); return
        self.root.destroy()


if __name__ == '__main__':
    if sys.platform != 'win32':
        raise SystemExit('이 캡처 도구는 Windows 데스크톱에서 실행하세요.')
    enable_dpi_awareness()
    root = tk.Tk()
    App(root)
    root.mainloop()
