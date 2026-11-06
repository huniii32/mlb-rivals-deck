#!/usr/bin/env python3
"""Build a team/theme roster gated by the current official combination eligibility list."""
import argparse
from collections import Counter
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import unicodedata
import urllib.request
from import_skill_probabilities import Rows

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / 'data/combination-roster'
RATES = 'https://futuremlb-fn.qpyou.cn/futuremlb/push/IndividualRates/261105/RV1105LD.files/'
LISTS = 'https://futuremlb-fn.qpyou.cn/futuremlb/push/list/SPM/'
BOOKS = {
    'MSL072203': ['FIRST SPURT', 'SUMMER MONSTER', 'OCTOBER LEGEND', 'SLOW STARTER'],
    'MSL092203': ['FIRST SPURT', 'SUMMER MONSTER', 'SLOW STARTER'],
    'MSL110503_01': ['OCTOBER LEGEND', 'FIRST SPURT', 'SUMMER MONSTER', 'SLOW STARTER'],
}
TEAMS = set('NYY BOS TB TOR BAL MIN DET CWS CLE KC LAA TEX SEA ATH HOU PHI MIA ATL NYM WSH STL CHC MIL PIT CIN LAD SF SD ARI COL'.split())
ALIASES = {'LC': 'KC', 'OAK': 'ATH', 'AZ': 'ARI'}

def canonical_team(team):
    result = ALIASES.get(team, team)
    if result not in TEAMS: raise ValueError(f'Unknown team {team}')
    return result

def normalized(name):
    return re.sub('[^a-z0-9]', '', unicodedata.normalize('NFKD', name).encode('ascii','ignore').decode().lower())

def abbreviated(name):
    first, rest = name.split(' ', 1)
    initial = first if re.fullmatch(r'[A-Z.]{2,4}', first) else first[0]
    return normalized(initial + ' ' + rest)

def parse_rows(raw):
    parser = Rows(); parser.feed(raw.decode('cp949')); return parser.rows

def moment_rows(rows):
    team = theme = None
    result = []
    for i, row in enumerate(rows):
        if row and len(row) <= 2 and ' / ' in row[0]:
            raw_team, theme = row[0].split(' / ',1)
            team = canonical_team(raw_team)
        if len(row) >= 4 and row[0] == 'Moment':
            if not team or not theme: raise ValueError('Moment outside team/theme section')
            result.append({'id': f'moment-145-{i}', 'grade':'moment', 'team':team, 'name':row[2], 'enName':row[1], 'theme':theme})
    return result

def supreme_rows(rows, book, sheet, theme):
    result=[]
    for i,row in enumerate(rows):
        if len(row)>=7 and re.fullmatch('[A-Z]{2,3}',row[1]):
            result.append({'id':f'supreme-{book}-{sheet}-{i}', 'grade':'supreme', 'team':canonical_team(row[1]), 'name':row[3], 'enName':row[2], 'theme':theme, 'position':row[5], 'ovr':int(row[6])})
    return result

def gate_supreme(records, eligible):
    full = Counter(abbreviated(p['enName']) for p in records)
    # A historical name may disappear entirely. A partial collision is ambiguous: fail rather than guess a team/theme.
    for name,count in eligible.items():
        if full[name]!=count: raise ValueError(f'Supreme eligibility mismatch {name}: {full[name]} != {count}')
    return [p for p in records if abbreviated(p['enName']) in eligible]

def main():
    ap=argparse.ArgumentParser(description=__doc__);ap.add_argument('--refresh',action='store_true');args=ap.parse_args();CACHE.mkdir(parents=True,exist_ok=True)
    sources=[]
    def fetch(key,url):
        path=CACHE/(key+'.htm')
        if args.refresh or not path.exists(): path.write_bytes(urllib.request.urlopen(url,timeout=30).read())
        raw=path.read_bytes();sources.append({'key':key,'url':url,'sha256':hashlib.sha256(raw).hexdigest()});return parse_rows(raw)
    eligibility=fetch('combination',RATES+'sheet159.htm')
    moment=moment_rows(fetch('moment-team-theme',RATES+'sheet145.htm'))
    eligible_moment=Counter(normalized(r[1]) for r in eligibility if len(r)>=4 and r[0]=='Moment')
    if Counter(normalized(p['enName']) for p in moment)!=eligible_moment:raise ValueError('Moment list does not match current combination list')
    supreme=[]
    for book,themes in BOOKS.items():
        for sheet,theme in enumerate(themes,1):
            supreme+=supreme_rows(fetch(f'{book}-{sheet}',LISTS+f'{book}.files/sheet{sheet:03}.htm'),book,sheet,theme)
    eligible_supreme=Counter(normalized(r[1]) for r in eligibility if len(r)>=4 and r[0]=='Supreme Moment')
    before=len(supreme);supreme=gate_supreme(supreme,eligible_supreme)
    players=supreme+moment
    if len({p['id'] for p in players})!=len(players):raise ValueError('Duplicate card IDs')
    for grade in ['supreme','moment']:
        if {p['team'] for p in players if p['grade']==grade}!=TEAMS:raise ValueError(f'Missing team in {grade}')
    out={'asOf':'2026-11-05','checkedAt':datetime.now(timezone.utc).date().isoformat(),'sources':sources,'excludedHistoricalSupremeCards':before-len(supreme),'players':players}
    (ROOT/'src/data/combinationPlayers.json').write_text(json.dumps(out,ensure_ascii=False,separators=(',',':'))+'\n')
    print(f'Imported {len(supreme)} Supreme + {len(moment)} Moment card entries, all 30 teams; excluded {before-len(supreme)} retired historical entries')

if __name__=='__main__':main()
