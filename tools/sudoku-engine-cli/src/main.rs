use serde::Serialize;
use std::collections::BTreeMap;
use std::env;
use std::process;
use sudoku_core::{Difficulty, Generator, Grid, Solver};

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
        _ => Err("usage: sudoku-engine generate --level <easy|medium|hard|expert|master> [--seed N] | rate <grid>".to_string()),
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
