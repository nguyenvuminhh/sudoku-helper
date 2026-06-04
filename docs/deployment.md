# Deployment

This app can run as a split deployment:

- Backend API and OCR on Amazon EC2.
- Static frontend on GitHub Pages.

GitHub Pages is HTTPS. The frontend API URL must also be HTTPS, otherwise browsers block API calls as mixed content.

## Backend On EC2

Install Docker on the EC2 instance, then build the API image from the repository root:

```bash
docker build -t puzzle-hint-api .
```

Run it locally on the instance:

```bash
docker run -d \
  --name puzzle-hint-api \
  --restart unless-stopped \
  -p 127.0.0.1:8000:8000 \
  -e PUZZLE_HINT_CORS_ORIGINS=https://<github-user>.github.io,https://<github-user>.github.io/<repo-name> \
  puzzle-hint-api
```

Expose it through HTTPS with a reverse proxy such as Caddy, nginx plus Certbot, or an AWS Application Load Balancer. A minimal Caddy site block looks like:

```text
api.example.com {
  reverse_proxy 127.0.0.1:8000
}
```

Then verify:

```bash
curl https://api.example.com/api/health
```

For better OCR accuracy, build the image with the ONNX runtime and downloaded MNIST model included:

```bash
docker build \
  -t puzzle-hint-api .
```

The model is downloaded from Hugging Face during image build, so that build needs outbound network access.

## Frontend On GitHub Pages

In the GitHub repository settings:

1. Enable Pages with GitHub Actions as the source.
2. Add repository variable `NEXT_PUBLIC_API_BASE_URL` with the HTTPS backend URL, for example `https://api.example.com`.
3. Add repository variable `NEXT_PUBLIC_BASE_PATH` only if this is a project Pages site.

Use these base path values:

```text
https://<github-user>.github.io/              -> NEXT_PUBLIC_BASE_PATH=
https://<github-user>.github.io/<repo-name>/  -> NEXT_PUBLIC_BASE_PATH=/<repo-name>
```

Push to `main` or run the "Deploy Frontend To GitHub Pages" workflow manually. The workflow builds `frontend/out` and deploys it with GitHub Pages Actions.

## Local Split-Deploy Check

Run backend:

```bash
PUZZLE_HINT_STATIC_DIR= \
PUZZLE_HINT_CORS_ORIGINS=http://127.0.0.1:3000 \
python3 -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8000
```

Run frontend:

```bash
cd frontend
NEXT_PUBLIC_API_BASE_URL=http://127.0.0.1:8000 npm run dev -- --hostname 127.0.0.1 --port 3000
```
