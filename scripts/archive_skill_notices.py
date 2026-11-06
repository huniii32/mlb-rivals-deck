#!/usr/bin/env python3
"""Archive public Korean Hive notices and extract skill source material.

stdlib only; read-only POST list API, bounded workers, shared throttle, resumable cache.
Raw notices contain historical values, not verified current scoring inputs.
Run: python3 scripts/archive_skill_notices.py
Re-download: add --refresh. Outputs in ignored data/official-skill-archive/.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
from html import escape, unescape
from html.parser import HTMLParser
import json
from pathlib import Path
import re
import threading
import time
import urllib.parse
import urllib.request
import zipfile
from skill_source_levels import annotate_history

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://community.withhive.com'
BOARDS = {2: '공지사항', 9: '버전 업데이트', 10: 'Live 업데이트', 11: '개발자 노트',
          12: 'GM라운지', 13: '미디어', 14: '이벤트', 23: '플레이북'}
CORE = {9, 10, 11, 12, 23}
VOID = {'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr'}


def compact(value):
    return re.sub(r'\s+', ' ', unescape(value or '')).strip()


def write_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


class Node:
    def __init__(self, tag='', attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def find(self, tag):
        for child in self.children:
            if isinstance(child, Node):
                if child.tag == tag:
                    yield child
                yield from child.find(tag)

    def text(self):
        return ''.join(c.text() if isinstance(c, Node) else c for c in self.children)


class BodyParser(HTMLParser):
    """Only article .post_cont; no navigation, comments or account data."""
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = []
        self.found = False

    def handle_starttag(self, tag, attrs):
        if not self.stack:
            if self.found or 'post_cont' not in dict(attrs).get('class', '').split():
                return
            self.found = True
            self.stack = [self.root]
            return
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in VOID:
            self.stack.append(node)

    def handle_startendtag(self, tag, attrs):
        self.handle_starttag(tag, attrs)
        if tag not in VOID:
            self.handle_endtag(tag)

    def handle_endtag(self, tag):
        if not self.stack:
            return
        for i in range(len(self.stack) - 1, 0, -1):
            if self.stack[i].tag == tag:
                del self.stack[i:]
                return
        if tag == 'div' and len(self.stack) == 1:
            self.stack = []

    def handle_data(self, text):
        if self.stack:
            self.stack[-1].children.append(text)


def table_data(node):
    return [[{'text': compact(cell.text()),
              'rowspan': int(cell.attrs.get('rowspan', '1')),
              'colspan': int(cell.attrs.get('colspan', '1'))}
             for cell in row.children if isinstance(cell, Node) and cell.tag in ('td', 'th')]
            for row in node.find('tr')]


def content_blocks(node):
    if node.tag in ('table', 'p', 'h1', 'h2', 'h3', 'h4'):
        yield node
        return
    for child in node.children:
        if isinstance(child, Node):
            yield from content_blocks(child)


def is_skill_table(table):
    headers = [re.sub(r"\s+", "", cell['text']) for row in table[:4] for cell in row]
    return ('스킬명' in headers or '스킬이름' in headers or
            ('스킬' in headers and any(h in ('내용', '설명', '효과', '스킬효과') for h in headers)))


def render(node):
    if isinstance(node, str):
        return escape(node)
    if node.tag in ('script', 'style'):
        return ''
    if node.tag == 'img':
        url = urllib.parse.urljoin(BASE, node.attrs.get('src', ''))
        return f'\n\n[원문 이미지]({url})\n\n' if url.startswith('https://') else ''
    if node.tag == 'br':
        return '\n'
    if node.tag == 'table':
        # Keep merged cells rather than silently shifting columns in Markdown.
        rows = []
        for row in table_data(node):
            cells = ''.join(f'<td rowspan="{c["rowspan"]}" colspan="{c["colspan"]}">{escape(c["text"])}</td>' for c in row)
            rows.append('<tr>' + cells + '</tr>')
        return '\n\n<table>\n' + '\n'.join(rows) + '\n</table>\n\n'
    text = ''.join(render(c) for c in node.children)
    if node.tag == 'a':
        url = urllib.parse.urljoin(BASE, node.attrs.get('href', ''))
        return f'[{compact(node.text())}]({url})' if url.startswith(('https://', 'http://')) else text
    if node.tag in ('p', 'div', 'figure', 'h1', 'h2', 'h3', 'h4', 'li'):
        return '\n\n' + text.strip() + '\n\n'
    return text


class Fetcher:
    def __init__(self, cache, refresh):
        self.cache, self.refresh = cache, refresh
        self.lock, self.next_request = threading.Lock(), 0.0

    def get(self, key, url, data=None):
        path = self.cache / key
        if path.exists() and not self.refresh:
            return path.read_bytes()
        for attempt in range(3):
            with self.lock:
                delay = max(0, self.next_request - time.monotonic())
                self.next_request = max(time.monotonic(), self.next_request) + 0.6
            if delay:
                time.sleep(delay)
            request = urllib.request.Request(url, data=urllib.parse.urlencode(data).encode() if data else None,
                headers={'User-Agent': 'Mozilla/5.0 (Rivals Deck public-notice research)',
                         'Referer': BASE + '/MLB9IRIVALS/ko/board/all', 'Accept-Language': 'ko-KR,ko;q=0.9'})
            try:
                with urllib.request.urlopen(request, timeout=35) as response:
                    raw = response.read()
                path.write_bytes(raw)
                return raw
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)


def list_page(fetch, board, page):
    raw = fetch.get(f'board-{board}-page-{page}.json', BASE + '/MLB9IRIVALS/board/list/getGeneralPostList',
        {'page': page, 'board_idx': board, 'board_comment': 1, 'boardtype1_preview_image': 1,
         'is_mobile': 0, 'sort_type': 0, 'header': 0})
    result = json.loads(raw)
    if result.get('lang') != 'ko' or not isinstance(result.get('list'), dict):
        raise ValueError(f'Unexpected board response: {board}/{page}')
    return result


def record(item, board):
    return {'id': str(item['idx']), 'board': board, 'board_name': BOARDS[board],
            'title': compact(item.get('title')), 'published_at': item.get('regdate'),
            'url': f'{BASE}/MLB9IRIVALS/ko/board/{board}/{item["idx"]}',
            'listing_text': unescape(item.get('body_noscript') or '')}


def collect_article(fetch, item, out):
    raw = fetch.get(f'post-{item["id"]}.html', item['url'])
    parser = BodyParser()
    parser.feed(raw.decode('utf-8'))
    if not parser.found:
        raise ValueError('Article body not found')
    root = parser.root
    body = re.sub(r'\n[ \t]*\n(?:[ \t]*\n)+', '\n\n', ''.join(render(c) for c in root.children)).strip()
    text = compact(root.text())
    skill_tables, contexts, preceding = [], [], []
    for block in content_blocks(root):
        if block.tag == 'table':
            table = table_data(block)
            if is_skill_table(table):
                skill_tables.append(table)
                contexts.append(preceding[-3:])
        else:
            paragraph = compact(block.text())
            if paragraph:
                preceding.append(paragraph)
    images = [urllib.parse.urljoin(BASE, n.attrs['src']) for n in root.find('img') if n.attrs.get('src')]
    paragraphs = []
    for n in root.find('p'):
        t = compact(n.text())
        if '스킬' in t:
            paragraphs.append(t)
    result = {**item, 'sha256': hashlib.sha256(raw).hexdigest(), 'text': text,
              'skill_tables': skill_tables, 'skill_table_contexts': contexts, 'skill_paragraphs': paragraphs,
              'images': images, 'body_file': f'articles/{item["id"]}.md',
              'review_status': '원문 수집 · 현행 효과/스킬별 이력 대조 전',
              'image_review': '이미지 URL 보존 · 이미지 내용 미전사'}
    (out / 'articles' / (item['id'] + '.md')).write_text(
        f'# {item["title"]}\n\n- 게시: {item["published_at"]}\n- 게시판: {item["board_name"]}\n- 원문: {item["url"]}\n'
        '- 과거 공지 원문입니다. 현재 적용 수치로 확정한 자료가 아닙니다.\n- 표의 병합 셀을 보존했습니다. 이미지 속 설명은 원문 이미지 링크로 확인하세요.\n\n' + body + '\n', encoding='utf-8')
    return result


def expand_table(rows):
    """Expand rowspan/colspan so an effect cannot move to the wrong skill."""
    grid = {}
    for r, row in enumerate(rows):
        c = 0
        for cell in row:
            while (r, c) in grid:
                c += 1
            for dr in range(cell['rowspan']):
                for dc in range(cell['colspan']):
                    grid[r + dr, c + dc] = cell['text']
            c += cell['colspan']
    width = max((c for _, c in grid), default=-1) + 1
    height = max((r for r, _ in grid), default=-1) + 1
    return [[grid.get((r, c), '') for c in range(width)] for r in range(height)]


def skill_history(articles):
    history = {}
    for article in articles:
        for table_index, table in enumerate(article['skill_tables']):
            rows = expand_table(table)
            header_row = None
            for i, row in enumerate(rows[:4]):
                normalized = [re.sub(r'\s+', '', c) for c in row]
                names = [j for j, c in enumerate(normalized) if c in ('스킬명', '스킬이름', '스킬')]
                # Only explicit effect tables; don't treat probability or player lists as effects.
                if names and any(c in ('내용', '설명', '효과', '스킬효과', '스킬설명') for c in normalized):
                    header_row, name_col = i, names[0]
                    break
            if header_row is None:
                continue
            grouped = {}
            for row in rows[header_row + 1:]:
                name = row[name_col].strip()
                if not name or name in ('스킬명', '스킬 이름', '스킬') or len(name) > 100:
                    continue
                grouped.setdefault(name, []).append(row)
            for name, values in grouped.items():
                history.setdefault(name, []).append({'notice_id': article['id'], 'published_at': article['published_at'],
                    'title': article['title'], 'url': article['url'], 'table_index': table_index,
                    'context': article.get('skill_table_contexts', [[]] * len(article['skill_tables']))[table_index],
                    'columns': rows[header_row], 'rows': values})
    return dict(sorted(history.items()))


def report_history(out, history):
    lines = ['# 스킬별 공식 효과표 출처', '',
             '스킬명과 설명/내용/효과 열이 명시된 HTML 표에서 추출했습니다. 아래 목록이 게임의 전체 스킬 목록이라는 의미는 아닙니다.',
             '동일 스킬이 반복 등장하면 원문의 날짜를 함께 표시합니다. 가장 최근 행을 현재 효과로 자동 확정하지 않았습니다.',
             '이미지 전용 표·본문 문장·다른 형태의 표는 누락될 수 있으므로 README와 원문도 함께 확인하세요.', '',
             f'추출된 스킬 표기 {len(history)}개. 이름은 원문 표기를 유지합니다.', '']
    for name, entries in history.items():
        lines += [f'## {name}', '']
        for entry in entries:
            lines += [f'- {entry["published_at"][:10]} · [{entry["title"]}]({entry["url"]})', '']
            for context in entry['context']:
                lines += ['> ' + context, '']
            columns = entry['columns']
            lines += ['| ' + ' | '.join(c.replace('|', '\\|') for c in columns) + ' |',
                      '| ' + ' | '.join('---' for _ in columns) + ' |']
            for row in entry['rows']:
                lines.append('| ' + ' | '.join(c.replace('|', '\\|') for c in row) + ' |')
            lines.append('')
    (out / 'SKILLS.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--refresh', action='store_true')
    ap.add_argument('--publish-docs', action='store_true', help='Write source indexes to docs (no app changes)')
    ap.add_argument('--out', type=Path, default=ROOT / 'data/official-skill-archive')
    args = ap.parse_args()
    out = args.out
    for path in [out, out / 'cache', out / 'articles']:
        path.mkdir(parents=True, exist_ok=True)
    fetch = Fetcher(out / 'cache', args.refresh)
    all_items, coverage, failures = {}, [], []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        for board in BOARDS:
            first = list_page(fetch, board, 1)
            expected = int(str(first['total']).replace(',', ''))
            last = int(first['paging']['last'])
            pages = {1: first}
            jobs = {pool.submit(list_page, fetch, board, p): p for p in range(2, last + 1)}
            for future in concurrent.futures.as_completed(jobs):
                page = jobs[future]
                try:
                    pages[page] = future.result()
                except Exception as error:
                    failures.append({'board': board, 'page': page, 'error': str(error)})
            items = {}
            for page in sorted(pages):
                for item in pages[page]['list']['list']:
                    if int(item['board_idx']) != board:
                        raise ValueError('Cross-board regular listing item')
                    items[str(item['idx'])] = record(item, board)
            all_items.update(items)
            coverage.append({'board': board, 'name': BOARDS[board], 'expected': expected,
                             'collected': len(items), 'pages_expected': last, 'pages_collected': len(pages)})
            print(f'{BOARDS[board]}: {len(items)}/{expected}, pages {len(pages)}/{last}', flush=True)
    notices = sorted(all_items.values(), key=lambda x: (x['published_at'] or '', x['id']), reverse=True)
    write_json(out / 'all-notices.json', notices)
    # Fetch all core boards (also image-only notices); retain other mentions broadly.
    # Sales/event text remains fully searchable in all-notices.json even when not selected here.
    candidates = [n for n in notices if n['board'] in CORE or not n['listing_text'].strip() or
                  ('스킬' in n['listing_text'] + n['title'] and
                   (re.search(r'스킬.{0,12}(?:효과|설명|능력치|오류|수정|추가|개선|변경|시스템|확률|도감|티어)', n['listing_text'])
                    and not re.search(r'패키지.*판매|스카우트.*일정', n['title'])))]
    articles = []
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        jobs = {pool.submit(collect_article, fetch, n, out): n for n in candidates}
        for future in concurrent.futures.as_completed(jobs):
            n = jobs[future]
            try:
                articles.append(future.result())
            except Exception as error:
                failures.append({'id': n['id'], 'url': n['url'], 'error': str(error)})
            if (len(articles) + len(failures)) % 20 == 0:
                print(f'Article bodies: {len(articles)}/{len(candidates)}; failures {len(failures)}', flush=True)
    articles.sort(key=lambda x: (x['published_at'] or '', x['id']), reverse=True)
    skill_articles = [a for a in articles if '스킬' in a['text'] or '스킬' in a['title']]
    by_id = {a['id']: a for a in articles}
    for n in notices:
        n['text'] = by_id[n['id']]['text'] if n['id'] in by_id else compact(n['listing_text'])
        n['text_source'] = 'article_html' if n['id'] in by_id else 'list_api'
    write_json(out / 'all-notices.json', notices)
    write_json(out / 'articles.json', articles)
    write_json(out / 'skill-notices.json', skill_articles)
    history = annotate_history(skill_history(skill_articles))
    write_json(out / 'skill-history.json', history)
    report_history(out, history)
    manifest = {'schema_version': 1, 'published_date_range': [min(n['published_at'] for n in notices), max(n['published_at'] for n in notices)], 'collected_at_utc': datetime.now(timezone.utc).isoformat(), 'boards': coverage,
                'notice_count': len(notices), 'empty_text_count': sum(not n['text'] for n in notices), 'candidate_count': len(candidates), 'article_count': len(articles),
                'skill_mention_count': len(skill_articles), 'effect_table_skill_names': len(history), 'skill_table_count': sum(len(a['skill_tables']) for a in articles),
                'failures': failures, 'limits': ['공개 한국어 공식 게시판 8개만 수집. 삭제/비공개 글은 포함되지 않음.',
                '게시 날짜는 원문 날짜. 현재 수정된 본문 스냅샷이며 수정 전 버전의 복구 자료가 아님.',
                '이미지 URL은 보존하지만 이미지 속 표/효과는 OCR 또는 검수하지 않음.',
                '스킬 언급 자동 분류. 개별 스킬의 최신 효과 확정 및 계산 점수 대조는 수행하지 않음.']}
    write_json(out / 'manifest.json', manifest)
    report(out, manifest, skill_articles, articles)
    if args.publish_docs:
        publish_docs(out, manifest, articles)
    for name, include_cache in [('official-skill-archive.zip', True), ('skill-reference.zip', False)]:
        zip_path = out / name
        with zipfile.ZipFile(zip_path, 'w', zipfile.ZIP_DEFLATED) as z:
            for path in sorted(out.rglob('*')):
                if not path.is_file() or path.suffix == '.zip':
                    continue
                if not include_cache and path.relative_to(out).parts[0] == 'cache':
                    continue
                z.write(path, path.relative_to(out))
        print(f'Archive: {zip_path}', flush=True)
    print(json.dumps(manifest, ensure_ascii=False), flush=True)
    if failures or any(c['expected'] != c['collected'] for c in coverage):
        raise SystemExit('Incomplete coverage; inspect manifest and retry with --refresh if needed.')


def publish_docs(out, manifest, articles):
    docs = ROOT / 'docs'
    text = (out / 'README.md').read_text(encoding='utf-8')
    text = re.sub(r' · \[본문\]\(articles/[^)]+\)', '', text)
    text = text.replace('(SKILLS.md)', '(official-skill-effects.md)').replace(' · [스킬별 구조화 데이터](skill-history.json)', '')
    text += ('\n## 원문 아카이브 재생성\n\n'
             '`python3 scripts/archive_skill_notices.py --publish-docs`\n\n'
             '결과는 `data/official-skill-archive/`에 저장됩니다. '
             '`official-skill-archive.zip`에는 전체 목록·본문 텍스트·상세 원문 HTML·표·이미지 URL·스킬별 색인이 포함됩니다. '
             '`skill-reference.zip`은 원문 HTML 캐시를 제외한 읽기용 묶음입니다. 이미지 파일 자체와 이미지 안의 텍스트는 포함하지 않습니다. 캐시를 새로 받으려면 `--refresh`를 추가하세요.\n')
    text += '\n추가 조사: [공지 이미지 OCR·검수](official-skill-image-review.md) · [레벨 표기 대응](skill-level-mapping.md) · [Windows 도감 캡처](../tools/skill-capture/README.md)\n'
    (docs / 'official-skill-notices.md').write_text(text, encoding='utf-8')
    write_json(docs / 'official-skill-effects.json', json.loads((out / 'skill-history.json').read_text()))
    (docs / 'official-skill-effects.md').write_text(
        (out / 'SKILLS.md').read_text(encoding='utf-8').replace('README와', '[공지 색인](official-skill-notices.md)과') + '\n레벨 표기: [SS·SS+와 S0~S4 대응](skill-level-mapping.md). 원문 등급은 보존합니다.\n', encoding='utf-8')
    write_json(docs / 'official-skill-sources.json', {'manifest': manifest,
        'sources': [{k: a[k] for k in ('id', 'board', 'title', 'published_at', 'url', 'sha256', 'review_status', 'image_review')}
                    for a in articles]})


def report(out, manifest, skill_articles, articles):
    lines = ['# 공식 스킬 관련 공지 수집', '', f'수집 시각(UTC): {manifest["collected_at_utc"]}', '',
             '공식 게시판의 공개 한국어 글을 끝 페이지까지 수집했습니다. 판매·이벤트를 포함한 전체 목록과 제공된 본문 텍스트는 `all-notices.json`, 스킬 관련 자료는 `skill-notices.json`에서 검색할 수 있습니다.', '',
             '[스킬별 효과표 보기](SKILLS.md) · [스킬별 구조화 데이터](skill-history.json)', '', '## 수집 범위', '', '| 게시판 | 목록 수집 / 공개 글 수 | 페이지 |', '|---|---:|---:|']
    for c in manifest['boards']:
        lines.append(f'| {c["name"]} | {c["collected"]} / {c["expected"]} | {c["pages_collected"]} / {c["pages_expected"]} |')
    lines += ['', f'전체 목록 {manifest["notice_count"]}건 · 상세 본문 {manifest["article_count"]}건 · 스킬 언급 {manifest["skill_mention_count"]}건 · 스킬명 표 {manifest["skill_table_count"]}개', '',
              '## 읽을 때 주의할 점', ''] + ['- ' + s for s in manifest['limits']]
    lines += ['', '## 스킬명 표가 있는 공지', '', '스킬명 헤더가 있는 표를 자동 추출했습니다. 효과표·변경표·선수별 지정 스킬표 등이 섞일 수 있습니다. 원문을 함께 확인하세요.', '', '| 게시일 | 공지 | 표 수 |', '|---|---|---:|']
    for a in skill_articles:
        if a['skill_tables']:
            title = a['title'].replace('|', '\\|')
            lines.append(f'| {a["published_at"][:10]} | [{title}]({a["url"]}) | {len(a["skill_tables"])} |')
    lines += ['', '## 연도별 스킬 관련 공지', '', '스킬이 언급된 글 전체입니다. 효과 수치가 없는 운영·이벤트·시스템 글도 포함합니다.']
    year = None
    for a in skill_articles:
        y = a['published_at'][:4]
        if y != year:
            lines += ['', f'### {y}', '']; year = y
        lines.append(f'- {a["published_at"][:10]} · [{a["title"]}]({a["url"]}) · [본문]({a["body_file"]})')
    lines += ['', '## 텍스트에 스킬 언급이 없는 추가 보존 글', '', '핵심 게시판 글과 목록 본문이 비어 있던 글도 상세 페이지를 보존했습니다. 이미지에만 설명이 있을 수 있습니다.', '']
    for a in articles:
        if '스킬' not in a['text'] + a['title']:
            lines.append(f'- {a["published_at"][:10]} · [{a["title"]}]({a["url"]}) · [본문]({a["body_file"]})')
    (out / 'README.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')


if __name__ == '__main__':
    main()
