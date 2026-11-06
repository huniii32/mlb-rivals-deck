import json
from pathlib import Path
import subprocess
import sys
import tempfile
import threading
import unittest
from unittest.mock import patch

@unittest.skipUnless(sys.platform=='win32','Windows GUI/OCR integration')
class WindowsIntegration(unittest.TestCase):
    def test_mode_selection_and_review(self):
        import tkinter as tk
        from app import App
        from player_gui import MODE_LABELS,PlayerReview
        from test_players import Game,CONFIG
        from player_core import PlayerCollector,card_identity
        from core import crop
        import copy
        root=tk.Tk()
        try:
            with patch('app.windows',return_value=[]):app=App(root)
            for label,mode in MODE_LABELS.items():
                app.mode.set(label);app.mode_changed();root.update()
                self.assertEqual(bool(app.player_controls.winfo_ismapped()),mode!='skills')
                app.set_busy(True);self.assertEqual(str(app.mode_combo.cget('state')),'disabled')
                app.set_busy(False);self.assertEqual(str(app.mode_combo.cget('state')),'readonly')
            with tempfile.TemporaryDirectory() as tmp:
                folder=Path(tmp);(folder/'calibration').mkdir();game=Game();config=copy.deepcopy(CONFIG);config['first_fingerprint']=card_identity(game.screenshot(),config)
                crop(game.screenshot(),config['detail_anchor']).save(folder/'calibration/detail_anchor.png')
                PlayerCollector(game,config,folder,threading.Event(),lambda _:None,delay=0,test_only=True).run()
                review=PlayerReview(root,folder);root.update()
                for key,value in [('name','Test Player'),('team','NYY'),('grade','Moment')]:review.variables[('fields',key)].set(value)
                review.variables[('stats','파워')].set('105');review.reviewed.set(True);review.save()
                record=next(iter(json.loads((folder/'state.json').read_text())['cards'].values()))
                self.assertEqual(record['review_status'],'reviewed');self.assertEqual(record['stats']['파워']['value'],105)
                review.destroy()
            # Only the test runner desktop, no game or user data.
            try:
                from PIL import ImageGrab
                root.update();ImageGrab.grab().save('gui-preview.png')
            except OSError:pass
        finally:root.destroy()
    def test_local_windows_ocr(self):
        from PIL import Image,ImageDraw,ImageFont
        from player_ocr import windows_ocr
        with tempfile.TemporaryDirectory() as tmp:
            path=Path(tmp)/'digits.png';im=Image.new('RGB',(500,180),'white');ImageDraw.Draw(im).text((30,25),'123',font=ImageFont.truetype('arial.ttf',95),fill='black');im.save(path)
            try:result=windows_ocr([path],threading.Event())
            except RuntimeError as e:
                if 'language is unavailable' in str(e):self.skipTest('Windows runner OCR language not installed')
                raise
            self.assertEqual(len(result),1);self.assertFalse(result[0].get('error'));self.assertEqual(result[0]['text'].strip(),'123')

if __name__=='__main__':unittest.main()
