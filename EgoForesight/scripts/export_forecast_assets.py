"""Export the selected forecasts only from verified, LayerNorm-corrected sources."""

import argparse
import hashlib
import io
import json
from pathlib import Path

from PIL import Image


PAGE = Path(__file__).resolve().parents[1]
CASES = {"robot": "trex_9_30", "human": "egodex_235149_13"}
CROP = (0, 32, 320, 224)
GRID = [12, 10, 768]
NORMALIZATION_ID = "policy-dino-final-ln-inverse-affine-v1"
AFFINE_SHA256 = "21ef6bdb6a44cbf145e43f9ac0d30b550013e2e274d6fb3799d1be58d77efca5"
SOURCE_FILES = {
    "current": "current.png",
    "future": "future_gt.png",
    "prediction": "predicted_decoded.png",
    "reference": "future_gt_decoded.png",
}
NORMALIZATION_FIELDS = (
    "id", "formula", "source_dtype", "source_layernorm_eps", "target_layernorm_eps",
    "affine_float32_sha256", "target", "pooled_and_predicted_same_transform", "rgb_input",
)


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_source(folder, case):
    sample = json.loads((folder / "sample.json").read_text())
    viz = json.loads((folder / "visualization.json").read_text())
    norm = viz.get("feature_normalization", {})
    require(norm.get("id") == NORMALIZATION_ID,
            f"{case}: refuse legacy reconstructions without the LayerNorm fix")
    require(norm.get("affine_float32_sha256") == AFFINE_SHA256,
            f"{case}: unexpected policy LayerNorm affine parameters")
    require(norm.get("formula") == "(policy_tokens - beta) / gamma"
            and norm.get("pooled_and_predicted_same_transform") is True
            and norm.get("rgb_input") is False,
            f"{case}: prediction/reference must share the feature-only transform")
    require(sample["case"] == viz["case"] == case, f"{case}: mismatched case")
    require(sample["feature_shape"] == viz["comparison"]["input_grid"] == GRID,
            f"{case}: unexpected feature grid")
    require(sample["future_removed_before_inference"] is True,
            f"{case}: future RGB must not enter forecasting")
    require(viz["comparison"]["reference"] == SOURCE_FILES["reference"]
            and viz["comparison"]["prediction"] == SOURCE_FILES["prediction"],
            f"{case}: use matched pooled reconstructions, not unpooled GT or PCA")
    images = {}
    for kind, filename in SOURCE_FILES.items():
        data = (folder / filename).read_bytes()
        require(sha256(data) == viz["files"][filename], f"{case}/{filename}: hash mismatch")
        with Image.open(io.BytesIO(data)) as image:
            require(image.size == (320, 384), f"{case}/{filename}: unexpected source size")
            images[kind] = image.convert("RGB").crop(CROP)
    return sample, viz, images


def export(source_root):
    # Validate both cases before writing any output. The old paper exports fail here.
    sources = {example: validate_source(source_root / case, case)
               for example, case in CASES.items()}
    robot_viz, human_viz = sources["robot"][1], sources["human"][1]
    for field in ("feature_normalization", "decoder", "decoder_code_commit"):
        require(robot_viz[field] == human_viz[field], f"Cases use different {field}")
    manifest = {
        "schema_version": 1,
        "source_revision": "2026-09-23 LayerNorm-corrected Studio reconstructions",
        "display_crop": list(CROP),
        "display_size": [320, 192],
        "decoded_webp_encoding": "lossless; no color adjustment or resampling",
        "feature_normalization": {key: robot_viz["feature_normalization"][key]
                                  for key in NORMALIZATION_FIELDS},
        "decoder": robot_viz["decoder"],
        "decoder_code_commit": robot_viz["decoder_code_commit"],
        "examples": {},
    }
    output = PAGE / "assets" / "images"
    pending = {}
    for example, (sample, viz, images) in sources.items():
        record = {key: sample[key] for key in (
            "case", "dataset", "episode", "start", "future_frame", "seed", "flow_steps",
            "feature_shape", "future_removed_before_inference",
        )}
        record["features_sha256"] = viz["files"]["features.npz"]
        record["visualization_sha256"] = sha256(
            (source_root / sample["case"] / "visualization.json").read_bytes())
        record["images"] = {}
        for kind, image in images.items():
            if kind in ("prediction", "reference"):
                buffer = io.BytesIO()
                image.save(buffer, format="WEBP", lossless=True, method=6)
                data = buffer.getvalue()
                filename = f"{example}-{kind}-lnfix-{sha256(data)[:12]}.webp"
                pending[filename] = data
                # Keep corrected compatibility copies for older HTML/JS, without 404s.
                pending[f"{example}-{kind}.webp"] = data
            else:
                # The observations are unchanged; preserve their original web encodings.
                filename = f"{example}-{kind}.webp"
                data = (output / filename).read_bytes()
            record["images"][kind] = {
                "file": filename,
                "sha256": sha256(data),
                "source_file": SOURCE_FILES[kind],
                "source_sha256": viz["files"][SOURCE_FILES[kind]],
                "source_crop_rgb_sha256": sha256(image.tobytes()),
            }
        manifest["examples"][example] = record
    for filename, data in pending.items():
        (output / filename).write_bytes(data)
    (output / "forecast-sources.json").write_text(json.dumps(manifest, indent=2) + "\n")
    for example, record in manifest["examples"].items():
        print(example, {kind: info["file"] for kind, info in record["images"].items()})


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("source_root", type=Path,
                        help="Corrected source directory containing both selected cases")
    export(parser.parse_args().source_root.resolve())
