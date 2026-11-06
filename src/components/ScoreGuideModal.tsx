import { useState, type ReactNode } from "react";
import { DECK_WEIGHTS } from "../lib/engine";
import { Modal } from "./Modal";
import { ShareBar } from "./ScoreDiagrams";

const sections = ["능력치 준비", "덱스코어", "팀 버프·전술", "스킬 점수", "선수 점수", "덱 총점"];

function Section({ index, title, subtitle, children }: { index: number; title: string; subtitle: string; children: ReactNode }) {
  return <section className="score-section" id={`score-guide-${index}`} aria-labelledby={`score-title-${index}`}>
    <header className="score-section-head"><span className="score-step-number">{String(index).padStart(2, "0")}</span>
      <div><h3 id={`score-title-${index}`}>{title}</h3><p>{subtitle}</p></div>
    </header>
    {children}
  </section>;
}

function Formula({ label, children, emphasis = false }: { label: string; children: ReactNode; emphasis?: boolean }) {
  return <div className={`score-equation${emphasis ? " score-equation-primary" : ""}`}>
    <span className="score-label">{label}</span><div className="score-math">{children}</div>
  </div>;
}

function Flow({ items }: { items: { title: string; detail: string }[] }) {
  return <ol className="score-flow">{items.map((item) => <li key={item.title}>
    <strong>{item.title}</strong><span>{item.detail}</span>
  </li>)}</ol>;
}

