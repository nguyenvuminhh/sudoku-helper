// Thin C++ wrapper around l2sg's logical solver, exported to WebAssembly via
// Emscripten embind. The browser calls `getHint(puzzle)` with an 81-character
// board string ('0' or '.' for empty cells) and receives a JSON string
// describing the next logical step, or the literal `null` when there is no
// logical step (board solved, or only guessing/brute force would advance it).
//
// JSON shape (consumed by frontend/src/lib/hints.ts):
//   {
//     "technique":        string,   // l2sg's display name, e.g. "X-Wings"
//     "description":      string,   // one-line human readable summary
//     "difficulty":       number,   // rank, lower = simpler (see rankFor)
//     "causalCells":      number[], // cell indices (0..80) forming the pattern
//     "eliminationCells": number[], // cell indices where candidates are removed
//     "eliminations":     [{ "cell": number, "digit": number }],
//     "placement":        { "cell": number, "digit": number } | null
//   }
//
// Cell index convention matches the frontend: index = row * 9 + col, with row
// and col both 0-based (l2sg uses the same 0-based row/col internally).

#include "l2sg/Enums.h"
#include "l2sg/Grid.h"
#include "l2sg/Logs.h"
#include "l2sg/Solver.h"

#include <emscripten/bind.h>

#include <set>
#include <sstream>
#include <string>
#include <utility>
#include <vector>

using namespace l2sg;

namespace
{

// Lower numbers are simpler techniques; mirrors the order the solver tries them
// in and drives the "Rank N" badge in the UI.
int rankFor(solver::Technique technique)
{
    switch (technique)
    {
        case solver::Technique::NakedSingles:
            return 1;
        case solver::Technique::HiddenSingles:
            return 2;
        case solver::Technique::LockedCandidatesType1:
        case solver::Technique::LockedCandidatesType2:
            return 3;
        case solver::Technique::NakedPair:
            return 4;
        case solver::Technique::HiddenPair:
            return 5;
        case solver::Technique::NakedTriple:
            return 6;
        case solver::Technique::HiddenTriple:
            return 7;
        case solver::Technique::NakedQuadruple:
            return 8;
        case solver::Technique::HiddenQuadruple:
            return 9;
        case solver::Technique::XWings:
            return 10;
        case solver::Technique::Skyscraper:
            return 11;
        case solver::Technique::TwoStringKite:
            return 12;
        case solver::Technique::XYWing:
            return 13;
        case solver::Technique::WWing:
            return 14;
        case solver::Technique::Swordfish:
            return 15;
        case solver::Technique::Jellyfish:
            return 16;
        default:
            return 99;
    }
}

std::string jsonEscape(const std::string &s)
{
    std::string out;
    out.reserve(s.size() + 8);
    for (const char c : s)
    {
        switch (c)
        {
            case '"':
                out += "\\\"";
                break;
            case '\\':
                out += "\\\\";
                break;
            case '\n':
                out += "\\n";
                break;
            default:
                out += c;
        }
    }
    return out;
}

// Appends value to vec only if not already present, preserving discovery order.
void pushUnique(std::vector<int> &vec, int value)
{
    for (const int existing : vec)
    {
        if (existing == value)
            return;
    }
    vec.push_back(value);
}

std::string jsonArray(const std::vector<int> &values)
{
    std::ostringstream out;
    out << '[';
    for (size_t i = 0; i < values.size(); ++i)
    {
        if (i != 0)
            out << ',';
        out << values[i];
    }
    out << ']';
    return out.str();
}

int cellIndex(const std::pair<int, int> &cell)
{
    return cell.first * 9 + cell.second;
}

} // namespace

