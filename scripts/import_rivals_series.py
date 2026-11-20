#!/usr/bin/env python3
"""Build a dated Rival Series demo roster from official notice + same-release pack tables.
Source files must already be downloaded; no fabricated player stats or card grades.
"""
from pathlib import Path
import argparse,hashlib,json,re,collections
from import_skill_probabilities import Rows,POSITIONS
ROOT=Path(__file__).resolve().parents[1]
BASE='https://futuremlb-fn.qpyou.cn/futuremlb/push/IndividualRates/261119/RV1119LD.files/'
TEAMS='NYY BOS TB TOR BAL MIN DET CWS CLE KC LAA TEX SEA ATH HOU PHI MIA ATL NYM WSH STL CHC MIL CIN PIT LAD COL SF SD AZ'.split()
def rows(p,enc='cp949'):
 r=Rows();r.feed(p.read_bytes().decode(enc));return r.rows
def norm(s):return re.sub(r'[^가-힣0-9]','',s.split("'")[0])
def build(cache, *, version='2026-11-19-live18', effective_at='2026-11-19T11:00:00+09:00',
          title='2026 시즌 18차 Live 업데이트', year=2026, pick_rows=None, source_urls=None):
 cards=[];team=None
 for row in rows(cache/'sheet015.htm'):
  if row and (row[0] in TEAMS or row[0] in ['LC','OAK','ARI']):team={'LC':'KC','OAK':'ATH','ARI':'AZ'}.get(row[0],row[0])
  if row and row[0]=='Live':cards.append({'id':team+':'+row[1],'team':team,'name':row[2],'english':row[1],'year':year,'live':True,'pick':False,'ovr':None,'grade':None,'positions':[]})
 raw_count=len(cards)
 count=collections.Counter(p['english'] for p in cards)
 # Same-team abbreviated identities are also ambiguous (including two-way Ohtani).
 # Retain separate source rows but exclude these from roster construction.
 seen=collections.Counter()
 for p in cards:
  seen[p['id']]+=1
  p['id']+=f"#{seen[p['id']]}"
 pos={};position=None
 for row in rows(cache/'sheet025.htm'):
  if row and row[0] in POSITIONS:position=POSITIONS[row[0]]
  if row and row[0]=='Live':pos.setdefault(row[1],set()).add(position)
 s={r[1] for r in rows(cache/'sheet018.htm') if r and r[0]=='Live'}
 sa={r[1] for r in rows(cache/'sheet020.htm') if r and r[0]=='Live'}
 for p in cards:
  if count[p['english']]==1:
   p['positions']=sorted(pos.get(p['english'],[]));p['grade']='S' if p['english'] in s else 'A' if p['english'] in sa else None
 picks=[]
 for r in pick_rows if pick_rows is not None else rows(cache/'notice-18460.html','utf-8'):
  if len(r)==5 and r[0] in TEAMS and r[2]==str(year) and r[3] in POSITIONS.values() and r[4].isdigit():
   matches=[p for p in cards if p['team']==r[0] and (norm(r[1]).endswith(norm(p['name'])) or (len(norm(p['name']))>=2 and norm(r[1]).startswith(norm(p['name']))))]
   if len(matches)!=1:raise ValueError(('Rival Pick identity needs review',r,[p['name'] for p in matches]))
   p=matches[0];p['pick']=True;p['noticeName']=r[1];p['ovr']=int(r[4]);p['positions']=[r[3]]
   picks.append(p['id'])
 assert len(picks)==60 and len(set(picks))==60
 assert all(sum(p['pick'] and p['team']==t and p['positions'][0] in ('SP','RP','CP') for p in cards)==1 for t in TEAMS)
 assert all(sum(p['pick'] and p['team']==t for p in cards)==2 for t in TEAMS)
 assert raw_count and len({p['id'] for p in cards})==raw_count and s and sa and s <= sa and set(POSITIONS.values()) <= set.union(*pos.values())
 assert set(p['team'] for p in cards)==set(TEAMS)
 excluded=[p['id'] for p in cards if not p['positions']]
 sources=[]
 for name,url in source_urls or [('notice-18460.html','https://community.withhive.com/MLB9IRIVALS/ko/board/10/18460')]+[(f'sheet{n:03}.htm',BASE+f'sheet{n:03}.htm') for n in [15,18,20,25]]:
  sources.append({'file':name,'url':url,'sha256':hashlib.sha256((cache/name).read_bytes()).hexdigest()})
 return {'version':version,'effectiveAt':effective_at,'title':title,'sources':sources,'limitations':['버프·편성 규칙은 별도 계산기에서 제공된 게임 화면 및 사용자 확인 기준으로 관리','시즌 선수 실명 목록은 미수집. 일반 카드는 별도의 구단·등급·종류 조건으로 구성 가능','선수명 축약 중복으로 구별하지 못한 포지션·등급은 미확인 처리','공지 OVR은 Rival Pick 효과 포함. 다른 선수 OVR·육성값은 미수집'], 'excludedFromSearch':excluded,'players':cards}
if __name__=='__main__':
 ap=argparse.ArgumentParser();ap.add_argument('cache',type=Path);args=ap.parse_args();data=build(args.cache)
 target=ROOT/'src/data/rivalsSeries-20261119.json';target.write_text(json.dumps(data,ensure_ascii=False,separators=(',',':'))+'\n')
 print(f"Imported {len(data['players'])} Live cards, 60 Rival Picks; {len(data['excludedFromSearch'])} ambiguous cards excluded from search")
 for p in data['players']:
  if p['pick']:print(p['team'],p['name'],'=',p['noticeName'],p['positions'],p['grade'],p['ovr'])
