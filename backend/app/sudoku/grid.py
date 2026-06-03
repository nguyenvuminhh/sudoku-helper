from __future__ import annotations

from dataclasses import dataclass
from typing import Iterable

DIGITS = set(range(1, 10))


@dataclass(frozen=True)
class GridValidation:
    valid: bool
    conflicts: list[dict[str, object]]


def parse_grid(value: str | Iterable[int | str | None]) -> list[int]:
    if isinstance(value, str):
        raw_cells = list(value.strip().replace("\n", "").replace(" ", ""))
    else:
        raw_cells = list(value)

    if len(raw_cells) != 81:
        raise ValueError("Sudoku grid must contain exactly 81 cells.")

    cells: list[int] = []
    for index, raw in enumerate(raw_cells):
        if raw in (None, "", ".", "0", 0):
            cells.append(0)
            continue

        try:
            digit = int(raw)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"Cell {index + 1} must be blank or a digit from 1 to 9.") from exc

        if digit not in DIGITS:
            raise ValueError(f"Cell {index + 1} must be blank or a digit from 1 to 9.")
        cells.append(digit)

    return cells


def row_of(index: int) -> int:
    return index // 9


def col_of(index: int) -> int:
    return index % 9


def box_of(index: int) -> int:
    return (row_of(index) // 3) * 3 + (col_of(index) // 3)


def coord(index: int) -> dict[str, int]:
    return {"row": row_of(index) + 1, "col": col_of(index) + 1}


def unit_indexes(kind: str, number: int) -> list[int]:
    if kind == "row":
        return [number * 9 + col for col in range(9)]
    if kind == "col":
        return [row * 9 + number for row in range(9)]
    if kind == "box":
        start_row = (number // 3) * 3
        start_col = (number % 3) * 3
        return [
            (start_row + row_offset) * 9 + start_col + col_offset
            for row_offset in range(3)
            for col_offset in range(3)
        ]
    raise ValueError(f"Unknown unit kind: {kind}")


def all_units() -> list[tuple[str, int, list[int]]]:
    return [
        *[("row", number, unit_indexes("row", number)) for number in range(9)],
        *[("col", number, unit_indexes("col", number)) for number in range(9)],
        *[("box", number, unit_indexes("box", number)) for number in range(9)],
    ]


def validate_grid(grid: list[int]) -> GridValidation:
    conflicts: list[dict[str, object]] = []

    for kind, number, indexes in all_units():
        seen: dict[int, list[int]] = {}
        for index in indexes:
            digit = grid[index]
            if digit:
                seen.setdefault(digit, []).append(index)

        for digit, locations in seen.items():
            if len(locations) > 1:
                conflicts.append(
                    {
                        "unit": kind,
                        "unitNumber": number + 1,
                        "digit": digit,
                        "cells": [coord(index) for index in locations],
                    }
                )

    return GridValidation(valid=not conflicts, conflicts=conflicts)


def used_digits(grid: list[int], index: int) -> set[int]:
    related = set(unit_indexes("row", row_of(index)))
    related.update(unit_indexes("col", col_of(index)))
    related.update(unit_indexes("box", box_of(index)))
    return {grid[peer] for peer in related if grid[peer]}


def candidates_for(grid: list[int], index: int) -> set[int]:
    if grid[index]:
        return set()
    return DIGITS - used_digits(grid, index)


def candidate_map(grid: list[int]) -> dict[int, set[int]]:
    return {index: candidates_for(grid, index) for index, value in enumerate(grid) if value == 0}
