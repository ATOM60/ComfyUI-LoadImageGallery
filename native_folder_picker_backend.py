"""Native folder picker for the input and output galleries.

On Windows this is Explorer's own "Select folder" dialog (IFileOpenDialog with
FOS_PICKFOLDERS), called through ctypes in the ComfyUI process, so no
PowerShell start-up or compilation is involved. Compared with the WinForms
FolderBrowserDialog it replaces:

- it follows the system light/dark theme;
- the dialog thread is per-monitor DPI aware, so it is sharp on 4K screens;
- each gallery has its own client GUID, so Windows remembers that gallery's
  last folder and the dialog's size and position;
- it opens in the gallery's current folder when that is a specific folder,
  otherwise in the remembered one.

Anywhere else, or if COM fails, the previous picker is used.
"""
import ctypes
import os
import threading
import time
import uuid

from . import image_gallery_core as core


_FALLBACK_PICK_FOLDER = core._pick_folder_native

# Windows keeps the last folder, size and position per client GUID.
_CLIENT_GUIDS = {
    "input": "8f0b6c52-3e5d-4c1b-9a37-6a1d2b7e4c01",
    "output": "8f0b6c52-3e5d-4c1b-9a37-6a1d2b7e4c02",
}
_DEFAULT_TITLES = {"input": "Select image folder", "output": "Select video folder"}

_lock = threading.Lock()
_open_thread_id = 0


