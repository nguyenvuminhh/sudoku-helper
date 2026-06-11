.PHONY: be fe test build dev model engine

be:
	python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001 --reload

fe:
	cd frontend && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8001 npm run dev -- --hostname 127.0.0.1 --port 3000

test:
	python3 -m unittest discover -s tests -v
	cd frontend && npm test -- --run
	cd frontend && npm run typecheck

build:
	cd frontend && npm run build

model:
	python3 -m pip install -r requirements-model.txt
	python3 scripts/download_digit_model.py

engine:
	cd tools/sudoku-engine-cli && cargo build --release
	mkdir -p bin
	cp tools/sudoku-engine-cli/target/release/puzzle-hint-sudoku-engine bin/sudoku-engine

dev:
	@echo "Run these in two separate terminals:"
	@echo "  make be"
	@echo "  make fe"