// Returns the next logical step as a JSON string, "null" when there is no
// logical step, or {"error":"..."} when the input cannot be parsed/solved.
//
// `puzzle`     — 81 chars, '1'-'9' for givens, '0'/'.' for empty cells.
// `candidates` — optional pencil marks so the hint respects work the player has
//                already done. Format: 81 cells separated by '|', each cell a
//                run of its candidate digits ("" for filled cells), e.g.
//                "|159|3|...". Empty string => derive full candidates from the
//                values (so consecutive hints would repeat an elimination-only
//                step until a value is placed).
std::string getHint(const std::string &puzzle, const std::string &candidates)
{
    Grid grid;
    if (!grid.fillValues(puzzle))
        return "{\"error\":\"invalid_format\"}";

    if (grid.isFull())
        return "null"; // already solved

    if (!candidates.empty())
        grid.fillNotes(candidates); // respect the player's pencil marks
    else if (grid.isNotesEmpty())
        grid.fillNotes(); // derive candidates from the given values

    solver::Logs logs;
    // Cap at the hardest pure-logic level so the solver never resorts to
    // SimpleGuess / BruteForce for a hint.
    solver::solve(grid, &logs, Level::LEV_3_LOGIC);

    if (logs.empty())
        return "null"; // no logical step available from here

    // The solver tries techniques simplest-first and logs each step in order,
    // so the first log entry is the simplest next step.
    const solver::Log &step = logs.front();
    if (step.technique == solver::Technique::BadPuzzle)
        return "{\"error\":\"unsolvable\"}";

    std::vector<int> causalCells;
    std::vector<int> eliminationCells;
    std::vector<std::pair<int, int>> eliminations; // (cellIndex, digit)
    int placementCell = -1;
    int placementDigit = 0;

    for (const auto &cellLog : step.cellLogs)
    {
        const int idx = cellIndex(cellLog.cell);
        switch (cellLog.action)
        {
            case CellAction::AppliedValue:
                placementCell = idx;
                placementDigit = cellLog.value;
                pushUnique(causalCells, idx);
                break;
            case CellAction::RemovedNote:
                eliminations.emplace_back(idx, cellLog.value);
                pushUnique(eliminationCells, idx);
                break;
            case CellAction::InPatternN1:
            case CellAction::InPatternN2:
                pushUnique(causalCells, idx);
                break;
            default:
                break; // diagnostic actions are not surfaced as hints
        }
    }

    const std::string techniqueName = solver::technique2Str(step.technique);

    std::ostringstream desc;
    if (placementCell >= 0)
    {
        desc << techniqueName << ": place " << placementDigit << " in R" << (placementCell / 9 + 1) << "C"
             << (placementCell % 9 + 1) << ".";
    }
    else
    {
        std::set<int> digits;
        for (const auto &elim : eliminations)
            digits.insert(elim.second);

        desc << techniqueName << ": remove ";
        bool first = true;
        for (const int digit : digits)
        {
            if (!first)
                desc << ", ";
            desc << digit;
            first = false;
        }
        desc << " from " << eliminationCells.size() << " cell" << (eliminationCells.size() == 1 ? "" : "s") << ".";
    }

    std::ostringstream out;
    out << '{';
    out << "\"technique\":\"" << jsonEscape(techniqueName) << "\",";
    out << "\"description\":\"" << jsonEscape(desc.str()) << "\",";
    out << "\"difficulty\":" << rankFor(step.technique) << ',';
    out << "\"causalCells\":" << jsonArray(causalCells) << ',';
    out << "\"eliminationCells\":" << jsonArray(eliminationCells) << ',';
    out << "\"eliminations\":[";
    for (size_t i = 0; i < eliminations.size(); ++i)
    {
        if (i != 0)
            out << ',';
        out << "{\"cell\":" << eliminations[i].first << ",\"digit\":" << eliminations[i].second << '}';
    }
    out << "],";
    out << "\"placement\":";
    if (placementCell >= 0)
        out << "{\"cell\":" << placementCell << ",\"digit\":" << placementDigit << '}';
    else
        out << "null";
    out << '}';

    return out.str();
}

EMSCRIPTEN_BINDINGS(l2sg_hint)
{
    emscripten::function("getHint", &getHint);
}
