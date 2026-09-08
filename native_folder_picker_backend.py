import os
import subprocess

from . import image_gallery_core as core


_ORIGINAL_PICK_FOLDER = core._pick_folder_native


def _pick_folder_native_modern() -> str:
    if os.name != "nt":
        return _ORIGINAL_PICK_FOLDER()

    # Use the modern Windows folder picker (Explorer-style common dialog) and
    # opt the picker thread into per-monitor-v2 DPI awareness so the dialog is
    # rendered natively on high-DPI displays instead of being bitmap-scaled.
    script = r'''
Add-Type -AssemblyName System.Windows.Forms
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public static class CIGDpiAwareness {
    [DllImport("user32.dll")]
    public static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
}
"@
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { [CIGDpiAwareness]::SetThreadDpiAwarenessContext([IntPtr](-4)) | Out-Null } catch {}
[System.Windows.Forms.Application]::EnableVisualStyles()
$d = New-Object System.Windows.Forms.FolderBrowserDialog
$d.Description = "Select folder"
$d.ShowNewFolderButton = $true
try { $d.AutoUpgradeEnabled = $true } catch {}
try { $d.UseDescriptionForTitle = $true } catch {}
if ($d.ShowDialog() -eq [System.Windows.Forms.DialogResult]::OK) {
    [Console]::Write($d.SelectedPath)
}
'''
    result = subprocess.run(
        [
            "powershell.exe",
            "-NoProfile",
            "-STA",
            "-WindowStyle",
            "Hidden",
            "-Command",
            script,
        ],
        capture_output=True,
        text=True,
        encoding="utf-8",
        errors="replace",
        creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
    )
    if result.returncode != 0:
        raise RuntimeError(result.stderr.strip() or "Folder picker failed")
    return result.stdout.strip()


# The input and output galleries both call /image-gallery/pick-folder, whose
# route resolves this function from image_gallery_core at request time.
core._pick_folder_native = _pick_folder_native_modern
