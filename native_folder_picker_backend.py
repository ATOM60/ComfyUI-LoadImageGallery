import os
import subprocess

from . import image_gallery_core as core


_ORIGINAL_PICK_FOLDER = core._pick_folder_native


def _pick_folder_native_modern() -> str:
    if os.name != "nt":
        return _ORIGINAL_PICK_FOLDER()

    # Use the actual Windows IFileOpenDialog in FOS_PICKFOLDERS mode. This keeps
    # the normal Explorer-style common dialog while making folders selectable
    # directly instead of relying on the OpenFileDialog "fake filename" trick.
    script = r'''
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

[ComImport]
[Guid("DC1C5A9C-E88A-4DDE-A5A1-60F82A20AEF7")]
internal class FileOpenDialogRCW {}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("42F85136-DB7E-439C-85F1-E4075D135FC8")]
internal interface IFileDialog {
    [PreserveSig] int Show(IntPtr parent);
    void SetFileTypes(uint cFileTypes, IntPtr rgFilterSpec);
    void SetFileTypeIndex(uint iFileType);
    void GetFileTypeIndex(out uint piFileType);
    void Advise(IntPtr pfde, out uint pdwCookie);
    void Unadvise(uint dwCookie);
    void SetOptions(uint fos);
    void GetOptions(out uint pfos);
    void SetDefaultFolder(IShellItem psi);
    void SetFolder(IShellItem psi);
    void GetFolder(out IShellItem ppsi);
    void GetCurrentSelection(out IShellItem ppsi);
    void SetFileName([MarshalAs(UnmanagedType.LPWStr)] string pszName);
    void GetFileName([MarshalAs(UnmanagedType.LPWStr)] out string pszName);
    void SetTitle([MarshalAs(UnmanagedType.LPWStr)] string pszTitle);
    void SetOkButtonLabel([MarshalAs(UnmanagedType.LPWStr)] string pszText);
    void SetFileNameLabel([MarshalAs(UnmanagedType.LPWStr)] string pszLabel);
    void GetResult(out IShellItem ppsi);
    void AddPlace(IShellItem psi, int fdap);
    void SetDefaultExtension([MarshalAs(UnmanagedType.LPWStr)] string pszDefaultExtension);
    void Close(int hr);
    void SetClientGuid(ref Guid guid);
    void ClearClientData();
    void SetFilter(IntPtr pFilter);
}

[ComImport]
[InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
[Guid("43826D1E-E718-42EE-BC55-A1E261C37BFE")]
internal interface IShellItem {
    void BindToHandler(IntPtr pbc, ref Guid bhid, ref Guid riid, out IntPtr ppv);
    void GetParent(out IShellItem ppsi);
    void GetDisplayName(uint sigdnName, out IntPtr ppszName);
    void GetAttributes(uint sfgaoMask, out uint psfgaoAttribs);
    void Compare(IShellItem psi, uint hint, out int piOrder);
}

public static class CIGFolderPicker {
    const uint FOS_PICKFOLDERS = 0x00000020;
    const uint FOS_FORCEFILESYSTEM = 0x00000040;
    const uint FOS_NOCHANGEDIR = 0x00000008;
    const uint FOS_PATHMUSTEXIST = 0x00000800;
    const uint SIGDN_FILESYSPATH = 0x80058000;

    [DllImport("user32.dll")]
    static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);

    public static string Pick() {
        try { SetThreadDpiAwarenessContext(new IntPtr(-4)); } catch {}

        IFileDialog dialog = null;
        IShellItem item = null;
        IntPtr pathPtr = IntPtr.Zero;
        try {
            dialog = (IFileDialog)new FileOpenDialogRCW();
            uint options;
            dialog.GetOptions(out options);
            dialog.SetOptions(options | FOS_PICKFOLDERS | FOS_FORCEFILESYSTEM | FOS_NOCHANGEDIR | FOS_PATHMUSTEXIST);
            dialog.SetTitle("Select folder");
            dialog.SetOkButtonLabel("Select folder");

            int hr = dialog.Show(IntPtr.Zero);
            if (hr != 0) return String.Empty;

            dialog.GetResult(out item);
            item.GetDisplayName(SIGDN_FILESYSPATH, out pathPtr);
            return Marshal.PtrToStringUni(pathPtr) ?? String.Empty;
        }
        finally {
            if (pathPtr != IntPtr.Zero) Marshal.FreeCoTaskMem(pathPtr);
            if (item != null && Marshal.IsComObject(item)) Marshal.ReleaseComObject(item);
            if (dialog != null && Marshal.IsComObject(dialog)) Marshal.ReleaseComObject(dialog);
        }
    }
}
"@
[Console]::Write([CIGFolderPicker]::Pick())
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


# Both Input Gallery and Output Gallery use the shared /image-gallery/pick-folder
# route, so they get exactly the same working Explorer folder picker.
core._pick_folder_native = _pick_folder_native_modern
