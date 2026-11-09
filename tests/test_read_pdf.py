import importlib.util
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import tomllib
import unittest
from unittest.mock import patch

import pymupdf


REPO = Path(__file__).resolve().parents[1]
SCRIPT = REPO / "templates/read-pdf/scripts/read_pdf.py"


class ReadPDFTests(unittest.TestCase):
    def setUp(self):
        self.scratch = tempfile.TemporaryDirectory(prefix="paper workbench test-")
        self.addCleanup(self.scratch.cleanup)
        self.root = Path(self.scratch.name)
        self.pdf = self.root / "sample.pdf"
        self.env = dict(os.environ, TMPDIR=str(self.root), PYTHONDONTWRITEBYTECODE="1")
        with pymupdf.open() as doc:
            for text in ("Version A", "Table 1. Result evidence", "Conclusion evidence"):
                doc.new_page().insert_text((72, 72), text)
            doc.set_toc([[1, "Introduction", 1], [1, "Results", 2]])
            doc.save(self.pdf)

    def run_reader(self, *args, success=True):
        result = subprocess.run(
            [sys.executable, str(SCRIPT), str(self.pdf), "--no-prune", *map(str, args)],
            capture_output=True, text=True, env=self.env, timeout=30,
        )
        if success:
            self.assertEqual(result.returncode, 0, result.stderr)
        else:
            self.assertNotEqual(result.returncode, 0)
        return result

    def export_path(self):
        self.run_reader("--all")
        return next(self.root.glob("codex-read-pdf-tmp-*/sample.txt"))

    def test_selected_text_search_toc_and_page_records(self):
        selected = self.run_reader("--pages", "1,3").stdout
        self.assertIn("Version A", selected)
        self.assertIn("Conclusion evidence", selected)
        self.assertNotIn("Result evidence", selected)
        self.assertIn("Result evidence", self.run_reader("--search", "RESULT", "--ignore-case").stdout)
        self.assertIn("p.2 Results", self.run_reader("--toc").stdout)
        exported = self.export_path()
        records = [json.loads(line) for line in exported.with_suffix(".pages.jsonl").read_text().splitlines()]
        self.assertEqual([item["page"] for item in records], [1, 2, 3])
        self.assertEqual([item["mode"] for item in records], ["text"] * 3)
        self.assertIn("Using cached full text:", self.run_reader("--all").stdout)

    def test_missing_corrupt_and_partial_exports_are_rebuilt(self):
        exported = self.export_path()
        for suffix in (".pages.jsonl", ".manifest.json", ".txt"):
            for damage in ("missing", "corrupt"):
                with self.subTest(suffix=suffix, damage=damage):
                    artifact = exported.with_suffix(suffix)
                    if damage == "missing":
                        artifact.unlink()
                    else:
                        artifact.write_text("partial data", encoding="utf-8")
                    self.assertIn("Wrote full text to:", self.run_reader("--all").stdout)
                    self.assertIn("Version A", exported.read_text())
                    manifest = json.loads(exported.with_suffix(".manifest.json").read_text())
                    self.assertEqual(manifest["pages_written"], 3)
                    self.assertEqual(len(exported.with_suffix(".pages.jsonl").read_text().splitlines()), 3)

    def test_malformed_manifest_structure_and_ocr_failure_are_not_reused(self):
        exported = self.export_path()
        path = exported.with_suffix(".manifest.json")
        manifest = json.loads(path.read_text())
        manifest["mode_counts"] = []
        path.write_text(json.dumps(manifest))
        self.assertIn("Wrote full text to:", self.run_reader("--all").stdout)
        for _ in range(2):
            result = self.run_reader("--all", "--ocr", "force", "--tessdata", self.root / "missing-tessdata")
            self.assertIn("OCR failed", result.stderr)
            self.assertIn("Wrote full text to:", result.stdout)

    def test_runtime_version_is_part_of_cache_identity(self):
        spec = importlib.util.spec_from_file_location("paper_workbench_reader_version_test", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        original = module.build_cache_key(self.pdf, "render", {"render_dpi": 200})
        with patch.object(module, "PYMUPDF_VERSION", "different-runtime"):
            self.assertNotEqual(original, module.build_cache_key(self.pdf, "render", {"render_dpi": 200}))

    def test_changed_content_invalidates_cache_even_with_same_size_and_mtime(self):
        self.export_path()
        original = self.pdf.read_bytes()
        changed = original.replace(b"56657273696f6e2041", b"56657273696f6e2042")
        self.assertNotEqual(original, changed)
        stat = self.pdf.stat()
        self.pdf.write_bytes(changed)
        os.utime(self.pdf, ns=(stat.st_atime_ns, stat.st_mtime_ns))
        self.assertIn("Wrote full text to:", self.run_reader("--all").stdout)
        exports = list(self.root.glob("codex-read-pdf-tmp-*/sample.txt"))
        self.assertEqual(len(exports), 2)
        self.assertTrue(any("Version B" in item.read_text() for item in exports))

    def test_explicit_render_is_regenerated_for_current_pdf_and_dpi(self):
        output = self.root / "page.png"
        self.run_reader("--render-page", 1, "--output", output, "--render-dpi", 72)
        first = output.read_bytes()
        first_width = pymupdf.Pixmap(output).width
        changed = self.pdf.read_bytes().replace(b"56657273696f6e2041", b"56657273696f6e2042")
        self.pdf.write_bytes(changed)
        result = self.run_reader("--render-page", 1, "--output", output, "--render-dpi", 144)
        self.assertIn("Wrote render to:", result.stdout)
        self.assertNotEqual(first, output.read_bytes())
        self.assertEqual(pymupdf.Pixmap(output).width, first_width * 2)

    def test_render_cache_validates_png_and_manifest(self):
        self.run_reader("--render-page", 2)
        output = next(self.root.glob("codex-read-pdf-tmp-*/renders/*.png"))
        self.assertIn("Using cached render:", self.run_reader("--render-page", 2).stdout)
        output.write_bytes(b"broken png")
        self.assertIn("Wrote render to:", self.run_reader("--render-page", 2).stdout)
        self.assertGreater(pymupdf.Pixmap(output).width, 0)
        output.with_suffix(".manifest.json").unlink()
        self.assertIn("Wrote render to:", self.run_reader("--render-page", 2).stdout)

    def test_keep_temp_does_not_reuse_prunable_output(self):
        self.export_path()
        result = self.run_reader("--all", "--keep-temp")
        self.assertIn("codex-read-pdf-keep-", result.stdout)
        self.assertEqual(len(list(self.root.glob("codex-read-pdf-keep-*/sample.txt"))), 1)

    def test_invalid_pages_and_source_overwrite_fail_without_damaging_pdf(self):
        before = self.pdf.read_bytes()
        for args in (("--page", 0), ("--render-page", 4), ("--pages", "1-999999999"), ("--render-dpi", 0), ("--all", "--output", self.pdf)):
            with self.subTest(args=args):
                result = self.run_reader(*args, success=False)
                self.assertNotIn("Traceback", result.stderr)
                self.assertEqual(self.pdf.read_bytes(), before)

    def test_interrupted_export_preserves_previous_complete_outputs(self):
        output = self.root / "export.txt"
        self.run_reader("--all", "--output", output)
        artifacts = [output, output.with_suffix(".pages.jsonl"), output.with_suffix(".manifest.json")]
        before = [item.read_bytes() for item in artifacts]
        spec = importlib.util.spec_from_file_location("paper_workbench_reader_test", SCRIPT)
        module = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(module)
        args = module.build_parser().parse_args([str(self.pdf), "--all", "--output", str(output)])
        with pymupdf.open(self.pdf) as doc:
            reader = module.PDFReader(doc, args)
            original = reader.extract_page_text
            def fail_on_second_page(page):
                if page == 2:
                    raise RuntimeError("simulated extraction failure")
                return original(page)
            with patch.object(reader, "extract_page_text", side_effect=fail_on_second_page):
                with self.assertRaisesRegex(RuntimeError, "simulated extraction failure"):
                    module.dump_all_text(reader, self.pdf, output)
        self.assertEqual([item.read_bytes() for item in artifacts], before)
        self.assertEqual(list(self.root.glob(".*.tmp")), [])

    @unittest.skipUnless(shutil.which("tesseract"), "Tesseract not installed")
    def test_scan_ocr_reads_pixels(self):
        langs = subprocess.run(["tesseract", "--list-langs"], capture_output=True, text=True, timeout=10)
        if "eng" not in langs.stdout.splitlines():
            self.skipTest("English OCR language data unavailable")
        with pymupdf.open() as source:
            page = source.new_page()
            page.insert_text((60, 120), "SCANNED PAPER EVIDENCE", fontsize=28)
            image = page.get_pixmap(matrix=pymupdf.Matrix(2, 2)).tobytes("png")
        with pymupdf.open() as scan:
            page = scan.new_page()
            page.insert_image(page.rect, stream=image)
            scan.save(self.pdf)
        result = self.run_reader("--page", 1, "--ocr", "auto")
        self.assertIn("SCANNED PAPER EVIDENCE", result.stdout)
        self.assertNotIn("OCR failed", result.stderr)

    @unittest.skipUnless(shutil.which("node"), "Node.js not installed")
    def test_real_cli_install_upgrade_conflict_and_wrapper_from_another_directory(self):
        for target in ("codex", "claude"):
            with self.subTest(target=target):
                install_root = self.root / target
                command = ["node", str(REPO / "bin/install-paper-workbench.js"), "--target", target,
                           "--python", sys.executable, "--yes", "--install-root", str(install_root)]
                def install(*extra):
                    return subprocess.run(command + list(extra), capture_output=True, text=True, env=self.env, timeout=30)
                first = install()
                self.assertEqual(first.returncode, 0, first.stderr)
                skill = install_root / (".agents" if target == "codex" else ".claude") / "skills/read-pdf"
                self.assertNotIn("{{", (skill / "SKILL.md").read_text())
                unrelated = self.root / "another working directory"
                unrelated.mkdir(exist_ok=True)
                read = subprocess.run(["bash", str(skill / "scripts/run_read_pdf.sh"), str(self.pdf), "--page", "1", "--no-prune"],
                                      cwd=unrelated, capture_output=True, text=True, env=self.env, timeout=30)
                self.assertEqual(read.returncode, 0, read.stderr)
                self.assertIn("Version A", read.stdout)
                if target == "codex":
                    agents = list((install_root / ".codex/agents").glob("*.toml"))
                    self.assertEqual(len(agents), 2)
                    for agent in agents:
                        parsed = tomllib.loads(agent.read_text())
                        self.assertTrue(all(parsed[key] for key in ("name", "description", "developer_instructions")))
                self.assertEqual(install().returncode, 0)
                with (skill / "SKILL.md").open("a") as handle:
                    handle.write("\nLocal user customization.\n")
                refused = install()
                self.assertNotEqual(refused.returncode, 0)
                self.assertIn("Local user customization", (skill / "SKILL.md").read_text())
                forced = install("--force")
                self.assertEqual(forced.returncode, 0, forced.stderr)
                backups = list((skill.parent.parent / ".paper-workbench-backups").glob("*/read-pdf/SKILL.md"))
                self.assertTrue(any("Local user customization" in item.read_text() for item in backups))


if __name__ == "__main__":
    unittest.main()
