import { useState } from 'react';
import forecast from '../data/rivalPickForecast20.json';
import { TEAMS, LEAGUES, type Team } from '../lib/mlbTeams';

interface ForecastRow {
  batters: string[];
  hits: number;
  previousBatter?: string;
  pitcher: string;
  outs: number;
}

const byTeam: Record<Team, ForecastRow> = forecast;

function innings(outs: number) {
  return `${Math.floor(outs / 3)}${['', '⅓', '⅔'][outs % 3]}`;
}

export function RivalPickForecast() {
  const [club, setClub] = useState('');
  return <details className="panel pick-forecast" id="next-picks" open={window.location.hash === '#next-picks' || undefined}>
    <summary>20차 라이벌픽 예상 명단 · 30개 구단</summary>
    <p>게임 내 예고 기준은 구단별 최다 안타와 최다 투구 이닝입니다. 집계 기간은 공개되지 않아 2026 MLB 정규시즌 해당 구단 성적으로 예상했습니다. 18차 픽과 겹치면 차순위 선수를 표시합니다.</p>
    <label>구단 선택
      <select value={club} onChange={e => setClub(e.target.value)}>
        <option value="">전체 구단</option>
        {TEAMS.map(t => <option value={t.id} key={t.id}>{t.name}</option>)}
      </select>
    </label>
    {(['AL', 'NL'] as const).map(league => {
      const teams = TEAMS.filter(t => t.league === league && (!club || t.id === club));
      if (!teams.length) return null;
      return <table key={league}>
        <caption>{LEAGUES[league]}</caption>
        <thead><tr><th scope="col">구단</th><th scope="col">타자 · 안타</th><th scope="col">투수 · 이닝</th></tr></thead>
        <tbody>{teams.map(t => {
          const row = byTeam[t.id];
          return <tr key={t.id}>
            <th scope="row"><abbr title={t.name}>{t.id === 'ARI' ? 'AZ' : t.id}</abbr></th>
            <td>{row.batters.map(name => <strong key={name}>{name}</strong>)}
              <span>{row.batters.length > 1 ? '공동 1위 · 각 ' : ''}{row.hits}안타</span>
              {row.previousBatter && <small>차순위 · 직전 픽 {row.previousBatter} 제외</small>}
            </td>
            <td><strong>{row.pitcher}</strong><span>{innings(row.outs)}이닝</span>
              {row.outs < 162 * 3 && <small>팀 최다 · 규정 162이닝 미달</small>}
            </td>
          </tr>;
        })}</tbody>
      </table>;
    })}
    <p className="forecast-sources">기록 기준일 2026.11.20 · <a href="https://www.mlb.com/stats/hits/2026">MLB 안타</a> · <a href="https://www.mlb.com/stats/pitching/innings-pitched/2026">MLB 투구 이닝</a> · <a href="https://community.withhive.com/MLB9IRIVALS/ko/board/10/18460">18차 공식 명단</a></p>
  </details>;
}
