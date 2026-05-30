# Droi-game-tool

**AI game art production toolkit for maps, matting, and character action sprites.**

[English](README.md) | [Japanese](README.ja.md) | [Chinese](README.zh.md)

## Built in 5 Minutes with Droi AI

From concept to full game, in minutes, not weeks.

[Project repository: Droi-AI-landing](https://github.com/droidev-Studio/Droi-AI-landing)

This entire bullet-hell game was generated end-to-end by Droi AI, complete with ECS architecture, boss patterns, particle effects, and a neon cyberpunk aesthetic.

Droi-game-tool is part of the Droi AI creator workflow. It helps game makers turn rough art inputs into production-ready map layouts, transparent cutouts, and character action sprite candidates.

## What It Does

- **Map Studio**: upload map tiles or full map images, stitch maps, preview the canvas, place obstacles, and edit collision cells.
- **Obstacle Editor**: upload single images or a full folder of obstacle assets into the sidebar; remove assets and automatically clear placed instances and collision data.
- **AI Matte**: remove backgrounds through the configured AI backend, while reusing images that already contain transparency.
- **Character Action Studio**: analyze a character image and build a starter action set for `idle / walk / run / attack / skill / hurt / death`.
- **Progressive Generation**: generate action candidates in batches, persist every successful frame immediately, and keep ready images available while later frames continue.
- **Provider Routing**: switch between multiple AI backends through the product interface without exposing model details to the user.

## AI Workflow

Droi-game-tool focuses on the practical asset steps that sit between idea generation and a playable game:

1. Prepare or stitch the map.
2. Add obstacle assets and collision data.
3. Remove backgrounds from character or prop art.
4. Analyze a character and generate a basic action task set.
5. Drag ready candidates into action slots while generation continues.

Ready candidates appear as they are generated, so creators can keep arranging action frames while the rest of the set continues in the background.

## Related Droi AI Projects

- [Droi-AI-landing](https://github.com/droidev-Studio/Droi-AI-landing)
