import unittest
from import_hof_recruit import parse_roster

def table(rows, title='NORMAL RECRUIT HOF PACK'):
    return ('<table><tr><td>'+title+'</td></tr>'+''.join('<tr>'+''.join('<td>'+c+'</td>' for c in row)+'</tr>' for row in rows)+'</table>').encode('cp949')

class ImportHofTest(unittest.TestCase):
    def test_names_and_exact_rates(self):
        rows=[['HOF','Player A','선수 가','', '33.333333%'],['HOF','Player B','선수 나','','66.666667%']]
        players=parse_roster(table(rows))
        self.assertEqual(players[0]['name'],'선수 가')
        self.assertEqual(players[1]['weight'],66666667)
        self.assertEqual(sum(p['weight'] for p in players),100000000)

    def test_wrong_pool_and_incomplete_table_fail_closed(self):
        rows=[['HOF','Player A','선수 가','','50%']]
        for raw in [table(rows),table(rows*2),table([], 'SPECIAL RECRUIT HOF PACK'),table([['HOF','','선수 가','','100%']]),table([['HOF','Player A','선수 가','','100.000001%']])]:
            with self.assertRaises(ValueError):parse_roster(raw)

if __name__=='__main__':unittest.main()
