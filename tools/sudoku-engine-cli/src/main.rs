use serde::Serialize;
use std::collections::BTreeMap;
use std::env;
use std::process;
use sudoku_core::{Difficulty, Generator, Grid, Hint, HintType, Position, Solver, Technique};

#[derive(Serialize)]
struct Attribution {
    name: &'static str,
    url: &'static str,
    license: &'static str,
}

#[derive(Serialize)]
struct EngineResponse {
    puzzle: String,
    solution: String,
    level: String,
    requested_level: String,
    se_rating: f32,
    techniques: Vec<String>,
    technique_profile: BTreeMap<String, u32>,
    attribution: Attribution,
}

#[derive(Serialize)]
struct ApiTechnique {
    id: String,
    name: String,
    rank: u32,
}

#[derive(Serialize, Clone)]
struct ApiCell {
    row: usize,
    col: usize,
}

#[derive(Serialize, Clone)]
struct ApiElimination {
    cell: ApiCell,
    digit: u8,
}

#[derive(Serialize)]
struct ApiAction {
    #[serde(rename = "type")]
    action_type: &'static str,
    cell: Option<ApiCell>,
    digit: Option<u8>,
    eliminations: Vec<ApiElimination>,
}

#[derive(Serialize)]
struct ApiHighlights {
    primary_cells: Vec<ApiCell>,
    related_cells: Vec<ApiCell>,
    eliminations: Vec<ApiElimination>,
}

#[derive(Serialize)]
struct ApiHintResponse {
    technique: ApiTechnique,
    action: ApiAction,
    summary: String,
    explanation: Vec<String>,
    highlights: ApiHighlights,
}

fn main() {
    if let Err(error) = run() {
        eprintln!("{error}");
        process::exit(2);
    }
}

fn run() -> Result<(), String> {
    let mut args = env::args().skip(1);
    match args.next().as_deref() {
        Some("generate") => {
            let mut level = "easy".to_string();
            let mut seed: Option<u64> = None;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--level" => level = args.next().ok_or("--level requires a value")?,
                    "--seed" => {
                        let raw = args.next().ok_or("--seed requires a value")?;
                        seed = Some(raw.parse::<u64>().map_err(|_| "--seed must be an integer")?);
                    }
                    other => return Err(format!("unknown generate argument: {other}")),
                }
            }

            let requested = parse_level(&level)?;
            let mut generator = seed.map(Generator::with_seed).unwrap_or_else(Generator::new);
            let puzzle = generator.generate(requested);
            print_response(&puzzle, requested)
        }
        Some("rate") => {
            let raw_grid = args.next().ok_or("rate requires an 81-character grid")?;
            let puzzle = Grid::from_string(&raw_grid).ok_or("grid must contain 81 digits, zeroes, or dots")?;
            let solver = Solver::new();
            let requested = solver.rate_difficulty(&puzzle);
            print_response(&puzzle, requested)
        }
        Some("hint") => {
            let raw_grid = args.next().ok_or("hint requires an 81-character grid")?;
            let mut candidates_json: Option<String> = None;
            while let Some(arg) = args.next() {
                match arg.as_str() {
                    "--candidates" => candidates_json = Some(args.next().ok_or("--candidates requires a JSON value")?),
                    other => return Err(format!("unknown hint argument: {other}")),
                }
            }

            let puzzle = Grid::from_string(&raw_grid).ok_or("grid must contain 81 digits, zeroes, or dots")?;
            let candidates = candidates_json
                .as_deref()
                .map(parse_candidates)
                .transpose()?;
            print_hint_response(&puzzle, candidates.as_ref())
        }
        _ => Err("usage: sudoku-engine generate --level <easy|medium|hard|expert|master> [--seed N] | rate <grid> | hint <grid> [--candidates JSON]".to_string()),
    }
}

fn print_response(puzzle: &Grid, requested: Difficulty) -> Result<(), String> {
    let solver = Solver::new();
    let solution = solver.solve(puzzle).ok_or("generated puzzle has no solution")?;
    let (rated, se_rating) = solver.analyze(puzzle);
    let (profile, _) = solver
        .collect_technique_profile(puzzle)
        .ok_or("could not collect technique profile")?;
    let technique_profile: BTreeMap<String, u32> = profile
        .into_iter()
        .map(|(name, count)| (technique_id(&name), count))
        .collect();
    let techniques = technique_profile.keys().cloned().collect();

    let response = EngineResponse {
        puzzle: normalize_grid(&puzzle.to_string_compact()),
        solution: normalize_grid(&solution.to_string_compact()),
        level: export_level(rated).to_string(),
        requested_level: export_level(requested).to_string(),
        se_rating,
        techniques,
        technique_profile,
        attribution: Attribution {
            name: "Ukodus sudoku-core",
            url: "https://github.com/kcirtapfromspace/sudoku-core",
            license: "MIT",
        },
    };

    println!("{}", serde_json::to_string(&response).map_err(|error| error.to_string())?);
    Ok(())
}

fn print_hint_response(puzzle: &Grid, candidates: Option<&BTreeMap<usize, Vec<u8>>>) -> Result<(), String> {
    let solver = Solver::new();
    let direct_hint = solver.get_hint(puzzle);
    let response = match direct_hint.and_then(|hint| export_hint(&hint, candidates)) {
        Some(response) => response,
        None => {
            let placement = solver
                .get_next_placement(puzzle)
                .ok_or("could not find a hint for this grid")?;
            export_hint(&placement, None).ok_or("could not export engine hint")?
        }
    };

    println!("{}", serde_json::to_string(&response).map_err(|error| error.to_string())?);
    Ok(())
}

