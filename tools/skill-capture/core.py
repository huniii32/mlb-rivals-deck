"""Skill detail capture using level dropdowns and a circular next-skill button."""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import time
from PIL import Image, ImageChops, ImageOps, ImageStat

# Current in-game limits supplied by the user on 2026-11-06.
SKILL_LEVEL_CAPS = {'일반': 'S4', '모먼트': 'S', 'WBC': 'S2', '블랙 시그니처': 'S2', 'HOF': 'S1'}
TYPE_IDS = dict(zip(SKILL_LEVEL_CAPS, ('normal', 'moment', 'wbc', 'black', 'hof')))


class StopCapture(Exception):
    pass


class LayoutMismatch(StopCapture):
    pass


def app_level(label):
    return {'S': 'S0', 'SS': 'S1', 'SS+': 'S2'}.get(label.upper(), label.upper())


def level_file(label):
    return app_level(label)


def preset_levels(skill_type, base='S'):
    cap = SKILL_LEVEL_CAPS[skill_type]
    maximum = 0 if cap == 'S' else int(cap[1:])
    return [base] + [f'S{i}' for i in range(1, maximum + 1)]


def save_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def crop(image, box):
    return image.crop(tuple(box))


def distance(a, b):
    def normalized(im):
        return im.convert('RGB').resize((240, 72), Image.Resampling.BILINEAR)
    return sum(ImageStat.Stat(ImageChops.difference(normalized(a), normalized(b))).mean) / (3 * 255)


def identity(image):
    im = ImageOps.autocontrast(image.convert('L'))
    return hashlib.sha256(im.tobytes() + str(im.size).encode()).hexdigest()


def validate_config(config):
    if config.get('schema') != 3:
        raise ValueError('드롭다운/다음 스킬 방식으로 새 프로필을 설정하세요.')
    if not config['profile'].strip():
        raise ValueError('프로필 이름이 필요합니다.')
    width, height = config['window_size']
    def box(value):
        x1, y1, x2, y2 = value
        if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
            raise ValueError('선택 영역이 게임창을 벗어났습니다.')
    def point(value):
        if not (0 <= value[0] < width and 0 <= value[1] < height):
            raise ValueError('클릭 위치가 게임창을 벗어났습니다.')
    for name in ('tab_box', 'detail_box', 'name_box', 'level_box'):
        box(config[name])
    dx1, dy1, dx2, dy2 = config['detail_box']
    for name in ('name_box', 'level_box'):
        x1, y1, x2, y2 = config[name]
        if not (dx1 <= x1 < x2 <= dx2 and dy1 <= y1 < y2 <= dy2):
            raise ValueError('스킬명과 레벨 표시를 저장할 설명창 안에 포함하세요.')
    for name in ('neutral_point', 'next_point', 'close_point', 'dropdown_point'):
        point(config[name])
    kinds = [tab['skill_type'] for tab in config['tabs']]
    if not kinds or len(kinds) != len(set(kinds)):
        raise ValueError('수집할 스킬 탭을 중복 없이 선택하세요.')
    for tab in config['tabs']:
        kind = tab['skill_type']
        if kind not in SKILL_LEVEL_CAPS:
            raise ValueError('알 수 없는 스킬 종류입니다.')
        point(tab['tab_point']); point(tab['first_point'])
        labels = tab['levels']
        if labels != preset_levels(kind):
            raise ValueError('스킬 종류에 맞는 S부터 상한까지의 레벨을 사용하세요.')
        if not labels or len(labels) != len({level_file(x) for x in labels}):
            raise ValueError('레벨은 중복 없이 지정하세요.')
        if any(label not in ('현재레벨', 'S', 'S0', 'S1', 'S2', 'S3', 'S4', 'SS', 'SS+') for label in labels):
            raise ValueError('표시된 S 레벨 또는 현재레벨을 지정하세요.')
        cap = int(app_level(SKILL_LEVEL_CAPS[kind])[1:])
        if any(app_level(label) is not None and int(app_level(label)[1:]) > cap for label in labels):
            raise ValueError(f'{kind} 스킬의 최대 레벨은 {SKILL_LEVEL_CAPS[kind]}입니다.')
        if len(labels) > 1:
            box(tab['menu_box'])
            if not set(labels[1:]).issubset(tab['level_points']) or not set(tab['level_points']).issubset(labels):
                raise ValueError('레벨과 드롭다운 항목 위치가 일치하지 않습니다.')
            x1, y1, x2, y2 = tab['menu_box']
            for p in tab['level_points'].values():
                point(p)
                if not (x1 <= p[0] < x2 and y1 <= p[1] < y2):
                    raise ValueError('레벨 항목은 드롭다운 목록 영역 안에 지정하세요.')


