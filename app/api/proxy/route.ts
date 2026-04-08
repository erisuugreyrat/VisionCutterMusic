import { NextRequest, NextResponse } from 'next/server';
import { Client as MagicHourClient } from 'magic-hour';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import { spawn } from 'node:child_process';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MAGIC_HOUR_BASE_URL = process.env.MAGIC_HOUR_API_BASE_URL ?? 'https://api.magichour.ai';
const BEAT_ENDPOINT = process.env.MAGIC_HOUR_BEAT_ENDPOINT ?? '/v1/beat';

const MAGIC_HOUR_TOOLS = [
  'ai-anime-generator',
  'ai-art-generator',
  'ai-background-generator',
  'ai-character-generator',
  'ai-face-generator',
  'ai-fashion-generator',
  'ai-icon-generator',
  'ai-illustration-generator',
  'ai-interior-design-generator',
  'ai-landscape-generator',
  'ai-logo-generator',
  'ai-manga-generator',
  'ai-outfit-generator',
  'ai-pattern-generator',
  'ai-photo-generator',
  'ai-sketch-generator',
  'ai-tattoo-generator',
  'album-cover-generator',
  'animated-characters-generator',
  'architecture-generator',
  'book-cover-generator',
  'comic-book-generator',
  'dark-fantasy-ai',
  'disney-ai-generator',
  'dnd-ai-art-generator',
  'emoji-generator',
  'fantasy-map-generator',
  'graffiti-generator',
  'movie-poster-generator',
  'optical-illusion-generator',
  'pokemon-generator',
  'south-park-character-generator',
  'superhero-generator',
  'thumbnail-maker',
  'general',
] as const;

type MagicHourTool = (typeof MAGIC_HOUR_TOOLS)[number];

const MAGIC_HOUR_TOOL_SET = new Set<string>(MAGIC_HOUR_TOOLS);

const PUBLIC_DIR = path.join(process.cwd(), 'public');
const OUTPUT_DIR = path.join(PUBLIC_DIR, 'outputs');
const INPUTS_DIR = path.join(OUTPUT_DIR, '_inputs');

function ensureDirs() {
  if (!fs.existsSync(OUTPUT_DIR)) fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  if (!fs.existsSync(INPUTS_DIR)) fs.mkdirSync(INPUTS_DIR, { recursive: true });
}

function getMagicHourClient() {
  const token = process.env.MAGIC_HOUR_API_KEY;
  if (!token) throw new Error('Missing MAGIC_HOUR_API_KEY');
  return new MagicHourClient({ token });
}

