import importlib.util
import random
import tempfile
import unittest
from pathlib import Path

import cv2
import numpy as np

from scripts import train_sudoku_digit_model as trainer


class TrainSudokuDigitModelTests(unittest.TestCase):
    def test_infer_label_from_path_supports_digit_dirs_blank_dirs_and_chars74k(self):
        cases = {
            Path("printed/7/image.png"): 7,
            Path("printed/blank/image.png"): 0,
            Path("chars74k/English/Fnt/Sample001/img001-00001.png"): None,
            Path("chars74k/English/Fnt/Sample002/img002-00001.png"): 1,
            Path("chars74k/English/Fnt/Sample010/img010-00001.png"): 9,
            Path("chars74k/English/Fnt/Sample011/img011-00001.png"): None,
        }

        for path, expected in cases.items():
            with self.subTest(path=path):
                self.assertEqual(trainer.infer_label_from_path(path), expected)

    def test_collect_labeled_images_filters_to_digit_classes(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            for relative in [
                "printed/3/three.png",
                "printed/blank/empty.png",
                "chars74k/English/Fnt/Sample010/nine.png",
                "chars74k/English/Fnt/Sample011/letter-a.png",
                "notes/readme.txt",
            ]:
                path = root / relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(b"placeholder")

            samples = trainer.collect_labeled_images([root])

        labels_by_name = {sample.path.name: sample.label for sample in samples}
        self.assertEqual(labels_by_name, {"three.png": 3, "empty.png": 0, "nine.png": 9})

    def test_normalize_to_classifier_image_returns_white_ink_on_black_canvas(self):
        image = np.full((64, 64), 255, dtype=np.uint8)
        cv2.putText(image, "7", (18, 48), cv2.FONT_HERSHEY_SIMPLEX, 1.6, 0, 3, cv2.LINE_AA)

        normalized = trainer.normalize_to_classifier_image(image)

        self.assertEqual(normalized.shape, (28, 28))
        self.assertEqual(normalized.dtype, np.uint8)
        self.assertGreater(np.count_nonzero(normalized), 30)
        self.assertEqual(int(normalized.max()), 255)
        self.assertEqual(int(normalized[0, 0]), 0)

    def test_synthetic_samples_are_balanced_and_include_blank_negatives(self):
        images, labels = trainer.build_synthetic_samples(
            samples_per_class=2,
            seed=7,
            font_paths=[],
        )

        self.assertEqual(images.shape, (20, 28, 28))
        self.assertEqual(labels.tolist().count(0), 2)
        self.assertEqual(labels.tolist().count(9), 2)
        self.assertTrue(all(image.dtype == np.uint8 for image in images))
        self.assertTrue(any(np.count_nonzero(image) == 0 for image, label in zip(images, labels, strict=False) if label == 0))
        self.assertTrue(any(np.count_nonzero(image) > 0 for image, label in zip(images, labels, strict=False) if label == 0))
        self.assertTrue(all(np.count_nonzero(image) > 20 for image, label in zip(images, labels, strict=False) if label != 0))

    def test_pillow_rendered_font_images_can_be_mutated_by_opencv_augmentation(self):
        if importlib.util.find_spec("PIL") is None:
            self.skipTest("Pillow is not installed")

        font_path = next(
            (
                path
                for path in [
                    Path("/System/Library/Fonts/SFNS.ttf"),
                    Path("/System/Library/Fonts/Supplemental/Arial.ttf"),
                    Path("/Library/Fonts/Arial.ttf"),
                ]
                if path.exists()
            ),
            None,
        )
        if font_path is None:
            self.skipTest("No known local TrueType font found")

        rendered = trainer._render_digit_with_pillow(7, font_path, random.Random(3))

        self.assertIsNotNone(rendered)
        cv2.line(rendered, (0, 0), (27, 0), 0, 1)


if __name__ == "__main__":
    unittest.main()
