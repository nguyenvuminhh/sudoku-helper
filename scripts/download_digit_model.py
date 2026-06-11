from __future__ import annotations

import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from backend.app.ocr import default_digit_model_external_data_path, default_digit_model_path


def main() -> None:
    model_path = default_digit_model_path()
    external_data_path = default_digit_model_external_data_path()
    missing = [path for path in [model_path, external_data_path] if not path.exists()]
    if missing:
        missing_list = "\n".join(f"- {path}" for path in missing)
        raise SystemExit(
            "\n".join(
                [
                    "Required Sudoku digit model files are missing:",
                    missing_list,
                    "",
                    "Train the model first, for example:",
                    "python3 scripts/train_sudoku_digit_model.py --dataset data/training/printed-digits-dataset --output data/models/sudoku-digits/sudoku-digits.onnx",
                ]
            )
        )

    print(f"Found Sudoku digit model at {model_path}")
    print(f"Found Sudoku digit model external data at {external_data_path}")


if __name__ == "__main__":
    main()