async function callMagicHour(endpoint: string, payload: unknown) {
  const token = process.env.MAGIC_HOUR_API_KEY;
  if (!token) throw new Error('Missing MAGIC_HOUR_API_KEY');

  const res = await fetch(`${MAGIC_HOUR_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(payload),
    cache: 'no-store',
  });

  const text = await res.text();
  let data: unknown;

  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    throw new Error(typeof data === 'object' && data !== null ? JSON.stringify(data) : String(data));
  }

  return data;
}

function mapAspectRatioToOrientation(
  aspectRatio: '16:9' | '1:1' | '9:16'
): 'landscape' | 'square' | 'portrait' {
  if (aspectRatio === '1:1') return 'square';
  if (aspectRatio === '9:16') return 'portrait';
  return 'landscape';
}

function getProp<T>(value: unknown, key: string): T | undefined {
  if (!value || typeof value !== 'object') return undefined;
  return (value as Record<string, unknown>)[key] as T | undefined;
}

function extractDownloadedPath(payload: unknown): string | undefined {
  return getProp<string[]>(payload, 'downloadedPaths')?.[0];
}

function toPublicUrl(absFilePath: string): string {
  const abs = path.resolve(absFilePath);
  const rel = path.relative(PUBLIC_DIR, abs).replace(/\\/g, '/');
  return `/${rel}`;
}

function isSafeHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

function stripQueryAndHash(p: string): string {
  const q = p.indexOf('?');
  const h = p.indexOf('#');
  const cut = [q, h].filter((n) => n >= 0).sort((a, b) => a - b)[0];
  return cut === undefined ? p : p.slice(0, cut);
}

function extFromContentType(contentType: string | null): string {
  const c = (contentType || '').toLowerCase();
  if (c.includes('png')) return '.png';
  if (c.includes('jpeg') || c.includes('jpg')) return '.jpg';
  if (c.includes('webp')) return '.webp';
  if (c.includes('gif')) return '.gif';
  if (c.includes('mp4')) return '.mp4';
  if (c.includes('quicktime')) return '.mov';
  if (c.includes('mpeg')) return '.mp4';
  return '.bin';
}

function extFromPathname(p: string): string {
  const ext = path.extname(stripQueryAndHash(p)).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.webp', '.gif', '.mp4', '.mov'].includes(ext)) return ext;
  return '';
}

function uniqueName(prefix: 'image' | 'video' | 'input' | 'job' | 'trim', ext: string): string {
  const stamp = Date.now();
  const rand = crypto.randomBytes(4).toString('hex');
  return `${prefix}-${stamp}-${rand}${ext || '.bin'}`;
}

function sanitizeKey(input: string): string {
  return input.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 80);
}

function moveToOutput(srcPath: string, prefix: 'image' | 'video', outputKey?: string): string {
  const ext = path.extname(srcPath) || '.bin';
  const safeKey = outputKey ? sanitizeKey(outputKey) : '';
  const finalName = safeKey ? `${prefix}-${safeKey}${ext}` : uniqueName(prefix, ext);
  const finalPath = path.join(OUTPUT_DIR, finalName);

  const srcAbs = path.resolve(srcPath);
  const dstAbs = path.resolve(finalPath);

  if (srcAbs === dstAbs) return finalPath;

  if (fs.existsSync(dstAbs)) fs.unlinkSync(dstAbs);
  fs.renameSync(srcAbs, dstAbs);
  return finalPath;
}

function resolveLocalOutputPathFromUrlish(mediaUrl: string): string | null {
  if (mediaUrl.startsWith('/outputs/')) {
    const clean = stripQueryAndHash(mediaUrl);
    const rel = clean.replace(/^\/+/, '');
    const abs = path.resolve(PUBLIC_DIR, rel);
    if (!abs.startsWith(path.resolve(OUTPUT_DIR))) return null;
    return fs.existsSync(abs) ? abs : null;
  }

  if (isSafeHttpUrl(mediaUrl)) {
    const u = new URL(mediaUrl);
    if (u.pathname.startsWith('/outputs/')) {
      const rel = stripQueryAndHash(u.pathname).replace(/^\/+/, '');
      const abs = path.resolve(PUBLIC_DIR, rel);
      if (!abs.startsWith(path.resolve(OUTPUT_DIR))) return null;
      return fs.existsSync(abs) ? abs : null;
    }
  }

  return null;
}

async function saveBufferToInputFile(buf: Buffer, extHint = '.png'): Promise<string> {
  const ext = extHint || '.png';
  const filePath = path.join(INPUTS_DIR, uniqueName('input', ext));
  fs.writeFileSync(filePath, buf);
  return filePath;
}

async function downloadUrlToInputFile(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to download file: ${res.status}`);

  const ctype = res.headers.get('content-type');
  const ext = extFromPathname(url) || extFromContentType(ctype) || '.png';
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) throw new Error('Downloaded file is empty');

  return saveBufferToInputFile(buf, ext);
}

async function resolveImageInputForVideo(imageUrl: string): Promise<string> {
  const localOutput = resolveLocalOutputPathFromUrlish(imageUrl);
  if (localOutput) {
    const ext = path.extname(localOutput) || '.png';
    const buf = fs.readFileSync(localOutput);
    return saveBufferToInputFile(buf, ext);
  }

  if (imageUrl.startsWith('/api/proxy?')) {
    const u = new URL(imageUrl, 'http://localhost');
    const nested = u.searchParams.get('url');
    if (!nested || !isSafeHttpUrl(nested)) {
      throw new Error('Invalid /api/proxy?url=... imageUrl');
    }
    return downloadUrlToInputFile(nested);
  }

  if (isSafeHttpUrl(imageUrl)) {
    return downloadUrlToInputFile(imageUrl);
  }

  throw new Error('imageUrl must be /outputs/... or http(s) URL');
}

function isImageExt(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  return ['.png', '.jpg', '.jpeg', '.webp', '.gif'].includes(ext);
}

function normalizeResolution(input?: string): '480p' | '720p' | '1080p' | undefined {
  if (input === '480p' || input === '720p' || input === '1080p') return input;
  return undefined;
}