@dataclass
class CaptureOptions:
    delay: float = 0.5
    max_skills: int = 500
    test_only: bool = False


class Collector:
    def __init__(self, backend, config, folder, stop, log=print, options=None):
        validate_config(config)
        self.backend, self.config, self.folder = backend, config, Path(folder)
        self.stop, self.log = stop, log
        self.options = options or CaptureOptions()
        self.folder.mkdir(parents=True, exist_ok=True)
        self.state_path = self.folder / 'state.json'
        self.state = json.loads(self.state_path.read_text(encoding='utf-8')) if self.state_path.exists() else {
            'schema': 3, 'profile': config['profile'], 'tabs': {}, 'status': 'ready'}
        signature = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
        if self.state.get('config_signature', signature) != signature:
            raise ValueError('위치/탭 설정이 바뀌었습니다. 새 프로필을 사용하세요.')
        self.state['config_signature'] = signature
        self.templates = {}
        for tab in config['tabs']:
            kind = tab['skill_type']
            base = self.folder / 'calibration' / TYPE_IDS[kind]
            def load(name):
                with Image.open(base / name) as image:
                    return image.copy()
            self.templates[kind] = {
                'tab': load('tab.png'), 'first_name': load('first-name.png'),
                'levels': {label: load(f'level-{level_file(label)}.png') for label in tab['levels']},
                'menus': {label: load(f'menu-{level_file(label)}.png') for label in tab['levels']} if len(tab['levels']) > 1 else {},
            }

    def check(self):
        if self.stop.is_set() or self.backend.escape_pressed():
            raise StopCapture('중지 요청을 받았습니다.')
        self.backend.guard()

    def wait(self):
        until = time.monotonic() + self.options.delay
        while time.monotonic() < until:
            self.check(); time.sleep(0.04)

    def screenshot(self):
        self.check()
        image = self.backend.screenshot()
        if list(image.size) != self.config['window_size']:
            raise LayoutMismatch('게임창 크기가 바뀌었습니다.')
        return image

    def click(self, point):
        self.check(); self.backend.click(point); self.wait()
        self.check(); self.backend.move(self.config['neutral_point']); self.wait()

    def assert_tabs(self, image, kind=None):
        current = crop(image, self.config['tab_box'])
        scores = sorted((distance(current, t['tab']), name) for name, t in self.templates.items())
        score, selected = scores[0]
        if score > 0.045 or (kind is not None and selected != kind) or (len(scores) > 1 and scores[1][0] - score < 0.001):
            raise LayoutMismatch('도감의 스킬 탭 화면을 확인하지 못했습니다. 설명창을 닫고 수집 대상 탭 중 하나를 선택한 화면에서 시작하세요.')

    def selected_level(self, image, kind, expected=None):
        current = crop(image, self.config['level_box'])
        scores = sorted((distance(current, template), label) for label, template in self.templates[kind]['levels'].items())
        score, best = scores[0]
        if score > 0.045 or (len(scores) > 1 and scores[1][0] - score < 0.001):
            raise LayoutMismatch('현재 레벨 표시를 식별할 수 없습니다.')
        if expected is not None and best != expected:
            raise LayoutMismatch(f'{expected} 선택 후 {best}가 표시됩니다. 저장을 중단합니다.')
        return best

    def checkpoint(self, status, message=''):
        self.state.update(status=status, message=message, updated_at=time.strftime('%Y-%m-%d %H:%M:%S'))
        save_json(self.state_path, self.state)

    def capture_skill(self, tab, image):
        kind = tab['skill_type']
        state = self.state['tabs'][kind]
        name_image = crop(image, self.config['name_box'])
        key = identity(name_image)
        record = state['skills'].get(key)
        if record is None:
            number = len(state['skills']) + 1
            if number > self.options.max_skills:
                raise StopCapture('탭별 최대 스킬 수에 도달했습니다. 순환 확인이 필요합니다.')
            record = {'id': f'skill_{number:04}', 'name_fingerprint': key, 'levels': {},
                      'source': '사용자 Windows 게임 내 도감', 'skill_type': kind,
                      'max_level': SKILL_LEVEL_CAPS[kind]}
            state['skills'][key] = record
        dest = self.folder / TYPE_IDS[kind] / record['id']
        dest.mkdir(parents=True, exist_ok=True)
        name_image.save(dest / 'name.png')
        for label in tab['levels']:
            if label in record['levels'] and (self.folder / record['levels'][label]['file']).exists():
                continue
            current = self.selected_level(self.screenshot(), kind)
            if current != label:
                if label not in tab['level_points']:
                    raise LayoutMismatch('다음 스킬에서 기본 S로 돌아오지 않았습니다. S 복귀 항목 위치를 지정한 새 프로필이 필요합니다.')
                self.click(self.config['dropdown_point'])
                opened = self.screenshot()
                if distance(crop(opened, tab['menu_box']), self.templates[kind]['menus'][current]) > 0.045:
                    raise LayoutMismatch('레벨 드롭다운이 기준과 다릅니다. 항목을 클릭하지 않고 멈춥니다.')
                self.click(tab['level_points'][label])
            shot = self.screenshot()
            self.selected_level(shot, kind, label)
            if identity(crop(shot, self.config['name_box'])) != key:
                raise LayoutMismatch('레벨 선택 중 스킬명이 바뀌었습니다. 이름 영역과 클릭 위치를 확인하세요.')
            filename = f'{TYPE_IDS[kind]}/{record["id"]}/{level_file(label)}.png'
            crop(shot, self.config['detail_box']).save(self.folder / filename)
            record['levels'][label] = {'source_level': label, 'app_level': app_level(label),
                                      'file': filename, 'captured_at': time.strftime('%Y-%m-%d %H:%M:%S'),
                                      'level_status': '선택 표시 기준'}
            self.checkpoint('running')
            self.log(f'{kind} · {record["id"]} · {label} 저장')
        record['complete'] = True
        self.checkpoint('running')
        return key

    def collect_tab(self, tab):
        kind = tab['skill_type']
        state = self.state['tabs'].setdefault(kind, {'skills': {}, 'status': 'ready'})
        self.assert_tabs(self.screenshot())
        self.click(tab['tab_point'])
        self.assert_tabs(self.screenshot(), kind)
        self.click(tab['first_point'])
        image = self.screenshot()
        self.selected_level(image, kind)
        first = identity(crop(image, self.config['name_box']))
        if first != identity(self.templates[kind]['first_name']):
            raise LayoutMismatch('설정 때의 첫 스킬과 다릅니다. 목록/필터를 확인하거나 새 프로필을 만드세요.')
        state.update(status='running', first_fingerprint=first)
        seen = set()
        for _ in range(self.options.max_skills):
            key = self.capture_skill(tab, image)
            seen.add(key)
            if self.options.test_only:
                self.click(self.config['close_point'])
                self.assert_tabs(self.screenshot(), kind)
                self.checkpoint('test_complete', '첫 스킬의 레벨 캡처 완료. 선택 레벨과 설명을 확인하세요.')
                return
            self.click(self.config['next_point'])
            image = self.screenshot()
            self.selected_level(image, kind)
            new_key = identity(crop(image, self.config['name_box']))
            if new_key == key:
                raise LayoutMismatch('>> 클릭 후 스킬명이 바뀌지 않았습니다. 버튼/대기 시간을 확인하세요. 스킬이 한 개뿐인 탭은 자동 완료로 판단하지 않습니다.')
            if new_key == first:
                state.update(status='complete', cycle_skill_count=len(seen))
                self.checkpoint('running')
                self.log(f'{kind}: 첫 스킬로 돌아옴 · {len(seen)}개 완료')
                self.click(self.config['close_point'])
                self.assert_tabs(self.screenshot(), kind)
                return
            if new_key in seen:
                raise LayoutMismatch('첫 스킬이 아닌 이전 스킬이 반복됩니다. 탭을 완료 처리하지 않고 멈춥니다.')
        raise StopCapture('탭별 최대 이동 횟수에 도달했습니다. 첫 스킬로 돌아오는지 확인하세요.')

    def run(self):
        self.checkpoint('running')
        try:
            self.assert_tabs(self.screenshot())
            for tab in self.config['tabs']:
                state = self.state['tabs'].get(tab['skill_type'], {})
                if state.get('status') == 'complete' and not self.options.test_only:
                    # A missing saved file requires a new cycle to repair it.
                    files = [v['file'] for r in state['skills'].values() for v in r['levels'].values()]
                    if files and all((self.folder / f).exists() for f in files):
                        self.log(f'{tab["skill_type"]}: 완료한 탭 건너뜀'); continue
                self.collect_tab(tab)
                if self.options.test_only:
                    return
            self.checkpoint('complete', '선택한 모든 탭에서 첫 스킬로 돌아오는 순환을 확인했습니다.')
        except StopCapture as error:
            self.checkpoint('paused', str(error)); raise
        except Exception as error:
            self.checkpoint('error', str(error)); raise
