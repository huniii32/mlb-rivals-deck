#!/usr/bin/env python3
"""Download and OCR official skill-notice images; never update score tables.

Requires Pillow, tesseract, Korean/English traineddata. First run the notice archive.
Example: python3 scripts/ocr_skill_notice_images.py --workers 3
OCR text is unverified. Review original images before assigning effects to skills.
"""
import argparse
import concurrent.futures
from datetime import datetime, timezone
import hashlib
import io
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from PIL import Image, ImageOps
from archive_skill_notices import BodyParser, Node, compact, write_json

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = ROOT / 'data/official-skill-archive'
OUT = ROOT / 'data/official-skill-images'
TARGETS = {'클린업 트리오': r'클\s*린\s*업|클린업|클린압',
           '배팅 머신': r'[배베바타]\s*팅\s*머\s*신|배팅|배링|BATTING\s*MACHINE',
           '타점기계': r'타\s*점\s*기\s*계|타점|RBI\s*MACHINE'}


def blocks(n):
    if n.tag in ('p', 'h1', 'h2', 'h3', 'h4', 'table'):
        text = compact(n.text())
        if text:
            yield 'text', text
        for image in n.find('img'):
            yield 'img', image.attrs.get('src', '')
        return
    if n.tag == 'img':
        yield 'img', n.attrs.get('src', '')
        return
    for child in n.children:
        if isinstance(child, Node):
            yield from blocks(child)


def inventory():
    articles = json.loads((ARCHIVE / 'articles.json').read_text())
    records = []
    for article in articles:
        parser = BodyParser()
        parser.feed((ARCHIVE / 'cache' / f'post-{article["id"]}.html').read_text())
        previous, section, index = [], '', 0
        for kind, value in blocks(parser.root):
            if kind == 'text':
                if re.match(r'^(?:\d{1,2}\.\s|[■▶]\s*)', value) and len(value) < 160:
                    section = value
                previous.append(value)
                continue
            index += 1
            url = urllib.parse.urljoin('https://community.withhive.com', value)
            if not url.startswith('https://'):
                continue
            reasons = []
            if '스킬' in article['title']:
                reasons.append('스킬 제목 공지')
            if '스킬' in section:
                reasons.append('스킬 섹션')
            if any('스킬' in p for p in previous[-3:]):
                reasons.append('직전 문단 스킬 언급')
            if article['board'] in (9, 10, 11, 12, 23) and not article['text']:
                reasons.append('텍스트 없는 핵심 공지')
            priority = bool(reasons)
            # Older notices often place entire tables in images. Read these without keyword gating.
            if article['board'] in (9, 10, 11) and article['published_at'] < '2024-07-01':
                reasons.append('초기 업데이트 이미지 전체 확인')
            records.append({'key': hashlib.sha256(url.encode()).hexdigest()[:16],
                'notice_id': article['id'], 'title': article['title'], 'date': article['published_at'],
                'url': article['url'], 'image_index': index, 'image_url': url, 'section': section,
                'context': previous[-3:], 'reasons': reasons, 'selected': bool(reasons), 'priority': priority})
    return records


class Downloader:
    def __init__(self):
        self.lock, self.next_at = threading.Lock(), 0.0

    def get(self, row):
        path = OUT / 'images' / (row['key'] + '.original')
        if path.exists():
            return path.read_bytes()
        for attempt in range(3):
            with self.lock:
                delay = max(0, self.next_at - time.monotonic())
                self.next_at = max(time.monotonic(), self.next_at) + 0.4
            time.sleep(delay)
            req = urllib.request.Request(row['image_url'], headers={
                'User-Agent': 'Mozilla/5.0 (Rivals Deck official-skill image research)', 'Referer': row['url']})
            try:
                with urllib.request.urlopen(req, timeout=35) as response:
                    raw = response.read(32 * 1024 * 1024 + 1)
                if len(raw) > 32 * 1024 * 1024:
                    raise ValueError('Image exceeds 32 MiB bound')
                with Image.open(io.BytesIO(raw)) as im:
                    im.verify()
                path.write_bytes(raw)
                return raw
            except urllib.error.HTTPError as error:
                if error.code in (400, 401, 403, 404, 410) or attempt == 2:
                    raise
                time.sleep(2 ** attempt)
            except Exception:
                if attempt == 2:
                    raise
                time.sleep(2 ** attempt)


