# Droi-game-tool

Droi-game-tool は、Droi AI エコシステム向けのゲームアート制作ツールです。マップ制作、背景除去、キャラクターアクション素材生成を 1 つのワークフローにまとめます。

English README: [README.md](README.md)

## Droi AI

Built in 5 Minutes with Droi AI.

From concept to full game, in minutes, not weeks.

- [Droi AI GitHub](https://github.com/droidev-Studio)
- [Droi AI live experience](https://droidev-studio.github.io)
- [Project repository: Droi-AI-landing](https://github.com/droidev-Studio/Droi-AI-landing)

## Main Features

- Map Studio
- Obstacle Editor
- AI Matte with Gemini and Qwen fallback
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
