"""Visible player-guide capture. No game file/network/memory access."""
import csv
import hashlib
import json
from pathlib import Path
import re
import time
from PIL import Image
from core import StopCapture, LayoutMismatch, crop, distance, identity, save_json

PLAYER_MODES = {'stats', 'portrait', 'all'}
METADATA = {'name': '선수명', 'team': '구단', 'grade': '카드 종류', 'year': '연도', 'theme': '테마'}


def safe_path(folder, relative):
    root = Path(folder).resolve()
    path = (root / relative).resolve()
    if not path.is_relative_to(root): raise ValueError('결과 경로가 프로필 폴더를 벗어났습니다.')
    return path


def validate_player_config(config):
    if config.get('schema') != 'players-v1' or config.get('capture_mode') not in PLAYER_MODES:
        raise ValueError('선수 수집용 프로필을 설정하세요.')
    if not config.get('profile', '').strip() or not config.get('scope', '').strip():
        raise ValueError('프로필과 현재 도감 필터 설명이 필요합니다.')
    width, height = config['window_size']
    def box(b):
        if len(b) != 4 or not all(type(n) is int for n in b) or not (0 <= b[0] < b[2] <= width and 0 <= b[1] < b[3] <= height):
            raise ValueError('캡처 영역이 게임창을 벗어났습니다.')
    def point(p):
        if len(p) != 2 or not all(type(n) is int for n in p) or not (0 <= p[0] < width and 0 <= p[1] < height):
            raise ValueError('클릭 위치가 게임창을 벗어났습니다.')
    for key in ('detail_box', 'detail_anchor', 'name_box', 'identity_box'): box(config[key])
    for key in ('name_box', 'identity_box'):
        x1, y1, x2, y2 = config[key]; dx1, dy1, dx2, dy2 = config['detail_box']
        if not (dx1 <= x1 < x2 <= dx2 and dy1 <= y1 < y2 <= dy2): raise ValueError('이름과 카드 식별 정보는 상세 캡처 안에 포함하세요.')
    point(config['neutral_point'])
    for key, b in config.get('metadata_boxes', {}).items():
        if key not in METADATA: raise ValueError('알 수 없는 선수 정보 항목입니다.')
        box(b)
    if config['capture_mode'] in ('stats', 'all'):
        box(config['stats_box'])
        fields = config.get('stat_boxes', [])
        if not fields or len(fields) > 20 or len({f['name'] for f in fields}) != len(fields): raise ValueError('능력치 항목을 중복 없이 1~20개 지정하세요.')
        for f in fields:
            if not f['name'].strip() or len(f['name']) > 30: raise ValueError('능력치 이름을 확인하세요.')
            box(f['box'])
    if config['capture_mode'] in ('portrait', 'all'): box(config['portrait_box'])
    if config['navigation'] != 'next': raise ValueError('상세 화면의 다음 선수 이동 방식을 사용하세요.')
    point(config['next_point'])
    if type(config['max_cards']) is not int or not 1 <= config['max_cards'] <= 10000: raise ValueError('최대 수집 수는 1~10,000입니다.')


def card_identity(image, config):
    # Both name AND card metadata; never stop solely on a repeated player name.
    return hashlib.sha256((identity(crop(image, config['name_box'])) + identity(crop(image, config['identity_box']))).encode()).hexdigest()


