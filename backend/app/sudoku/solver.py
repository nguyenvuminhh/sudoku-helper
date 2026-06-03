from __future__ import annotations

from dataclasses import asdict, dataclass, field
from itertools import combinations

from backend.app.sudoku.grid import (
    candidate_map,
    coord,
    parse_grid,
    unit_indexes,
    validate_grid,
)


@dataclass(frozen=True)
class Technique:
    id: str
    name: str
    rank: int


@dataclass(frozen=True)
class Action:
    type: str
    cell: dict[str, int] | None = None
    digit: int | None = None
    eliminations: list[dict[str, object]] = field(default_factory=list)


@dataclass(frozen=True)
class Highlights:
    primary_cells: list[dict[str, int]] = field(default_factory=list)
    related_cells: list[dict[str, int]] = field(default_factory=list)
    eliminations: list[dict[str, object]] = field(default_factory=list)


@dataclass(frozen=True)
class Hint:
    technique: Technique
    action: Action
    summary: str
    explanation: list[str]
    highlights: Highlights

    def to_dict(self) -> dict[str, object]:
        return asdict(self)


def next_hint(raw_grid: list[int] | str) -> Hint:
    grid = parse_grid(raw_grid) if not isinstance(raw_grid, list) else raw_grid
    validation = validate_grid(grid)
    if not validation.valid:
        raise ValueError("Cannot generate a hint for a grid with conflicts.")

    candidates = candidate_map(grid)
    return (
        _find_naked_single(candidates)
        or _find_hidden_single(candidates)
        or _find_locked_candidate(candidates)
        or _find_naked_pair(candidates)
        or _no_logical_progress()
    )


def _find_naked_single(candidates: dict[int, set[int]]) -> Hint | None:
    for index in sorted(candidates):
        digits = candidates[index]
        if len(digits) == 1:
            digit = next(iter(digits))
            cell = coord(index)
            return Hint(
                technique=Technique("naked_single", "Naked single", 10),
                action=Action("place", cell=cell, digit=digit),
                summary=f"R{cell['row']}C{cell['col']} must be {digit}.",
                explanation=[
                    "Conclusion: this cell has only one remaining candidate.",
                    f"R{cell['row']}C{cell['col']} sees every other digit through its row, column, or box.",
                    f"Place {digit} in R{cell['row']}C{cell['col']}.",
                ],
                highlights=Highlights(primary_cells=[cell]),
            )
    return None


def _find_hidden_single(candidates: dict[int, set[int]]) -> Hint | None:
    for kind in ("box", "row", "col"):
        for number in range(9):
            indexes = unit_indexes(kind, number)
            unit_candidates = [index for index in indexes if index in candidates]
            for digit in range(1, 10):
                locations = [index for index in unit_candidates if digit in candidates[index]]
                if len(locations) == 1:
                    index = locations[0]
                    cell = coord(index)
                    related = [coord(other) for other in unit_candidates if other != index]
                    unit_name = _unit_name(kind, number)
                    return Hint(
                        technique=Technique("hidden_single", "Hidden single", 20),
                        action=Action("place", cell=cell, digit=digit),
                        summary=f"In {unit_name}, only R{cell['row']}C{cell['col']} can contain {digit}.",
                        explanation=[
                            f"Conclusion: place {digit} in R{cell['row']}C{cell['col']}.",
                            f"Look at {unit_name}: every other empty cell in that unit rejects {digit}.",
                            f"Because {digit} still has to appear once in {unit_name}, R{cell['row']}C{cell['col']} is forced.",
                        ],
                        highlights=Highlights(primary_cells=[cell], related_cells=related),
                    )
    return None


