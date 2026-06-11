from __future__ import annotations

import argparse
import importlib.util
import json
import random
from dataclasses import dataclass
from pathlib import Path
from typing import Sequence

import cv2
import numpy as np

CLASSIFIER_SIZE = 28
IMAGE_SUFFIXES = {".bmp", ".jpeg", ".jpg", ".png", ".tif", ".tiff", ".webp"}
BLANK_LABEL_NAMES = {"blank", "empty", "none", "background", "grid", "grid-only", "no-digit"}
DEFAULT_OUTPUT = Path("data/models/sudoku-digits/sudoku-digits.onnx")


@dataclass(frozen=True)
class LabeledImage:
    path: Path
    label: int


def infer_label_from_path(path: Path) -> int | None:
    parts = [part.lower() for part in path.parts]

    chars74k_label = _chars74k_label(parts)
    if chars74k_label is not None:
        return chars74k_label
    if any(part in BLANK_LABEL_NAMES for part in parts):
        return 0

    for part in reversed(parts[:-1]):
        if part in {"0", "zero"}:
            return 0
        if part.isdigit() and 1 <= int(part) <= 9:
            return int(part)
        if len(part) == 1 and part in "123456789":
            return int(part)

    return None


def collect_labeled_images(dataset_roots: Sequence[Path]) -> list[LabeledImage]:
    samples: list[LabeledImage] = []
    for root in dataset_roots:
        if not root.exists():
            raise FileNotFoundError(f"Dataset root does not exist: {root}")
        for path in sorted(root.rglob("*")):
            if not path.is_file() or path.suffix.lower() not in IMAGE_SUFFIXES:
                continue
            label = infer_label_from_path(path.relative_to(root))
            if label is not None:
                samples.append(LabeledImage(path=path, label=label))
    return samples


