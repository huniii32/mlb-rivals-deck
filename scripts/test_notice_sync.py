import tempfile
import unittest
from pathlib import Path
from unittest.mock import Mock
from fetch_notices_ko import BodyParser, ROUND, SHEETS, skill_notice, update_release
from import_rivals_series import TEAMS
from import_skill_probabilities import POSITIONS


def body(text):
    root = BodyParser()
    root.feed('<div class="post_cont">'+text+'</div>')
    return root.root


def table(rows):
    return '<table>'+''.join('<tr>'+''.join('<td>'+s+'</td>' for s in row)+'</tr>' for row in rows)+'</table>'


class Notices(unittest.TestCase):
    item = {'id':'123','url':'https://community.withhive.com/MLB9IRIVALS/ko/board/10/123',
            'title':'2026 시즌 20차 Live 업데이트','published_at':'2026-12-01','board':10}

    def test_release_without_picks(self):
        self.assertIsNone(update_release(None,body('<p>라이브 선수 업데이트</p>'),
                                         self.item,ROUND.search(self.item['title']),None))

    def test_complete_release(self):
        book='https://futuremlb-fn.qpyou.cn/futuremlb/push/IndividualRates/261203/RV1203LD.htm'
        with tempfile.TemporaryDirectory() as directory:
            cache=Path(directory)
            rows=[['Team','Name','Year','Position','OVR']]
            clubs=[]; ranks=[]; positions=[]
            for i,team in enumerate(TEAMS):
                clubs.append([team])
                for j,pos in enumerate(['C','SP']):
                    english=f'Card{i}-{j}'; name=f'선수{i}번{j}번'
                    card=['Live',english,name]
                    rows.append([team,name,'2026',pos,'80'])
                    clubs.append(card); ranks.append(card)
                    positions.extend([[next(k for k,v in POSITIONS.items() if v==pos)],card])
            for position in POSITIONS:
                positions.extend([[position],ranks[0]])
            raw={'workbook-261203':''.join(f'<x:Name>{name}</x:Name><x:WorksheetSource HRef="RV1203LD.files/sheet{n+3:03}.htm"/>' for n,name in SHEETS.items())}
            for n,values in [(15,clubs),(18,ranks),(20,ranks),(25,positions)]:
                raw[f'261203-sheet{n:03}.htm']=table(values)
            fetch=Mock()
            fetch.get.side_effect=lambda key,url: raw[key].encode('cp949')
            content='<p>■ 업데이트 일시</p><p>12/3(목) 11:00</p><h3>1. Rival Pick 선수 변경</h3>'
            link=f'<p><a href="{book}">개별 확률</a></p>'
            (cache/'notice-123.html').write_text(content)
            args=(self.item,ROUND.search(self.item['title']),cache)
            meta,snapshot=update_release(fetch,body(content+table(rows)+link),*args)
            self.assertEqual(meta,{'version':'2026-12-03-live20','round':20,'effectiveAt':'2026-12-03T11:00:00+09:00'})
            self.assertEqual(sum(p['pick'] for p in snapshot['players']),60)
            self.assertTrue(snapshot['sources'][1]['url'].endswith('sheet018.htm'))
            with self.assertRaises(ValueError):
                update_release(fetch,body(content+table(rows[:-1])+link),*args)

    def test_skill_source(self):
        item={**self.item,'board':11}
        root=body('<p>신규 스킬 추가</p>'+table([['스킬명','효과'],['키스톤','수비 +9']]))
        result=skill_notice(root,item)
        self.assertEqual(result['effects'][0]['rows'],[['키스톤','수비 +9']])
        self.assertIsNone(skill_notice(body('<p>선수 사진 추가</p>'),item))