class PlayerCollector:
    def __init__(self, backend, config, folder, stop, log=print, delay=0.6, test_only=False):
        validate_player_config(config)
        self.backend, self.config, self.folder, self.stop, self.log = backend, config, Path(folder), stop, log
        self.delay, self.test_only = delay, test_only
        self.folder.mkdir(parents=True, exist_ok=True)
        self.state_path = self.folder / 'state.json'
        self.state = json.loads(self.state_path.read_text(encoding='utf-8')) if self.state_path.exists() else {'schema':'players-v1', 'cards':{}, 'status':'ready'}
        signature = hashlib.sha256(json.dumps(config, sort_keys=True).encode()).hexdigest()
        if self.state.get('schema') != 'players-v1' or self.state.get('config_signature', signature) != signature:
            raise ValueError('위치·필터·수집 기능이 바뀌었습니다. 새 프로필로 설정하세요.')
        self.state['config_signature'] = signature
        self.templates = {}
        for key in ['detail_anchor']:
            with Image.open(self.folder / 'calibration' / (key + '.png')) as image: self.templates[key] = image.copy()

    def check(self):
        if self.stop.is_set() or self.backend.escape_pressed(): raise StopCapture('수집을 중지했습니다.')
        self.backend.guard()

    def wait(self):
        end = time.monotonic() + self.delay
        while time.monotonic() < end: self.check(); time.sleep(0.04)

    def screenshot(self):
        self.check(); image = self.backend.screenshot()
        if list(image.size) != self.config['window_size']: raise LayoutMismatch('게임창 크기가 바뀌었습니다.')
        return image

    def click(self, point):
        self.check(); self.backend.click(point); self.wait(); self.backend.move(self.config['neutral_point']); self.wait()

    def assert_anchor(self, image, name):
        if identity(crop(image, self.config[name])) != identity(self.templates[name]):
            raise LayoutMismatch('선수 상세 화면을 확인하지 못했습니다. 빈 목록 칸·버튼 위치·필터를 확인하세요.' if name == 'detail_anchor' else '선수 목록의 필터 또는 화면이 달라졌습니다.')

    def stable_detail(self):
        previous = None
        for _ in range(6):
            image = self.screenshot(); self.assert_anchor(image, 'detail_anchor')
            current = card_identity(image, self.config)
            if current == previous: return image, current
            previous = current; self.wait()
        raise LayoutMismatch('선수 식별 영역이 계속 변합니다. 애니메이션·재화·시간을 제외한 이름과 카드 정보를 지정하세요.')

    def checkpoint(self, status, message=''):
        self.state.update(status=status, message=message, updated_at=time.strftime('%Y-%m-%d %H:%M:%S'))
        save_json(self.state_path, self.state)

    def capture(self, image, key):
        old = self.state['cards'].get(key)
        if old and old.get('files') and all(safe_path(self.folder, f).is_file() for f in old.get('files', {}).values()):
            self.log(f'{old["id"]}: 저장된 카드 건너뜀'); return
        number = len(self.state['cards']) + 1
        if not old and number > self.config['max_cards']: raise StopCapture('최대 카드 수에 도달했습니다. 전체 수집 완료로 처리하지 않습니다.')
        record = old or {'id':f'card_{number:05}', 'fingerprint':key, 'scope':self.config['scope'], 'stat_basis':'선수도감 기본 능력치', 'fields':{}, 'stats':{}, 'review_status':'needs_review'}
        dest = self.folder / 'cards' / record['id']; dest.mkdir(parents=True, exist_ok=True)
        files = {}
        def save(name, box):
            relative = f'cards/{record["id"]}/{name}.png'; crop(image, box).save(self.folder / relative); files[name] = relative; return relative
        save('detail', self.config['detail_box']); save('identity', self.config['identity_box'])
        boxes = {**self.config.get('metadata_boxes', {}), 'name':self.config['name_box']}
        for name, box in boxes.items():
            file = save(name, box)
            record['fields'].setdefault(name, {'value':None, 'raw':'', 'status':'pending'})['image'] = file
        if self.config['capture_mode'] in ('stats','all'):
            save('stats', self.config['stats_box'])
            for i, field in enumerate(self.config['stat_boxes']):
                file = save(f'stat_{i+1:02}', field['box'])
                record['stats'].setdefault(field['name'], {'value':None, 'raw':'', 'status':'pending'})['image'] = file
        if self.config['capture_mode'] in ('portrait','all'): save('portrait', self.config['portrait_box'])
        record.update(files=files, captured_at=time.strftime('%Y-%m-%d %H:%M:%S'))
        self.state['cards'][key] = record
        self.checkpoint('running'); self.log(f'{record["id"]}: 기본 능력치/이미지 원본 저장')

    def collect_next(self):
        image, first = self.stable_detail()
        if first != self.config['first_fingerprint']: raise LayoutMismatch('설정 때 첫 선수 상세 화면에서 시작하세요. 도감 정렬·필터도 같아야 합니다.')
        seen = set()
        for _ in range(self.config['max_cards']):
            key = card_identity(image, self.config); self.capture(image, key); seen.add(key)
            if self.test_only: self.checkpoint('test_complete', '첫 카드만 저장했습니다. 영역과 숫자를 검토하세요.'); return
            self.click(self.config['next_point']); image, new_key = self.stable_detail()
            if new_key == key: raise LayoutMismatch('다음 선수로 이동하지 않았습니다. 마지막 카드 또는 클릭 실패일 수 있어 완료로 처리하지 않습니다.')
            if new_key == first:
                self.checkpoint('complete', f'첫 카드로 돌아옴 · 현재 필터에서 {len(seen)}개 카드 확인'); return
            if new_key in seen: raise LayoutMismatch('첫 카드가 아닌 이전 카드가 반복되었습니다. 식별 영역과 이동을 확인하세요.')
        raise StopCapture('최대 이동 수에 도달했습니다. 아직 첫 카드로 돌아온 것을 확인하지 못했습니다.')

    def run(self):
        self.checkpoint('running')
        try:
            self.collect_next()
        except StopCapture as error:
            self.checkpoint('paused', str(error)); self.log(str(error))
        finally: export_players(self.folder, self.state)


def strict_stat(text):
    cleaned = text.strip()
    return int(cleaned) if re.fullmatch(r'[0-9]{1,3}', cleaned) else None


def export_players(folder, state):
    folder = Path(folder)
    records = list(state.get('cards', {}).values())
    save_json(folder / 'players.json', {'schema':'player-export-v1', 'stat_basis':'선수도감 기본 능력치', 'cards':records})
    names = list(dict.fromkeys(n for r in records for n in r['stats']))
    headers = ['id','scope',*METADATA,'stat_basis',*['기본_'+n for n in names],'portrait_path','review_status']
    def cell(v):
        if v is None: return ''
        if isinstance(v,str) and v.lstrip().startswith(('=','+','-','@')): return "'"+v
        return v
    tmp = folder / 'players.csv.tmp'
    with tmp.open('w',encoding='utf-8-sig',newline='') as f:
        writer = csv.writer(f); writer.writerow(headers)
        for r in records:
            writer.writerow([cell(v) for v in [r['id'],r['scope'],*[r['fields'].get(k,{}).get('value') for k in METADATA],r['stat_basis'],*[r['stats'].get(k,{}).get('value') for k in names],r['files'].get('portrait',''),r['review_status']]])
    tmp.replace(folder / 'players.csv')
