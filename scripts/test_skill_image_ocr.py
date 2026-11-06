import unittest
from archive_skill_notices import BodyParser
from ocr_skill_notice_images import blocks, from_tsv


class OCRTests(unittest.TestCase):
    def test_images_nested_in_paragraph_stay_in_inventory(self):
        parser = BodyParser()
        parser.feed('<div class="post_cont"><h2>스킬</h2><p>설명<img src="https://example.com/1"></p><img src="https://example.com/2"></div>')
        self.assertEqual(list(blocks(parser.root)), [('text', '스킬'), ('text', '설명'),
                         ('img', 'https://example.com/1'), ('img', 'https://example.com/2')])

    def test_tsv_preserves_lines_confidence_and_boxes(self):
        header = 'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext'
        rows = ['5\t1\t1\t1\t1\t1\t10\t20\t30\t40\t91.5\t배팅',
                '5\t1\t1\t1\t1\t2\t50\t20\t30\t40\t92\t머신',
                '5\t1\t1\t1\t2\t1\t10\t60\t30\t40\t90\t+6',
                '4\t1\t1\t1\t2\t0\t10\t60\t30\t40\t-1\t']
        text, scores, words = from_tsv('\n'.join([header, *rows]))
        self.assertEqual(text, '배팅 머신\n+6')
        self.assertEqual(scores, [91.5, 92.0, 90.0])
        self.assertEqual(words[0]['box'], [10, 20, 30, 40])


if __name__ == '__main__':
    unittest.main()
