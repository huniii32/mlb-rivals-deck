import unittest
from collections import Counter
from import_combination_roster import abbreviated, normalized, moment_rows, supreme_rows, gate_supreme, canonical_team

class RosterTests(unittest.TestCase):
    def test_names_and_team_aliases(self):
        self.assertEqual(abbreviated('A.J. Minter'), normalized('A.J. Minter'))
        self.assertEqual(abbreviated('AJ Blubaugh'), normalized('A.J. Blubaugh'))
        self.assertEqual(abbreviated('Hyun Jin Ryu'), normalized('H. Jin Ryu'))
        self.assertEqual(abbreviated('Marcell Ozuna'), normalized('M. Ozuna'))
        self.assertEqual(canonical_team('LC'),'KC')
        self.assertEqual(canonical_team('OAK'),'ATH')
        self.assertEqual(canonical_team('AZ'),'ARI')
        with self.assertRaises(ValueError):canonical_team('BAD')
    def test_theme_sections_preserve_distinct_cards(self):
        records=moment_rows([['NYY / Franchise',''],['Moment','A. Judge','A. 저지',''],['NYY / Power Hitter',''],['Moment','A. Judge','A. 저지','']])
        self.assertEqual([r['theme'] for r in records],['Franchise','Power Hitter'])
        self.assertNotEqual(records[0]['id'],records[1]['id'])
        with self.assertRaises(ValueError):moment_rows([['Moment','A. Judge','A. 저지','']])
    def test_eligibility_does_not_guess_ambiguous_team(self):
        records=supreme_rows([['','NYY','Aaron Judge','애런 저지','','RF','80'],['','BOS','Aaron Judge','애런 저지','','RF','80'],['','NYY','Old Player','과거 선수','','SP','70']],'book',1,'FIRST SPURT')
        kept=gate_supreme(records,Counter({'ajudge':2}))
        self.assertEqual(len(kept),2)
        with self.assertRaises(ValueError):gate_supreme(records,Counter({'ajudge':1}))
        with self.assertRaises(ValueError):gate_supreme(records,Counter({'missing':1}))

if __name__=='__main__':unittest.main()
