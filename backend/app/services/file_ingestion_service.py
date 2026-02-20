from __future__ import annotations

from io import BytesIO

try:
    from pypdf import PdfReader
except Exception:  # pragma: no cover
    PdfReader = None

try:
    from docx import Document
except Exception:  # pragma: no cover
    Document = None

from app.services.ocr_service import extract_text_from_image


TEXT_MIME_PREFIXES = ("text/",)
IMAGE_MIME_PREFIXES = ("image/",)


def _decode_text(raw: bytes) -> str:
    for enc in ("utf-8", "utf-16", "latin-1"):
        try:
            return raw.decode(enc).strip()
        except Exception:
            continue
    return ""


def _read_pdf_text(raw: bytes) -> str:
    if PdfReader is None:
        return ""
    reader = PdfReader(BytesIO(raw))
    parts: list[str] = []
    for page in reader.pages:
        text = (page.extract_text() or "").strip()
        if text:
            parts.append(text)
    return "\n\n".join(parts).strip()


def _read_docx_text(raw: bytes) -> str:
    if Document is None:
        return ""

    doc = Document(BytesIO(raw))
    chunks = [(p.text or "").strip() for p in doc.paragraphs]
    return "\n".join([c for c in chunks if c]).strip()


async def extract_text_from_upload(
    raw: bytes,
    filename: str,
    content_type: str,
    lang: str,
) -> tuple[str, float, list[dict], list[str], str]:
    warnings: list[str] = []
    content_type = (content_type or "").lower()
    ext = filename.lower().rsplit(".", 1)[-1] if "." in filename else ""

    if content_type.startswith(IMAGE_MIME_PREFIXES) or ext in {"png", "jpg", "jpeg", "webp", "bmp", "tiff", "gif"}:
        text, conf, boxes = await extract_text_from_image(raw, lang)
        if not text:
            warnings.append("OCR extracted limited text from image.")
        return text, conf, boxes, warnings, "image"

    if content_type == "application/pdf" or ext == "pdf":
        pdf_text = _read_pdf_text(raw)
        if not pdf_text:
            warnings.append("PDF text extraction returned empty content. The PDF may be scanned-only.")
        return pdf_text, 0.0, [], warnings, "pdf"

    if content_type in {"application/vnd.openxmlformats-officedocument.wordprocessingml.document"} or ext == "docx":
        text = _read_docx_text(raw)
        if not text:
            warnings.append("DOCX extraction returned empty content.")
        return text, 0.0, [], warnings, "docx"

    if content_type.startswith(TEXT_MIME_PREFIXES) or ext in {"txt", "md", "csv", "rtf", "log", "json", "yaml", "yml", "xml"}:
        text = _decode_text(raw)
        if not text:
            warnings.append("Text file could not be decoded cleanly.")
        return text, 0.0, [], warnings, "text"

    fallback_text = _decode_text(raw)
    if fallback_text:
        warnings.append("Unknown file type parsed as plain text.")
        return fallback_text, 0.0, [], warnings, "unknown-text"

    warnings.append("Unsupported file type. Please upload image, PDF, DOCX, or text-like files.")
    return "", 0.0, [], warnings, "unsupported"
