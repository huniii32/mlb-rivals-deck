"""Protect source attribution and merged-cell effect extraction (no network)."""
import unittest
from archive_skill_notices import BodyParser, table_data, expand_table, is_skill_table, skill_history


class ArchiveTests(unittest.TestCase):
    def table(self, html):
        parser = BodyParser()
        parser.feed('<div class="post_cont">' + html + '</div>')
        return table_data(next(parser.root.find('table')))

    def test_article_excludes_navigation_and_comments(self):
        parser = BodyParser()
        parser.feed('<p>navigation</p><div class="post_cont"><div><p>효과</p></div>'
                    '<img src="https://example.com/effect.png"></div><p>comments</p>')
        self.assertEqual(parser.root.text(), '효과')
        self.assertEqual(len(list(parser.root.find('img'))), 1)

    def test_rowspan_keeps_grade_with_its_skill(self):
        table = self.table('<table><tr><th>스킬명</th><th>등급</th><th>설명</th></tr>'
                           '<tr><td rowspan="2">A</td><td>S</td><td>+4</td></tr>'
                           '<tr><td>S1</td><td>+6</td></tr>'
                           '<tr><td>B</td><td>S</td><td>+9</td></tr></table>')
        self.assertEqual(expand_table(table)[2], ['A', 'S1', '+6'])
        self.assertEqual(expand_table(table)[3], ['B', 'S', '+9'])

    def test_title_colspan_does_not_shift_header(self):
        table = self.table('<table><tr><th colspan="2">타자</th></tr>'
                           '<tr><th>스킬명</th><th>설명</th></tr>'
                           '<tr><td>A</td><td>+4</td></tr></table>')
        self.assertTrue(is_skill_table(table))
        self.assertEqual(expand_table(table)[2], ['A', '+4'])

    def test_effect_history_retains_context_date_and_source(self):
        t = self.table('<table><tr><th>티어</th><th>스킬 이름</th><th>효과</th></tr>'
                       '<tr><td>골드</td><td>A</td><td>+4</td></tr></table>')
        history = skill_history([{'id': '1', 'published_at': '2024-01-01', 'title': '업데이트',
                                 'url': 'https://example.com/1', 'skill_tables': [t],
                                 'skill_table_contexts': [['투수']]}])
        self.assertEqual(history['A'][0]['rows'], [['골드', 'A', '+4']])
        self.assertEqual(history['A'][0]['context'], ['투수'])
        self.assertEqual(history['A'][0]['published_at'], '2024-01-01')
        self.assertEqual(history['A'][0]['url'], 'https://example.com/1')

    def test_probability_table_not_claimed_as_effect(self):
        t = self.table('<table><tr><th>스킬명</th><th>확률</th></tr>'
                       '<tr><td>A</td><td>1%</td></tr></table>')
        self.assertEqual(skill_history([{'skill_tables': [t]}]), {})

    def test_repeated_name_keeps_both_historical_versions(self):
        def article(id, gain):
            return {'id': id, 'published_at': id, 'title': id, 'url': id, 'skill_tables': [
                self.table(f'<table><tr><th>스킬명</th><th>내용</th></tr><tr><td>A</td><td>{gain}</td></tr></table>')]}
        entries = skill_history([article('2025', '+5'), article('2024', '+4')])['A']
        self.assertEqual([e['rows'][0][1] for e in entries], ['+5', '+4'])


if __name__ == '__main__':
    unittest.main()
