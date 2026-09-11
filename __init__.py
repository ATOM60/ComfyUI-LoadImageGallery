from .image_gallery_core import *
from . import native_folder_picker_backend  # noqa: F401
from . import output_video_gallery_backend  # noqa: F401
from . import output_video_folder_backend  # noqa: F401
from . import output_video_cpu_backend  # noqa: F401

# Keep the internal node id stable for existing workflows; change only the user-facing name.
NODE_DISPLAY_NAME_MAPPINGS["LoadImageGallery"] = "Liber Load Image from Gallery and Output Gallery"
