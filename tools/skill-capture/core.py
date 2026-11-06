"""Read-only skill guide capture, with an injectable desktop backend."""
from dataclasses import dataclass
import hashlib
import json
from pathlib import Path
import time
import cv2
import numpy as np
from PIL import Image, ImageOps


class StopCapture(Exception):
    pass


class LayoutMismatch(StopCapture):
    pass


def save_json(path, value):
    tmp = path.with_suffix('.tmp')
    tmp.write_text(json.dumps(value, ensure_ascii=False, indent=2), encoding='utf-8')
    tmp.replace(path)


def crop(image, box):
    return image.crop(tuple(box))


def canonical(image):
    return np.array(image.convert('RGB').resize((240, 72), Image.Resampling.BILINEAR), dtype=np.float32)


def distance(a, b):
    return float(np.abs(canonical(a) - canonical(b)).mean() / 255)


def identity(image):
    # Exact fingerprints: a false duplicate is worse than an extra capture.
    im = ImageOps.autocontrast(image.convert('L'))
    return hashlib.sha256(im.tobytes() + str(im.size).encode()).hexdigest()


def page_unchanged(before, after):
    return distance(before, after) < 0.003


def has_scroll_overlap(before, after, pitch):
    """Check old lower rows still occur above their old position after scrolling."""
    if before.size != after.size:
        return False
    width, height = before.size
    scale = min(1, 420 / width)
    size = (max(1, round(width * scale)), max(1, round(height * scale)))
    a = cv2.Canny(np.array(before.convert('L').resize(size)), 60, 150)
    b = cv2.Canny(np.array(after.convert('L').resize(size)), 60, 150)
    row_height = max(8, round(pitch * scale * 0.5))
    for frac in (0.45, 0.6, 0.75, 0.85):
        y = min(size[1] - row_height, round(size[1] * frac))
        template = a[y:y + row_height, :]
        if template.size == 0 or np.count_nonzero(template) < 25:
            continue
        scores = cv2.matchTemplate(b, template, cv2.TM_CCOEFF_NORMED)
        _, score, _, (_, matched_y) = cv2.minMaxLoc(scores)
        if score >= 0.88 and matched_y < y - max(1, round(scale)):
            return True
    return False


def app_level(label):
    return {'S': 'S0', 'SS': 'S1', 'SS+': 'S2'}.get(label.upper(), label.upper())


def validate_config(config):
    width, height = config['window_size']
    if not config['profile'].strip():
        raise ValueError('프로필 이름이 필요합니다.')
    if not config['levels'] or any(label not in ('D', 'C', 'B', 'A', 'S', 'S0', 'S1', 'S2', 'S3', 'S4', 'SS', 'SS+') for label in config['levels']):
        raise ValueError('유효한 레벨을 한 개 이상 지정하세요.')
    for name in ('list_box', 'detail_box', 'name_box', 'level_box', 'filter_box'):
        x1, y1, x2, y2 = config[name]
        if not (0 <= x1 < x2 <= width and 0 <= y1 < y2 <= height):
            raise ValueError(f'{name}: 영역이 게임창을 벗어났습니다.')
    dx1, dy1, dx2, dy2 = config['detail_box']
    for name in ('name_box', 'level_box'):
        x1, y1, x2, y2 = config[name]
        if not (dx1 <= x1 < x2 <= dx2 and dy1 <= y1 < y2 <= dy2):
            raise ValueError(f'{name}: 저장할 설명창 안의 영역을 지정하세요.')
    rows = config['rows']
    if len(rows) < 2 or any(y2 <= y1 for (_, y1), (_, y2) in zip(rows, rows[1:])):
        raise ValueError('목록에서 위에서 아래 순서로 최소 두 항목을 지정하세요.')
    if any(not config['list_box'][1] <= y < config['list_box'][3] for _, y in rows):
        raise ValueError('클릭할 스킬 행은 목록 영역 높이 안에 있어야 합니다.')
    if len(config['levels']) != len({app_level(x) for x in config['levels']}):
        raise ValueError('중복 레벨이 있습니다. S와 S0를 동시에 지정하지 마세요.')
    if set(config['levels']) != set(config['level_points']):
        raise ValueError('레벨 이름과 위치가 일치하지 않습니다.')
    for point in [*rows, config['close_point'], config['neutral_point'], *config['level_points'].values()]:
        if not (0 <= point[0] < width and 0 <= point[1] < height):
            raise ValueError('클릭 위치가 게임창을 벗어났습니다.')
    for label, (x, y) in config['level_points'].items():
        bx1, by1, bx2, by2 = config['level_box']
        if not (bx1 <= x < bx2 and by1 <= y < by2):
            raise ValueError(f'{label} 버튼이 레벨 영역 안에 있어야 합니다.')


