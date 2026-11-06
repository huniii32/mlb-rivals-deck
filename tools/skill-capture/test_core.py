"""Simulated game tests. No Windows/game input is sent by these tests."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from PIL import Image, ImageDraw
import numpy as np
from core import (Collector, CaptureOptions, StopCapture, LayoutMismatch,
                  crop, app_level, has_scroll_overlap, validate_config)


CONFIG = {
    'profile': 'gold-batter', 'window_size': [600, 400],
    'filter_box': [0, 0, 160, 30], 'list_box': [0, 50, 180, 350],
    'rows': [[80, 100], [80, 200]], 'neutral_point': [590, 390],
    'detail_box': [200, 40, 580, 370], 'name_box': [220, 60, 400, 100],
    'level_box': [220, 120, 540, 160], 'close_point': [570, 50],
    'levels': ['S', 'S1'], 'level_points': {'S': [250, 140], 'S1': [350, 140]},
}


class FakeGame:
    def __init__(self):
        self.modal = False
        self.skill = 0
        self.level = 'S'
        self.focus = True
        self.ignore_level = False
        self.wrong_name = False
        self.clicks = []
        self.changed_filter = False

    def guard(self):
        if not self.focus:
            raise StopCapture('focus lost')

    def escape_pressed(self):
        return False

    def move(self, point):
        self.guard()

    def scroll(self, amount):
        self.guard()  # Single page, already at bottom.

    def click(self, point):
        self.guard()
        self.clicks.append(point)
        if point == CONFIG['close_point']:
            self.modal = False
        elif not self.modal:
            self.skill = CONFIG['rows'].index(point)
            self.modal, self.level = True, 'S'
        elif not self.ignore_level:
            self.level = next(label for label, p in CONFIG['level_points'].items() if p == point)

    def screenshot(self):
        self.guard()
        image = Image.new('RGB', (600, 400), '#102030')
        draw = ImageDraw.Draw(image)
        draw.rectangle(CONFIG['filter_box'], fill='red' if self.changed_filter else 'green')
        draw.text((20, 95), 'Alpha', fill='white')
        draw.text((20, 195), 'Beta', fill='white')
        if self.modal:
            draw.rectangle(CONFIG['detail_box'], fill='#303040')
            name = ['Alpha', 'Beta'][self.skill]
            if self.wrong_name and self.level == 'S1':
                name = 'Another Skill'
            draw.text((225, 70), name, fill='white')
            draw.rectangle(CONFIG['level_box'], fill='black')
            x = CONFIG['level_points'][self.level][0]
            draw.rectangle((x - 25, 125, x + 25, 155), fill='cyan')
            draw.text((225, 200), f'effect {self.skill} {self.level}', fill='white')
        return image


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.game = FakeGame()
        calibration = self.folder / 'calibration'
        calibration.mkdir()
        crop(self.game.screenshot(), CONFIG['filter_box']).save(calibration / 'filter.png')
        self.game.modal = True
        for label in CONFIG['levels']:
            self.game.level = label
            crop(self.game.screenshot(), CONFIG['level_box']).save(calibration / f'level-{app_level(label)}.png')
        self.game.modal = False

    def collector(self, test_only=False, stop=None):
        return Collector(self.game, CONFIG, self.folder, stop or threading.Event(), lambda _: None,
                         CaptureOptions(delay=0, test_only=test_only))

    def state(self):
        return json.loads((self.folder / 'state.json').read_text())

    def test_all_levels_and_bottom_detection(self):
        self.collector().run()
        state = self.state()
        self.assertEqual(state['status'], 'bottom_detected')
        self.assertEqual(len(state['skills']), 2)
        for skill in state['skills'].values():
            self.assertTrue(skill['complete'])
            self.assertEqual(set(skill['levels']), {'S', 'S1'})
            for entry in skill['levels'].values():
                self.assertTrue((self.folder / entry['file']).exists())
        self.assertTrue((self.folder / 'skill_0001/S0.png').exists())

    def test_wrong_selected_level_does_not_get_saved_and_resume_fills_it(self):
        self.game.ignore_level = True
        with self.assertRaises(LayoutMismatch):
            self.collector().run()
        self.assertEqual(self.state()['status'], 'paused')
        self.assertTrue((self.folder / 'skill_0001/S0.png').exists())
        self.assertFalse((self.folder / 'skill_0001/S1.png').exists())
        existing = (self.folder / 'skill_0001/S0.png').stat().st_mtime_ns
        self.game.ignore_level, self.game.modal = False, False
        self.collector().run()
        self.assertEqual(len(self.state()['skills']), 2)
        self.assertEqual((self.folder / 'skill_0001/S0.png').stat().st_mtime_ns, existing)
        self.assertTrue((self.folder / 'skill_0001/S1.png').exists())

    def test_name_change_rejected(self):
        self.game.wrong_name = True
        with self.assertRaises(LayoutMismatch):
            self.collector().run()
        self.assertFalse((self.folder / 'skill_0001/S1.png').exists())

    def test_wrong_filter_stops_before_click(self):
        self.game.changed_filter = True
        with self.assertRaises(LayoutMismatch):
            self.collector().run()
        self.assertEqual(self.game.clicks, [])

    def test_focus_loss_stops_before_click(self):
        self.game.focus = False
        with self.assertRaises(StopCapture):
            self.collector().run()
        self.assertEqual(self.game.clicks, [])

    def test_stop_request_preserves_checkpoint(self):
        stop = threading.Event()
        stop.set()
        with self.assertRaises(StopCapture):
            self.collector(stop=stop).run()
        self.assertEqual(self.state()['status'], 'paused')
        self.assertEqual(self.game.clicks, [])

    def test_one_skill_test_does_not_walk_remaining_rows(self):
        self.collector(test_only=True).run()
        self.assertEqual(self.state()['status'], 'test_complete')
        self.assertEqual(len(self.state()['skills']), 1)
        self.assertNotIn(CONFIG['rows'][1], self.game.clicks)

    def test_calibration_change_cannot_reuse_existing_checkpoint(self):
        self.collector(test_only=True).run()
        changed = copy.deepcopy(CONFIG)
        changed['neutral_point'] = [589, 390]
        with self.assertRaises(ValueError):
            Collector(self.game, changed, self.folder, threading.Event())

    def test_resume_repairs_deleted_image(self):
        self.collector(test_only=True).run()
        (self.folder / 'skill_0001/S1.png').unlink()
        self.collector(test_only=True).run()
        self.assertTrue((self.folder / 'skill_0001/S1.png').exists())


class ValidationTests(unittest.TestCase):
    def test_duplicate_alias_and_empty_level_rejected(self):
        for levels in ([], ['S', 'S0']):
            config = copy.deepcopy(CONFIG)
            config['levels'] = levels
            with self.assertRaises(ValueError):
                validate_config(config)

    def test_capture_must_include_name_and_level(self):
        config = copy.deepcopy(CONFIG)
        config['detail_box'] = [200, 180, 580, 370]
        with self.assertRaises(ValueError):
            validate_config(config)

    def test_scroll_overlap_accepts_shared_rows_but_rejects_skip(self):
        # Deterministic textured content: scroll by 60 pixels, then skip a page.
        rng = np.random.default_rng(240)
        content = Image.fromarray(rng.integers(0, 256, (1000, 180, 3), dtype=np.uint8))
        before = content.crop((0, 0, 180, 300))
        self.assertTrue(has_scroll_overlap(before, content.crop((0, 60, 180, 360)), 60))
        self.assertFalse(has_scroll_overlap(before, content.crop((0, 400, 180, 700)), 60))


if __name__ == '__main__':
    unittest.main()
