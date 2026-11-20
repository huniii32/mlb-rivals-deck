#!/usr/bin/env python3
"""Sync Korean notice listings, verified Rival Pick releases and official skill changes."""
import json
import re
import tempfile
from datetime import datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import urljoin

from archive_skill_notices import (BASE, BodyParser, Fetcher, compact, content_blocks, list_page,
                                  is_skill_table, record, skill_history, table_data)
from import_rivals_series import build

DATA = Path(__file__).resolve().parents[1] / 'src/data'
KST = timezone(timedelta(hours=9))
BASELINE = '2026-11-19-live18'
PACK = r'https://futuremlb-fn\.qpyou\.cn/futuremlb/push/IndividualRates/'
SHEETS = {15:'TEAM SELECTIVE LIVE PACK', 18:'LIVE S PACK', 20:'LIVE S OR A PACK', 25:'POSITION SELECTIVE LIVE PACK'}
CHANGE = re.compile(r'(?:신규|새로운|추가|변경|개선|조정|상향|하향|개편).{0,28}스킬|스킬.{0,32}(?:추가|변경|개선|조정|상향|하향|개편)')
ROUND = re.compile(r'(20\d\d)\s*시즌\s*(\d+)차\s*(?:Live|라이브)\s*업데이트',re.I)
PICK = re.compile(r'(?:Rival\s*Pick|라이벌\s*픽)\s*선수\s*(?:변경|선정)',re.I)


def dump(value):
    return json.dumps(value, ensure_ascii=False, separators=(',', ':'))+'\n'


def update_release(fetch, article, item, match, cache):
    blocks = list(content_blocks(article))
    section = next((i for i,b in enumerate(blocks) if b.tag != 'table' and PICK.search(compact(b.text())) and not re.search(r'변경되지|변경\s*없',b.text())), None)
    if section is None:
        if re.search(r'(Rival\s*Pick|라이벌\s*픽).{0,20}(변경|선정)',compact(article.text()),re.I):
            raise ValueError('라이벌픽 변경 본문의 형식 확인 필요')
        return None  # Ordinary live update with no change of picks.
    year, number = map(int,match.groups())
    rows = []
    for b in blocks[section+1:]:
        if re.match(r'^\d+\s*[.)]', compact(b.text())) and not PICK.search(b.text()):
            break
        if b.tag=='table':
            table = table_data(b)
            if table and [c['text'].lower() for c in table[0]]==['team','name','year','position','ovr']:
                rows.extend([[c['text'] for c in row] for row in table[1:]])
    if len(rows)!=60:
        raise ValueError('공식 라이벌픽 타자·투수 60명 표 확인 필요')
    lines = [compact(b.text()) for b in blocks if b.tag!='table']
    idx = next(i for i,t in enumerate(lines) if '업데이트 일시' in t or '업데이트 일정' in t)
    schedule = ' '.join(lines[idx:idx+2])
    date = re.search(r'(\d{1,2})/(\d{1,2})\s*(?:\([월화수목금토일]\))?\s*(\d{1,2}):(\d{2})',schedule)
    if not date or re.search(r'미정|연기|변경 예정',schedule):
        raise ValueError('공식 적용 일시 확인 필요')
    effective = datetime(year,*map(int,date.groups()),tzinfo=KST)
    date_code=effective.strftime('%y%m%d')
    books={a.attrs.get('href','') for a in article.find('a')}
    workbook, = [u for u in books if re.fullmatch(PACK+date_code+r'/[A-Za-z0-9_-]+\.htm',u)]
    sheet_info=fetch.get('workbook-'+date_code,workbook).decode('cp949')
    names={compact(name).upper():href for name,href in re.findall(
        r'<x:Name>([^<]+)</x:Name>\s*<x:WorksheetSource HRef="([^"]+)"',sheet_info,re.I)}
    notice='notice-'+item['id']+'.html'
    sources=[(notice,item['url'])]
    for alias,name in SHEETS.items():
        url=urljoin(workbook,names[name])
        if not re.fullmatch(re.escape(workbook[:-4])+r'\.files/sheet\d+\.htm',url):
            raise ValueError('확률표 시트 경로 확인 필요')
        filename=f'sheet{alias:03}.htm'
        (cache/filename).write_bytes(fetch.get(date_code+'-'+filename,url))
        sources.append((filename,url))
    version=f'{effective.date()}-live{number}'
    snapshot=build(cache,version=version,effective_at=effective.isoformat(),title=item['title'],year=year,pick_rows=rows,source_urls=sources)
    return {'version':version,'round':number,'effectiveAt':effective.isoformat()},snapshot


