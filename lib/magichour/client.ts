type AspectRatio = '16:9' | '1:1' | '9:16';
type Quality = 'low' | 'medium' | 'high';

export type VideoModel =
  | 'default'
  | 'ltx-2'
  | 'seedance'
  | 'kling-2.5'
  | 'kling-3.0'
  | 'veo3.1'
  | 'sora-2'
  | 'kling-1.6'
  | 'kling-2.5-audio'
  | 'veo3.1-audio';

export type ImageModel =
  | 'default'
  | 'flux-schnell'
  | 'z-image-turbo'
  | 'seedream'
  | 'nano-banana'
  | 'nano-banana-2'
  | 'nano-banana-pro';

export type ImageResolution = 'auto' | '2k' | '4k';

type VideoOptions = {
  model?: VideoModel;
  quality?: Quality;
  duration?: number; // Maps to endSeconds
};

type ImageOptions = {
  model?: ImageModel;
  resolution?: ImageResolution;
  tool?: string;
  name?: string;
  imageCount?: number;
};

let _apiKey = '';

export function initFalClient(apiKey: string) {
  _apiKey = apiKey || '';
}

async function parseJsonSafe(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

export async function generateImage(
  prompt: string,
  aspectRatio: AspectRatio = '16:9',
  _resolution?: string,
  sceneId?: string,
  options?: ImageOptions
): Promise<{ imageUrl: string; url?: string; visualId?: string }> {
  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(_apiKey ? { 'x-client-key': _apiKey } : {}),
    },
    body: JSON.stringify({
      action: 'image',
      prompt,
      aspectRatio,
      sceneId,
      imageModel: options?.model,
      imageResolution: options?.resolution,
      imageTool: options?.tool,
      name: options?.name,
      imageCount: options?.imageCount ?? 1,
    }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) throw new Error(data?.error || 'Image generation failed');

  return {
    imageUrl: data?.imageUrl || data?.url,
    url: data?.url,
    visualId: data?.visualId,
  };
}

function assertVideoModelProvided(model: VideoOptions['model']): asserts model is VideoModel {
  if (!model) {
    throw new Error(
      'Video model is required. Pass options.model explicitly (e.g. "ltx-2").'
    );
  }
}

/**
 * Generates video using Magic Hour Image-to-Video API
 * Maps duration to endSeconds and imageUrl to assets.imageFilePath
 */
export async function generateVideo(
  imageUrl: string,
  prompt: string,
  resolution: string = '720p',
  sceneId?: string,
  options?: VideoOptions
): Promise<{ videoUrl: string; url?: string; visualId?: string }> {
  assertVideoModelProvided(options?.model);

  const res = await fetch('/api/proxy', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      ...(_apiKey ? { 'x-client-key': _apiKey } : {}),
    },
    body: JSON.stringify({
      action: 'video',
      sceneId,
      // API Specific Mappings
      model: options.model, 
      style: { prompt },
      assets: {
        imageFilePath: imageUrl, // SDK handles this as a URL or path
      },
      endSeconds: options?.duration || 5, // LTX-2 requires this
      resolution: resolution,
      quality: options?.quality,
    }),
  });

  const data = await parseJsonSafe(res);
  if (!res.ok) throw new Error(data?.error || 'Video generation failed');

  return {
    videoUrl: data?.videoUrl || data?.url,
    url: data?.url,
    visualId: data?.visualId,
  };
}