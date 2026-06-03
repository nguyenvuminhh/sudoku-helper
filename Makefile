.PHONY: be fe test build dev model

be:
	python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000 --reload

fe:
	cd frontend && NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --hostname 127.0.0.1 --port 3000

test:
	python3 -m unittest discover -s tests -v
	cd frontend && npm test -- --run
	cd frontend && npm run typecheck

build:
	cd frontend && npm run build

model:
	python3 -m pip install -r requirements-model.txt
	python3 scripts/download_digit_model.py

dev:
	@echo "Run these in two separate terminals:"
	@echo "  make be"
	@echo "  make fe"
