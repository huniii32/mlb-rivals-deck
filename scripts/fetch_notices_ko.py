#!/usr/bin/env python3
"""Hive 커뮤니티 한국어 공지 증분 수집 (스케줄러용, stdlib만 사용).

- 공지사항(board 2) + Live 업데이트(board 10) + 개발자 노트(board 11) 1페이지씩
- ko 헤더(Referer + Accept-Language)로 한국어 글 요청 (영어 글과 idx가 다름)
- 기존 src/data/notices.json에 새 URL만 추가 (덮어쓰기 아님), 날짜 내림차순, 최대 300건
- 사용: python3 scripts/fetch_notices_ko.py
"""
import json
import time
import urllib.parse
import urllib.request
from pathlib import Path

BASE = "https://community.withhive.com"
BOARDS = [2, 10, 11]
MAX_KEEP = 300

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / "src" / "data" / "notices.json"


def fetch_board(board: int):
    data = urllib.parse.urlencode({
        "page": 1, "board_idx": board, "board_type": 1,
        "board_comment": 0, "is_mobile": 0, "select_type": 1, "view_type": "list",
    }).encode()
    req = urllib.request.Request(
        BASE + "/MLB9IRIVALS/board/list/getBoardList",
        data=data,
        headers={
            "User-Agent": "Mozilla/5.0 rivals-deck-notices/0.1 (+scheduled)",
            "Referer": f"{BASE}/MLB9IRIVALS/ko/board/{board}",
            "Accept-Language": "ko-KR,ko;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        j = json.loads(r.read().decode("utf-8", errors="ignore"))
    out = []
    for o in j.get("contents_list", {}).get("list", []):
        out.append({
            "title": (o.get("title") or "").strip(),
            "date": o.get("regdate") or "",
            "url": f"{BASE}/MLB9IRIVALS/ko/board/{board}/{o.get('idx')}",
            "lang": "/ko/",
        })
    return out


def main() -> int:
    existing = []
    if OUT.exists():
        try:
            existing = json.loads(OUT.read_text(encoding="utf-8")).get("notices", [])
        except Exception:
            existing = []
    seen = {n.get("url") for n in existing}
    added = 0
    for board in BOARDS:
        try:
            for n in fetch_board(board):
                if n["url"] and n["url"] not in seen:
                    seen.add(n["url"])
                    existing.append(n)
                    added += 1
            print(f"board {board}: ok")
        except Exception as e:  # noqa: BLE001
            print(f"board {board}: err {e}")
        time.sleep(1.5)
    existing.sort(key=lambda n: n.get("date", ""), reverse=True)
    merged = existing[:MAX_KEEP]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps({"updated": time.strftime("%Y-%m-%d"), "notices": merged},
                   ensure_ascii=False, indent=1) + "\n",
        encoding="utf-8",
    )
    print(f"added {added}, total {len(merged)} -> {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