function isValidMagicHourTool(tool: string): tool is MagicHourTool {
  return MAGIC_HOUR_TOOL_SET.has(tool);
}

function toErrorPayload(error: unknown) {
  const e = error as Record<string, unknown>;
  return {
    message: error instanceof Error ? error.message : 'Unknown error',
    name: typeof e?.name === 'string' ? e.name : undefined,
    status: typeof e?.status === 'number' ? e.status : undefined,
    code: typeof e?.code === 'string' ? e.code : undefined,
    response: e?.response ?? undefined,
    cause: e?.cause ?? undefined,
  };
}

function runFfmpeg(args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const proc = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';

    proc.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });

    proc.on('error', reject);

    proc.on('close', (code) => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg failed (${code}): ${stderr}`));
    });
  });
}

async function downloadToFile(url: string, outPath: string) {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  if (!buf.length) {
    throw new Error(`Downloaded file is empty: ${url}`);
  }
  await fsp.writeFile(outPath, buf);
}

function resolveToAbsoluteUrl(raw: string, request: NextRequest): string {
  if (isSafeHttpUrl(raw)) return raw;
  const origin = new URL(request.url).origin;
  return new URL(raw, origin).toString();
}

async function trimClipToDuration(inputPath: string, outputPath: string, durationSeconds: number) {
  const safeDuration = Math.max(0.1, Number(durationSeconds.toFixed(3)));
  await runFfmpeg([
    '-y',
    '-i',
    inputPath,
    '-t',
    String(safeDuration),
    '-an',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    outputPath,
  ]);
}

async function composeClips(
  request: NextRequest,
  clipUrls: string[],
  audioUrl?: string | null,
  bpm?: number | null,
  beatsPerScene?: number | null,
  outputKey?: string
) {
  if (!Array.isArray(clipUrls) || clipUrls.length === 0) {
    throw new Error('clipUrls is required');
  }

  ensureDirs();

  const hasBeatCut =
    typeof bpm === 'number' &&
    Number.isFinite(bpm) &&
    bpm > 0 &&
    typeof beatsPerScene === 'number' &&
    Number.isFinite(beatsPerScene) &&
    beatsPerScene > 0;

  const secondsPerScene = hasBeatCut ? (60 / bpm!) * beatsPerScene! : null;

  const jobId = uniqueName('job', '').replace(/\.[^.]+$/, '');
  const workDir = path.join(os.tmpdir(), `visioncutter-${jobId}`);
  const clipsDir = path.join(workDir, 'clips');
  const audioDir = path.join(workDir, 'audio');

  await fsp.mkdir(workDir, { recursive: true });
  await fsp.mkdir(clipsDir, { recursive: true });
  await fsp.mkdir(audioDir, { recursive: true });

  const localClips: string[] = [];

  for (let i = 0; i < clipUrls.length; i++) {
    const absoluteClipUrl = resolveToAbsoluteUrl(clipUrls[i], request);
    const rawClipPath = path.join(clipsDir, `raw_${String(i).padStart(3, '0')}.mp4`);
    await downloadToFile(absoluteClipUrl, rawClipPath);

    if (secondsPerScene) {
      const trimmedPath = path.join(clipsDir, `clip_${String(i).padStart(3, '0')}.mp4`);
      await trimClipToDuration(rawClipPath, trimmedPath, secondsPerScene);
      localClips.push(trimmedPath);
    } else {
      const clipPath = path.join(clipsDir, `clip_${String(i).padStart(3, '0')}.mp4`);
      await fsp.copyFile(rawClipPath, clipPath);
      localClips.push(clipPath);
    }
  }

  let localAudioPath: string | null = null;
  if (audioUrl) {
    const absoluteAudioUrl = resolveToAbsoluteUrl(audioUrl, request);
    localAudioPath = path.join(audioDir, 'audio.mp3');
    await downloadToFile(absoluteAudioUrl, localAudioPath);
  }

  const concatListPath = path.join(workDir, 'concat.txt');
  const concatList = localClips.map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`).join('\n');
  await fsp.writeFile(concatListPath, concatList, 'utf-8');

  const silentOutPath = path.join(workDir, 'stitched_silent.mp4');
  await runFfmpeg([
    '-y',
    '-f',
    'concat',
    '-safe',
    '0',
    '-i',
    concatListPath,
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-movflags',
    '+faststart',
    silentOutPath,
  ]);

  const finalName = outputKey ? `final-${sanitizeKey(outputKey) || jobId}.mp4` : `${jobId}.mp4`;
  const finalPath = path.join(OUTPUT_DIR, finalName);

  if (localAudioPath) {
    await runFfmpeg([
      '-y',
      '-i',
      silentOutPath,
      '-i',
      localAudioPath,
      '-c:v',
      'copy',
      '-c:a',
      'aac',
      '-shortest',
      '-movflags',
      '+faststart',
      finalPath,
    ]);
  } else {
    fs.copyFileSync(silentOutPath, finalPath);
  }

  const finalUrl = toPublicUrl(finalPath);

  return {
    finalUrl,
    url: finalUrl,
    savedPath: finalPath,
    outputDir: OUTPUT_DIR,
    clipCount: clipUrls.length,
    bpm: bpm ?? null,
    beatsPerScene: beatsPerScene ?? null,
    secondsPerScene: secondsPerScene ?? null,
  };
}

