"""MITM 캡처(rivals.mitm) 파서 — 카드/스탯 JSON 채굴용.

사용법:
    python scripts/parse_mitm.py C:\\project\\tools\\rivals.mitm

동작:
    1. 플로우를 읽어 호스트·URL·응답 요약 출력
    2. JSON 응답을 호스트별로 저장 (data/mitm_out/)
    3. 선수 카드로 보이는 JSON(ovr/stat/player 키 포함)을 candidates.json으로 추출
"""
import json
import re
import sys
from collections import Counter
from pathlib import Path

CARD_KEYS = re.compile(r"ovr|baseStat|cardGrade|playerId|playerName|deckScore", re.I)


def main(path: str) -> None:
    from mitmproxy.io import FlowReader

    flows_path = Path(path)
    if not flows_path.exists():
        print(f"없음: {flows_path}")
        print("먼저 캡처: mitmdump -p 8080 -w " + str(flows_path))
        sys.exit(1)

    out_dir = Path(__file__).resolve().parent.parent / "data" / "mitm_out"
    out_dir.mkdir(parents=True, exist_ok=True)

    hosts: Counter = Counter()
    paths: Counter = Counter()
    candidates: list = []
    n_flows = 0
    n_json = 0

    with open(flows_path, "rb") as f:
        reader = FlowReader(f)
        for flow in reader.stream():
            n_flows += 1
            req = getattr(flow, "request", None)
            resp = getattr(flow, "response", None)
            if req is None or resp is None:
                continue
            host = req.host
            hosts[host] += 1
            paths[f"{host}{req.path.split('?')[0]}"] += 1
            ctype = resp.headers.get("content-type", "")
            if "json" not in ctype:
                continue
            try:
                body = resp.content.decode("utf-8", "ignore")
                data = json.loads(body)
            except Exception:
                continue
            n_json += 1
            safe = re.sub(r"[^a-zA-Z0-9.-]+", "_", host)[:60]
            with open(out_dir / f"{safe}_{n_json}.json", "w", encoding="utf-8") as fo:
                json.dump({"url": req.pretty_url, "data": data}, fo, ensure_ascii=False)
            if CARD_KEYS.search(body):
                candidates.append({"url": req.pretty_url, "sample": body[:500]})

    print(f"flows={n_flows} json={n_json} out={out_dir}")
    print("--- hosts ---")
    for h, c in hosts.most_common(20):
        print(f"{c:6d} {h}")
    print("--- top paths ---")
    for p, c in paths.most_common(30):
        print(f"{c:6d} {p}")
    with open(out_dir / "candidates.json", "w", encoding="utf-8") as fo:
        json.dump(candidates, fo, ensure_ascii=False, indent=1)
    print(f"candidates(card-like)={len(candidates)} -> candidates.json")


if __name__ == "__main__":
    main(sys.argv[1] if len(sys.argv) > 1 else r"C:\project\tools\rivals.mitm")
