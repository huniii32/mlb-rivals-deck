"""Consumable UI loop tests: no real game input, OCR, or inventory."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from PIL import Image,ImageDraw
from core import StopCapture,crop,save_json
from reroll_core import RerollController,matches_pair,parse_balance,validate_reroll_config

KEYS=['player_box','ready_box','button_box','lock_box','first_box','second_box','third_box','balance_box']
CONFIG={'schema':'reroll-v1','profile':'test','card_kind':'moment','locked_confirmed':True,'fixed':'배팅머신','candidates':['클린업 트리오','타점기계'],'max_changes':5,'known_names':['배팅머신','클린업 트리오','타점기계','집중력','파워히터'],'window_size':[320,200],'confirmation':'none','neutral_point':[300,190],'result_box':[0,0,320,200]}
for i,key in enumerate(KEYS):CONFIG[key]=[i*40,0,i*40+35,35]
CONFIG['change_point']=[85,15]

class Game:
    def __init__(self,results=None):
        self.names=['집중력','파워히터'];self.balance=100;self.results=list(results or []);self.clicks=0;self.bad=None;self.focus=True;self.escape=False
    def guard(self):
        if not self.focus:raise StopCapture('focus lost')
    def escape_pressed(self):return self.escape
    def move(self,point):self.guard()
    def screenshot(self):
        im=Image.new('RGB',(320,200),'white');draw=ImageDraw.Draw(im)
        for i,key in enumerate(KEYS):
            value=str(i) if key not in ('second_box','third_box','balance_box') else str(self.balance) if key=='balance_box' else str(['배팅머신','클린업 트리오','타점기계','집중력','파워히터'].index(self.names[0 if key=='second_box' else 1])) if self.names[0 if key=='second_box' else 1] in CONFIG['known_names'] else 'unknown'
            draw.text((i*40+2,3),value,fill='black')
        if self.bad:draw.rectangle(CONFIG[self.bad],fill='black')
        return im
    def click(self,point):
        self.guard();self.clicks+=1
        if self.results:
            change=self.results.pop(0)
            if callable(change):change(self)
            else:self.names=list(change);self.balance-=1
    def recognize(self,paths,check):
        check();values={'second_box':self.names[0],'third_box':self.names[1],'balance_box':str(self.balance)}
        return [{'path':str(p),'text':values[p.stem],'error':None} for p in paths]

class RerollTests(unittest.TestCase):
    def setUp(self):
        self.tmp=tempfile.TemporaryDirectory();self.folder=Path(self.tmp.name);self.config=copy.deepcopy(CONFIG);self.game=Game();self.stop=threading.Event()
        (self.folder/'calibration').mkdir()
        for key in ('player_box','ready_box','button_box','lock_box','first_box'):crop(self.game.screenshot(),self.config[key]).save(self.folder/'calibration'/(key+'.png'))
    def tearDown(self):self.tmp.cleanup()
    def controller(self,read_only=False):return RerollController(self.game,self.config,self.folder,self.stop,self.game.recognize,lambda _:None,delay=0,read_only=read_only,max_polls=3)
    def run_loop(self):
        c=self.controller();c.run();return c
    def prepare(self):
        c=self.controller(True);c.run();self.assertEqual(c.state['status'],'tested');self.assertEqual(self.game.clicks,0)
    def test_unordered_exact_and_candidates(self):
        self.assertTrue(matches_pair(['타점기계','배팅 머신'],'배팅머신',['타점기계','클린업트리오']))
        self.assertTrue(matches_pair(['클린업 트리오','배팅머신'],'배팅머신',['클린업트리오']))
        self.assertFalse(matches_pair(['타점기계','집중력'],'배팅머신',['타점기계']))
        self.assertFalse(matches_pair(['배팅머신','배팅머신'],'배팅머신',['배팅머신']))
        self.assertFalse(matches_pair(['배팅머신','타점기계','집중력'],'배팅머신',['타점기계']))
    def test_requires_read_only_test(self):
        c=self.run_loop();self.assertEqual(c.state['status'],'paused');self.assertEqual(self.game.clicks,0)
    def test_existing_goal_zero_clicks(self):
        self.game.names=['클린업 트리오','배팅머신'];self.prepare();c=self.run_loop()
        self.assertEqual(c.state['status'],'goal');self.assertEqual(self.game.clicks,0);self.assertTrue((self.folder/'goal.png').exists())
    def test_stop_exactly_at_first_goal(self):
        self.game.results=[['집중력','타점기계'],['타점기계','배팅머신'],['집중력','파워히터']];self.prepare();c=self.run_loop()
        self.assertEqual(c.state['status'],'goal');self.assertEqual(self.game.clicks,2);self.assertEqual(c.state['confirmed'],2);self.assertEqual(c.state['spent'],2)
    def test_limit_persists_on_resume(self):
        self.config['max_changes']=2;self.game.results=[['집중력','타점기계'],['파워히터','타점기계'],['타점기계','배팅머신']];self.prepare()
        self.assertEqual(self.run_loop().state['status'],'limit');self.assertEqual(self.run_loop().state['status'],'limit');self.assertEqual(self.game.clicks,2)
    def test_identical_result_with_counter_confirmed(self):
        self.game.results=[['집중력','파워히터'],['배팅머신','클린업 트리오']];self.prepare();c=self.run_loop()
        self.assertEqual(c.state['status'],'goal');self.assertEqual(c.state['confirmed'],2)
    def test_same_result_without_counter_not_retried(self):
        self.config['balance_box']=None;self.game.results=[['집중력','파워히터']];self.prepare()
        c=self.run_loop();self.assertEqual(c.state['status'],'paused');self.assertIsNotNone(c.state['pending'])
        self.run_loop();self.assertEqual(self.game.clicks,1)
    def test_no_counter_changed_pair_works(self):
        self.config['balance_box']=None;self.game.results=[['배팅머신','클린업 트리오']];self.prepare()
        self.assertEqual(self.run_loop().state['status'],'goal');self.assertEqual(self.game.clicks,1)
    def test_pending_resume_settles_without_second_click(self):
        self.prepare();c=self.run_loop();self.assertEqual(self.game.clicks,1);self.assertIsNotNone(c.state['pending'])
        self.game.names=['배팅머신','타점기계'];self.game.balance=99;c=self.run_loop()
        self.assertEqual(c.state['status'],'goal');self.assertEqual(c.state['confirmed'],1);self.assertEqual(self.game.clicks,1)
    def test_unknown_ocr_stops_after_one_change(self):
        self.game.results=[['미확인스킬','집중력']];self.prepare();c=self.run_loop()
        self.assertEqual(c.state['status'],'paused');self.assertEqual(self.game.clicks,1);self.assertEqual(c.state['confirmed'],0)
    def test_lock_player_first_or_screen_changed_no_more_click(self):
        for key in ('lock_box','first_box','player_box','ready_box','button_box'):
            with self.subTest(key=key):
                # Separate profile state for each failed action.
                (self.folder/'state.json').unlink(missing_ok=True);self.game=Game([lambda g:setattr(g,'bad',key)]);self.prepare()
                c=self.run_loop();self.assertEqual(c.state['status'],'paused');self.assertEqual(self.game.clicks,1)
    def test_unchanged_counter_never_retries_even_with_changed_text(self):
        self.game.results=[lambda g:setattr(g,'names',['집중력','타점기계'])];self.prepare();self.run_loop();self.assertEqual(self.game.clicks,1)
    def test_zero_balance_no_click(self):
        self.game.balance=0;self.prepare();self.assertEqual(self.run_loop().state['status'],'paused');self.assertEqual(self.game.clicks,0)
    def test_increasing_counter_stops(self):
        self.game.results=[lambda g:setattr(g,'balance',101)];self.prepare();self.assertEqual(self.run_loop().state['status'],'paused');self.assertEqual(self.game.clicks,1)
    def test_stop_escape_focus(self):
        self.prepare()
        for prop in ('stop','escape','focus'):
            self.stop.clear();self.game.escape=False;self.game.focus=True
            if prop=='stop':self.stop.set()
            elif prop=='escape':self.game.escape=True
            else:self.game.focus=False
            self.assertEqual(self.run_loop().state['status'],'paused');self.assertEqual(self.game.clicks,0)
    def test_config_changes_require_new_profile(self):
        self.prepare();self.config['max_changes']=6
        with self.assertRaises(ValueError):self.controller()
    def test_screen_changes_during_ocr_are_reread_before_click(self):
        self.prepare();recognize=self.game.recognize
        def changing(paths,check):
            result=recognize(paths,check)
            self.game.names=['배팅머신','타점기계']
            return result
        self.game.recognize=changing
        c=self.controller();c.max_polls=6;c.run();self.assertEqual(c.state['status'],'goal');self.assertEqual(self.game.clicks,0)
    def test_request_is_checkpointed_before_input(self):
        self.prepare()
        def failed_click(point):raise StopCapture('input interrupted')
        self.game.click=failed_click
        c=self.run_loop();self.assertEqual(c.state['requested'],1);self.assertIsNotNone(c.state['pending'])
        self.game.click=lambda point:self.fail('ambiguous input must not be replayed')
        self.run_loop()
    def test_target_and_coordinate_validation(self):
        for changes in ({'candidates':['배팅머신']},{'candidates':['타점기계','타점 기계']},{'max_changes':0},{'locked_confirmed':False},{'change_point':[200,180]},{'card_kind':'black'},{'confirmation':'dialog'}):
            with self.subTest(changes=changes),self.assertRaises(ValueError):validate_reroll_config({**self.config,**changes})
    def test_balance_strictness(self):
        self.assertEqual(parse_balance('1,234'),1234)
        for invalid in ('1O0','3/100','-1','1 000','1,00',''):self.assertIsNone(parse_balance(invalid))

if __name__=='__main__':unittest.main()
