#!/usr/bin/env python3
"""공식 커뮤니티 공지에서 선수표 수집 (seed DB용).

- 게시글 본문은 서버렌더링 HTML이라 requests로 바로 긁힘
- 목록 페이지는 JS라서, 글 내 사이드바 링크로 BFS 확장
- 예의: 식별 UA + 1.5초 간격
- 출력: data/seed_players.csv (팀,이름,카드타입,포지션,OVR,연도,출처URL)

사용: python3 scripts/crawl_notices.py [--max-posts 200] [--seeds URL,...]
"""
import argparse
import csv
import html as ihtml
import json
import re
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin

import requests

BASE = "https://community.withhive.com"
UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) rivals-deck-seed/0.1 (+personal research)"
DELAY = 1.5

HEADER_MAP = {
    "team": "team", "팀": "team",
    "name": "name", "이름": "name", "선수명": "name", "선수": "name",
    "card type": "card_type", "cardtype": "card_type", "카드": "card_type",
    "카드타입": "card_type", "카드 타입": "card_type",
    "position": "position", "포지션": "position",
    "ovr": "ovr", "오버롤": "ovr",
    "year": "year", "연도": "year", "시즌": "year",
}


class TableParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tables = []
        self._cur = None
        self._row = None
        self._cell = None

    def handle_starttag(self, tag, attrs):
        if tag == "table":
            self._cur = []
        elif tag == "tr" and self._cur is not None:
            self._row = []
        elif tag in ("td", "th") and self._row is not None:
            self._cell = ""

    def handle_data(self, data):
        if self._cell is not None:
            self._cell += data

    def handle_endtag(self, tag):
        if tag in ("td", "th") and self._cell is not None:
            self._row.append(re.sub(r"\s+", " ", ihtml.unescape(self._cell)).strip())
            self._cell = None
        elif tag == "tr" and self._row is not None:
            if any(self._row):
                self._cur.append(self._row)
            self._row = None
        elif tag == "table" and self._cur is not None:
            if self._cur:
                self.tables.append(self._cur)
            self._cur = None


def norm_header(h):
    return HEADER_MAP.get(h.strip().lower().replace("_", " "), "")


def extract_players(tables, url):
    out = []
    for t in tables:
        if len(t) < 2:
            continue
        cols = [norm_header(h) for h in t[0]]
        if "name" not in cols or "team" not in cols:
            continue
        idx = {c: i for i, c in enumerate(cols) if c}
        for row in t[1:]:
            if len(row) < len(cols):
                row = row + [""] * (len(cols) - len(row))
            name = row[idx["name"]].strip()
            team = row[idx["team"]].strip()
            if not name or len(name) > 60:
                continue
            out.append({
                "team": team,
                "name": name,
                "card_type": row[idx["card_type"]].strip() if "card_type" in idx else "",
                "position": row[idx["position"]].strip() if "position" in idx else "",
                "ovr": row[idx["ovr"]].strip() if "ovr" in idx else "",
                "year": row[idx["year"]].strip() if "year" in idx else "",
                "source": url,
            })
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--max-posts", type=int, default=200)
    ap.add_argument("--seeds", default="https://community.withhive.com/MLB9IRIVALS/ko/board/all/10968,https://community.withhive.com/MLB9IRIVALS/en/board/2/10415")
    ap.add_argument("--out", default="data/seed_players.csv")
    args = ap.parse_args()

    root = Path(__file__).resolve().parent.parent
    out_path = root / args.out
    out_path.parent.mkdir(parents=True, exist_ok=True)

    s = requests.Session()
    s.headers["User-Agent"] = UA
    queue = [u.strip() for u in args.seeds.split(",") if u.strip()]
    seen = set()
    rows = []
    fetched = 0

    while queue and fetched < args.max_posts:
        url = queue.pop(0)
        if url in seen:
            continue
        seen.add(url)
        try:
            r = s.get(url, timeout=30)
            if r.status_code != 200:
                print(f"skip {r.status_code} {url}", flush=True)
                continue
            fetched += 1
            parser = TableParser()
            parser.feed(r.text)
            got = extract_players(parser.tables, url)
            rows.extend(got)
            print(f"[{fetched}] {url} tables={len(parser.tables)} players={len(got)}", flush=True)
            for link in sorted(set(re.findall(r"/MLB9IRIVALS/(?:ko|en)/board/\d+/\d+", r.text))):
                full = urljoin(BASE, link)
                if full not in seen:
                    queue.append(full)
        except Exception as e:  # noqa: BLE001
            print(f"err {url}: {e}", flush=True)
        time.sleep(DELAY)

    # 중복 제거 (팀,이름,카드타입,연도)
    dedup = {}
    for row in rows:
        dedup[(row["team"], row["name"], row["card_type"], row["year"], row["position"])] = row
    final = sorted(dedup.values(), key=lambda r: (r["team"], r["name"]))
    with out_path.open("w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=["team", "name", "card_type", "position", "ovr", "year", "source"])
        w.writeheader()
        w.writerows(final)
    print(f"saved {len(final)} rows -> {out_path} (fetched {fetched} posts)")


if __name__ == "__main__":
    sys.exit(main())