def _find_locked_candidate(candidates: dict[int, set[int]]) -> Hint | None:
    for box in range(9):
        box_indexes = unit_indexes("box", box)
        for digit in range(1, 10):
            locations = [index for index in box_indexes if digit in candidates.get(index, set())]
            if len(locations) < 2:
                continue

            rows = {index // 9 for index in locations}
            cols = {index % 9 for index in locations}
            if len(rows) == 1:
                row = next(iter(rows))
                eliminations = [
                    {"cell": coord(index), "digit": digit}
                    for index in unit_indexes("row", row)
                    if index not in box_indexes and digit in candidates.get(index, set())
                ]
                if eliminations:
                    return _elimination_hint("locked_candidate", "Locked candidate", 30, "row", row, box, digit, locations, eliminations)
            if len(cols) == 1:
                col = next(iter(cols))
                eliminations = [
                    {"cell": coord(index), "digit": digit}
                    for index in unit_indexes("col", col)
                    if index not in box_indexes and digit in candidates.get(index, set())
                ]
                if eliminations:
                    return _elimination_hint("locked_candidate", "Locked candidate", 30, "column", col, box, digit, locations, eliminations)
    return None


def _find_naked_pair(candidates: dict[int, set[int]]) -> Hint | None:
    for kind in ("row", "col", "box"):
        for number in range(9):
            indexes = [index for index in unit_indexes(kind, number) if len(candidates.get(index, set())) == 2]
            for left, right in combinations(indexes, 2):
                pair = candidates[left]
                if pair != candidates[right]:
                    continue
                eliminations = [
                    {"cell": coord(index), "digit": digit}
                    for index in unit_indexes(kind, number)
                    if index not in (left, right)
                    for digit in sorted(pair)
                    if digit in candidates.get(index, set())
                ]
                if eliminations:
                    pair_digits = ", ".join(str(digit) for digit in sorted(pair))
                    unit_name = _unit_name(kind, number)
                    cells = [coord(left), coord(right)]
                    return Hint(
                        technique=Technique("naked_pair", "Naked pair", 40),
                        action=Action("eliminate", eliminations=eliminations),
                        summary=f"R{cells[0]['row']}C{cells[0]['col']} and R{cells[1]['row']}C{cells[1]['col']} form a naked pair in {unit_name}.",
                        explanation=[
                            f"Conclusion: remove {pair_digits} from other cells in {unit_name}.",
                            "The two cells share exactly the same two candidates, so those digits must occupy those two cells.",
                            "No other cell in the same unit can use either digit.",
                        ],
                        highlights=Highlights(primary_cells=cells, eliminations=eliminations),
                    )
    return None


def _elimination_hint(
    technique_id: str,
    technique_name: str,
    rank: int,
    line_kind: str,
    line_number: int,
    box: int,
    digit: int,
    source_indexes: list[int],
    eliminations: list[dict[str, object]],
) -> Hint:
    source_cells = [coord(index) for index in source_indexes]
    line_label = f"{line_kind} {line_number + 1}"
    box_label = f"box {box + 1}"
    return Hint(
        technique=Technique(technique_id, technique_name, rank),
        action=Action("eliminate", eliminations=eliminations),
        summary=f"{digit} is locked in {line_label} inside {box_label}.",
        explanation=[
            f"Conclusion: remove {digit} from the rest of {line_label}.",
            f"Inside {box_label}, every possible {digit} sits on the same {line_kind}.",
            f"That means {digit} must be placed in that {line_kind} within {box_label}, so it cannot appear elsewhere on the line.",
        ],
        highlights=Highlights(primary_cells=source_cells, eliminations=eliminations),
    )


def _no_logical_progress() -> Hint:
    return Hint(
        technique=Technique("no_progress", "No logical progress", 999),
        action=Action("none"),
        summary="No supported logical hint is available for this grid yet.",
        explanation=[
            "The puzzle is valid, but the current engine did not find a supported next step.",
            "More advanced techniques can be added to the ranked pipeline without changing the API.",
            "You can still continue manually or reveal the full solve path once deeper strategies are implemented.",
        ],
        highlights=Highlights(),
    )


def _unit_name(kind: str, number: int) -> str:
    if kind == "row":
        return f"row {number + 1}"
    if kind == "col":
        return f"column {number + 1}"
    if kind == "box":
        return f"box {number + 1}"
    return f"{kind} {number + 1}"
