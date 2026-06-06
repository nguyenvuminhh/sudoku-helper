.PHONY: test model engine desktop-deps desktop-frontend desktop-backend desktop-dev desktop-build

test:
	python3 -m unittest discover -s tests -v
	cd frontend && npm test -- --run
	cd frontend && npm run typecheck

model:
	python3 -m pip install -r requirements-model.txt
	python3 scripts/download_digit_model.py

engine:
	cd tools/sudoku-engine-cli && cargo build --release
	mkdir -p bin
	cp tools/sudoku-engine-cli/target/release/puzzle-hint-sudoku-engine bin/sudoku-engine

desktop-deps:
	python3 -m pip install -r requirements-desktop.txt
	cd desktop && npm install

desktop-frontend:
	cd frontend && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:48731 npm run build

desktop-backend:
	cd desktop && npm run build:backend

desktop-dev: desktop-backend
	cd desktop && npm run tauri dev

desktop-build: desktop-frontend desktop-backend
	cd desktop && CI=true npm run tauri build