def from_tsv(text):
    lines, scores, words = {}, [], []
    for line in text.splitlines()[1:]:
        fields = line.split('\t', 11)
        if len(fields) < 12 or not fields[11].strip():
            continue
        confidence = float(fields[10])
        if confidence < 0:
            continue
        group = tuple(fields[1:5])
        lines.setdefault(group, []).append(fields[11])
        scores.append(confidence)
        words.append({'text': fields[11], 'confidence': confidence,
                      'box': [int(v) for v in fields[6:10]]})
    return '\n'.join(' '.join(row) for row in lines.values()), scores, words


def process(row, downloader, tessdata):
    result_path = OUT / 'ocr' / (row['key'] + '.json')
    if result_path.exists():
        cached = json.loads(result_path.read_text())
        if cached.get('status') == 'ok':
            return cached
    result = {'key': row['key'], 'image_url': row['image_url'], 'status': 'error',
              'review_status': 'OCR 자동 추출 · 효과 수치 미검수'}
    try:
        raw = downloader.get(row)
        result['sha256'] = hashlib.sha256(raw).hexdigest()
        with Image.open(io.BytesIO(raw)) as original:
            im = ImageOps.exif_transpose(original).convert('RGB')
            result['original_size'] = list(im.size)
            if im.width < 1200 and im.height < 5000:
                factor = min(2, 1200 / im.width, 6000 / im.height)
                im = im.resize((round(im.width * factor), round(im.height * factor)), Image.Resampling.LANCZOS)
            result['ocr_size'] = list(im.size)
            prepared = OUT / 'prepared' / (row['key'] + '.png')
            im.save(prepared)
        modes = [11, 6] if row['priority'] else [11]
        runs = []
        for mode in modes:
            prefix = OUT / 'ocr' / f'{row["key"]}-psm{mode}'
            tsv_path = prefix.with_suffix('.tsv')
            if not tsv_path.exists():
                env = {**os.environ, 'OMP_THREAD_LIMIT': '1'}
                subprocess.run(['tesseract', str(prepared), str(prefix), '--tessdata-dir', str(tessdata),
                                '-l', 'kor+eng', '--psm', str(mode), '-c', 'tessedit_create_tsv=1'], env=env,
                               stdout=subprocess.PIPE, stderr=subprocess.PIPE, check=True, timeout=180)
            text, scores, words = from_tsv(tsv_path.read_text())
            prefix.with_suffix('.txt').write_text(text + '\n', encoding='utf-8')
            runs.append({'psm': mode, 'text': text, 'word_count': len(scores),
                         'mean_word_confidence': round(sum(scores) / len(scores), 2) if scores else 0,
                         'words': words})
        result.update(status='ok', runs=runs)
        text = '\n'.join(r['text'] for r in runs)
        result['target_candidates'] = [name for name, pattern in TARGETS.items() if re.search(pattern, text, re.I)]
    except Exception as error:
        result['error'] = f'{type(error).__name__}: {str(error)[:500]}'
    write_json(result_path, result)
    return result