fn export_hint(hint: &Hint, candidates: Option<&BTreeMap<usize, Vec<u8>>>) -> Option<ApiHintResponse> {
    match &hint.hint_type {
        HintType::SetValue { pos, value } => Some(export_placement_hint(hint.technique, *pos, *value, &hint.explanation, &hint.involved_cells)),
        HintType::EliminateCandidates { pos, values } => {
            let kept_values: Vec<u8> = values
                .iter()
                .copied()
                .filter(|value| candidate_is_visible(candidates, *pos, *value))
                .collect();
            if kept_values.is_empty() {
                return None;
            }
            Some(export_elimination_hint(hint.technique, *pos, &kept_values, &hint.explanation, &hint.involved_cells))
        }
    }
}

fn export_placement_hint(
    technique: Technique,
    pos: Position,
    value: u8,
    engine_explanation: &str,
    involved_cells: &[Position],
) -> ApiHintResponse {
    let cell = api_cell(pos);
    let related_cells = related_cells(involved_cells, &[pos]);
    ApiHintResponse {
        technique: api_technique(technique),
        action: ApiAction {
            action_type: "place",
            cell: Some(api_cell(pos)),
            digit: Some(value),
            eliminations: Vec::new(),
        },
        summary: format!("R{}C{} should be {} using {}.", cell.row, cell.col, value, technique),
        explanation: vec![
            format!("Conclusion: place {} in R{}C{}.", value, cell.row, cell.col),
            engine_explanation.to_string(),
            "This step comes from the Ukodus sudoku-core engine.".to_string(),
        ],
        highlights: ApiHighlights {
            primary_cells: vec![cell],
            related_cells,
            eliminations: Vec::new(),
        },
    }
}

fn export_elimination_hint(
    technique: Technique,
    pos: Position,
    values: &[u8],
    engine_explanation: &str,
    involved_cells: &[Position],
) -> ApiHintResponse {
    let cell = api_cell(pos);
    let eliminations: Vec<ApiElimination> = values
        .iter()
        .map(|value| ApiElimination {
            cell: api_cell(pos),
            digit: *value,
        })
        .collect();
    let digits = values
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>()
        .join(", ");
    ApiHintResponse {
        technique: api_technique(technique),
        action: ApiAction {
            action_type: "eliminate",
            cell: None,
            digit: None,
            eliminations: eliminations.clone(),
        },
        summary: format!("Remove {} from R{}C{} using {}.", digits, cell.row, cell.col, technique),
        explanation: vec![
            format!("Conclusion: remove {} from R{}C{}.", digits, cell.row, cell.col),
            engine_explanation.to_string(),
            "This step comes from the Ukodus sudoku-core engine.".to_string(),
        ],
        highlights: ApiHighlights {
            primary_cells: related_cells(involved_cells, &[]),
            related_cells: Vec::new(),
            eliminations,
        },
    }
}

fn api_technique(technique: Technique) -> ApiTechnique {
    let name = technique.to_string();
    ApiTechnique {
        id: technique_id(&name),
        name,
        rank: (technique.se_rating() * 10.0).round() as u32,
    }
}

fn api_cell(pos: Position) -> ApiCell {
    ApiCell {
        row: pos.row + 1,
        col: pos.col + 1,
    }
}

fn related_cells(positions: &[Position], excluded: &[Position]) -> Vec<ApiCell> {
    positions
        .iter()
        .copied()
        .filter(|pos| !excluded.contains(pos))
        .map(api_cell)
        .collect()
}

fn candidate_is_visible(candidates: Option<&BTreeMap<usize, Vec<u8>>>, pos: Position, value: u8) -> bool {
    match candidates {
        None => true,
        Some(candidate_map) => candidate_map
            .get(&(pos.row * 9 + pos.col))
            .map(|values| values.contains(&value))
            .unwrap_or(false),
    }
}

fn parse_candidates(value: &str) -> Result<BTreeMap<usize, Vec<u8>>, String> {
    let raw: BTreeMap<String, Vec<u8>> =
        serde_json::from_str(value).map_err(|error| format!("invalid candidates JSON: {error}"))?;
    let mut candidates = BTreeMap::new();
    for (raw_index, raw_values) in raw {
        let index = raw_index
            .parse::<usize>()
            .map_err(|_| format!("candidate index {raw_index} must be an integer"))?;
        if index > 80 {
            return Err(format!("candidate index {index} must be between 0 and 80"));
        }
        if raw_values.iter().any(|value| !(1..=9).contains(value)) {
            return Err(format!("candidates for cell {} must be digits from 1 to 9", index + 1));
        }
        candidates.insert(index, raw_values);
    }
    Ok(candidates)
}

fn parse_level(value: &str) -> Result<Difficulty, String> {
    match value {
        "easy" => Ok(Difficulty::Easy),
        "medium" => Ok(Difficulty::Medium),
        "hard" => Ok(Difficulty::Hard),
        "expert" => Ok(Difficulty::Expert),
        "master" => Ok(Difficulty::Master),
        other => Err(format!("unknown difficulty level: {other}")),
    }
}

fn export_level(level: Difficulty) -> &'static str {
    match level {
        Difficulty::Beginner | Difficulty::Easy => "easy",
        Difficulty::Medium => "medium",
        Difficulty::Intermediate | Difficulty::Hard => "hard",
        Difficulty::Expert => "expert",
        Difficulty::Master | Difficulty::Extreme => "master",
    }
}

fn normalize_grid(value: &str) -> String {
    value.chars().map(|cell| if cell == '.' { '0' } else { cell }).collect()
}

fn technique_id(name: &str) -> String {
    name.to_lowercase()
        .replace("+1", "plus_one")
        .replace("3d", "three_d")
        .chars()
        .map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '_' })
        .collect::<String>()
        .split('_')
        .filter(|part| !part.is_empty())
        .collect::<Vec<_>>()
        .join("_")
}
