import type { PlayerInput } from "../lib/engine";
import type { PhotoInfo } from "../lib/photos";
import { commonsSearchUrl } from "../lib/photos";

/** 선수 사진 설정: 영문명으로 Commons 자동조회, 없으면 URL 직접 지정 */
export function PhotoSettings({
  rows, update, photos,
}: {
  rows: PlayerInput[];
  update: (excelRow: number, patch: Partial<PlayerInput>) => void;
  photos: Record<number, PhotoInfo | null>;
}) {
  return (
    <div className="card">
      <h4>사진 설정 (Wikimedia Commons, CC 라이선스)</h4>
      <p className="muted">
        영문명을 적으면 공개 사진에서 자동으로 찾아옴. 못 찾으면{" "}
        <span>사진 URL 직접 입력</span>. 클릭 시 원본 페이지(출처)로 이동.
      </p>
      {rows.map((r) => {
        const ph = photos[r.excelRow];
        return (
          <div className="row" key={r.excelRow} style={{ marginBottom: 6 }}>
            <b style={{ width: 90 }}>{r.name || r.pos}</b>
            {ph ? (
              <a href={ph.page} target="_blank" rel="noreferrer">
                <img src={ph.src} alt={r.name} style={{ width: 40, height: 52, objectFit: "cover", borderRadius: 4 }} />
              </a>
            ) : (
              <span className="muted" style={{ width: 40 }}>없음</span>
            )}
            <input
              placeholder="영문명 (예: Shohei Ohtani)"
              value={r.enName}
              style={{ width: 180 }}
              onChange={(e) => update(r.excelRow, { enName: e.target.value })}
            />
            <input
              placeholder="사진 URL 직접 입력 (선택)"
              value={r.photoUrl}
              style={{ flex: 1, minWidth: 160 }}
              onChange={(e) => update(r.excelRow, { photoUrl: e.target.value })}
            />
            {r.enName.trim() && (
              <a href={commonsSearchUrl(r.enName)} target="_blank" rel="noreferrer">직접찾기</a>
            )}
          </div>
        );
      })}
    </div>
  );
}