def main():
    ap = argparse.ArgumentParser(description=__doc__)
    ap.add_argument('--workers', type=int, default=3)
    ap.add_argument('--limit', type=int, default=0, help='Optional smoke run; manifest records incomplete scope')
    ap.add_argument('--tessdata', type=Path, default=OUT / 'tessdata')
    ap.add_argument('--bundle', action='store_true', help='Bundle OCR text and source metadata (no image/model binaries)')
    args = ap.parse_args()
    for name in ['images', 'prepared', 'ocr']:
        (OUT / name).mkdir(parents=True, exist_ok=True)
    if not (args.tessdata / 'kor.traineddata').exists() or not (args.tessdata / 'eng.traineddata').exists():
        raise SystemExit('Korean/English Tesseract data missing; see docs/official-skill-image-review.md.')
    rows = inventory()
    write_json(OUT / 'image-inventory.json', rows)
    unique = {}
    for row in rows:
        if row['selected']:
            if row['key'] not in unique or row['priority']:
                unique[row['key']] = row
    ordered = sorted(unique.values(), key=lambda r: (not r['priority'], r['date'], r['key']))
    expected = len(ordered)
    if args.limit:
        ordered = ordered[:args.limit]
    print(f'Images: {len(rows)} occurrences; {expected} unique selected; running {len(ordered)}', flush=True)
    results, downloader = [], Downloader()
    with concurrent.futures.ThreadPoolExecutor(max_workers=max(1, min(4, args.workers))) as pool:
        jobs = {pool.submit(process, r, downloader, args.tessdata): r for r in ordered}
        for future in concurrent.futures.as_completed(jobs):
            result = future.result()
            results.append(result)
            if result.get('target_candidates'):
                print(f'Target candidate: {result["key"]} {result["target_candidates"]}', flush=True)
            if len(results) % 10 == 0 or result['status'] == 'error':
                print(f'OCR {len(results)}/{len(ordered)}; errors {sum(r["status"] != "ok" for r in results)}' +
                      (f'; {result.get("error")}' if result['status'] == 'error' else ''), flush=True)
    results.sort(key=lambda r: r['key'])
    manifest = {'created_at_utc': datetime.now(timezone.utc).isoformat(), 'image_occurrences': len(rows),
                'selected_unique': expected, 'attempted': len(results),
                'successful': sum(r['status'] == 'ok' for r in results),
                'failures': [r for r in results if r['status'] != 'ok'],
                'ocr_engine': subprocess.check_output(['tesseract', '--version'], text=True).splitlines()[0],
                'korean_model_sha256': hashlib.sha256((args.tessdata / 'kor.traineddata').read_bytes()).hexdigest(),
                'scope': '스킬 문맥 이미지 + 2024-07-01 이전 버전/Live/개발자 공지 이미지',
                'limits': ['선택되지 않은 이미지도 목록에 남김. 전체 이미지 OCR 완료를 의미하지 않음.',
                           'OCR은 오탈자·표의 행/열 혼합 가능. 현재 효과나 계산 점수에 자동 반영하지 않음.']}
    write_json(OUT / 'manifest.json', manifest)
    write_json(OUT / 'ocr-results.json', results)
    report(rows, results, manifest)
    if args.bundle:
        bundle(OUT)
    print(json.dumps({k: v for k, v in manifest.items() if k != 'failures'}, ensure_ascii=False), flush=True)


def report(rows, results, manifest):
    by_key = {r['key']: r for r in results}
    sources = {}
    for row in rows:
        if row['selected']:
            sources.setdefault(row['key'], []).append(row)
    lines = ['# 공식 공지 이미지 OCR', '',
             '자동 추출 텍스트입니다. 원본 이미지에서 이름·등급·조건·숫자를 확인한 뒤 사용해야 합니다.', '',
             f'대상 고유 이미지 {manifest["selected_unique"]}개 / 시도 {manifest["attempted"]}개 / 성공 {manifest["successful"]}개', '',
             '## 이미지별 원문과 OCR', '']
    for key, occurrences in sources.items():
        if key not in by_key:
            continue
        result, first = by_key[key], occurrences[0]
        lines += [f'### {first["title"]} · 이미지 {first["image_index"]}', '',
                  f'- [공지]({first["url"]}) · [원본 이미지]({first["image_url"]}) · ID `{key}`',
                  '- 선정 이유: ' + ', '.join(first['reasons']), '']
        if result['status'] != 'ok':
            lines += ['다운로드/OCR 실패: ' + result['error'], '']
        else:
            for run in result['runs']:
                lines += [f'#### OCR 모드 {run["psm"]}', '', '```text', run['text'], '```', '']
    (OUT / 'README.md').write_text('\n'.join(lines), encoding='utf-8')


def bundle(folder):
    """A portable text reference; original images remain at the recorded public URLs."""
    target = folder / 'skill-image-reference.zip'
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as archive:
        for filename in ('README.md', 'manifest.json', 'image-inventory.json', 'ocr-results.json'):
            archive.write(folder / filename, filename)
        for path in sorted((folder / 'ocr').glob('*')):
            if path.suffix in ('.json', '.txt', '.tsv'):
                archive.write(path, path.relative_to(folder))
    return target


if __name__ == '__main__':
    main()
