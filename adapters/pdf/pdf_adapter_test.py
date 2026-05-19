from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path

from .orchestrator import emit_adapter


ROOT = Path(__file__).resolve().parents[2]


class PDFAdapterTests(unittest.TestCase):
    def emit(self, fixture: str, **options):
        path = ROOT / fixture
        return emit_adapter(
            {
                "sourcePath": str(path),
                "sourceId": "fixture-source",
                "sourceName": path.name,
                "sourceType": "bookSource",
                "generatedAt": "2026-05-16T12:00:00Z",
                **options,
            }
        )

    def test_detects_tagged_pdf_tier(self):
        result = self.emit("fixtures/pdf/tagged_fixture.pdf")
        self.assertEqual(result["metadata"]["supportTier"], "A")
        self.assertIn("Tagged fixture opening", result["document"]["nodes"][0]["speechText"])

    def test_orders_multicolumn_pdf_blocks(self):
        result = self.emit("fixtures/pdf/born_digital_multicolumn.pdf")
        text = "\n".join(node["speechText"] for node in result["document"]["nodes"])
        self.assertLess(text.index("Left column starts"), text.index("Right column follows"))
        self.assertIn("reading_order_low_confidence", result["metadata"]["warnings"])

    def test_extracts_structured_tables(self):
        result = self.emit("fixtures/pdf/table_fixture.pdf", pdfTableMode="structured")
        kinds = [node["kind"] for node in result["document"]["nodes"]]
        self.assertIn("table", kinds)

    def test_uses_fixture_ocr_for_scanned_pdf(self):
        result = self.emit("fixtures/pdf/scanned_fixture.pdf")
        self.assertEqual(result["metadata"]["supportTier"], "C")
        self.assertEqual(result["document"]["nodes"][0]["provenance"]["locator"]["type"], "ocr")

    def test_uses_scholarly_fast_path_when_requested(self):
        result = self.emit("fixtures/pdf/scholarly_fixture.pdf", importProfile="scholarly")
        self.assertEqual(result["metadata"]["supportTier"], "E")
        self.assertIn("bibliography", [node["kind"] for node in result["document"]["nodes"]])

    def test_imports_ordered_image_batch(self):
        paths = [
            ROOT / "fixtures/images/page-001.png",
            ROOT / "fixtures/images/page-002.png",
        ]
        result = emit_adapter(
            {
                "sourcePaths": [str(path) for path in paths],
                "sourceId": "image-source",
                "sourceName": "image-batch",
                "sourceType": "bookSource",
                "generatedAt": "2026-05-16T12:00:00Z",
            }
        )
        self.assertEqual(result["metadata"]["supportTier"], "D")
        text = "\n".join(node["speechText"] for node in result["document"]["nodes"])
        self.assertLess(text.index("first image page"), text.index("second image page"))

    @unittest.skipUnless(shutil.which("tesseract"), "local Tesseract is unavailable")
    def test_tesseract_smoke_when_available(self):
        completed = subprocess.run(["tesseract", "--version"], check=False, capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)

    @unittest.skipUnless(shutil.which("ocrmypdf"), "local OCRmyPDF is unavailable")
    def test_ocrmypdf_smoke_when_available(self):
        completed = subprocess.run(["ocrmypdf", "--version"], check=False, capture_output=True, text=True)
        self.assertEqual(completed.returncode, 0, completed.stderr)


if __name__ == "__main__":
    unittest.main()