if os.name == "nt":
    from ctypes import wintypes

    class _GUID(ctypes.Structure):
        _fields_ = [
            ("Data1", wintypes.DWORD),
            ("Data2", wintypes.WORD),
            ("Data3", wintypes.WORD),
            ("Data4", ctypes.c_ubyte * 8),
        ]

    def _guid(text):
        return _GUID.from_buffer_copy(uuid.UUID(text).bytes_le)

    _HRESULT = ctypes.c_long
    _CLSID_FILE_OPEN_DIALOG = _guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")
    _IID_FILE_OPEN_DIALOG = _guid("D57C7288-D4AD-4768-BE02-9D969532D960")
    _IID_SHELL_ITEM = _guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")
    _COINIT_APARTMENTTHREADED = 0x2
    _COINIT_DISABLE_OLE1DDE = 0x4
    _CLSCTX_INPROC_SERVER = 0x1
    _FOS_NOCHANGEDIR = 0x8
    _FOS_PICKFOLDERS = 0x20
    _FOS_FORCEFILESYSTEM = 0x40
    _FOS_PATHMUSTEXIST = 0x800
    _SIGDN_FILESYSPATH = 0x80058000
    _ERROR_CANCELLED = 0x800704C7 - 0x100000000   # HRESULT_FROM_WIN32(ERROR_CANCELLED)
    _DPI_PER_MONITOR_AWARE_V2 = -4

    # Private library instances: argtypes set here do not leak into
    # ctypes.windll, which other custom nodes share.
    _ole32 = ctypes.WinDLL("ole32")
    _shell32 = ctypes.WinDLL("shell32")
    _user32 = ctypes.WinDLL("user32")
    _kernel32 = ctypes.WinDLL("kernel32")

    _ole32.CoInitializeEx.argtypes = [ctypes.c_void_p, wintypes.DWORD]
    _ole32.CoInitializeEx.restype = _HRESULT
    _ole32.CoUninitialize.argtypes = []
    _ole32.CoUninitialize.restype = None
    _ole32.CoCreateInstance.argtypes = [ctypes.POINTER(_GUID), ctypes.c_void_p, wintypes.DWORD,
                                        ctypes.POINTER(_GUID), ctypes.POINTER(ctypes.c_void_p)]
    _ole32.CoCreateInstance.restype = _HRESULT
    _ole32.CoTaskMemFree.argtypes = [ctypes.c_void_p]
    _ole32.CoTaskMemFree.restype = None
    _shell32.SHCreateItemFromParsingName.argtypes = [wintypes.LPCWSTR, ctypes.c_void_p,
                                                     ctypes.POINTER(_GUID), ctypes.POINTER(ctypes.c_void_p)]
    _shell32.SHCreateItemFromParsingName.restype = _HRESULT
    _kernel32.GetCurrentThreadId.argtypes = []
    _kernel32.GetCurrentThreadId.restype = wintypes.DWORD
    _WNDENUMPROC = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)
    _user32.EnumThreadWindows.argtypes = [wintypes.DWORD, _WNDENUMPROC, wintypes.LPARAM]
    _user32.EnumThreadWindows.restype = wintypes.BOOL
    _user32.IsWindowVisible.argtypes = [wintypes.HWND]
    _user32.IsWindowVisible.restype = wintypes.BOOL
    _user32.GetClassNameW.argtypes = [wintypes.HWND, wintypes.LPWSTR, ctypes.c_int]
    _user32.GetClassNameW.restype = ctypes.c_int
    _user32.GetForegroundWindow.argtypes = []
    _user32.GetForegroundWindow.restype = wintypes.HWND
    _user32.GetWindowThreadProcessId.argtypes = [wintypes.HWND, ctypes.c_void_p]
    _user32.GetWindowThreadProcessId.restype = wintypes.DWORD
    _user32.AttachThreadInput.argtypes = [wintypes.DWORD, wintypes.DWORD, wintypes.BOOL]
    _user32.AttachThreadInput.restype = wintypes.BOOL
    _user32.SetForegroundWindow.argtypes = [wintypes.HWND]
    _user32.SetForegroundWindow.restype = wintypes.BOOL
    _user32.BringWindowToTop.argtypes = [wintypes.HWND]
    _user32.BringWindowToTop.restype = wintypes.BOOL
    _user32.ShowWindow.argtypes = [wintypes.HWND, ctypes.c_int]
    _user32.ShowWindow.restype = wintypes.BOOL
    _user32.SetWindowPos.argtypes = [wintypes.HWND, wintypes.HWND, ctypes.c_int, ctypes.c_int,
                                     ctypes.c_int, ctypes.c_int, wintypes.UINT]
    _user32.SetWindowPos.restype = wintypes.BOOL

    class _FLASHWINFO(ctypes.Structure):
        _fields_ = [("cbSize", wintypes.UINT), ("hwnd", wintypes.HWND), ("dwFlags", wintypes.DWORD),
                    ("uCount", wintypes.UINT), ("dwTimeout", wintypes.DWORD)]

    _user32.FlashWindowEx.argtypes = [ctypes.POINTER(_FLASHWINFO)]
    _user32.FlashWindowEx.restype = wintypes.BOOL
    try:
        _user32.SetThreadDpiAwarenessContext.argtypes = [ctypes.c_void_p]
        _user32.SetThreadDpiAwarenessContext.restype = ctypes.c_void_p
    except AttributeError:   # before Windows 10 1607
        pass

    def _vtable_function(pointer, index, restype, *argtypes):
        vtable = ctypes.cast(pointer, ctypes.POINTER(ctypes.POINTER(ctypes.c_void_p))).contents
        return ctypes.WINFUNCTYPE(restype, ctypes.c_void_p, *argtypes)(vtable[index])

    def _call(pointer, index, argtypes, *args):
        return _vtable_function(pointer, index, _HRESULT, *argtypes)(pointer, *args)

    def _release(pointer):
        if pointer:
            _vtable_function(pointer, 2, ctypes.c_ulong)(pointer)

    def _check(hr, what):
        if hr < 0:
            raise OSError(f"{what} failed (0x{hr & 0xFFFFFFFF:08X})")

    def _shell_item(path):
        item = ctypes.c_void_p()
        hr = _shell32.SHCreateItemFromParsingName(path, None, ctypes.byref(_IID_SHELL_ITEM), ctypes.byref(item))
        return item if hr >= 0 and item else None

    _theme_ready = False

    def _allow_dark_theme():
        # SetPreferredAppMode(AllowDark) and FlushMenuThemes: uxtheme
        # ordinals 135/136 since Windows 10 1903. They let this process's
        # windows, the dialog included, follow the system dark theme. There
        # is no documented API for this.
        global _theme_ready
        if _theme_ready:
            return
        _theme_ready = True
        try:
            uxtheme = ctypes.WinDLL("uxtheme")
            set_mode = uxtheme[135]
            set_mode.argtypes = [ctypes.c_int]
            set_mode.restype = ctypes.c_int
            set_mode(1)
            flush = uxtheme[136]
            flush.argtypes = []
            flush.restype = None
            flush()
        except Exception:
            pass

    def _dialog_window(thread_id):
        found = []

        def visit(hwnd, _):
            name = ctypes.create_unicode_buffer(64)
            _user32.GetClassNameW(hwnd, name, 64)
            if name.value == "#32770" and _user32.IsWindowVisible(hwnd):
                found.append(hwnd)
                return False
            return True

        _user32.EnumThreadWindows(thread_id, _WNDENUMPROC(visit), 0)
        return found[0] if found else None

    def _bring_to_front(thread_id, timeout=3.0):
        # ComfyUI is a background process, so Windows would open the dialog
        # behind the browser. Sharing input with the foreground window's
        # thread for a moment lets it take the foreground, as the user asked.
        deadline = time.monotonic() + timeout
        while time.monotonic() < deadline:
            hwnd = _dialog_window(thread_id)
            if hwnd:
                foreground = _user32.GetForegroundWindow()
                if foreground == hwnd:
                    return True
                current = _kernel32.GetCurrentThreadId()
                other = _user32.GetWindowThreadProcessId(foreground, None) if foreground else 0
                attached = bool(other and other != current and _user32.AttachThreadInput(current, other, True))
                try:
                    _user32.ShowWindow(hwnd, 9)   # SW_RESTORE
                    _user32.BringWindowToTop(hwnd)
                    _user32.SetForegroundWindow(hwnd)
                finally:
                    if attached:
                        _user32.AttachThreadInput(current, other, False)
                if _user32.GetForegroundWindow() != hwnd:
                    # Activation refused: still lift it above the other
                    # windows (without focus) and flash its taskbar button.
                    flags = 0x0001 | 0x0002 | 0x0010 | 0x0040   # NOSIZE | NOMOVE | NOACTIVATE | SHOWWINDOW
                    _user32.SetWindowPos(hwnd, wintypes.HWND(-1), 0, 0, 0, 0, flags)   # HWND_TOPMOST
                    _user32.SetWindowPos(hwnd, wintypes.HWND(-2), 0, 0, 0, 0, flags)   # HWND_NOTOPMOST
                    flash = _FLASHWINFO(ctypes.sizeof(_FLASHWINFO), hwnd, 0x3 | 0xC, 0, 0)   # ALL | TIMERNOFG
                    _user32.FlashWindowEx(ctypes.byref(flash))
                return True
            time.sleep(0.05)
        return False

    def _run_dialog(kind, initial, default, title, outcome):
        global _open_thread_id
        initialized = _ole32.CoInitializeEx(None, _COINIT_APARTMENTTHREADED | _COINIT_DISABLE_OLE1DDE) >= 0
        dialog = ctypes.c_void_p()
        try:
            try:
                _user32.SetThreadDpiAwarenessContext(ctypes.c_void_p(_DPI_PER_MONITOR_AWARE_V2))
            except AttributeError:
                pass
            _allow_dark_theme()
            _check(_ole32.CoCreateInstance(ctypes.byref(_CLSID_FILE_OPEN_DIALOG), None, _CLSCTX_INPROC_SERVER,
                                           ctypes.byref(_IID_FILE_OPEN_DIALOG), ctypes.byref(dialog)),
                   "Creating the folder dialog")
            options = wintypes.DWORD()
            _check(_call(dialog, 10, [ctypes.POINTER(wintypes.DWORD)], ctypes.byref(options)), "GetOptions")
            options.value |= _FOS_PICKFOLDERS | _FOS_FORCEFILESYSTEM | _FOS_PATHMUSTEXIST | _FOS_NOCHANGEDIR
            _check(_call(dialog, 9, [wintypes.DWORD], options.value), "SetOptions")
            client = _guid(_CLIENT_GUIDS.get(kind, _CLIENT_GUIDS["input"]))
            _call(dialog, 24, [ctypes.POINTER(_GUID)], ctypes.byref(client))   # SetClientGuid
            _call(dialog, 17, [wintypes.LPCWSTR], title)                       # SetTitle
            for index, path in ((11, default), (12, initial)):                  # SetDefaultFolder, SetFolder
                item = _shell_item(path) if path else None
                if item:
                    _call(dialog, index, [ctypes.c_void_p], item)
                    _release(item)
            _open_thread_id = _kernel32.GetCurrentThreadId()
            threading.Thread(target=_bring_to_front, args=(_open_thread_id,), daemon=True).start()
            hr = _call(dialog, 3, [wintypes.HWND], None)                       # Show
            if hr == _ERROR_CANCELLED:
                outcome["path"] = ""
                return
            _check(hr, "Showing the folder dialog")
            item = ctypes.c_void_p()
            _check(_call(dialog, 20, [ctypes.POINTER(ctypes.c_void_p)], ctypes.byref(item)), "GetResult")
            try:
                name = ctypes.c_void_p()
                _check(_call(item, 5, [wintypes.DWORD, ctypes.POINTER(ctypes.c_void_p)],
                             _SIGDN_FILESYSPATH, ctypes.byref(name)), "GetDisplayName")
                try:
                    outcome["path"] = ctypes.wstring_at(name.value)
                finally:
                    _ole32.CoTaskMemFree(name)
            finally:
                _release(item)
        except Exception as exc:
            outcome["error"] = exc
        finally:
            _open_thread_id = 0
            _release(dialog)
            if initialized:
                _ole32.CoUninitialize()


