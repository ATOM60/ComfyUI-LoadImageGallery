from .image_gallery_core import *
from . import output_video_gallery_backend  # noqa: F401


# Keep the stock LoadImage behavior and IMAGE/MASK outputs, but remove the
# frontend upload control. Images are chosen through the gallery UI instead.
class LoadImageGalleryNoUpload(LoadImageGallery):
    @classmethod
    def INPUT_TYPES(cls):
        data = super().INPUT_TYPES()
        spec = data.get("required", {}).get("image")
        if isinstance(spec, tuple) and len(spec) >= 2 and isinstance(spec[1], dict):
            options = dict(spec[1])
            options.pop("image_upload", None)
            data["required"]["image"] = (spec[0], options, *spec[2:])
        return data


NODE_CLASS_MAPPINGS["LoadImageGallery"] = LoadImageGalleryNoUpload
