"""Simulated dropdown + circular next-skill game. Sends no desktop input."""
import copy
import json
from pathlib import Path
import tempfile
import threading
import unittest
from PIL import Image, ImageDraw
from core import (Collector, CaptureOptions, StopCapture, LayoutMismatch, crop,
                  TYPE_IDS, SKILL_LEVEL_CAPS, preset_levels, level_file, validate_config)

KINDS = list(SKILL_LEVEL_CAPS)
POINTS = {'S': [480, 175], 'S1': [480, 200], 'S2': [480, 225], 'S3': [480, 250], 'S4': [480, 275]}
CONFIG = {
    'schema': 3, 'profile': 'skill-guide', 'window_size': [600, 400],
    'tab_box': [0, 0, 600, 35], 'neutral_point': [590, 390],
    'detail_box': [200, 40, 580, 370], 'name_box': [220, 60, 440, 100],
    'level_box': [220, 110, 540, 150], 'close_point': [570, 50],
    'next_point': [550, 350], 'dropdown_point': [520, 130],
    'tabs': [{'skill_type': kind, 'tab_point': [50 + i * 100, 20], 'first_point': [80, 100],
              'levels': preset_levels(kind), 'menu_box': [450, 160, 550, 300],
              'level_points': {label: POINTS[label] for label in preset_levels(kind)}} for i, kind in enumerate(KINDS)],
}


class FakeGame:
    def __init__(self):
        self.kind = KINDS[0]
        self.modal = self.menu = False
        self.skill, self.level = 0, 'S'
        self.focus = True
        self.ignore_level = self.hide_menu = self.wrong_name = False
        self.next_noop = self.wrong_cycle = self.preserve_level = False
        self.clicks = []

    def guard(self):
        if not self.focus: raise StopCapture('focus lost')

    def escape_pressed(self):
        return False

    def move(self, point):
        self.guard()

    def click(self, point):
        self.guard(); self.clicks.append(tuple(point))
        if not self.modal:
            for tab in CONFIG['tabs']:
                if point == tab['tab_point']:
                    self.kind = tab['skill_type']; return
            if point == [80, 100]:
                self.modal, self.skill, self.level, self.menu = True, 0, 'S', False
            return
        if self.menu:
            for label, location in POINTS.items():
                if point == location:
                    if not self.ignore_level: self.level = label
                    self.menu = False
                    return
        elif point == CONFIG['dropdown_point']:
            if not self.hide_menu: self.menu = True
        elif point == CONFIG['close_point']:
            self.modal = False
        elif point == CONFIG['next_point']:
            if not self.next_noop:
                self.skill = 1 if self.wrong_cycle and self.skill == 2 else (self.skill + 1) % 3
                if not self.preserve_level: self.level = 'S'

    def screenshot(self):
        self.guard()
        image = Image.new('RGB', (600, 400), '#102030')
        draw = ImageDraw.Draw(image)
        draw.rectangle(CONFIG['tab_box'], fill=['#8f1010', '#108f10', '#10108f', '#8f8f10', '#8f108f'][KINDS.index(self.kind)])
        draw.text((20, 95), 'first skill', fill='white')
        if self.modal:
            draw.rectangle(CONFIG['tab_box'], fill='black')
            draw.rectangle(CONFIG['detail_box'], fill='#303040')
            name = f'{TYPE_IDS[self.kind]} {self.skill}'
            if self.wrong_name and self.level == 'S1': name = 'Wrong Skill'
            draw.text((225, 70), name, fill='white')
            draw.rectangle(CONFIG['level_box'], fill='black')
            x = 230 + ['S', 'S1', 'S2', 'S3', 'S4'].index(self.level) * 55
            draw.rectangle((x, 115, x + 40, 145), fill='cyan')
            draw.text((225, 220), f'effect {self.skill} {self.level}', fill='white')
            if self.menu:
                draw.rectangle((450, 160, 550, 300), fill='#e0e0e0')
                for label in preset_levels(self.kind):
                    x, y = POINTS[label]
                    if label == self.level: draw.rectangle((455, y - 8, 540, y + 8), fill='orange')
                    draw.text((460, y - 6), label, fill='black')
        return image


class CollectorTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(); self.addCleanup(self.tmp.cleanup)
        self.folder = Path(self.tmp.name)
        self.game = FakeGame()
        for kind in KINDS:
            self.game.kind, self.game.modal, self.game.menu = kind, False, False
            calibration = self.folder / 'calibration' / TYPE_IDS[kind]
            calibration.mkdir(parents=True)
            crop(self.game.screenshot(), CONFIG['tab_box']).save(calibration / 'tab.png')
            self.game.modal = True
            crop(self.game.screenshot(), CONFIG['name_box']).save(calibration / 'first-name.png')
            for label in preset_levels(kind):
                self.game.level, self.game.menu = label, False
                crop(self.game.screenshot(), CONFIG['level_box']).save(calibration / f'level-{level_file(label)}.png')
                if len(preset_levels(kind)) > 1:
                    self.game.menu = True
                    crop(self.game.screenshot(), [450, 160, 550, 300]).save(calibration / f'menu-{level_file(label)}.png')
        self.game = FakeGame()

    def collector(self, test_only=False, stop=None, config=None):
        return Collector(self.game, config or CONFIG, self.folder, stop or threading.Event(), lambda _: None,
                         CaptureOptions(delay=0, test_only=test_only))

    def state(self):
        return json.loads((self.folder / 'state.json').read_text(encoding='utf-8'))

    def test_all_five_tabs_capture_caps_and_stop_at_first_skill(self):
        self.collector().run()
        state = self.state()
        self.assertEqual(state['status'], 'complete')
        for kind, tab in state['tabs'].items():
            self.assertEqual(tab['status'], 'complete')
            self.assertEqual(tab['cycle_skill_count'], 3)
            self.assertEqual(len(tab['skills']), 3)
            for record in tab['skills'].values():
                self.assertEqual(record['skill_type'], kind)
                self.assertEqual(record['max_level'], SKILL_LEVEL_CAPS[kind])
                self.assertEqual(set(record['levels']), set(preset_levels(kind)))
                self.assertTrue(record['complete'])
                for entry in record['levels'].values():
                    self.assertTrue((self.folder / entry['file']).exists())
        self.assertEqual(self.game.clicks.count(tuple(CONFIG['next_point'])), 15)
        self.assertTrue((self.folder / 'normal/skill_0001/S0.png').exists())

    def test_wrong_level_not_saved_then_resume_preserves_existing_image(self):
        self.game.ignore_level = True
        with self.assertRaises(LayoutMismatch): self.collector().run()
        target = self.folder / 'normal/skill_0001/S0.png'
        self.assertTrue(target.exists())
        self.assertFalse((self.folder / 'normal/skill_0001/S1.png').exists())
        original = target.stat().st_mtime_ns
        self.game = FakeGame()
        self.collector().run()
        self.assertEqual(target.stat().st_mtime_ns, original)
        self.assertEqual(self.state()['status'], 'complete')

    def test_closed_dropdown_never_clicks_option(self):
        self.game.hide_menu = True
        with self.assertRaisesRegex(LayoutMismatch, '드롭다운'): self.collector().run()
        self.assertNotIn(tuple(POINTS['S1']), self.game.clicks)

    def test_failed_next_is_not_confused_with_completed_cycle(self):
        self.game.next_noop = True
        with self.assertRaisesRegex(LayoutMismatch, '바뀌지'): self.collector().run()
        self.assertNotEqual(self.state()['tabs']['일반']['status'], 'complete')
        self.assertEqual(self.game.clicks.count(tuple(CONFIG['next_point'])), 1)

    def test_cycle_to_other_previous_skill_pauses(self):
        self.game.wrong_cycle = True
        with self.assertRaisesRegex(LayoutMismatch, '첫 스킬이 아닌'): self.collector().run()
        self.assertEqual(self.state()['status'], 'paused')

    def test_retained_level_can_return_to_s_when_configured(self):
        self.game.preserve_level = True
        self.collector().run()
        self.assertEqual(self.state()['status'], 'complete')
        self.assertIn(tuple(POINTS['S']), self.game.clicks)

    def test_retained_level_without_s_return_point_pauses_before_wrong_s_capture(self):
        config = copy.deepcopy(CONFIG)
        for tab in config['tabs']: tab['level_points'].pop('S')
        self.game.preserve_level = True
        with self.assertRaisesRegex(LayoutMismatch, '기본 S'): self.collector(config=config).run()
        self.assertFalse((self.folder / 'normal/skill_0002/S0.png').exists())

    def test_no_s_return_point_needed_when_next_resets_to_s(self):
        config = copy.deepcopy(CONFIG)
        for tab in config['tabs']: tab['level_points'].pop('S')
        self.collector(config=config).run()
        self.assertEqual(self.state()['status'], 'complete')

    def test_name_change_during_level_selection_not_saved(self):
        self.game.wrong_name = True
        with self.assertRaises(LayoutMismatch): self.collector().run()
        self.assertFalse((self.folder / 'normal/skill_0001/S1.png').exists())

    def test_wrong_initial_screen_stops_before_click(self):
        self.game.modal = True
        with self.assertRaises(LayoutMismatch): self.collector().run()
        self.assertEqual(self.game.clicks, [])

    def test_focus_loss_stops_before_click(self):
        self.game.focus = False
        with self.assertRaises(StopCapture): self.collector().run()
        self.assertEqual(self.game.clicks, [])

    def test_stop_request_preserves_checkpoint(self):
        stop = threading.Event(); stop.set()
        with self.assertRaises(StopCapture): self.collector(stop=stop).run()
        self.assertEqual(self.state()['status'], 'paused')

    def test_one_skill_test_does_not_press_next_or_change_tabs(self):
        self.collector(test_only=True).run()
        self.assertEqual(self.state()['status'], 'test_complete')
        self.assertEqual(len(self.state()['tabs']), 1)
        self.assertNotIn(tuple(CONFIG['next_point']), self.game.clicks)
        self.assertFalse(self.game.modal)

    def test_moment_only_never_opens_level_dropdown(self):
        config = copy.deepcopy(CONFIG)
        config['tabs'] = [tab for tab in config['tabs'] if tab['skill_type'] == '모먼트']
        self.game.kind = '모먼트'
        self.collector(config=config).run()
        self.assertEqual(self.state()['status'], 'complete')
        self.assertNotIn(tuple(CONFIG['dropdown_point']), self.game.clicks)

    def test_completed_tabs_skipped_but_missing_image_repaired(self):
        self.collector().run()
        self.game = FakeGame()
        self.collector().run()
        self.assertEqual(self.game.clicks, [])
        (self.folder / 'wbc/skill_0002/S2.png').unlink()
        self.collector().run()
        self.assertTrue((self.folder / 'wbc/skill_0002/S2.png').exists())
        self.assertEqual(self.game.clicks.count(tuple(CONFIG['next_point'])), 3)

    def test_changed_coordinates_cannot_reuse_checkpoint(self):
        self.collector(test_only=True).run()
        config = copy.deepcopy(CONFIG); config['next_point'] = [549, 350]
        with self.assertRaises(ValueError): self.collector(config=config)


class ValidationTests(unittest.TestCase):
    def test_exact_caps(self):
        self.assertEqual(preset_levels('일반'), ['S', 'S1', 'S2', 'S3', 'S4'])
        self.assertEqual(preset_levels('모먼트'), ['S'])
        self.assertEqual(preset_levels('WBC'), ['S', 'S1', 'S2'])
        self.assertEqual(preset_levels('블랙 시그니처'), ['S', 'S1', 'S2'])
        self.assertEqual(preset_levels('HOF'), ['S', 'S1'])

    def test_wrong_cap_and_missing_levels_rejected(self):
        for kind, levels in [('모먼트', ['S','S1']), ('HOF', ['S','S1','S2']), ('일반', ['S'])]:
            config = copy.deepcopy(CONFIG)
            config['tabs'] = [copy.deepcopy(next(tab for tab in CONFIG['tabs'] if tab['skill_type'] == kind))]
            config['tabs'][0]['levels'] = levels
            with self.assertRaises(ValueError): validate_config(config)

    def test_capture_must_include_name_and_level(self):
        config = copy.deepcopy(CONFIG); config['detail_box'] = [200, 180, 580, 370]
        with self.assertRaises(ValueError): validate_config(config)


if __name__ == '__main__':
    unittest.main()
