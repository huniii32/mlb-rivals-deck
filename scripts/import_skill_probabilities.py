#!/usr/bin/env python3
"""Import the official 2026-11-05 Superior Skill Change tables, preserving displayed rates."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/skill-probabilities'
BASE = 'https://futuremlb-fn.qpyou.cn/futuremlb/push/IndividualRates/261105/'
OVERVIEW = 'https://hive-fn.qpyou.cn/markup/img/tf/mlbrv/mlb9irivals_ko.html'
SHEETS = {'normal': 200, 'hof': 203, 'black': 206, 'blackOther': 207,
          'wbc': 210, 'wbcBlack': 212, 'wbcBlackOther': 213, 'supreme': 214}
POSITIONS = dict(zip(('Starting Pitcher', 'Relief Pitcher', 'Closing Pitcher', 'Catcher', 'First Baseman',
                     'Second Baseman', 'Third Baseman', 'Short Stop', 'Left Fielder', 'Center Fielder',
                     'Right Fielder', 'Designated Hitter'), ('SP','RP','CP','C','1B','2B','3B','SS','LF','CF','RF','DH')))
LEVELS = ['D', 'C', 'B', 'A', 'S']


class Rows(HTMLParser):
    def __init__(self):
        super().__init__(); self.rows, self.row, self.cell = [], None, None
    def handle_starttag(self, tag, attrs):
        if tag == 'tr': self.row = []
        if tag in ('td', 'th'): self.cell = []
        if tag == 'br' and self.cell is not None: self.cell.append(' ')
    def handle_endtag(self, tag):
        if tag in ('td', 'th') and self.cell is not None:
            if self.row is not None: self.row.append(re.sub(r'\s+', ' ', ''.join(self.cell)).strip())
            self.cell = None
        if tag == 'tr' and self.row is not None:
            self.rows.append(self.row); self.row = None
    def handle_data(self, text):
        if self.cell is not None: self.cell.append(text)


def percent(text):
    # Excel sometimes writes the decimal fraction without the percent formatter.
    return Decimal(text[:-1]) if text.endswith('%') else Decimal(text) * 100


def parse_sheet(raw):
    parser = Rows(); parser.feed(raw.decode('cp949'))
    result, position = {}, None
    for row in parser.rows:
        if row and row[0] in POSITIONS:
            position = POSITIONS[row[0]]; result[position] = {}
        if position and len(row) >= 8 and row[5] in LEVELS:
            name, level, tier, value = row[0], row[5], row[6], percent(row[7])
            tier = 'WBC' if tier == 'World Baseball Classic' else tier
            key = tier + ':' + name
            skill = result[position].setdefault(key, {'name': name, 'tier': tier, 'rates': [0] * 5})
            index = LEVELS.index(level)
            if skill['rates'][index] or not 0 < value <= 100: raise ValueError(f'Invalid/duplicate row: {row}')
            skill['rates'][index] = float(value)
    if set(result) != set(POSITIONS.values()): raise ValueError('Missing position section')
    for position, skills in result.items():
        total = sum(sum(skill['rates']) for skill in skills.values())
        if abs(total - 100) > 0.0001: raise ValueError(f'Unexpected total {position}: {total}')
    return {p: list(skills.values()) for p, skills in result.items()}


def main():
    ap = argparse.ArgumentParser(description=__doc__); ap.add_argument('--refresh', action='store_true'); args = ap.parse_args()
    CACHE.mkdir(parents=True, exist_ok=True)
    tables, sources = {}, {}
    for key, number in SHEETS.items():
        url = BASE + f'RV1105LD.files/sheet{number}.htm'; path = CACHE / f'sheet{number}.htm'
        if args.refresh or not path.exists(): path.write_bytes(urllib.request.urlopen(url, timeout=30).read())
        raw = path.read_bytes(); tables[key] = parse_sheet(raw)
        sources[key] = {'url': url, 'sha256': hashlib.sha256(raw).hexdigest()}
    overview = CACHE / 'overview.html'
    if args.refresh or not overview.exists(): overview.write_bytes(urllib.request.urlopen(OVERVIEW, timeout=30).read())
    out = {'asOf': '2026-11-05', 'checkedAt': datetime.now(timezone.utc).date().isoformat(),
           'overview': {'url': OVERVIEW, 'sha256': hashlib.sha256(overview.read_bytes()).hexdigest()},
           'sources': sources, 'levels': LEVELS, 'tables': tables}
    (ROOT / 'src/data/skillProbabilities.json').write_text(json.dumps(out, ensure_ascii=False, separators=(',', ':')) + '\n', encoding='utf-8')
    print('Imported', len(tables), 'tables ×', len(POSITIONS), 'positions')


if __name__ == '__main__': main()
