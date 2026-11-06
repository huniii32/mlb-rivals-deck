#!/usr/bin/env python3
"""Import the current official NORMAL RECRUIT HOF PACK roster and displayed rates."""
import argparse
from datetime import datetime, timezone
from decimal import Decimal
import hashlib,json,re,urllib.request
from pathlib import Path
from import_skill_probabilities import Rows
ROOT=Path(__file__).resolve().parents[1]
OVERVIEW='https://hive-fn.qpyou.cn/markup/img/tf/mlbrv/mlb9irivals_ko.html'
GUIDE='https://community.withhive.com/MLB9IRIVALS/ko/board/9/10742'

def parse_roster(raw):
    parser=Rows();parser.feed(raw.decode('cp949'))
    if not parser.rows or 'NORMAL RECRUIT HOF PACK' not in ' '.join(parser.rows[0]):raise ValueError('Not a normal HOF recruitment table')
    players=[]
    for row in parser.rows:
        if len(row)<5 or row[0]!='HOF':continue
        if not row[1].strip() or not row[2].strip():raise ValueError('Missing player name')
        rate=Decimal(row[4].removesuffix('%'));units=rate*1_000_000
        if units!=units.to_integral_value() or not 0<rate<=100:raise ValueError('Invalid official rate')
        players.append({'id':re.sub(r'[^a-z0-9]+','-',row[1].lower()).strip('-'),'name':row[2],'enName':row[1],'rate':str(rate),'weight':int(units)})
    if not players or len({p['id'] for p in players})!=len(players) or sum(p['weight'] for p in players)!=100_000_000:raise ValueError('Incomplete/duplicate roster or probabilities do not sum to 100%')
    return players

def main():
    ap=argparse.ArgumentParser();ap.add_argument('--refresh',action='store_true');args=ap.parse_args()
    folder=ROOT/'data/hof-recruit';folder.mkdir(parents=True,exist_ok=True)
    overview=folder/'overview.html'
    if args.refresh or not overview.exists():overview.write_bytes(urllib.request.urlopen(OVERVIEW,timeout=30).read())
    index=re.search(r'https://[^"\s<>]+/IndividualRates/\d+/[^"\s<>]+\.htm',overview.read_text(encoding='utf-8'))
    if not index:raise ValueError('No current individual rate link')
    base=index.group().removesuffix('.htm')+'.files/'
    folder=folder/base.split('/IndividualRates/')[1].rstrip('/')
    folder.mkdir(parents=True,exist_ok=True)
    tabs=folder/'tabstrip.htm'
    if args.refresh or not tabs.exists():tabs.write_bytes(urllib.request.urlopen(base+'tabstrip.htm',timeout=30).read())
    match=re.search(r'href="(sheet\d+\.htm)"[^>]*>\s*<font[^>]*>NORMAL RECRUIT HOF PACK</font>',tabs.read_bytes().decode('cp949'),re.I)
    if not match:raise ValueError('Normal HOF sheet not found')
    url=base+match[1];sheet=folder/match[1]
    if args.refresh or not sheet.exists():sheet.write_bytes(urllib.request.urlopen(url,timeout=30).read())
    raw=sheet.read_bytes();date=re.search(r'/IndividualRates/(\d{6})/',url)[1]
    output={'asOf':datetime.strptime(date,'%y%m%d').date().isoformat(),'checkedAt':datetime.now(timezone.utc).date().isoformat(),'overview':OVERVIEW,'guide':GUIDE,'source':{'url':url,'sha256':hashlib.sha256(raw).hexdigest()},'players':parse_roster(raw)}
    (ROOT/'src/data/hofRecruitment.json').write_text(json.dumps(output,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
    print('Imported',len(output['players']),'normal HOF players; total 100%;',url)
if __name__=='__main__':main()
