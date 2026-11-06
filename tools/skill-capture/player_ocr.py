"""Optional local Windows OCR; original captures always remain available."""
import json
from pathlib import Path
import subprocess
import sys
import time
from core import StopCapture, save_json
from player_core import export_players, safe_path, strict_stat


def windows_ocr(paths, stop):
    if sys.platform != 'win32': raise RuntimeError('Windows 10/11에서 로컬 문자 인식을 실행하세요.')
    command = ['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('windows_ocr.ps1'))]
    process = subprocess.Popen(command, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE, creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
    payload = json.dumps([str(p.resolve()) for p in paths],ensure_ascii=False).encode('utf-8')
    start = time.monotonic(); first = True
    try:
        while True:
            if stop.is_set(): raise StopCapture('문자 인식을 중지했습니다. 원본 캡처는 유지됩니다.')
            if time.monotonic()-start > 120: raise RuntimeError('Windows OCR 응답 시간이 초과되었습니다.')
            try:
                out, err = process.communicate(input=payload if first else None,timeout=0.2); break
            except subprocess.TimeoutExpired: first = False
        if process.returncode: raise RuntimeError('Windows OCR 실행 실패. Windows 언어 설정의 한국어 OCR 설치를 확인하세요. '+err.decode('utf-8',errors='replace')[-600:])
        result = json.loads(out.decode('utf-8-sig'))
        return result if isinstance(result,list) else [result]
    finally:
        if process.poll() is None: process.kill(); process.communicate()


def process_players(folder, stop, log=print, recognize=windows_ocr):
    folder = Path(folder); state_path=folder/'state.json'
    state=json.loads(state_path.read_text(encoding='utf-8'))
    if state.get('schema') != 'players-v1': raise ValueError('선수 수집 결과를 선택하세요.')
    try:
        for record in state['cards'].values():
            if stop.is_set(): raise StopCapture('문자 인식을 중지했습니다.')
            fields=[(False,k,v) for k,v in record['fields'].items()]+[(True,k,v) for k,v in record['stats'].items()]
            pending=[entry for entry in fields if 'image' in entry[2] and entry[2].get('status') not in ('manual','ocr')]
            if not pending: continue
            paths=[safe_path(folder,v['image']) for _,_,v in pending]
            results=recognize(paths,stop)
            by_path={str(Path(r['path']).resolve()):r for r in results}
            for (numeric,key,value),path in zip(pending,paths):
                result=by_path.get(str(path),{'text':'','error':'OCR 결과 누락'})
                value['raw']=result.get('text',''); value['language']=result.get('language','')
                if result.get('error'):
                    value.update(value=None,status='needs_review',error=result['error']); continue
                parsed=strict_stat(value['raw']) if numeric else value['raw'].strip() or None
                value.update(value=parsed,status='ocr' if parsed is not None else 'needs_review')
                value.pop('error',None)
            # OCR is a proposal, never a verified game statistic.
            record['review_status']='needs_review'
            save_json(state_path,state); export_players(folder,state)
            log(f'{record["id"]}: 문자 인식 완료 · 기본 수치/이름 검토 필요')
    finally: export_players(folder,state)
