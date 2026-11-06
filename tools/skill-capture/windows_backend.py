"""Windows desktop IO. No memory/process injection; only foreground mouse and screenshots."""
import ctypes
from ctypes import wintypes
import os
import time
from core import StopCapture


def enable_dpi_awareness():
    try:
        ctypes.windll.user32.SetProcessDpiAwarenessContext(ctypes.c_void_p(-4))
    except (AttributeError, OSError):
        try:
            ctypes.windll.shcore.SetProcessDpiAwareness(2)
        except (AttributeError, OSError):
            pass


class Windows:
    def __init__(self, hwnd):
        import pyautogui
        self.gui = pyautogui
        self.gui.FAILSAFE = True
        self.gui.PAUSE = 0.08
        self.user = ctypes.windll.user32
        self.user.GetForegroundWindow.restype = wintypes.HWND
        self.hwnd = hwnd
        self.pid = self.process_id()
        self.bounds = self.client_bounds()
        self.executable = executable(hwnd)

    def process_id(self):
        pid = wintypes.DWORD()
        ctypes.windll.user32.GetWindowThreadProcessId(wintypes.HWND(self.hwnd), ctypes.byref(pid))
        return pid.value

    def client_bounds(self):
        rect = wintypes.RECT()
        point = wintypes.POINT(0, 0)
        if not self.user.GetClientRect(wintypes.HWND(self.hwnd), ctypes.byref(rect)):
            raise StopCapture('게임창을 찾을 수 없습니다.')
        self.user.ClientToScreen(wintypes.HWND(self.hwnd), ctypes.byref(point))
        return (point.x, point.y, rect.right, rect.bottom)

    def focus(self):
        if self.user.IsIconic(wintypes.HWND(self.hwnd)):
            self.user.ShowWindow(wintypes.HWND(self.hwnd), 9)
        self.user.SetForegroundWindow(wintypes.HWND(self.hwnd))
        time.sleep(0.6)
        self.guard()

    def guard(self):
        if self.process_id() != self.pid or not self.user.IsWindow(wintypes.HWND(self.hwnd)):
            raise StopCapture('게임창이 닫혔거나 다시 실행됐습니다.')
        if self.user.GetForegroundWindow() != self.hwnd:
            raise StopCapture('다른 창이 활성화되어 클릭을 중단했습니다.')
        if self.client_bounds() != self.bounds:
            raise StopCapture('게임창의 위치 또는 크기가 바뀌었습니다.')
        x, y, width, height = self.bounds
        screen = self.gui.size()
        if x < 0 or y < 0 or x + width > screen.width or y + height > screen.height:
            raise StopCapture('게임창 전체를 기본 모니터 안에 배치하세요.')

    def escape_pressed(self):
        return bool(self.user.GetAsyncKeyState(0x1B) & 0x8000)

    def screenshot(self):
        self.guard()
        return self.gui.screenshot(region=self.bounds)

    def click(self, point):
        self.guard()
        x, y, _, _ = self.bounds
        self.gui.click(x + point[0], y + point[1])

    def move(self, point):
        self.guard()
        x, y, _, _ = self.bounds
        self.gui.moveTo(x + point[0], y + point[1], duration=0.05)

    def scroll(self, amount):
        self.guard()
        self.gui.scroll(amount)


def executable(hwnd):
    user = ctypes.windll.user32
    kernel = ctypes.windll.kernel32
    kernel.OpenProcess.restype = wintypes.HANDLE
    kernel.QueryFullProcessImageNameW.argtypes = [wintypes.HANDLE, wintypes.DWORD, wintypes.LPWSTR, ctypes.POINTER(wintypes.DWORD)]
    kernel.CloseHandle.argtypes = [wintypes.HANDLE]
    pid = wintypes.DWORD()
    user.GetWindowThreadProcessId(wintypes.HWND(hwnd), ctypes.byref(pid))
    handle = kernel.OpenProcess(0x1000, False, pid.value)
    if not handle:
        return ''
    try:
        buffer = ctypes.create_unicode_buffer(32768)
        size = wintypes.DWORD(len(buffer))
        if kernel.QueryFullProcessImageNameW(handle, 0, buffer, ctypes.byref(size)):
            return os.path.basename(buffer.value)
        return ''
    finally:
        kernel.CloseHandle(handle)


def windows():
    result = []
    user = ctypes.windll.user32
    callback_type = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    def visit(hwnd, _):
        handle = wintypes.HWND(hwnd)
        if not user.IsWindowVisible(handle):
            return True
        length = user.GetWindowTextLengthW(handle)
        if not length:
            return True
        title = ctypes.create_unicode_buffer(length + 1)
        user.GetWindowTextW(handle, title, length + 1)
        rect = wintypes.RECT()
        user.GetClientRect(handle, ctypes.byref(rect))
        if rect.right < 500 or rect.bottom < 300:
            return True
        pid = wintypes.DWORD()
        user.GetWindowThreadProcessId(handle, ctypes.byref(pid))
        if pid.value != os.getpid():
            result.append((hwnd, title.value, executable(hwnd)))
        return True
    callback = callback_type(visit)
    user.EnumWindows(callback, 0)
    return result
