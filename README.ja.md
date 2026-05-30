# Droi-game-tool

[English](README.md) | [Japanese](README.ja.md) | [Chinese](README.zh.md)

Droi-game-tool is the game art production toolkit in the Droi AI ecosystem. It brings map composition, background removal, and character action sprite generation into one workflow.

## Droi AI

Built in 5 Minutes with Droi AI.

From concept to full game, in minutes, not weeks.

- [Droi AI GitHub](https://github.com/droidev-Studio)
- [Droi AI live experience](https://droidev-studio.github.io)
- [Project repository: Droi-AI-landing](https://github.com/droidev-Studio/Droi-AI-landing)

## Main Features

- Map Studio
- Obstacle Editor
- AI Matte through configurable AI backends
- Character Action Studio
- Progressive action candidate generation

## Local Development

```powershell
py -m pip install -r backend/requirements.txt

cd frontend
npm install
npm run dev
```

Backend:

```powershell
$env:PYTHONPATH = (Get-Location).Path
py -m uvicorn backend.app.main:app --reload --port 8000
```

Open `http://127.0.0.1:5173/`.

Do not commit real API keys, `.env.local`, generated outputs, or local logs.
