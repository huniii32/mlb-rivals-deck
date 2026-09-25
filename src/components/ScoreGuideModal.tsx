import { DECK_WEIGHTS } from "../lib/engine";
import { Modal } from "./Modal";
import { FlowDiagram, ScopeDiagram, ShareBar, WeightBars } from "./ScoreDiagrams";

// 0.4*100 = 40.00000000000001 방지
const pct = (w: number) => Math.round(w * 100);

/** 점수 산정 방식: 자동합·능력치·스킬점수·팀덱코/스덱코·덱 총점 공식 정리 */
export function ScoreGuideModal({ close }: { close: () => void }) {
  return (
    <Modal title="점수 산정 방식" close={close}>
      <p className="muted">엔진(engine.ts)이 실제로 계산하는 순서 그대로 정리했습니다.</p>

      <FlowDiagram steps={["자동합", "최종 스탯", "능력치(J)+스킬점수(O)", "최종점(P)", "덱 총점"]} />

      <h4>① 선수 스탯 자동합</h4>
      <div className="formula">기본 + 훈련 + 특훈 + 초월 + 강화 + 포훈 + 포지션훈련 + 시너지 + 라커룸 + 스킬보너스(+3) + 덱코 보너스</div>
      <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
        <li>초월·강화는 <b>카드+스탯</b>으로, 포훈은 <b>포지션+스탯</b>으로 표를 조회해 자동으로 채워짐</li>
        <li><b>포지션훈련</b> 칸은 포훈Lv 자동값과 별개 — 게임 화면의 &ldquo;보너스&rdquo; 수치만 입력해야 정확함</li>
        <li>&ldquo;최종&rdquo; 칸에 직접 숫자를 적으면 자동합 대신 그 값으로 고정됨</li>
      </ul>

      <h4>② 능력치 (J)</h4>
      <div className="row" style={{ alignItems: "stretch", gap: 12 }}>
        <div className="card" style={{ flex: 1, margin: 0 }}>
          <b>타자</b>
          <WeightBars color="var(--accent)" bars={[
            { label: "파워", weight: 1.1 },
            { label: "정확", weight: 0.9 },
            { label: "선구", weight: 0.4 },
          ]} />
          <div className="formula">(파워+P보너스)×1.1 + (정확+A보너스)×0.9 + 선구×0.4</div>
          <p className="muted">P·A보너스 = 타자케미(S1→+2, S→+1) + WBC에이스타자(S2→+2, S1→+2/+1, S→+1)</p>
        </div>
        <div className="card" style={{ flex: 1, margin: 0 }}>
          <b>투수</b>
          <WeightBars color="#38bdf8" bars={[
            { label: "변화", weight: 1.15 },
            { label: "구위", weight: 1.2 },
          ]} />
          <div className="formula">(변화+CHG)×1.15 + (구위+CTL)×1.2</div>
          <p className="muted">CHG·CTL = 커맨더·포수리드·투수케미·WBC에이스투수 등급별 가산</p>
        </div>
      </div>
      <p className="muted">케미 옵션은 덱 전체에 한 번만 지정하는 값이라 모든 타자/투수에게 동일하게 적용됩니다.</p>

      <h4>③ 스킬점수 (O)</h4>
      <div className="formula">스킬1 + 스킬2 + 스킬3 + (스킬4는 있으면만 가산)</div>
      <p className="muted">스킬 1~3 중 표에 없는 이름이 하나라도 있으면 O 전체가 &ldquo;표없음&rdquo;. 스킬4는 선택 사항.</p>

      <h4>④ 팀덱코 · 스덱코</h4>
      <div className="row" style={{ alignItems: "stretch", gap: 12 }}>
        <div className="card" style={{ flex: 1, margin: 0 }}>
          <b>팀덱코</b> <span className="muted">— 전역 보너스</span>
          <ScopeDiagram variant="uniform" label="다이아몬드 하나 = 9칸 전부 같은 보너스" />
          <p>다이아몬드 하나를 켜면 <b>라인업 전원</b>에게 같은 보너스가 붙습니다. (임계값 23단계, 200~600)</p>
        </div>
        <div className="card" style={{ flex: 1, margin: 0 }}>
          <b>스덱코</b> <span className="muted">— 포지션별 보너스</span>
          <ScopeDiagram variant="varied" label="같은 다이아몬드도 포지션마다 보너스가 다름" />
          <p>포지션마다 조건·점수가 달라 <b>그 선수의 카드·타순·강화Lv·연도</b>에 따라 결과가 다릅니다. (임계값 29단계, 100~700)</p>
        </div>
      </div>
      <p>규칙 하나는 <code className="inline-code">[조건, 점수]</code> 목록을 위에서부터 검사해 <b>처음 참인 조건</b>의 점수만 채택합니다(첫 매치 우선). 스덱코 615·645·680은 다이아몬드 대신 <b>연도 입력칸</b>이 붙어, 선수 카드 연도가 입력 연도 기준 0~9년 이내면 보너스가 붙습니다.</p>

      <h4>⑤ 덱 총점</h4>
      <ShareBar segments={[
        { label: "선발", pct: pct(DECK_WEIGHTS.sp), color: "var(--accent)" },
        { label: "계투", pct: pct(DECK_WEIGHTS.rp), color: "#f5c451" },
        { label: "타자", pct: pct(DECK_WEIGHTS.bt), color: "#38bdf8" },
      ]} />
      <div className="formula">선발 = avg(SP1~5 중 이름있는 선수 P) × 10
계투 = avg(RP1~3, CP1 중 이름있는 선수 P) × 10
타자 = avg(9포지션 중 이름있는 선수 P) × 10

덱 총점 = 선발×0.4 + 계투×0.1 + 타자×0.5</div>

      <h4>주의사항</h4>
      <ul style={{ margin: "6px 0 0", paddingLeft: 20 }}>
        <li>WBC에이스(타자) S1 등급은 파워엔 +2, 정확엔 +1로 비대칭 — 오타 아니고 원본 그대로</li>
        <li>스덱코 일부 규칙이 &ldquo;타순 1~2번&rdquo;·&ldquo;3~5번&rdquo; 조건을 봐서, 라인업 기본 타순(우익수 1번·지명타자 3번 등)에 따라 포지션별로 결과가 다르게 나오는 게 정상입니다</li>
        <li>새로 만든 덱은 원본 엑셀 저장값 그대로 팀덱코·스덱코 다이아몬드 50개가 이미 켜진 상태로 시작합니다</li>
      </ul>
    </Modal>
  );
}
