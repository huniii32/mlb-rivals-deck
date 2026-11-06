import copy
import csv
import json
from pathlib import Path
import tempfile
import threading
import unittest
from PIL import Image, ImageDraw
from core import StopCapture, crop
from player_core import PlayerCollector, card_identity, validate_player_config, strict_stat, safe_path, export_players
from player_ocr import process_players

CONFIG={'schema':'players-v1','capture_mode':'all','profile':'test-players','scope':'NYY / all','window_size':[600,400],'navigation':'next','max_cards':10,
        'neutral_point':[590,390],'next_point':[550,350],'detail_box':[0,0,580,380],'detail_anchor':[10,10,220,40],
        'name_box':[20,50,220,90],'identity_box':[20,100,280,140],'stats_box':[20,160,280,210],'portrait_box':[300,50,550,300],
        'metadata_boxes':{'team':[20,100,100,140]},'stat_boxes':[{'name':'파워','box':[20,160,80,200]}]}

class Game:
    def __init__(self):self.index=0;self.focus=True;self.noop=False;self.changed=False;self.clicks=0
    def guard(self):
        if not self.focus:raise StopCapture('focus lost')
    def escape_pressed(self):return False
    def move(self,p):self.guard()
    def click(self,p):
        self.guard();self.clicks+=1
        if not self.noop:self.index=(self.index+1)%3
    def screenshot(self):
        self.guard();im=Image.new('RGB',(600,400),'#102030');d=ImageDraw.Draw(im)
        d.text((12,12),'Player guide' if not self.changed else 'Wrong screen',fill='white')
        d.text((22,52),'Same Player' if self.index<2 else 'Other Player',fill='white')
        d.text((22,102),['NYY 2025 MOMENT THEME A','NYY 2026 MOMENT THEME B','LAD 2026 HOF'][self.index],fill='white')
        d.text((22,162),str(100+self.index),fill='white');d.rectangle(CONFIG['portrait_box'],fill=['red','blue','green'][self.index]);return im

class PlayerTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.addCleanup(self.tmp.cleanup);self.folder=Path(self.tmp.name);self.game=Game();self.config=copy.deepcopy(CONFIG)
        self.config['first_fingerprint']=card_identity(self.game.screenshot(),self.config)
        (self.folder/'calibration').mkdir();crop(self.game.screenshot(),CONFIG['detail_anchor']).save(self.folder/'calibration/detail_anchor.png')
    def collector(self,test=False,stop=None):return PlayerCollector(self.game,self.config,self.folder,stop or threading.Event(),lambda _:None,delay=0,test_only=test)
    def state(self):return json.loads((self.folder/'state.json').read_text())
    def test_cycle_keeps_same_name_different_cards(self):
        self.collector().run();s=self.state();self.assertEqual(s['status'],'complete');self.assertEqual(len(s['cards']),3)
        self.assertEqual(len(list((self.folder/'cards').glob('*/portrait.png'))),3)
        for r in s['cards'].values():self.assertEqual(r['stat_basis'],'선수도감 기본 능력치');self.assertIsNone(r['stats']['파워']['value'])
    def test_one_card_then_resume_and_repair(self):
        self.collector(True).run();self.assertEqual(self.game.clicks,0);self.assertEqual(len(self.state()['cards']),1)
        self.collector().run();r=next(iter(self.state()['cards'].values()));path=self.folder/r['files']['portrait'];path.unlink()
        self.collector().run();self.assertTrue(path.exists());self.assertEqual(len(self.state()['cards']),3)
    def test_noop_and_wrong_start_not_complete(self):
        self.game.noop=True;self.collector().run();self.assertEqual(self.state()['status'],'paused');self.assertEqual(len(self.state()['cards']),1)
        self.game.noop=False;self.game.index=1;self.collector().run();self.assertEqual(self.state()['status'],'paused');self.assertEqual(len(self.state()['cards']),1)
    def test_wrong_detail_screen_pauses_without_capture(self):
        self.game.changed=True;self.collector().run();self.assertEqual(self.state()['status'],'paused');self.assertEqual(len(self.state()['cards']),0);self.assertEqual(self.game.clicks,0)
    def test_scope_change_rejected(self):
        self.collector(True).run();self.config['scope']='changed'
        with self.assertRaises(ValueError):self.collector()
    def test_stop_and_limits(self):
        stop=threading.Event();stop.set();self.collector(stop=stop).run();self.assertEqual(len(self.state()['cards']),0)
        self.config['max_cards']=1
        # A distinct profile would be required after a prior run; remove only this test fixture state.
        (self.folder/'state.json').unlink();self.collector().run();self.assertEqual(self.state()['status'],'paused');self.assertEqual(len(self.state()['cards']),1)
    def test_numeric_regions_and_validation(self):
        self.assertEqual(strict_stat(' 123 '),123);self.assertEqual(strict_stat('0'),0)
        for x in ['1O5','105 99','+5','1000',''] :self.assertIsNone(strict_stat(x))
        with self.assertRaises(ValueError):safe_path(self.folder,'../outside')
        self.config['name_box']=[-1,0,100,100]
        with self.assertRaises(ValueError):validate_player_config(self.config)
    def test_ocr_blank_not_zero_and_manual_preserved(self):
        self.collector(True).run()
        def recognize(paths,stop):return [{'path':str(p),'text':'1O5' if 'stat_' in p.name else '=name','language':'ko'} for p in paths]
        process_players(self.folder,threading.Event(),lambda _:None,recognize)
        s=self.state();r=next(iter(s['cards'].values()));self.assertIsNone(r['stats']['파워']['value']);self.assertEqual(r['review_status'],'needs_review')
        with (self.folder/'players.csv').open(encoding='utf-8-sig') as f:rows=list(csv.DictReader(f));self.assertEqual(rows[0]['name'],"'=name");self.assertEqual(rows[0]['기본_파워'],'')
        r['stats']['파워'].update(value=105,status='manual');r['fields']['year']={'value':None,'status':'needs_review'}
        (self.folder/'state.json').write_text(json.dumps(s));process_players(self.folder,threading.Event(),lambda _:None,recognize)
        self.assertEqual(next(iter(self.state()['cards'].values()))['stats']['파워']['value'],105)
    def test_mode_specific_files(self):
        self.config['capture_mode']='portrait';self.collector(True).run();r=next(iter(self.state()['cards'].values()));self.assertFalse(r['stats']);self.assertIn('portrait',r['files']);self.assertNotIn('stats',r['files'])

if __name__=='__main__':unittest.main()
