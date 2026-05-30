# Droi-game-tool

[English](README.md) | [Japanese](README.ja.md) | [Chinese](README.zh.md)

Droi-game-tool 是 Droi AI 生态下的游戏美术与动作资产生产工具。它把地图拼接、阻挡物编辑、AI 去背、人物动作分析和动作候选图生成放进同一个工作流，帮助创作者更快把粗略素材整理成可用于游戏制作的资产。

## Built in 5 Minutes with Droi AI

From concept to full game, in minutes, not weeks.

- [Project repository: Droi-AI-landing](https://github.com/droidev-Studio/Droi-AI-landing)

This entire bullet-hell game was generated end-to-end by Droi AI, complete with ECS architecture, boss patterns, particle effects, and a neon cyberpunk aesthetic.

## 核心功能

- **Map Studio**：上传地图切片或完整地图图像，拼接地图、预览画布、放置阻挡物并编辑碰撞格。
- **Obstacle Editor**：上传单张图片或整个文件夹的阻挡物素材，删除素材时同步清理已放置实例和碰撞数据。
- **AI Matte**：通过当前配置的 AI 后端自动去背，并在图片已经带透明背景时直接复用原图。
- **Character Action Studio**：分析人物图片，生成 `idle / walk / run / attack / skill / hurt / death` 的基础动作任务。
- **Progressive Generation**：动作候选图按批推进，每成功一张就立即固定在候选栏，用户可以边生成边拖拽使用。
- **Provider Routing**：通过产品界面切换多个 AI 后端，不在用户侧暴露具体模型细节。
