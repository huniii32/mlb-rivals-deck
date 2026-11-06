import unittest
from decimal import Decimal
from import_skill_probabilities import Rows, percent

class ProbabilityImportTests(unittest.TestCase):
    def test_percent_and_unformatted_excel_fraction_match(self):
        self.assertEqual(percent('0.142857%'), percent('0.00142857'))
        self.assertEqual(percent('2.800000%'), Decimal('2.8'))
        self.assertEqual(percent('0.003'), Decimal('0.3'))

    def test_cell_text_keeps_korean_name_and_empty_columns(self):
        parser = Rows()
        parser.feed('<table><tr><td>배팅 <span>머신</span></td><td></td><td>S</td><td>0.020270%</td></tr></table>')
        self.assertEqual(parser.rows, [['배팅 머신', '', 'S', '0.020270%']])

if __name__ == '__main__': unittest.main()