def normalize_to_classifier_image(image: object) -> object:
    gray = _ensure_grayscale(image)
    if gray.size == 0:
        return np.zeros((CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8)

    blurred = cv2.GaussianBlur(gray, (3, 3), 0)
    _, light_foreground = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY | cv2.THRESH_OTSU)
    _, dark_foreground = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV | cv2.THRESH_OTSU)
    binary = _choose_digit_mask(light_foreground, dark_foreground)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
    contours = [contour for contour in contours if cv2.contourArea(contour) >= 2]
    if not contours:
        return np.zeros((CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8)

    x, y, w, h = cv2.boundingRect(np.vstack(contours))
    digit = binary[y : y + h, x : x + w]
    scale = min(20 / max(w, 1), 20 / max(h, 1))
    resized = cv2.resize(
        digit,
        (max(1, int(w * scale)), max(1, int(h * scale))),
        interpolation=cv2.INTER_AREA,
    )
    canvas = np.zeros((CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8)
    top = (CLASSIFIER_SIZE - resized.shape[0]) // 2
    left = (CLASSIFIER_SIZE - resized.shape[1]) // 2
    canvas[top : top + resized.shape[0], left : left + resized.shape[1]] = resized
    return canvas


def build_synthetic_samples(
    samples_per_class: int,
    seed: int,
    font_paths: Sequence[Path],
) -> tuple[object, object]:
    if samples_per_class <= 0:
        return (
            np.zeros((0, CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8),
            np.zeros((0,), dtype=np.int64),
        )

    rng = random.Random(seed)
    images: list[object] = []
    labels: list[int] = []
    missing_font_paths = [path for path in font_paths if not path.exists()]
    if missing_font_paths:
        missing = ", ".join(str(path) for path in missing_font_paths)
        raise FileNotFoundError(f"Font path does not exist: {missing}")
    valid_font_paths = list(font_paths)
    if valid_font_paths and importlib.util.find_spec("PIL") is None:
        raise RuntimeError("The --font option requires Pillow in the training environment.")

    for label in range(10):
        for sample_index in range(samples_per_class):
            if label == 0:
                image = _synthetic_blank_negative(rng, sample_index)
            else:
                image = _synthetic_digit(label, rng, valid_font_paths)
            images.append(image)
            labels.append(label)

    return np.stack(images).astype(np.uint8), np.asarray(labels, dtype=np.int64)


def load_dataset_samples(samples: Sequence[LabeledImage]) -> tuple[object, object]:
    images: list[object] = []
    labels: list[int] = []
    for sample in samples:
        image = cv2.imread(str(sample.path), cv2.IMREAD_GRAYSCALE)
        if image is None:
            continue
        images.append(normalize_to_classifier_image(image))
        labels.append(sample.label)
    if not images:
        return (
            np.zeros((0, CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8),
            np.zeros((0,), dtype=np.int64),
        )
    return np.stack(images).astype(np.uint8), np.asarray(labels, dtype=np.int64)


def train_and_export(
    images: object,
    labels: object,
    output_path: Path,
    *,
    epochs: int,
    batch_size: int,
    learning_rate: float,
    validation_split: float,
    seed: int,
) -> dict[str, object]:
    torch = _torch()
    from torch import nn
    from torch.utils.data import DataLoader, TensorDataset, random_split

    image_array = np.asarray(images, dtype=np.float32) / 255.0
    label_array = np.asarray(labels, dtype=np.int64)
    if len(image_array) < 10:
        raise ValueError("Need at least 10 labeled samples to train the classifier.")

    torch.manual_seed(seed)
    generator = torch.Generator().manual_seed(seed)
    x = torch.from_numpy(image_array).unsqueeze(1)
    y = torch.from_numpy(label_array)
    dataset = TensorDataset(x, y)
    validation_size = max(1, min(len(dataset) - 1, int(len(dataset) * validation_split)))
    training_size = len(dataset) - validation_size
    training_data, validation_data = random_split(dataset, [training_size, validation_size], generator=generator)
    training_loader = DataLoader(training_data, batch_size=batch_size, shuffle=True, generator=generator)
    validation_loader = DataLoader(validation_data, batch_size=batch_size)

    model = SudokuDigitNet()
    loss_fn = nn.CrossEntropyLoss()
    optimizer = torch.optim.Adam(model.parameters(), lr=learning_rate)

    for _ in range(epochs):
        model.train()
        for batch_x, batch_y in training_loader:
            optimizer.zero_grad()
            loss = loss_fn(model(batch_x), batch_y)
            loss.backward()
            optimizer.step()

    metrics = _evaluate_model(model, validation_loader)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    dummy = torch.zeros((1, 1, CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=torch.float32)
    torch.onnx.export(
        model,
        dummy,
        str(output_path),
        input_names=["image"],
        output_names=["logits"],
        dynamic_axes={"image": {0: "batch"}, "logits": {0: "batch"}},
        opset_version=17,
    )
    _write_training_summary(output_path, metrics, labels=label_array, epochs=epochs)
    return metrics


def build_training_arrays(args: argparse.Namespace) -> tuple[object, object, dict[str, int]]:
    dataset_samples = collect_labeled_images(args.dataset)
    dataset_images, dataset_labels = load_dataset_samples(dataset_samples)

    if args.no_synthetic:
        synthetic_images = np.zeros((0, CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8)
        synthetic_labels = np.zeros((0,), dtype=np.int64)
    else:
        synthetic_images, synthetic_labels = build_synthetic_samples(
            samples_per_class=args.synthetic_per_class,
            seed=args.seed,
            font_paths=args.font,
        )

    images = np.concatenate([dataset_images, synthetic_images], axis=0)
    labels = np.concatenate([dataset_labels, synthetic_labels], axis=0)
    counts = {str(label): int(np.sum(labels == label)) for label in range(10)}
    return images, labels, counts


def parse_args(argv: Sequence[str] | None = None) -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Train a Sudoku-specific printed digit classifier and export ONNX.")
    parser.add_argument("--dataset", action="append", type=Path, default=[], help="Dataset root. Repeat for Printed Digits, Chars74K, or curated crops.")
    parser.add_argument("--font", action="append", type=Path, default=[], help="Optional .ttf/.otf font path for synthetic rendering. Repeatable.")
    parser.add_argument("--output", type=Path, default=DEFAULT_OUTPUT, help=f"ONNX output path. Default: {DEFAULT_OUTPUT}")
    parser.add_argument("--synthetic-per-class", type=int, default=2000, help="Synthetic examples per class 0-9.")
    parser.add_argument("--no-synthetic", action="store_true", help="Train only from provided dataset roots.")
    parser.add_argument("--epochs", type=int, default=12)
    parser.add_argument("--batch-size", type=int, default=256)
    parser.add_argument("--learning-rate", type=float, default=1e-3)
    parser.add_argument("--validation-split", type=float, default=0.15)
    parser.add_argument("--seed", type=int, default=42)
    return parser.parse_args(argv)


def main(argv: Sequence[str] | None = None) -> int:
    args = parse_args(argv)
    images, labels, counts = build_training_arrays(args)
    metrics = train_and_export(
        images,
        labels,
        args.output,
        epochs=args.epochs,
        batch_size=args.batch_size,
        learning_rate=args.learning_rate,
        validation_split=args.validation_split,
        seed=args.seed,
    )
    print(f"Wrote {args.output}")
    print(f"Samples by class: {json.dumps(counts, sort_keys=True)}")
    print(f"Validation metrics: {json.dumps(metrics, sort_keys=True)}")
    return 0


class SudokuDigitNet:
    def __new__(cls) -> object:
        torch = _torch()
        from torch import nn

        class _Net(nn.Module):
            def __init__(self) -> None:
                super().__init__()
                self.layers = nn.Sequential(
                    nn.Conv2d(1, 16, kernel_size=3, padding=1),
                    nn.ReLU(),
                    nn.MaxPool2d(2),
                    nn.Conv2d(16, 32, kernel_size=3, padding=1),
                    nn.ReLU(),
                    nn.MaxPool2d(2),
                    nn.Flatten(),
                    nn.Linear(32 * 7 * 7, 64),
                    nn.ReLU(),
                    nn.Dropout(0.1),
                    nn.Linear(64, 10),
                )

            def forward(self, image: object) -> object:
                return self.layers(image)

        return _Net()


def _chars74k_label(parts: Sequence[str]) -> int | None:
    for part in parts:
        if not part.startswith("sample"):
            continue
        raw_number = part.removeprefix("sample")
        if not raw_number.isdigit():
            continue
        sample_index = int(raw_number)
        digit = sample_index - 1
        if 1 <= digit <= 9:
            return digit
        return None
    return None


def _ensure_grayscale(image: object) -> object:
    array = np.asarray(image)
    if array.ndim == 2:
        return array.astype(np.uint8)
    if array.ndim == 3:
        return cv2.cvtColor(array.astype(np.uint8), cv2.COLOR_BGR2GRAY)
    raise ValueError("Expected a grayscale or BGR image array.")


def _choose_digit_mask(light_foreground: object, dark_foreground: object) -> object:
    candidates = [light_foreground, dark_foreground]
    scored = []
    for candidate in candidates:
        ratio = float(np.count_nonzero(candidate)) / float(candidate.size)
        if ratio <= 0.6:
            scored.append((abs(ratio - 0.18), candidate))
    if scored:
        return min(scored, key=lambda item: item[0])[1]
    return min(candidates, key=lambda candidate: np.count_nonzero(candidate))


def _synthetic_blank_negative(rng: random.Random, sample_index: int) -> object:
    if sample_index == 0:
        return np.zeros((CLASSIFIER_SIZE, CLASSIFIER_SIZE), dtype=np.uint8)

    cell = np.full((50, 50), 255, dtype=np.uint8)
    variant = rng.choice(["grid", "notes", "specks"])
    if variant == "grid":
        if rng.random() < 0.6:
            cv2.line(cell, (0, rng.randrange(0, 8)), (49, rng.randrange(0, 8)), 0, rng.choice([1, 2]))
        if rng.random() < 0.6:
            cv2.line(cell, (rng.randrange(0, 8), 0), (rng.randrange(0, 8), 49), 0, rng.choice([1, 2]))
    elif variant == "notes":
        note_count = rng.randrange(1, 5)
        for _ in range(note_count):
            digit = str(rng.randrange(1, 10))
            x = rng.choice([6, 20, 34]) + rng.randrange(-2, 3)
            y = rng.choice([13, 27, 41]) + rng.randrange(-2, 3)
            cv2.putText(cell, digit, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.28, 0, 1, cv2.LINE_AA)
    else:
        for _ in range(rng.randrange(4, 18)):
            cell[rng.randrange(0, 50), rng.randrange(0, 50)] = rng.randrange(0, 80)
    return normalize_to_classifier_image(_augment_cell(cell, rng))


def _synthetic_digit(label: int, rng: random.Random, font_paths: Sequence[Path]) -> object:
    cell = np.full((50, 50), 255, dtype=np.uint8)
    if font_paths and rng.random() < 0.7:
        rendered = _render_digit_with_pillow(label, rng.choice(list(font_paths)), rng)
        if rendered is not None:
            cell = rendered
        else:
            _render_digit_with_opencv(cell, label, rng)
    else:
        _render_digit_with_opencv(cell, label, rng)

    if rng.random() < 0.35:
        _add_grid_residue(cell, rng)
    if rng.random() < 0.25:
        _add_pencil_notes(cell, rng)

    return normalize_to_classifier_image(_augment_cell(cell, rng))


def _render_digit_with_opencv(cell: object, label: int, rng: random.Random) -> None:
    font = rng.choice(
        [
            cv2.FONT_HERSHEY_SIMPLEX,
            cv2.FONT_HERSHEY_DUPLEX,
            cv2.FONT_HERSHEY_TRIPLEX,
            cv2.FONT_HERSHEY_COMPLEX,
        ]
    )
    scale = rng.uniform(1.15, 1.6)
    thickness = rng.choice([2, 3])
    text = str(label)
    text_size, _ = cv2.getTextSize(text, font, scale, thickness)
    x = (50 - text_size[0]) // 2 + rng.randrange(-4, 5)
    y = (50 + text_size[1]) // 2 + rng.randrange(-4, 5)
    cv2.putText(cell, text, (x, y), font, scale, 0, thickness, cv2.LINE_AA)


def _render_digit_with_pillow(label: int, font_path: Path, rng: random.Random) -> object | None:
    try:
        from PIL import Image, ImageDraw, ImageFont  # type: ignore[import-not-found]
    except ImportError:
        return None

    image = Image.new("L", (50, 50), 255)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(str(font_path), rng.randrange(34, 45))
    text = str(label)
    bbox = draw.textbbox((0, 0), text, font=font)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    x = (50 - width) // 2 + rng.randrange(-4, 5)
    y = (50 - height) // 2 - bbox[1] + rng.randrange(-4, 5)
    draw.text((x, y), text, fill=0, font=font)
    return np.asarray(image, dtype=np.uint8).copy()


def _add_grid_residue(cell: object, rng: random.Random) -> None:
    thickness = rng.choice([1, 2, 3])
    if rng.random() < 0.5:
        cv2.line(cell, (0, 0), (49, 0), 0, thickness)
    if rng.random() < 0.5:
        cv2.line(cell, (0, 49), (49, 49), 0, thickness)
    if rng.random() < 0.5:
        cv2.line(cell, (0, 0), (0, 49), 0, thickness)
    if rng.random() < 0.5:
        cv2.line(cell, (49, 0), (49, 49), 0, thickness)


def _add_pencil_notes(cell: object, rng: random.Random) -> None:
    for _ in range(rng.randrange(1, 4)):
        digit = str(rng.randrange(1, 10))
        x = rng.choice([5, 20, 35]) + rng.randrange(-2, 3)
        y = rng.choice([12, 26, 40]) + rng.randrange(-2, 3)
        cv2.putText(cell, digit, (x, y), cv2.FONT_HERSHEY_SIMPLEX, 0.25, 0, 1, cv2.LINE_AA)


def _augment_cell(cell: object, rng: random.Random) -> object:
    image = np.asarray(cell, dtype=np.uint8)
    angle = rng.uniform(-4.0, 4.0)
    shift_x = rng.uniform(-2.0, 2.0)
    shift_y = rng.uniform(-2.0, 2.0)
    matrix = cv2.getRotationMatrix2D((25, 25), angle, rng.uniform(0.92, 1.08))
    matrix[:, 2] += [shift_x, shift_y]
    image = cv2.warpAffine(image, matrix, (50, 50), borderValue=255)
    if rng.random() < 0.5:
        image = cv2.GaussianBlur(image, (3, 3), 0)
    if rng.random() < 0.35:
        noise = np.random.default_rng(rng.randrange(0, 2**32)).normal(0, rng.uniform(2, 10), image.shape)
        image = np.clip(image.astype(np.float32) + noise, 0, 255).astype(np.uint8)
    if rng.random() < 0.25:
        ok, encoded = cv2.imencode(".jpg", image, [cv2.IMWRITE_JPEG_QUALITY, rng.randrange(55, 95)])
        if ok:
            decoded = cv2.imdecode(encoded, cv2.IMREAD_GRAYSCALE)
            if decoded is not None:
                image = decoded
    return image


def _evaluate_model(model: object, validation_loader: object) -> dict[str, object]:
    torch = _torch()
    model.eval()
    correct = 0
    total = 0
    per_class_total = {str(label): 0 for label in range(10)}
    per_class_correct = {str(label): 0 for label in range(10)}
    with torch.no_grad():
        for batch_x, batch_y in validation_loader:
            logits = model(batch_x)
            predictions = torch.argmax(logits, dim=1)
            matches = predictions == batch_y
            correct += int(matches.sum().item())
            total += int(batch_y.numel())
            for label in range(10):
                mask = batch_y == label
                per_class_total[str(label)] += int(mask.sum().item())
                per_class_correct[str(label)] += int((matches & mask).sum().item())

    accuracy = float(correct / total) if total else 0.0
    per_class_accuracy = {
        label: (float(per_class_correct[label] / count) if count else None)
        for label, count in per_class_total.items()
    }
    return {"accuracy": accuracy, "per_class_accuracy": per_class_accuracy}


def _write_training_summary(output_path: Path, metrics: dict[str, object], *, labels: object, epochs: int) -> None:
    summary_path = output_path.with_suffix(".training-summary.json")
    payload = {
        "model": output_path.name,
        "epochs": epochs,
        "class_counts": {str(label): int(np.sum(labels == label)) for label in range(10)},
        "metrics": metrics,
        "class_semantics": {
            "0": "blank/no large Sudoku digit",
            **{str(label): f"printed Sudoku digit {label}" for label in range(1, 10)},
        },
    }
    summary_path.write_text(json.dumps(payload, indent=2, sort_keys=True) + "\n", encoding="utf-8")


def _torch() -> object:
    try:
        import torch  # type: ignore[import-not-found]
    except ImportError as exc:
        raise RuntimeError(
            "PyTorch is required only for training. Install torch before running this script."
        ) from exc
    return torch


if __name__ == "__main__":
    raise SystemExit(main())
