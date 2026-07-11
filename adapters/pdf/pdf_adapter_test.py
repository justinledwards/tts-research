from __future__ import annotations

import shutil
import subprocess
import unittest
from pathlib import Path
from unittest.mock import patch

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
                "contractFixtureIds": ["pdf-fixture.content-ir.v1"],
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

    def test_emits_pdf_contract_fit_report_without_best_in_class_claims(self):
        result = self.emit("fixtures/pdf/tagged_fixture.pdf")
        report = result["contractFitReport"]

        self.assertEqual(report["schemaVersion"], "adapter-contract-fit-report.v1")
        self.assertEqual(report["adapter"]["id"], "pdf")
        self.assertEqual(report["adapter"]["sourceKind"], "pdf")
        self.assertEqual(report["adapter"]["supportTier"], "lower-tier")
        self.assertEqual(report["status"], "lower_tier_with_gaps")
        self.assertEqual(report["evidence"]["fixtureIds"], ["pdf-fixture.content-ir.v1"])
        self.assertEqual(report["evidence"]["sourceNames"], ["tagged_fixture.pdf"])
        self.assertIn("best_in_class_pdf", report["nonClaims"])
        self.assertIn("exact_word_sync_ready", report["nonClaims"])
        self.assertIn("pdf_reading_order_degraded", {gap["id"] for gap in report["gaps"]})
        self.assertIn("no_best_in_class_claim", {warning["code"] for warning in report["warnings"]})
        self.assertIn("content_ir_v1_output", {feature["id"] for feature in report["supportedFeatures"]})
        self.assertEqual(result["metadata"]["contractFitReport"], report)
        self.assertEqual(result["diagnostics"]["contractFitReport"], report)

    def test_classifies_obvious_text_layer_headings_from_metrics(self):
        result = self.emit("fixtures/pdf/heading_metrics_fixture.pdf")
        nodes = result["document"]["nodes"]

        self.assertEqual(nodes[0]["kind"], "heading")
        self.assertEqual(nodes[1]["kind"], "subheading")
        self.assertEqual(nodes[2]["kind"], "body")
        self.assertEqual(nodes[3]["kind"], "body")
        self.assertEqual(nodes[0]["speech"]["policyHint"]["emphasis"], "heading")
        self.assertEqual(nodes[1]["speech"]["policyHint"]["emphasis"], "subheading")

    def test_uses_fixture_ocr_for_scanned_pdf(self):
        fixture_ocr = (ROOT / "fixtures/pdf/scanned_fixture.ocr.txt").read_text(encoding="utf-8")
        with patch(
            "adapters.pdf.ocr_with_ocrmypdf_or_tesseract._fixture_text",
            return_value=fixture_ocr,
        ):
            result = self.emit("fixtures/pdf/scanned_fixture.pdf")
        self.assertEqual(result["metadata"]["supportTier"], "C")
        self.assertEqual(result["document"]["nodes"][0]["provenance"]["locator"]["type"], "ocr")
        report = result["contractFitReport"]
        self.assertEqual(report["adapter"]["sourceKind"], "ocr")
        self.assertEqual(report["adapter"]["extractionPath"], "ocr")
        self.assertIn("best_in_class_ocr", report["nonClaims"])
        self.assertIn("ocr_text_confidence_degraded", {gap["id"] for gap in report["gaps"]})
        self.assertIn("ocr_lower_tier_contract_fit", {warning["code"] for warning in report["warnings"]})

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
                "contractFixtureIds": ["ocr-image-set.content-ir.v1"],
            }
        )
        self.assertEqual(result["metadata"]["supportTier"], "D")
        text = "\n".join(node["speechText"] for node in result["document"]["nodes"])
        self.assertLess(text.index("first image page"), text.index("second image page"))
        report = result["contractFitReport"]
        self.assertEqual(report["adapter"]["sourceKind"], "ocr")
        self.assertEqual(report["evidence"]["fixtureIds"], ["ocr-image-set.content-ir.v1"])
        self.assertEqual(report["evidence"]["sourceNames"], ["image-batch"])
        self.assertIn("best_in_class_ocr", report["nonClaims"])

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
