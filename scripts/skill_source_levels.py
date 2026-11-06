"""Source labels -> current official labels -> app labels. No numeric effect extrapolation."""
import re

LEVEL_CHANGE_SOURCE = 'https://community.withhive.com/MLB9IRIVALS/ko/board/9/8164'
S4_SOURCE = 'https://community.withhive.com/MLB9IRIVALS/ko/board/9/17979'


def normalize_level(label):
    source = label
    token = re.sub(r'\s+', '', label).upper()
    if token in ('SS', 'SS+'):
        official = {'SS': 'S1', 'SS+': 'S2'}[token]
        return {'source_level': source, 'official_level': official, 'app_level': official,
                'basis': LEVEL_CHANGE_SOURCE, 'status': '공식 표기 변경표로 확인'}
    if token in ('D', 'C', 'B', 'A', 'S', 'S0', 'S1', 'S2', 'S3', 'S4'):
        official = 'S' if token == 'S0' else token
        return {'source_level': source, 'official_level': official,
                'app_level': 'S0' if official == 'S' else official,
                'basis': 'S0는 앱의 기본 S 표기' if official == 'S' else '원문 레벨 유지',
                'status': '표기만 정규화 · 효과 변경 여부는 별도 검증'}
    return {'source_level': source, 'official_level': None, 'app_level': None,
            'basis': None, 'status': '미확인 표기 · 자동 변환하지 않음'}


def annotate_history(history):
    result = {}
    for name, entries in history.items():
        result[name] = []
        for entry in entries:
            level_columns = [i for i, c in enumerate(entry['columns'])
                             if re.sub(r'\s+', '', c) in ('레벨', '등급', '스킬레벨', '스킬등급')]
            levels = []
            for row in entry['rows']:
                levels.append([{'column_index': i, **normalize_level(row[i])} for i in level_columns])
            result[name].append({**entry, 'row_level_labels': levels,
                                'effect_status': '과거 원문 수치 · 현행 효과 확정/상위 레벨 추산 안 함'})
    return result
