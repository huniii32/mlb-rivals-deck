"""Keep the Windows OCR engine warm while checking stop/focus during recognition."""
import json
from pathlib import Path
import queue
import subprocess
import sys
import threading
import time

class OcrSession:
    def __init__(self):
        if sys.platform!='win32':raise RuntimeError('Windows 10/11에서 실행하세요.')
        self.process=subprocess.Popen(['powershell.exe','-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',str(Path(__file__).with_name('windows_ocr.ps1')),'-Server'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,stderr=subprocess.PIPE,creationflags=getattr(subprocess,'CREATE_NO_WINDOW',0))
        self.responses=queue.Queue();self.errors=[]
        def read():
            for line in self.process.stdout:self.responses.put(line)
            self.responses.put(None)
        def errors():
            for line in self.process.stderr:self.errors.append(line.decode('utf-8',errors='replace')[-600:]);self.errors=self.errors[-5:]
        threading.Thread(target=read,daemon=True).start();threading.Thread(target=errors,daemon=True).start()
    def recognize(self,paths,check):
        check()
        try:self.process.stdin.write((json.dumps([str(p.resolve()) for p in paths],ensure_ascii=False)+'\n').encode());self.process.stdin.flush()
        except (BrokenPipeError,OSError) as e:raise RuntimeError('Windows OCR를 시작하지 못했습니다. 한국어 OCR 설치를 확인하세요.') from e
        until=time.monotonic()+30
        while time.monotonic()<until:
            check()
            try:line=self.responses.get(timeout=0.1)
            except queue.Empty:continue
            if line is None:raise RuntimeError('Windows OCR 종료: '+''.join(self.errors))
            try:result=json.loads(line.decode('utf-8-sig'))
            except (ValueError,UnicodeError) as e:raise RuntimeError('Windows OCR 응답을 확인하지 못했습니다.') from e
            return result if isinstance(result,list) else [result]
        raise RuntimeError('Windows OCR 대기 시간이 초과되었습니다. 추가 클릭 없이 중단합니다.')
    def close(self):
        if self.process.poll() is None:self.process.terminate()
        try:self.process.wait(timeout=3)
        except subprocess.TimeoutExpired:self.process.kill();self.process.wait()
        for stream in (self.process.stdin,self.process.stdout,self.process.stderr):
            try:stream.close()
            except OSError:pass
