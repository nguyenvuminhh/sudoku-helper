from __future__ import annotations

import sys
from pathlib import Path

from huggingface_hub import hf_hub_download

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.ocr import DEFAULT_DIGIT_MODEL_FILENAME, DEFAULT_DIGIT_MODEL_REPO, default_digit_model_path


def main() -> None:
    target = default_digit_model_path()
    target.parent.mkdir(parents=True, exist_ok=True)
    downloaded = Path(
        hf_hub_download(
            repo_id=DEFAULT_DIGIT_MODEL_REPO,
            filename=DEFAULT_DIGIT_MODEL_FILENAME,
            local_dir=target.parent,
        )
    )
    if downloaded != target:
        target.write_bytes(downloaded.read_bytes())
    _write_license_note(target.parent)
    print(f"Downloaded {DEFAULT_DIGIT_MODEL_REPO}/{DEFAULT_DIGIT_MODEL_FILENAME} to {target}")


def _write_license_note(target_dir: Path) -> None:
    note = target_dir / "LICENSE-NOTE.txt"
    note.write_text(
        "\n".join(
            [
                "Model: onnxmodelzoo/mnist-8",
                "File: mnist-8.onnx",
                "Source: https://huggingface.co/onnxmodelzoo/mnist-8",
                "License listed by Hugging Face: Apache-2.0",
                "",
            ]
        ),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
