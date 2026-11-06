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
from core import (Collector, CaptureOptions, StopCapture, crop, distance, save_json,
                  validate_config, app_level, SKILL_LEVEL_CAPS, TYPE_IDS, preset_levels, level_file, identity)
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
        suffix = '드래그로 사각형 선택' if mode == 'rect' else '각 항목을 위에서 아래로 클릭 후 Enter' if mode == 'points' else '보이면 한 번 클릭, 없으면 선택 없이 Enter' if mode == 'optional' else '한 번 클릭'
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
        elif self.mode in ('point', 'optional'):
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
        elif mode == 'optional' and not points:
            value = None
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
        root.geometry('790x700')
        self.events, self.stop = queue.Queue(), threading.Event()
        self.busy, self.folder, self.config = False, None, None
        self.window_choices = []
        self.profile = tk.StringVar(value='스킬도감-' + time.strftime('%Y-%m-%d'))
        self.base = tk.StringVar(value=str(Path.home() / 'Documents' / 'RivalsSkillCapture'))
        self.delay = tk.StringVar(value='0.6')
        self.kinds = {kind: tk.BooleanVar(value=True) for kind in SKILL_LEVEL_CAPS}
        frame = ttk.Frame(root, padding=16); frame.pack(fill='both', expand=True)
        ttk.Label(frame, text='기본 S 저장 → 상위 레벨 저장 → >> 다음 스킬 → 다음 탭', font=('Malgun Gothic', 13, 'bold')).pack(anchor='w')
        ttk.Label(frame, text='준비: 메인 → 구단관리 → 선수도감 → 스킬. 설명창을 닫은 스킬 탭 화면에서 시작하세요.', wraplength=750).pack(anchor='w', pady=(6, 12))
        row = ttk.Frame(frame); row.pack(fill='x', pady=4)
        ttk.Label(row, text='게임창', width=16).pack(side='left')
        self.combo = ttk.Combobox(row, state='readonly', width=55); self.combo.pack(side='left', fill='x', expand=True)
        ttk.Button(row, text='새로고침', command=self.refresh).pack(side='right', padx=6)
        self.entry(frame, '프로필 이름', self.profile)
        self.entry(frame, '저장 위치', self.base)
        self.entry(frame, '클릭 후 대기(초)', self.delay)
        types = ttk.Frame(frame); types.pack(fill='x', pady=8)
        for kind, maximum in SKILL_LEVEL_CAPS.items():
            ttk.Checkbutton(types, text=f'{kind} ({maximum})', variable=self.kinds[kind]).pack(side='left', padx=5)
        ttk.Label(frame, text='수집할 탭을 선택한 뒤 위치 설정을 진행하세요. 첫 스킬로 돌아오면 다음 탭으로 이동합니다.', wraplength=750).pack(anchor='w')
        actions = ttk.Frame(frame); actions.pack(fill='x', pady=12)
        for label, command in [('① 위치 설정', self.calibrate), ('프로필 불러오기', self.load),
                               ('② 1개 테스트', lambda: self.run(True)), ('③ 전체 / 이어서', lambda: self.run(False)), ('중지', self.stop.set)]:
            ttk.Button(actions, text=label, command=command).pack(side='left', padx=3)
        ttk.Label(frame, text='중지: Esc, 마우스를 화면 왼쪽 위로 이동, 또는 다른 창으로 전환. 수집 중에는 게임을 조작하지 마세요.', wraplength=750).pack(anchor='w')
        self.logbox = tk.Text(frame, height=15, wrap='word', state='disabled'); self.logbox.pack(fill='both', expand=True, pady=10)
        bottom = ttk.Frame(frame); bottom.pack(fill='x')
        ttk.Button(bottom, text='결과 폴더', command=self.open_folder).pack(side='left')
        ttk.Button(bottom, text='결과 ZIP 만들기', command=self.export).pack(side='left', padx=8)
        root.protocol('WM_DELETE_WINDOW', self.close)
        root.after(100, self.poll)
        self.refresh()
        self.log('Windows Steam 창 모드에서 실행하세요. 설명된 경로는 모바일 기준이며 Steam의 실제 버튼 위치를 처음 한 번 지정합니다.')

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
        return Windows(hwnd), title, exe

    def select(self, image, steps):
        result = Selector(self.root, image, steps).result
        if result is None: raise StopCapture('위치 설정을 취소했습니다. 열린 설명창/목록은 직접 닫아 주세요.')
        return result

    def calibrate(self):
        if self.busy: return
        try:
            profile = self.profile.get().strip()
            kinds = [kind for kind, value in self.kinds.items() if value.get()]
            if not profile or not kinds: raise ValueError('프로필 이름과 수집할 탭을 선택하세요.')
            slug = re.sub(r'[<>:"/\\|?*\x00-\x1f]', '_', profile).rstrip('. ')
            folder = Path(self.base.get()).expanduser() / ('profile-' + slug)
            if (folder / 'state.json').exists(): raise ValueError('수집 기록이 있습니다. 이어서는 프로필 불러오기, 새 설정은 새 프로필 이름을 사용하세요.')
            backend, title, exe = self.backend()
            self.root.withdraw(); backend.focus()
            screen = backend.screenshot()
            values = self.select(screen, [
                ('tab_box', 'rect', '일반/모먼트/WBC/블랙/HOF 탭 줄 전체. 선택 표시를 포함하고 목록·재화·시간은 제외하세요.'),
                ('neutral_point', 'point', '마우스를 둘 빈 공간. 버튼·설명창·드롭다운 위는 피하세요.'),
            ] + [(f'tab:{kind}', 'point', f'{kind} 탭 버튼 중앙') for kind in kinds])
            config = {'schema': 3, 'profile': profile, 'window_title': title, 'executable': exe,
                      'window_size': list(screen.size), 'tab_box': values['tab_box'],
                      'neutral_point': values['neutral_point'], 'tabs': []}
            templates = {}
            def click(point):
                if backend.escape_pressed(): raise StopCapture('설정을 중지했습니다.')
                backend.click(point); time.sleep(0.6)
                backend.move(config['neutral_point']); time.sleep(0.2)
            for kind in kinds:
                backend.focus(); click(values[f'tab:{kind}'])
                screen = backend.screenshot()
                first = self.select(screen, [('first_point', 'point', f'{kind} 탭에서 첫 번째 스킬을 여는 위치')])['first_point']
                images = {'tab.png': crop(screen, config['tab_box'])}
                backend.focus(); click(first)
                opened = backend.screenshot()
                if not config['tabs']:
                    config.update(self.select(opened, [
                        ('detail_box', 'rect', '저장할 설명창 전체: 스킬명·S/S1 등 선택 레벨·효과 설명을 포함하세요.'),
                        ('name_box', 'rect', '스킬명 글자만. 레벨·아이콘·움직이는 배경은 제외하세요.'),
                        ('level_box', 'rect', 'S에서 S1 등으로 바뀌는 선택 레벨 표시만. 스킬명·효과 수치는 제외하세요.'),
                        ('next_point', 'point', '다음 스킬로 이동하는 하단 >> 버튼'),
                        ('close_point', 'point', '스킬 설명창을 닫고 탭 목록으로 돌아가는 버튼'),
                    ]))
                images['first-name.png'] = crop(opened, config['name_box'])
                images['level-S0.png'] = crop(opened, config['level_box'])
                tab = {'skill_type': kind, 'tab_point': values[f'tab:{kind}'], 'first_point': first,
                       'levels': preset_levels(kind), 'level_points': {}}
                backend.focus()
                if len(tab['levels']) > 1:
                    if 'dropdown_point' not in config:
                        config.update(self.select(opened, [('dropdown_point', 'point', '상위 레벨 선택 목록을 여는 현재레벨 오른쪽 버튼')]))
                        backend.focus()
                    click(config['dropdown_point'])
                    menu = backend.screenshot()
                    selected = self.select(menu, [
                        ('menu_box', 'rect', f'{kind}의 레벨 선택 목록 전체. 선택 표시를 포함하고 스킬명은 제외하세요.'),
                        ('S', 'optional', '기본 S로 돌아가는 항목이 보이면 선택하세요. 없다면 선택 없이 Enter. 이 경우 >> 이동 뒤 S로 돌아와야 합니다.'),
                    ] + [(label, 'point', f'{kind} · {label} 선택 항목 중앙') for label in tab['levels'][1:]])
                    tab['menu_box'] = selected.pop('menu_box')
                    tab['level_points'] = {label: point for label, point in selected.items() if point is not None}
                    images['menu-S0.png'] = crop(menu, tab['menu_box'])
                    backend.focus()
                    backend.move(config['neutral_point']); time.sleep(0.2)
                    if distance(crop(backend.screenshot(), tab['menu_box']), images['menu-S0.png']) > 0.045:
                        click(config['dropdown_point'])
                        if distance(crop(backend.screenshot(), tab['menu_box']), images['menu-S0.png']) > 0.045:
                            raise ValueError('게임으로 돌아온 뒤 레벨 목록을 확인하지 못했습니다. 위치 설정을 다시 진행하세요.')
                    known = [images['level-S0.png']]
                    for label in tab['levels'][1:]:
                        click(tab['level_points'][label])
                        closed = backend.screenshot()
                        if identity(crop(closed, config['name_box'])) != identity(images['first-name.png']):
                            raise ValueError('레벨 선택 중 스킬명이 달라졌습니다. 영역/버튼 위치를 확인하세요.')
                        template = crop(closed, config['level_box'])
                        if any(distance(template, previous) < 0.0025 for previous in known):
                            raise ValueError(f'{kind} {label}의 표시가 다른 레벨과 구분되지 않습니다. 선택 레벨이 변하는 영역을 지정하세요.')
                        known.append(template)
                        images[f'level-{level_file(label)}.png'] = template
                        click(config['dropdown_point'])
                        images[f'menu-{level_file(label)}.png'] = crop(backend.screenshot(), tab['menu_box'])
                    # Dropdown is open at the end: select the last grade to close it.
                    click(tab['level_points'][tab['levels'][-1]])
                config['tabs'].append(tab)
                templates[kind] = images
                click(config['close_point'])
                if distance(crop(backend.screenshot(), config['tab_box']), images['tab.png']) > 0.045:
                    raise ValueError('설명창을 닫은 뒤 스킬 탭 화면을 확인하지 못했습니다.')
            config.setdefault('dropdown_point', config['neutral_point'])
            validate_config(config)
            for kind, images in templates.items():
                dest = folder / 'calibration' / TYPE_IDS[kind]; dest.mkdir(parents=True, exist_ok=True)
                for name, image in images.items(): image.save(dest / name)
            save_json(folder / 'profile.json', config)
            self.config, self.folder = config, folder
            self.log(f'설정 완료: {folder}\n먼저 1개 테스트에서 S부터 상한까지 설명과 선택 표시를 확인하세요.')
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
                self.profile.set(config['profile'])
                selected = {tab['skill_type'] for tab in config['tabs']}
                for kind, value in self.kinds.items(): value.set(kind in selected)
                self.log('프로필 불러옴. 같은 창 크기로 스킬 탭 화면에서 시작하세요. 설명창과 드롭다운은 닫아 주세요.')
            except Exception as error: messagebox.showerror('프로필', str(error))

    def run(self, test):
        if self.busy: return
        try:
            if self.config is None: raise ValueError('먼저 위치 설정 또는 프로필 불러오기를 진행하세요.')
            if [kind for kind, value in self.kinds.items() if value.get()] != [tab['skill_type'] for tab in self.config['tabs']]:
                raise ValueError('탭 선택이 바뀌었습니다. 새 프로필 이름으로 위치 설정을 진행하세요.')
            delay = float(self.delay.get())
            if not 0.2 <= delay <= 3: raise ValueError('대기 시간은 0.2~3초로 지정하세요.')
            backend, title, exe = self.backend()
            if (self.config['executable'] and self.config['executable'] != exe) or self.config['window_title'] != title:
                raise ValueError('설정 때 선택한 게임창과 다릅니다.')
            self.stop.clear(); self.busy = True
            config, folder = self.config, self.folder
            self.log('3초 뒤 시작합니다. 설명창을 닫은 도감 스킬 탭 화면에서 대기하세요.')
            def worker():
                try:
                    for _ in range(30):
                        if self.stop.is_set(): raise StopCapture('시작을 취소했습니다.')
                        time.sleep(0.1)
                    backend.focus()
                    collector = Collector(backend, config, folder, self.stop, lambda s: self.events.put(('log', s)), CaptureOptions(delay=delay, test_only=test))
                    collector.run()
                    self.events.put(('log', collector.state.get('message', '완료')))
                except Exception as error:
                    self.events.put(('log', '중단: ' + str(error) + '\n설명창/드롭다운을 닫고 도감 스킬 탭 화면에서 이어서 실행하세요.'))
                finally: self.events.put(('done', '수집 작업 종료. 저장된 결과는 유지됩니다.'))
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
            messagebox.showinfo('결과 ZIP', '먼저 한 개 이상의 스킬을 수집하세요.'); return
        filename = filedialog.asksaveasfilename(defaultextension='.zip', initialfile=self.folder.name + '.zip', filetypes=[('ZIP', '*.zip')])
        if not filename: return
        target = Path(filename).resolve()
        with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
            for path in self.folder.rglob('*'):
                if path.is_file() and path.resolve() != target and path.suffix != '.zip': z.write(path, path.relative_to(self.folder))
        self.log(f'ZIP 저장: {target}')

    def close(self):
        if self.busy:
            self.stop.set(); self.log('중지 처리 후 창을 닫아 주세요.'); return
        self.root.destroy()


if __name__ == '__main__':
    if sys.platform != 'win32':
        raise SystemExit('Windows 데스크톱에서 실행하세요.')
    enable_dpi_awareness()
    root = tk.Tk(); App(root); root.mainloop()
