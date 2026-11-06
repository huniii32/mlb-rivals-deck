import unittest
from skill_source_levels import normalize_level, annotate_history


class SourceLevelsTests(unittest.TestCase):
    def test_official_renaming_is_not_s3_or_s4(self):
        self.assertEqual(normalize_level('SS')['app_level'], 'S1')
        self.assertEqual(normalize_level('SS +')['app_level'], 'S2')

    def test_s0_is_app_alias(self):
        self.assertEqual(normalize_level('S')['app_level'], 'S0')
        self.assertEqual(normalize_level('S0')['official_level'], 'S')

    def test_unknown_level_not_guessed(self):
        self.assertIsNone(normalize_level('SS++')['app_level'])
        self.assertEqual(normalize_level('S4')['app_level'], 'S4')

    def test_effects_and_original_rows_remain(self):
        entry = {'columns': ['스킬명', '티어', '레벨', '내용'], 'rows': [['A', '골드', 'SS+', '+8']]}
        out = annotate_history({'A': [entry]})['A'][0]
        self.assertEqual(out['rows'], entry['rows'])
        self.assertEqual(out['row_level_labels'][0][0]['app_level'], 'S2')
        self.assertEqual(len(out['rows']), 1)


if __name__ == '__main__':
    unittest.main()