def _existing_folder(path):
    try:
        return os.path.abspath(path) if path and os.path.isdir(path) else None
    except Exception:
        return None


def pick_folder(initial=None, default=None, kind="input", title=None):
    """Returns the chosen folder, "" when cancelled (or when a dialog is
    already open, which is brought to the front instead)."""
    if os.name != "nt":
        return _FALLBACK_PICK_FOLDER()
    if not _lock.acquire(blocking=False):
        if _open_thread_id:
            _bring_to_front(_open_thread_id, timeout=0.5)
        return ""
    try:
        outcome = {}
        # COM needs a single-threaded apartment; a dedicated thread keeps that
        # state out of the server's worker threads.
        worker = threading.Thread(
            target=_run_dialog,
            args=(kind, _existing_folder(initial), _existing_folder(default),
                  str(title or _DEFAULT_TITLES.get(kind, "Select folder"))[:200], outcome),
            name="ImageGalleryFolderDialog",
            daemon=True,
        )
        worker.start()
        worker.join()
    finally:
        _lock.release()
    if "error" in outcome:
        print(f"[ImageGallery] Explorer folder dialog failed, using the fallback: {outcome['error']}")
        return _FALLBACK_PICK_FOLDER()
    return outcome.get("path", "")


# Both pick-folder routes resolve image_gallery_core._pick_folder_native at
# request time.
core._pick_folder_native = pick_folder