export function ScoreGuideModal({ close }: { close: () => void }) {
  const [condition, setCondition] = useState(true);
  const leverageBase = 4 * (1.1 + 0.9 + 0.4);
  const leverageExtra = condition ? 11 * (1.1 + 0.9) : 0;
  const exampleTotal = (420 * DECK_WEIGHTS.bt + 400 * DECK_WEIGHTS.sp + 380 * DECK_WEIGHTS.rp) * 10;
  return (
    <Modal title="점수 산정 방식" close={close} width="min(1080px, 100%)">
      <div className="score-guide">
        <div className="score-intro">
          <span className="score-badge">랭킹대전 · 공격(원정) 기준</span>
          <h2>내 덱의 점수, 이렇게 계산해요</h2>
          <p>능력치와 스킬을 점수로 바꾸고, 포지션별 비중으로 합산합니다.</p>
          <Flow items={[
            { title: "능력치 준비", detail: "육성 + 덱스코어 + 버프" },
            { title: "선수 점수", detail: "능력치 점수 + 스킬 점수" },
            { title: "덱 총점", detail: "타자 50% · 선발 40% · 계투 10%" },
          ]} />
        </div>
        <nav className="score-nav" aria-label="산정방식 목차">
          {sections.map((title, i) => <button key={title} onClick={() => document.getElementById(`score-guide-${i + 1}`)?.scrollIntoView({ block: "start" })}>
            <span>{String(i + 1).padStart(2, "0")}</span>{title}
          </button>)}
        </nav>

        <Section index={1} title="점수에 사용할 능력치 준비" subtitle="각 능력치 칸의 수치를 먼저 합칩니다.">
          <div className="score-grid score-grid-three">
            <div className="score-tile"><h4>기본·육성</h4><p>기본 + 훈련 + 특훈<br />초월 + 강화 + 포훈</p></div>
            <div className="score-tile"><h4>추가 보너스</h4><p>포지션훈련 + 시너지 + 라커룸<br />블랙 보너스 + 리더 영향력</p></div>
            <div className="score-tile"><h4>공통·덱 설정</h4><p>스킬 보너스 +3<br />덱스코어 + 투수 전술</p></div>
          </div>
          <Formula label="자동 계산"><span>기본·육성</span> + <span>추가 보너스</span> + <span>공통·덱 설정</span> = <strong>최종 능력치</strong></Formula>
          <details className="score-details"><summary>직접 입력한 최종 능력치는 어떻게 되나요?</summary>
            <p>‘최종’에 숫자를 입력하면 자동 합계 대신 그 값을 사용합니다. 이후 강화·훈련·덱스코어 변경분은 자동 반영되며, 칸을 비우면 자동 합계로 돌아갑니다.</p>
            <p>투수는 <b>전술 적용 전 수치</b>를 입력하세요. 전술은 별도로 한 번 더해집니다. 포지션훈련 칸에는 포훈Lv 자동값을 제외한 게임 화면의 추가 보너스만 입력하세요.</p>
            <p>블랙 보너스는 블랙 시그니처 카드에만 적용합니다. 초월·강화·포훈은 선택한 카드·포지션의 표를 조회합니다.</p>
          </details>
        </Section>

        <Section index={2} title="덱스코어는 능력치에 더해져요" subtitle="선택한 효과 중 선수 조건에 맞는 보너스만 적용합니다.">
          <Flow items={[
            { title: "효과 선택", detail: "팀덱코 · 스페셜덱코" },
            { title: "선수 조건 확인", detail: "카드 · 타순 · 강화 · 연도" },
            { title: "능력치 가산", detail: "능력치별 보너스 합산" },
          ]} />
          <div className="score-grid">
            <div className="score-tile"><h4>팀 덱스코어</h4><p>덱 공통 설정 → 해당 선수에 적용</p><span className="score-caption">일부 효과에는 카드·타순 조건이 있습니다.</span></div>
            <div className="score-tile"><h4>스페셜 덱스코어</h4><p>포지션별 규칙 → 해당 선수에 적용</p><span className="score-caption">같은 선택도 선수에 따라 가산값이 달라집니다.</span></div>
          </div>
          <Formula label="능력치별 계산">팀덱코 보너스 + 스페셜덱코 보너스 = <strong>덱스코어 가산값</strong></Formula>
          <details className="score-details"><summary>점수가 그대로이거나 선수마다 다른 이유</summary>
            <p>각 규칙은 위에서부터 확인해 처음 충족한 조건의 값만 적용합니다. 여러 조건을 동시에 만족해도 같은 규칙에서 중복 가산하지 않습니다.</p>
            <p>팀덱코 330·345는 이 앱의 평가 대상 능력치를 올리지 않습니다. 스페셜덱코 615·645·680은 입력 연도와 카드 연도의 차이가 0~9년인지 확인합니다.</p>
          </details>
        </Section>

        <Section index={3} title="팀 버프와 투수 전술 반영" subtitle="능력치에 더하는 효과와 점수로 더하는 효과를 나눠 계산합니다.">
          <div className="score-grid">
            <div className="score-tile"><h4>팀 케미스트리 등</h4>
              <Flow items={[{ title: "등급 선택", detail: "팀 버프 설정" }, { title: "해당 능력치에 +", detail: "가중치를 곱하기 전" }]} />
              <p>타자 케미·WBC 에이스(타자) → 파워·정확<br />커맨더·포수리드·투수 케미·WBC 에이스(투수) → 변화·구위</p>
            </div>
            <div className="score-tile"><h4>점수로 환산하는 팀 효과</h4>
              <div className="score-key-value"><span>컴백 플래그 · 동점/열세</span><strong>타자마다 +6 / +8점</strong></div>
              <div className="score-key-value"><span>락다운 · CP 배치</span><strong>투수마다 +1.6점</strong></div>
              <p className="score-caption">컴백 S·S1: +6 / S2: +8. 락다운 개인 점수에 포함된 +1.6은 중복 가산하지 않습니다.</p>
            </div>
          </div>
          <div className="score-tactics" aria-label="투수 전술 가산">
            <div><span>승리조 · 분업</span><b>최소 3명</b><strong>변화·구위 각각 +4</strong><small>능력치 점수 +9.4</small></div>
            <div><span>승리조·추격조 · 적극</span><b>해당 조 최소 2명</b><strong>변화·구위 각각 +2</strong><small>능력치 점수 +4.7</small></div>
            <div><span>기본 · 롱릴리프 · 마무리</span><b>추가 효과 없음</b><strong>+0</strong><small>전술 인원 미충족 시에도 +0</small></div>
          </div>
          <p className="score-note">전술 인원은 이름이 등록된 선수만 셉니다. 지구력은 가산하지 않으며, 점수에는 변화·구위만 반영합니다.</p>
          <details className="score-details"><summary>버프 수치·평가 기준 자세히 보기</summary>
            <div className="score-table-wrap"><table><caption>등급별 능력치 가산 · 표기 순서대로 두 능력치에 적용</caption><thead><tr><th>팀 버프</th><th>능력치</th><th>등급 → 가산</th></tr></thead><tbody>
              <tr><td>타자 케미스트리</td><td>파워 / 정확</td><td>S: +1 / +1 · S1: +2 / +2</td></tr>
              <tr><td>WBC 에이스(타자)</td><td>파워 / 정확</td><td>S: +1 / +1 · S1: +2 / +1 · S2: +2 / +2</td></tr>
              <tr><td>커맨더</td><td>변화 / 구위</td><td>S: +1 / +2</td></tr>
              <tr><td>포수리드</td><td>변화 / 구위</td><td>S: +1 / +0 · S1~S2: +1 / +1 · S3~S4: +2 / +1</td></tr>
              <tr><td>투수 케미스트리</td><td>변화 / 구위</td><td>S: +1 / +1 · S1: +2 / +2</td></tr>
              <tr><td>WBC 에이스(투수)</td><td>변화 / 구위</td><td>S: +1 / +1 · S1: +1 / +2 · S2: +2 / +2</td></tr>
            </tbody></table></div>
            <p>투수 케미스트리 S2 팀 버프는 수치 미확인으로 제외합니다. 락다운의 +1.6점은 7~9회 효과를 9이닝 기준으로 환산한 2 × 2.4 × (3 ÷ 9)입니다.</p>
            <p>팀 버프는 설정한 값으로 계산합니다. 실제 경기 상황을 자동 추적하지 않습니다. 불펜은 총 7명까지이며 승리·추격·롱릴리프는 각 최대 4명, 마무리는 최대 2명입니다.</p>
          </details>
        </Section>

        <Section index={4} title="스킬 효과를 점수로 환산" subtitle="선택한 스킬의 등급·조건에 맞는 점수표 값을 합산합니다.">
          <Flow items={[
            { title: "등급·조건 선택", detail: "S~S4 · O 충족 / X 미충족" },
            { title: "효과 환산", detail: "능력치 변화량 × 가중치" },
            { title: "스킬 점수 합산", detail: "최대 4개 스킬" },
          ]} />
          <Formula label="점수표의 환산 원리">자신 능력치 증가량 × 해당 가중치<br />+ 상대 능력치 감소량 × 상대 가중치</Formula>
          <div className="score-grid">
            <div className="score-tile"><h4>타자 능력치 가중치</h4><div className="score-coefficients"><span>파워 <b>1.1</b></span><span>정확 <b>0.9</b></span><span>선구 <b>0.4</b></span></div><p className="score-caption">세 능력치가 각각 1 변하면 → 2.4점</p></div>
            <div className="score-tile"><h4>투수 능력치 가중치</h4><div className="score-coefficients"><span>변화 <b>1.15</b></span><span>구위 <b>1.2</b></span></div><p className="score-caption">두 능력치가 각각 1 변하면 → 2.35점</p></div>
          </div>
          <div className="score-example">
            <div className="score-example-head"><div><span className="score-label">조건을 바꿔 보세요</span><h4>레버리지 릴리퍼 · S (표에서는 S0)</h4></div>
              <div className="score-toggle" role="group" aria-label="첫 3아웃 조건">
                <button aria-pressed={condition} onClick={() => setCondition(true)}>첫 3아웃 O</button>
                <button aria-pressed={!condition} onClick={() => setCondition(false)}>첫 3아웃 X</button>
              </div>
            </div>
            <div className="score-example-sum"><span>기본 효과<b>4 × 2.4 = {leverageBase.toFixed(2)}</b></span><i aria-hidden="true">+</i><span>조건부 효과<b>{condition ? "11 × 2.0 = 22.00" : "미충족 = 0.00"}</b></span><i aria-hidden="true">=</i><output aria-live="polite" aria-label="레버리지 릴리퍼 예시 점수">{(leverageBase + leverageExtra).toFixed(2)}<small>점</small></output></div>
            <p className="score-caption">O: 처리한 아웃 0~2개 / X: 3개 이상. 추가 효과의 인내는 평가에서 제외해 파워·정확 가중치 2.0만 사용합니다.</p>
          </div>
          <Formula label="선수에게 더할 스킬 점수" emphasis>스킬 1 + 스킬 2 + 스킬 3 + 스킬 4<small>4번째 스킬은 있을 때만 합산</small></Formula>
          <details className="score-details"><summary>평균 효과·기존 스킬 검산·미적용 기준</summary>
            <Formula label="신속한 처리 S · 첫 3아웃 평균">((14 + 13 + 12) ÷ 3) × 2.35 = <strong>30.55점</strong></Formula>
            <p>첫 세 아웃을 연속 처리하는 세 타석에 같은 비중을 둔 평가값입니다. 실제 경기 전체의 통계 평균은 아닙니다.</p>
            <Formula label="기존 스킬 검산 예시 · 키플레이어 S">타자: 6 × 2.4 = <strong>14.40점</strong><br />투수: 6 × 2.35 = <strong>14.10점</strong></Formula>
            <p>리그·라이브 매치 전용 추가 효과는 제외합니다. 기존 스킬은 저장된 점수표를 사용하며, 모든 항목을 공식 효과로 다시 검산한 것은 아닙니다.</p>
            <p>신속한 처리·레버리지 릴리퍼·승리 공식·컴백 플래그는 승리조·추격조·롱릴리프에만 적용합니다. 선발·마무리에 배치하면 0점입니다.</p>
            <p>점수표에 없는 스킬은 제외하고 임시 점수와 경고를 표시합니다. 스킬의 O/X는 사용자가 선택하며 자동 판정하지 않습니다.</p>
          </details>
        </Section>

        <Section index={5} title="선수 한 명의 최종 점수" subtitle="능력치를 가중합한 점수에 스킬 점수를 더합니다.">
          <div className="score-grid">
            <Formula label="타자 능력치 점수"><span>파워 × <b>1.1</b></span> + <span>정확 × <b>0.9</b></span><br />+ <span>선구 × <b>0.4</b></span> + 팀 추가점수</Formula>
            <Formula label="투수 능력치 점수"><span>변화 × <b>1.15</b></span> + <span>구위 × <b>1.2</b></span><br />+ 팀 추가점수</Formula>
          </div>
          <p className="score-note">위 능력치는 덱스코어·전술·팀 케미를 반영한 값입니다. 팀 추가점수는 컴백 플래그·락다운의 환산값입니다.</p>
          <Formula label="선수 최종 점수" emphasis>능력치 점수 + 스킬 점수 = <strong>선수 점수</strong></Formula>
          <div className="score-example"><span className="score-label">타자 계산 예시 · 팀 추가점수 0</span>
            <p>파워 150 · 정확 140 · 선구 130 / 스킬 합계 60점</p>
            <div className="score-math">150 × 1.1 + 140 × 0.9 + 130 × 0.4 = <b>343</b><br />343 + 60 = <strong>403점</strong></div>
          </div>
        </Section>

        <Section index={6} title="선수 점수에서 덱 총점으로" subtitle="타자·선발·계투의 평균을 각각 구한 뒤 비중을 적용합니다.">
          <ShareBar segments={[
            { label: "타자", pct: Math.round(DECK_WEIGHTS.bt * 100), color: "var(--accent)" },
            { label: "선발", pct: Math.round(DECK_WEIGHTS.sp * 100), color: "#1d8c80" },
            { label: "계투", pct: Math.round(DECK_WEIGHTS.rp * 100), color: "#ad7d12" },
          ]} />
          <Formula label="그룹별 평균">이름이 있는 선수의 점수 합 ÷ 해당 선수 수 = <strong>그룹 평균</strong></Formula>
          <div className="score-grid score-grid-three">
            <div className="score-tile"><h4>타자 · 최대 9명</h4><div className="score-math">평균 × 10 × <b>{DECK_WEIGHTS.bt}</b></div></div>
            <div className="score-tile"><h4>선발 · 최대 5명</h4><div className="score-math">평균 × 10 × <b>{DECK_WEIGHTS.sp}</b></div></div>
            <div className="score-tile"><h4>계투 · 최대 7명</h4><div className="score-math">평균 × 10 × <b>{DECK_WEIGHTS.rp}</b></div><span className="score-caption">승리·추격·롱릴리프·마무리 포함</span></div>
          </div>
          <Formula label="덱 총점" emphasis>(타자 평균 × {DECK_WEIGHTS.bt} + 선발 평균 × {DECK_WEIGHTS.sp}<br />+ 계투 평균 × {DECK_WEIGHTS.rp}) × 10</Formula>
          <div className="score-example"><span className="score-label">그룹 평균이 타자 420 · 선발 400 · 계투 380일 때</span>
            <div className="score-example-sum"><span>타자<b>2,100</b></span><i aria-hidden="true">+</i><span>선발<b>1,600</b></span><i aria-hidden="true">+</i><span>계투<b>380</b></span><i aria-hidden="true">=</i><strong className="score-example-total">{exampleTotal.toLocaleString("en-US")}<small>점</small></strong></div>
          </div>
          <p className="score-note">빈 슬롯은 평균에서 제외합니다. 이름이 있으면 0점 선수도 포함하며, 등록 선수가 없는 그룹은 0점입니다.</p>
        </Section>
        <p className="score-footnote">앱의 덱 비교용 평가 점수입니다. 게임 공식 평점이나 실제 승률을 의미하지 않습니다.</p>
      </div>
    </Modal>
  );
}