export async function GET(request: NextRequest) {
  const list = request.nextUrl.searchParams.get('list');
  if (list === '1') {
    ensureDirs();
    const files = fs
      .readdirSync(OUTPUT_DIR, { withFileTypes: true })
      .filter((e) => e.isFile())
      .map((e) => {
        const abs = path.join(OUTPUT_DIR, e.name);
        const stat = fs.statSync(abs);
        return { id: e.name, url: `/outputs/${e.name}`, createdAt: stat.mtimeMs };
      })
      .sort((a, b) => b.createdAt - a.createdAt);

    return NextResponse.json({ outputDir: OUTPUT_DIR, files });
  }

  const url = request.nextUrl.searchParams.get('url');
  if (!url || !isSafeHttpUrl(url)) {
    return NextResponse.json({ error: 'Valid URL parameter is required' }, { status: 400 });
  }

  const response = await fetch(url);
  if (!response.ok) {
    return NextResponse.json({ error: `Failed to fetch: ${response.status}` }, { status: response.status });
  }

  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const buffer = await response.arrayBuffer();

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=300',
      'Access-Control-Allow-Origin': '*',
    },
  });
}

export async function POST(request: NextRequest) {
  try {
    ensureDirs();

    const body = (await request.json()) as {
      action?: 'image' | 'video' | 'beat' | 'stitch' | 'compose' | string;
      type?: 'image' | 'video' | 'beat' | 'stitch' | 'compose' | string;
      prompt?: string;
      tool?: string;
      style?: {
        prompt?: string;
        tool?: string;
      };
      aspectRatio?: '16:9' | '1:1' | '9:16';
      imageUrl?: string;
      assets?: { imageFilePath?: string };
      endSeconds?: number;
      duration?: number;
      resolution?: string;
      quality?: 'low' | 'medium' | 'high';
      model?: string;
      name?: string;
      sceneId?: string;
      outputKey?: string;
      audioUrl?: string;
      clipUrls?: string[];
      preset?: string | null;
      bpm?: number;
      beatsPerScene?: number;
    };

    const client = getMagicHourClient();

    const action = body.action ?? body.type;
    const prompt = body.prompt?.trim() || body.style?.prompt?.trim() || '';
    const tool = body.tool?.trim() || body.style?.tool?.trim() || '';
    const magicHourTool = tool && isValidMagicHourTool(tool) ? tool : undefined;
    const imageUrl = body.imageUrl ?? body.assets?.imageFilePath;
    const outputKey = body.sceneId?.trim() || body.outputKey?.trim() || undefined;

    const resolvedAction: 'image' | 'video' | 'beat' | 'stitch' | 'compose' = (() => {
      if (
        action === 'image' ||
        action === 'video' ||
        action === 'beat' ||
        action === 'stitch' ||
        action === 'compose'
      ) {
        return action;
      }

      return imageUrl ? 'video' : 'image';
    })();

    if (resolvedAction === 'beat') {
      const result = await callMagicHour(BEAT_ENDPOINT, {
        audioUrl: body.audioUrl,
        preset: body.preset ?? null,
        sceneId: body.sceneId ?? null,
      });
      return NextResponse.json(result);
    }

    if (resolvedAction === 'compose' || resolvedAction === 'stitch') {
      const result = await composeClips(
        request,
        body.clipUrls ?? [],
        body.audioUrl ?? null,
        body.bpm ?? null,
        body.beatsPerScene ?? null,
        outputKey
      );
      return NextResponse.json(result);
    }

    if (resolvedAction === 'image') {
      if (!prompt) {
        return NextResponse.json({ error: 'prompt is required' }, { status: 400 });
      }

      const orientation = mapAspectRatioToOrientation(body.aspectRatio ?? '16:9');

      const imagePayload: {
        imageCount: number;
        orientation: 'landscape' | 'square' | 'portrait';
        style: {
          prompt: string;
          tool?: MagicHourTool;
        };
      } = {
        imageCount: 1,
        orientation,
        style: {
          prompt,
          ...(magicHourTool ? { tool: magicHourTool } : {}),
        },
      };

      const result = await client.v1.aiImageGenerator.generate(imagePayload, {
        waitForCompletion: true,
        downloadOutputs: true,
        downloadDirectory: OUTPUT_DIR,
      });

      const rawDownloadedPath = extractDownloadedPath(result);
      if (!rawDownloadedPath) {
        return NextResponse.json({ error: 'No image file downloaded by Magic Hour' }, { status: 502 });
      }

      const finalPath = moveToOutput(rawDownloadedPath, 'image', outputKey);
      const localUrl = toPublicUrl(finalPath);

      return NextResponse.json({
        imageUrl: localUrl,
        url: localUrl,
        visualId: path.basename(finalPath),
        savedPath: finalPath,
        outputDir: OUTPUT_DIR,
      });
    }

    if (!imageUrl) {
      return NextResponse.json({ error: 'imageUrl is required for video generation' }, { status: 400 });
    }

    const model = body.model?.trim();
    if (!model || model === 'default') {
      return NextResponse.json({ error: 'Explicit video model is required (e.g. ltx-2)' }, { status: 400 });
    }

    const inputImagePath = await resolveImageInputForVideo(imageUrl);

    if (!fs.existsSync(inputImagePath)) {
      return NextResponse.json(
        { error: 'Resolved input image does not exist', inputImagePath },
        { status: 400 }
      );
    }

    if (!isImageExt(inputImagePath)) {
      return NextResponse.json(
        { error: 'Resolved input is not an image file', inputImagePath },
        { status: 400 }
      );
    }

    const durationRaw = typeof body.endSeconds === 'number' ? body.endSeconds : body.duration;
    const endSeconds =
      typeof durationRaw === 'number' && Number.isFinite(durationRaw) && durationRaw >= 1
        ? Number(durationRaw.toFixed(2))
        : 5;

    const payload: Record<string, unknown> = {
      model,
      assets: { imageFilePath: inputImagePath },
      style: { prompt: prompt || 'subtle camera movement, slow zoom, cinematic motion' },
      endSeconds,
    };

    const safeResolution = normalizeResolution(body.resolution);
    if (safeResolution) payload.resolution = safeResolution;
    if (body.name?.trim()) payload.name = body.name.trim();

    console.log('[proxy.video] incoming model:', body.model);
    console.log('[proxy.video] forwarded model:', payload.model);

    const result = await client.v1.imageToVideo.generate(
      payload as Parameters<typeof client.v1.imageToVideo.generate>[0],
      {
        waitForCompletion: true,
        downloadOutputs: true,
        downloadDirectory: OUTPUT_DIR,
      }
    );

    const rawDownloadedPath = extractDownloadedPath(result);
    if (!rawDownloadedPath) {
      return NextResponse.json(
        {
          error: 'No video file downloaded by Magic Hour',
          debug: {
            inputImagePath,
            inputExists: fs.existsSync(inputImagePath),
            result,
          },
        },
        { status: 502 }
      );
    }

    const finalPath = moveToOutput(rawDownloadedPath, 'video', outputKey);
    const localUrl = toPublicUrl(finalPath);

    return NextResponse.json({
      videoUrl: localUrl,
      url: localUrl,
      visualId: path.basename(finalPath),
      savedPath: finalPath,
      inputImagePath,
      outputDir: OUTPUT_DIR,
    });
  } catch (error) {
    const details = toErrorPayload(error);
    return NextResponse.json({ error: details.message, details }, { status: 500 });
  }
}