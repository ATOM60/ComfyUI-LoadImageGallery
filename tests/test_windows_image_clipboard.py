"""Pure payload tests: run on Windows and Linux with Pillow installed."""
import io
import importlib.util
from pathlib import Path
import struct
import tempfile
import unittest

from PIL import Image

MODULE_PATH = Path(__file__).resolve().parents[1] / "windows_image_clipboard.py"
spec = importlib.util.spec_from_file_location("windows_image_clipboard", MODULE_PATH)
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class WindowsClipboardPayloadTests(unittest.TestCase):
    def test_file_bitmap_and_png_formats_are_present(self):
        with tempfile.TemporaryDirectory() as folder:
            path = Path(folder) / "test.png"
            im = Image.new("RGBA", (2, 2), (255, 0, 0, 128))
            im.putpixel((0, 0), (0, 255, 0, 64))
            im.save(path)
            formats, png = module._payloads(path)
            self.assertEqual(set(formats), {8, 15, 17})
            hdrop = formats[15]
            self.assertEqual(struct.unpack_from("<I", hdrop)[0], 20)
            self.assertTrue(hdrop[20:].decode("utf-16le").endswith("\0\0"))
            dib = formats[8]
            self.assertEqual(struct.unpack_from("<IiiHHII", dib), (40, 2, 2, 1, 32, 0, 16))
            v5 = formats[17]
            self.assertEqual(struct.unpack_from("<IiiHHII", v5), (124, 2, 2, 1, 32, 3, 16))
            self.assertEqual(struct.unpack_from("<4I", v5, 40),
                             (0x00FF0000, 0x0000FF00, 0x000000FF, 0xFF000000))
            self.assertEqual(v5[124+8:124+12], bytes((0, 255, 0, 64)))
            with Image.open(io.BytesIO(png)) as roundtrip:
                self.assertEqual(roundtrip.getpixel((0, 0)), (0, 255, 0, 64))

    def test_non_windows_does_not_touch_clipboard(self):
        import os
        if os.name != "nt":
            with self.assertRaises(OSError):
                module.copy_image_to_windows_clipboard("not-exists.png")


if __name__ == "__main__":
    unittest.main()
