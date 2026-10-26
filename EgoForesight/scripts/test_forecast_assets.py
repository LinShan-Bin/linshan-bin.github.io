"""Regression checks for the displayed qualitative examples and cache-safe URLs."""

import hashlib
from html.parser import HTMLParser
import json
from pathlib import Path
import tempfile
import unittest

from PIL import Image

from export_forecast_assets import AFFINE_SHA256, CASES, NORMALIZATION_ID, validate_source


PAGE = Path(__file__).resolve().parents[1]
IMAGES = PAGE / "assets" / "images"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


class ImageSources(HTMLParser):
    def __init__(self, html):
        super().__init__()
        self.sources = {}
        self.feed(html)

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "img" and attrs.get("id", "").startswith("forecast-"):
            self.sources[attrs["id"]] = attrs["src"]


class ForecastAssetsTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest_text = (IMAGES / "forecast-sources.json").read_text()
        cls.manifest = json.loads(cls.manifest_text)
        cls.html = (PAGE / "index.html").read_text()
        cls.js = (PAGE / "app.js").read_text()

    def test_selected_cases_and_raw_features_are_unchanged(self):
        expected_features = {
            "robot": "23b94a8b5232fa6c64938fc0dec1740d7ab6ac043cfcb9894b5b639f2d99e76e",
            "human": "e4a9a740bcd099b0a6153f991159d233092c0833387b16acbc02f7aac315ff85",
        }
        self.assertEqual(self.manifest["display_crop"], [0, 32, 320, 224])
        self.assertEqual(set(self.manifest["examples"]), set(CASES))
        for example, record in self.manifest["examples"].items():
            with self.subTest(example=example):
                self.assertEqual(record["case"], CASES[example])
                self.assertEqual(record["features_sha256"], expected_features[example])
                self.assertEqual(record["feature_shape"], [12, 10, 768])
                self.assertTrue(record["future_removed_before_inference"])

    def test_matched_layernorm_corrected_decoder(self):
        norm = self.manifest["feature_normalization"]
        self.assertEqual(norm["id"], NORMALIZATION_ID)
        self.assertEqual(norm["affine_float32_sha256"], AFFINE_SHA256)
        self.assertEqual(norm["formula"], "(policy_tokens - beta) / gamma")
        self.assertTrue(norm["pooled_and_predicted_same_transform"])
        self.assertFalse(norm["rgb_input"])
        self.assertEqual(self.manifest["decoder"]["sha256"],
                         "dcc2df7bbe71770b8e8a0f240264bb4078fd7d44b46bba887416138b34b643eb")

    def test_output_hashes_dimensions_and_lossless_crops(self):
        for example, record in self.manifest["examples"].items():
            for kind, info in record["images"].items():
                with self.subTest(example=example, kind=kind):
                    path = IMAGES / info["file"]
                    self.assertEqual(sha256(path.read_bytes()), info["sha256"])
                    with Image.open(path) as image:
                        self.assertEqual(list(image.size), self.manifest["display_size"])
                        if kind in ("prediction", "reference"):
                            self.assertEqual(sha256(image.convert("RGB").tobytes()),
                                             info["source_crop_rgb_sha256"])
                            self.assertIn(f'-lnfix-{info["sha256"][:12]}.webp', info["file"])
                            compatibility = IMAGES / f"{example}-{kind}.webp"
                            self.assertEqual(compatibility.read_bytes(), path.read_bytes())

    def test_initial_robot_view_matches_manifest(self):
        sources = ImageSources(self.html).sources
        self.assertEqual(len(sources), 4)
        for kind, info in self.manifest["examples"]["robot"]["images"].items():
            self.assertEqual(sources[f"forecast-{kind}"], f'assets/images/{info["file"]}')

    def test_both_toggle_options_reference_corrected_assets(self):
        for example, record in self.manifest["examples"].items():
            for kind, info in record["images"].items():
                self.assertIn(f"'{info['file']}'", self.js)
                if kind in ("prediction", "reference"):
                    self.assertNotIn(f"{example}-{kind}.webp", self.html + self.js)
        self.assertIn("assets/images/${forecastSources[example][kind]}", self.js)

    def test_script_cache_version_matches_bytes(self):
        version = sha256((PAGE / "app.js").read_bytes())[:12]
        self.assertIn(f'app.js?v={version}', self.html)

    def test_export_rejects_legacy_visualization(self):
        with tempfile.TemporaryDirectory() as temp:
            folder = Path(temp)
            (folder / "sample.json").write_text('{"case": "trex_9_30"}')
            (folder / "visualization.json").write_text('{"case": "trex_9_30"}')
            with self.assertRaisesRegex(ValueError, "refuse legacy reconstructions"):
                validate_source(folder, "trex_9_30")

    def test_public_provenance_has_no_private_checkpoint_paths(self):
        self.assertNotIn("/mnt/", self.manifest_text)
        self.assertNotIn("/Users/", self.manifest_text)
        self.assertNotIn("source_checkpoint", self.manifest_text)


if __name__ == "__main__":
    unittest.main()