def skill_notice(root,item):
    tables=[table_data(b) for b in root.find('table')]
    tables=[t for t in tables if is_skill_table(t)]
    sections=[compact(p.text()) for p in content_blocks(root) if p.tag!='table']
    mentions=[p for p in sections if CHANGE.search(p)]
    images=any(root.find('img'))
    if not (tables or mentions or CHANGE.search(item['title']) or (int(item['board'])==11 and images and not sections)):
        return None
    history=skill_history([{**item,'skill_tables':tables}])
    return {'date':item['published_at'],'title':item['title'],'url':item['url'],
            'effects':[{'name':name,'columns':entry['columns'],'rows':entry['rows']}
                       for name,entries in history.items() for entry in entries],
            'mentions':mentions[:10]}


def process(fetch,cache,item,rounds,skills,outputs):
    url,title=item['url'],item['title']
    match=ROUND.search(title) if item['board']==10 else None
    notice='notice-'+item['id']+'.html'
    body=fetch.get(notice,url)
    root=BodyParser();root.feed(body.decode('utf-8'))
    if not root.found: raise ValueError(f'본문 누락 {url}')
    if match:
        release=update_release(fetch,root.root,item,match,cache)
        if release:
            meta,snapshot=release
            old_round=next((r for r in rounds if r['round']==meta['round'] and r['effectiveAt'][:4]==meta['effectiveAt'][:4]),None)
            if old_round: rounds.remove(old_round)
            rounds.append(meta)
            path=DATA/('rivalsSeries-20261119.json' if meta['version']==BASELINE else 'rival-rounds/'+meta['version']+'.json')
            # Exclude changing page chrome (view count, etc.) from update detection.
            if path.exists():
                previous=json.loads(path.read_text())
                if previous['players']==snapshot['players'] and previous['effectiveAt']==meta['effectiveAt'] and [x['url'] for x in previous['sources']]==[x['url'] for x in snapshot['sources']]:
                    return
            outputs[path]=dump(snapshot)
    else:
        change=skill_notice(root.root,item)
        if change: skills[url]=change
        else: skills.pop(url,None)


def main():
    old=json.loads((DATA/'notices.json').read_text())
    existing={n['url']:n for n in old['notices']}
    rounds=json.loads((DATA/'rivalPickRounds.json').read_text())
    skill_path=DATA/'officialSkillChanges.json'
    skills={x['url']:x for x in json.loads(skill_path.read_text())}
    pending_path=DATA/'noticeSyncPending.json'
    jobs=json.loads(pending_path.read_text())
    pending={}
    outputs={}
    with tempfile.TemporaryDirectory() as tmp:
        cache=Path(tmp)
        fetch=Fetcher(cache,False)
        for board in [2,9,10,11]:
            latest=max((n['date'][:10] for n in existing.values() if f'/board/{board}/' in n['url']),default='2026-11-18')
            cutoff=min(latest, (datetime.now(KST)-timedelta(days=7)).date().isoformat())
            page=1
            while True:
                listing=list_page(fetch,board,page)
                entries=listing['list']['list']
                if not entries or any(str(raw['board_idx'])!=str(board) for raw in entries):
                    raise ValueError(f'게시판 {board} 목록 형식 확인 필요')
                for raw in entries:
                    item=record(raw,board)
                    url,title,date=item['url'],item['title'],item['published_at']
                    if not str(item['id']).isdigit() or not date: raise ValueError('공지 식별 정보 누락')
                    existing[url]={'title':title,'date':date,'url':url,'lang':'/ko/'}
                    match=ROUND.search(title) if board==10 else None
                    if board not in [9,11] and not match: continue
                    if match and (int(match[1]),int(match[2]))<(2026,18): continue
                    if date[:10]<cutoff and not (page==1 and raw is entries[0]): continue
                    jobs[url]={key:item[key] for key in ('id','board','title','published_at','url')}
                if min(str(r['regdate'])[:10] for r in entries)<=cutoff or page>=int(listing['paging']['last']): break
                page+=1
        for url,item in jobs.items():
            try:
                process(fetch,cache,item,rounds,skills,outputs)
            except Exception as error:
                pending[url]=item
                print(f'원문 재확인 필요 {url}: {error}',flush=True)
    outputs[pending_path]=dump(pending)
    notices=sorted(existing.values(),key=lambda n:(n['date'],n['url']),reverse=True)[:300]
    if old['notices']!=notices:
        outputs[DATA/'notices.json']=json.dumps({'updated':datetime.now(KST).date().isoformat(),'notices':notices},ensure_ascii=False,indent=1)+'\n'
    outputs[DATA/'rivalPickRounds.json']=dump(sorted(rounds,key=lambda r:r['effectiveAt']))
    outputs[skill_path]=dump(sorted(skills.values(),key=lambda x:(x['date'],x['url']),reverse=True))
    for path,data in outputs.items():
        if not path.exists() or path.read_text()!=data:
            path.parent.mkdir(parents=True,exist_ok=True)
            path.write_text(data)
            print('updated',path.relative_to(DATA))
    return 1 if pending else 0


if __name__=='__main__':
    raise SystemExit(main())
