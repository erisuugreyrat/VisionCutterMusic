# VisionCutter

AI-powered music video generator. Upload a track, pick a visual style and story template, generate synchronized images and videos, export as a complete music video.

## Result

![Result](example.gif)

## Interface

![Website](website.gif)

## Features

- BPM detection and beat synchronization
- 16 visual style presets (Cyberpunk, Anime, Film Noir, Pixel Art, etc.)
- 22 story templates including 6 epic 30-scene templates
- AI image generation via xAI Grok Imagine
- AI video generation via xAI Grok Imagine Video
- Pool-based concurrent generation (5 simultaneous tasks)
- Aspect ratio selection (16:9, 1:1, 9:16)
- Beats per scene selection (1 or 2)
- FFmpeg-based video export in browser
- Drag and drop scene reordering

## Tech Stack

- Next.js 14
- Zustand
- FAL.ai API
- FFmpeg.wasm
- Tailwind CSS

## Setup

```bash
npm install
npm run dev
```

Open http://localhost:3000
