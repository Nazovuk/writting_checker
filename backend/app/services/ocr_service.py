from __future__ import annotations

from io import BytesIO
from PIL import Image, ImageOps
try:
    import pytesseract
except Exception:  # pragma: no cover
    pytesseract = None


async def extract_text_from_image(raw: bytes, lang: str) -> tuple[str, float, list[dict]]:
    if pytesseract is None:
        return "", 0.0, []

    image = Image.open(BytesIO(raw))
    image = ImageOps.exif_transpose(image).convert("RGB")

    tess_lang_map = {"en": "eng", "tr": "tur", "bg": "bul"}
    tess_lang = tess_lang_map.get(lang, "eng")

    data = pytesseract.image_to_data(image, lang=tess_lang, output_type=pytesseract.Output.DICT)
    tokens = []
    boxes = []
    confidence_values = []

    for i, token in enumerate(data.get("text", [])):
        token = (token or "").strip()
        conf_raw = data.get("conf", ["-1"])[i]
        try:
            conf = float(conf_raw)
        except Exception:
            conf = -1

        if token:
            tokens.append(token)
            if conf >= 0:
                confidence_values.append(conf)
            boxes.append(
                {
                    "text": token,
                    "left": int(data["left"][i]),
                    "top": int(data["top"][i]),
                    "width": int(data["width"][i]),
                    "height": int(data["height"][i]),
                    "confidence": conf,
                }
            )

    full_text = " ".join(tokens).strip()
    avg_conf = sum(confidence_values) / len(confidence_values) if confidence_values else 0.0
    return full_text, round(avg_conf / 100.0, 3), boxes
