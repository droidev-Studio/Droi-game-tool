# Droi-game-tool

**AI game art production toolkit for maps, matting, and character action sprites.**

[English](README.md) | [日本語](README.ja.md)

![React](https://img.shields.io/badge/React-19-61dafb?style=flat-square)
![FastAPI](https://img.shields.io/badge/FastAPI-backend-009688?style=flat-square)
![Gemini](https://img.shields.io/badge/Gemini-default%20AI-4285f4?style=flat-square)
![Qwen](https://img.shields.io/badge/Qwen-fallback%20AI-6f42c1?style=flat-square)

## Built in 5 Minutes with Droi AI

From concept to full game, in minutes, not weeks.

[Droi AI GitHub](https://github.com/droidev-Studio) | [Experience the future of game development](https://droidev-studio.github.io) | [Project repository: Droi-AI-landing](https://github.com/droidev-Studio/Droi-AI-landing)

This entire bullet-hell game was generated end-to-end by Droi AI, complete with ECS architecture, boss patterns, particle effects, and a neon cyberpunk aesthetic.

Droi-game-tool is part of the Droi AI creator workflow. It helps game makers turn rough art inputs into production-ready map layouts, transparent cutouts, and character action sprite candidates.

## What It Does

- **Map Studio**: upload map tiles or full map images, stitch maps, preview the canvas, place obstacles, and edit collision cells.
- **Obstacle Editor**: upload single images or a full folder of obstacle assets into the sidebar; remove assets and automatically clear placed instances and collision data.
- **AI Matte**: remove backgrounds with Gemini by default, while reusing images that already contain transparency.
- **Character Action Studio**: analyze a character image and build a starter action set for `idle / walk / run / attack / skill / hurt / death`.
- **Progressive Generation**: generate action candidates in batches, persist every successful frame immediately, and keep ready images available while later frames continue.
- **Provider Fallback**: use Gemini first and Qwen/DashScope as fallback, with all API keys read from local environment variables only.

## AI Workflow

Droi-game-tool focuses on the practical asset steps that sit between idea generation and a playable game:

1. Prepare or stitch the map.
2. Add obstacle assets and collision data.
3. Remove backgrounds from character or prop art.
4. Analyze a character and generate a basic action task set.
5. Drag ready candidates into action slots while generation continues.

The backend exposes partial character-action job results during processing, so the frontend can show successful candidates immediately instead of waiting for the full batch to finish.

## Local Development

Requirements:

- Python 3.11+
- Node.js 18+

Install dependencies:

```powershell
py -m pip install -r backend/requirements.txt

cd frontend
npm install
```

Start the backend:

```powershell
$env:PYTHONPATH = (Get-Location).Path
py -m uvicorn backend.app.main:app --reload --port 8000
```

Start the frontend:

```powershell
cd frontend
npm run dev
```

Open `http://127.0.0.1:5173/`.

## Environment Variables

Create `.env.local` in the repository root, or set the variables in your local shell. Never commit real API keys.

Recommended names:

- `GEMINI_API_KEY`
- `DASHSCOPE_API_KEY`

Compatible aliases:

- `GOOGLE_API_KEY`
- `QWEN_API_KEY`

## Main API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | Backend health check |
| `POST` | `/matte` | AI background removal, preferring Gemini with local fallback |
| `POST` | `/character-action/analyze` | Create a character action analysis and generation job |
| `GET` | `/character-action/analyze/{job_id}` | Poll job status, including partial candidates while processing |
| `GET` | `/character-action/analyze/{job_id}/result` | Read the completed action result |
| `GET` | `/character-action/analyze/{job_id}/assets/{filename}` | Read generated candidate image assets |

## Validation

```powershell
cd frontend
npm run build

cd ..
py -m py_compile backend\app\main.py backend\app\gemini_provider.py backend\app\qwen_provider.py
```

Before publishing, run a secret scan and confirm that `.env.local`, `backend/outputs/`, local logs, and generated assets are not included.

## Related Droi AI Projects

- [Droi AI GitHub](https://github.com/droidev-Studio)
- [Droi AI live experience](https://droidev-studio.github.io)
- [Droi-AI-landing](https://github.com/droidev-Studio/Droi-AI-landing)

## Project Layout

| Path | Description |
| --- | --- |
| `frontend/` | React frontend app |
| `backend/app/main.py` | FastAPI app and job endpoints |
| `backend/app/gemini_provider.py` | Gemini image and action generation |
| `backend/app/qwen_provider.py` | Qwen fallback provider |
| `backend/outputs/` | Local generated outputs, ignored by Git |