@dataclass
class CaptureOptions:
    delay: float = 0.45
    max_pages: int = 1000
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
            'schema': 1, 'profile': config['profile'], 'skills': {}, 'status': 'ready'}
        if self.state['profile'] != config['profile']:
            raise ValueError('다른 필터의 결과 폴더입니다. 새 프로필을 만드세요.')
        signature = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
        if self.state.get('config_signature', signature) != signature:
            raise ValueError('위치 설정이 바뀌었습니다. 새 프로필로 저장해 기존 결과와 분리하세요.')
        self.state['config_signature'] = signature
        self.templates = {level: Image.open(self.folder / 'calibration' / f'level-{app_level(level)}.png').copy()
                          for level in config['levels']}
        self.filter_template = Image.open(self.folder / 'calibration/filter.png').copy()
        self.modal_open = False

    def check(self):
        if self.stop.is_set() or self.backend.escape_pressed():
            raise StopCapture('중지 요청을 받았습니다.')
        self.backend.guard()

    def wait(self):
        until = time.monotonic() + self.options.delay
        while time.monotonic() < until:
            self.check()
            time.sleep(0.04)

    def screenshot(self):
        self.check()
        image = self.backend.screenshot()
        if list(image.size) != self.config['window_size']:
            raise LayoutMismatch('게임창 크기가 바뀌었습니다. 원래 크기로 되돌리세요.')
        return image

    def click(self, point):
        self.check()
        self.backend.click(point)
        self.wait()
        self.check()
        self.backend.move(self.config['neutral_point'])
        self.wait()

    def assert_list(self, image):
        if distance(crop(image, self.config['filter_box']), self.filter_template) > 0.045:
            raise LayoutMismatch('도감 필터/목록 화면이 기준과 다릅니다. 클릭을 중단합니다.')

    def expected_level(self, image, expected=None):
        current = crop(image, self.config['level_box'])
        scores = sorted((distance(current, template), level) for level, template in self.templates.items())
        score, best = scores[0]
        if score > 0.045 or (len(scores) > 1 and scores[1][0] - score < 0.001):
            raise LayoutMismatch('레벨 버튼 상태를 확실히 식별할 수 없습니다. 화면/필터를 확인하세요.')
        if expected is not None and best != expected:
            raise LayoutMismatch(f'{expected} 클릭 후 {best}가 선택돼 있습니다. 캡처를 중단합니다.')
        return best

    def checkpoint(self, status, message=''):
        self.state.update(status=status, message=message, updated_at=time.strftime('%Y-%m-%d %H:%M:%S'))
        save_json(self.state_path, self.state)

    def collect_one(self, point):
        self.assert_list(self.screenshot())
        self.click(point)
        opened = self.screenshot()
        self.expected_level(opened)
        self.modal_open = True
        name_image = crop(opened, self.config['name_box'])
        key = identity(name_image)
        record = self.state['skills'].get(key)
        if record is None:
            number = len(self.state['skills']) + 1
            if number > self.options.max_skills:
                raise StopCapture('설정한 최대 스킬 수에 도달했습니다.')
            record = {'id': f'skill_{number:04}', 'name_fingerprint': key, 'levels': {},
                      'source': '사용자 Windows 게임 내 도감', 'profile': self.config['profile']}
            self.state['skills'][key] = record
        dest = self.folder / record['id']
        dest.mkdir(exist_ok=True)
        name_image.save(dest / 'name.png')
        for level in self.config['levels']:
            if level in record['levels'] and (self.folder / record['levels'][level]['file']).exists():
                continue
            self.click(self.config['level_points'][level])
            shot = self.screenshot()
            self.expected_level(shot, level)
            if identity(crop(shot, self.config['name_box'])) != key:
                raise LayoutMismatch('레벨을 바꾸는 동안 스킬명 영역이 달라졌습니다. 이름 영역에 레벨/애니메이션이 들어갔는지 확인하세요.')
            filename = f'{record["id"]}/{app_level(level)}.png'
            crop(shot, self.config['detail_box']).save(self.folder / filename)
            record['levels'][level] = {'official_level': level, 'app_level': app_level(level), 'file': filename,
                                      'captured_at': time.strftime('%Y-%m-%d %H:%M:%S')}
            self.checkpoint('running')
            self.log(f'{record["id"]} · {level} 저장')
        record['complete'] = True
        self.checkpoint('running')
        self.click(self.config['close_point'])
        self.assert_list(self.screenshot())
        self.modal_open = False

    def run(self):
        self.checkpoint('running')
        try:
            seen_pages = set()
            for page in range(self.options.max_pages):
                self.check()
                before = self.screenshot()
                self.assert_list(before)
                list_image = crop(before, self.config['list_box'])
                page_key = identity(list_image)
                if page_key in seen_pages:
                    raise LayoutMismatch('이미 처리한 목록 화면으로 돌아왔습니다. 자동 종료 대신 목록 상태를 확인하세요.')
                seen_pages.add(page_key)
                points = self.config['rows'][:1] if self.options.test_only else self.config['rows']
                for point in points:
                    self.collect_one(point)
                if self.options.test_only:
                    self.checkpoint('test_complete', '첫 항목 캡처 완료. 결과 이미지를 확인하세요.')
                    return
                before = self.screenshot()
                self.assert_list(before)
                before_list = crop(before, self.config['list_box'])
                self.check()
                x1, y1, x2, y2 = self.config['list_box']
                self.backend.move(((x1 + x2) // 2, (y1 + y2) // 2))
                self.backend.scroll(-1)
                self.wait()
                self.check()
                self.backend.move(self.config['neutral_point'])
                self.wait()
                after = self.screenshot()
                self.assert_list(after)
                after_list = crop(after, self.config['list_box'])
                if page_unchanged(before_list, after_list):
                    # Confirm an unchanged list a second time after rendering settles.
                    self.wait()
                    if page_unchanged(before_list, crop(self.screenshot(), self.config['list_box'])):
                        self.checkpoint('bottom_detected', '목록 이동이 더 이상 감지되지 않습니다. 마지막 항목까지 포함됐는지 확인하세요.')
                        return
                pitch = self.config['rows'][1][1] - self.config['rows'][0][1]
                if not has_scroll_overlap(before_list, after_list, pitch):
                    after.save(self.folder / 'scroll-check.png')
                    raise LayoutMismatch('스크롤 전후에 겹치는 항목을 확인하지 못했습니다. 누락을 막기 위해 멈췄습니다. 목록 맨 위에서 다시 시작하세요.')
                self.log(f'목록 이동 {page + 1} · 저장 스킬 {len(self.state["skills"])}개')
            raise StopCapture('최대 목록 이동 횟수에 도달했습니다.')
        except StopCapture as error:
            self.checkpoint('paused', str(error))
            raise
        except Exception as error:
            self.checkpoint('error', str(error))
            raise
