'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  rectSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useAppStore } from '@/stores/app-store';
import {
  initFalClient,
  generateImage,
  generateVideo,
  type VideoModel,
  type ImageModel,
  type ImageResolution,
} from '@/lib/magichour/client';
import { Card, CardContent, Button, Progress } from '@/components/ui';

const COST_PER_IMAGE = 0.02;
const COST_PER_VIDEO = 0.052;
type Quality = 'low' | 'medium' | 'high';
type ExplicitVideoModel = Exclude<VideoModel, 'default'>;

const MODEL_DURATIONS: Record<ExplicitVideoModel, number[]> = {
  'ltx-2': [3, 4, 5, 6, 7, 8, 9, 10, 15, 20, 25, 30],
  seedance: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  'kling-2.5': [5, 10],
  'kling-3.0': [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
  'veo3.1': [4, 6, 8, 16, 24, 32, 40, 48, 56],
  'sora-2': [4, 8, 12, 24, 36, 48, 60],
  'kling-1.6': [5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
  'kling-2.5-audio': [5, 10],
  'veo3.1-audio': [4, 6, 8, 16, 24, 32, 40, 48, 56],
};

interface SortableImageCardProps {
  scene: {
    id: string;
    prompt: string;
    imageUrl?: string;
    videoUrl?: string;
    status: string;
    error?: string;
  };
  index: number;
  onRegenerate: (id: string) => void;
  onDelete: (id: string) => void;
  onGenerateVideo: (id: string) => void;
  onPreview: (type: 'image' | 'video', url: string, prompt: string) => void;
}

function mediaSrc(url: string): string {
  if (url.startsWith('/')) return url;
  return `/api/proxy?url=${encodeURIComponent(url)}`;
}

function SortableImageCard({
  scene,
  index,
  onRegenerate,
  onDelete,
  onGenerateVideo,
  onPreview,
}: SortableImageCardProps) {
  const [imageError, setImageError] = useState(false);
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scene.id,
  });

  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.5 : 1 };
  const isGeneratingImage = scene.status === 'generating-image';
  const isGeneratingVideo = scene.status === 'generating-video';
  const hasImage = scene.status !== 'pending' && scene.status !== 'generating-image' && !!scene.imageUrl && !imageError;
  const hasVideo = scene.status === 'video-ready' && !!scene.videoUrl;

  return (
    <div ref={setNodeRef} style={style}>
      <Card variant="interactive" className={`group overflow-hidden ${isDragging ? 'border-[var(--red)]' : ''}`}>
        <div className="aspect-video bg-[var(--paper-dark)] relative overflow-hidden border-b-2 border-[var(--ink)]">
          {scene.imageUrl && !imageError && (
            <img
              src={mediaSrc(scene.imageUrl)}
              alt={scene.prompt}
              className="w-full h-full object-cover cursor-pointer"
              onClick={() => {
                if (hasVideo && scene.videoUrl) onPreview('video', scene.videoUrl, scene.prompt);
                else if (hasImage && scene.imageUrl) onPreview('image', scene.imageUrl, scene.prompt);
              }}
              onError={() => setImageError(true)}
            />
          )}

          <div
            {...attributes}
            {...listeners}
            className="absolute top-2 left-2 p-2 bg-[var(--ink)] cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
          >
            <span className="text-[var(--paper)] text-xs">≡</span>
          </div>

          <div className="absolute top-2 right-2 w-8 h-8 bg-[var(--red)] flex items-center justify-center">
            <span className="font-mono text-xs text-white">{String(index + 1).padStart(2, '0')}</span>
          </div>

          {(isGeneratingImage || isGeneratingVideo) && (
            <div className="absolute inset-0 flex items-center justify-center bg-[var(--paper)]/90">
              <p className="text-sm font-mono uppercase tracking-wider text-[var(--text-secondary)]">
                {isGeneratingImage ? 'Creating...' : 'Animating...'}
              </p>
            </div>
          )}
        </div>

        <CardContent className="p-3">
          <p className="text-xs text-[var(--text-muted)] line-clamp-2 mb-3 min-h-[2.5rem]">{scene.prompt}</p>
          <div className="flex gap-2">
            {hasImage && !isGeneratingVideo && (
              <Button size="sm" variant="red" onClick={() => onGenerateVideo(scene.id)} className="flex-1 text-xs">
                {hasVideo ? 'Re-animate' : 'Animate'}
              </Button>
            )}
            {hasImage && (
              <Button size="sm" variant="secondary" onClick={() => onRegenerate(scene.id)} className="text-xs">
                ↻
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => onDelete(scene.id)}
              className="text-[var(--red)] hover:bg-[var(--red-soft)]"
            >
              ✕
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export function GenerateStep() {
  const {
    scenes,
    setScenes,
    updateScene,
    deleteScene,
    selectedStyle,
    falApiKey,
    isGenerating,
    setIsGenerating,
    generationProgress,
    setGenerationProgress,
    aspectRatio,
  } = useAppStore();

  const [showCostConfirm, setShowCostConfirm] = useState<'images' | 'videos' | null>(null);
  const [previewMedia, setPreviewMedia] = useState<{ type: 'image' | 'video'; url: string; prompt: string } | null>(null);

  // VIDEO SETTINGS
  const [videoModel, setVideoModel] = useState<ExplicitVideoModel>('ltx-2');
  const [videoQuality, setVideoQuality] = useState<Quality>('medium');
  const [videoDuration, setVideoDuration] = useState<number>(5);
  const [isPromptToVideo, setIsPromptToVideo] = useState(false);

  // IMAGE SETTINGS
  const [enableImageAdvanced, setEnableImageAdvanced] = useState(false);
  const [imageModel, setImageModel] = useState<ImageModel>('default');
  const [imageResolution, setImageResolution] = useState<ImageResolution>('auto');
  const [imageTool, setImageTool] = useState('general');

  const allowedDurations = useMemo(() => MODEL_DURATIONS[videoModel], [videoModel]);

  useEffect(() => {
    if (!allowedDurations.includes(videoDuration)) {
      setVideoDuration(allowedDurations[0]);
    }
  }, [allowedDurations, videoDuration]);

  useEffect(() => {
    initFalClient(falApiKey || '');
  }, [falApiKey]);

  useEffect(() => {
    console.log('[GenerateStep] selected videoModel:', videoModel);
  }, [videoModel]);

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = scenes.findIndex((s) => s.id === active.id);
    const newIndex = scenes.findIndex((s) => s.id === over.id);
    setScenes(arrayMove(scenes, oldIndex, newIndex));
  };

  const generateSingleImage = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene || !selectedStyle) return;

    updateScene(sceneId, { status: 'generating-image', error: undefined });

    try {
      const fullPrompt = scene.prompt + selectedStyle.suffix;
      const result = await generateImage(
        fullPrompt,
        aspectRatio,
        undefined,
        sceneId,
        enableImageAdvanced
          ? {
              model: imageModel,
              resolution: imageResolution,
              tool: imageTool,
              imageCount: 1,
            }
          : undefined
      );
      updateScene(sceneId, { status: 'image-ready', imageUrl: result.imageUrl, videoUrl: undefined });
    } catch (error) {
      updateScene(sceneId, { status: 'error', error: error instanceof Error ? error.message : 'Generation failed' });
    }
  };

  const generateSingleVideo = async (sceneId: string) => {
    const scene = scenes.find((s) => s.id === sceneId);
    if (!scene) return;

    if (isPromptToVideo) {
      updateScene(sceneId, { status: 'error', error: 'Prompt-to-Video is not supported by this endpoint.' });
      return;
    }

    if (!scene.imageUrl) {
      updateScene(sceneId, { status: 'error', error: 'No image found. Generate image first.' });
      return;
    }

    updateScene(sceneId, { status: 'generating-video', error: undefined, videoUrl: undefined });

    try {
      const motionPrompt = `subtle cinematic motion, gentle camera movement, ${scene.prompt} ${selectedStyle?.suffix || ''}`.trim();
      const chosenModel: ExplicitVideoModel = videoModel;

      console.log('[GenerateStep] calling generateVideo with model:', chosenModel);

      const result = await generateVideo(scene.imageUrl, motionPrompt, undefined, sceneId, {
        model: chosenModel,
        quality: videoQuality,
        duration: videoDuration,
      });

      updateScene(sceneId, { status: 'video-ready', videoUrl: result.videoUrl });
    } catch (error) {
      updateScene(sceneId, { status: 'error', error: error instanceof Error ? error.message : 'Video generation failed' });
    }
  };

  const runWithPool = async <T,>(
    items: T[],
    task: (item: T) => Promise<void>,
    onProgress: (completed: number, total: number) => void
  ) => {
    const limit = 60;
    let completed = 0;
    let index = 0;
    const total = items.length;

    const runNext = async (): Promise<void> => {
      if (index >= total) return;
      const item = items[index++];
      await task(item);
      completed++;
      onProgress(completed, total);
      await runNext();
    };

    await Promise.all(Array(Math.min(limit, total)).fill(null).map(() => runNext()));
  };

  const generateAllImages = async () => {
    const pendingScenes = scenes.filter((s) => s.status === 'pending' || s.status === 'error');
    if (pendingScenes.length === 0) return;
    setIsGenerating(true);
    setGenerationProgress(0);

    await runWithPool(
      pendingScenes,
      async (scene) => generateSingleImage(scene.id),
      (completed, total) => setGenerationProgress((completed / total) * 100)
    );

    setIsGenerating(false);
  };

  const generateAllVideos = async () => {
    const readyScenes = scenes.filter((s) => s.status === 'image-ready');
    if (readyScenes.length === 0) return;
    setIsGenerating(true);
    setGenerationProgress(0);

    await runWithPool(
      readyScenes,
      async (scene) => generateSingleVideo(scene.id),
      (completed, total) => setGenerationProgress((completed / total) * 100)
    );

    setIsGenerating(false);
  };

  const pendingCount = scenes.filter((s) => s.status === 'pending' || s.status === 'error').length;
  const imageReadyCount = scenes.filter((s) => s.status === 'image-ready').length;
  const videoReadyCount = scenes.filter((s) => s.status === 'video-ready').length;
  const totalEstimatedCost = scenes.length * COST_PER_IMAGE + scenes.length * COST_PER_VIDEO * videoDuration;

  return (
    <div className="w-full max-w-6xl mx-auto px-4">
      <div className="text-center mb-8">
        <h2 className="font-display text-5xl uppercase tracking-wider mb-2">Generate Visuals</h2>
      </div>

      <Card variant="default" className="mb-4">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-xs uppercase tracking-wider">Advanced Image Settings</p>
            <Button size="sm" variant={enableImageAdvanced ? 'cyan' : 'secondary'} onClick={() => setEnableImageAdvanced((v) => !v)}>
              {enableImageAdvanced ? 'On' : 'Off'}
            </Button>
          </div>

          {enableImageAdvanced && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <select value={imageModel} onChange={(e) => setImageModel(e.target.value as ImageModel)} className="h-10 px-3 border-2 border-[var(--ink)] bg-[var(--paper)] text-sm">
                <option value="default">default</option>
                <option value="flux-schnell">flux-schnell</option>
                <option value="z-image-turbo">z-image-turbo</option>
                <option value="seedream">seedream</option>
                <option value="nano-banana">nano-banana</option>
                <option value="nano-banana-2">nano-banana-2</option>
                <option value="nano-banana-pro">nano-banana-pro</option>
              </select>

              <select value={imageResolution} onChange={(e) => setImageResolution(e.target.value as ImageResolution)} className="h-10 px-3 border-2 border-[var(--ink)] bg-[var(--paper)] text-sm">
                <option value="auto">auto</option>
                <option value="2k">2k</option>
                <option value="4k">4k</option>
              </select>

              <select value={imageTool} onChange={(e) => setImageTool(e.target.value)} className="h-10 px-3 border-2 border-[var(--ink)] bg-[var(--paper)] text-sm">
                <option value="general">general</option>
                <option value="ai-anime-generator">ai-anime-generator</option>
                <option value="ai-art-generator">ai-art-generator</option>
                <option value="ai-photo-generator">ai-photo-generator</option>
                <option value="ai-illustration-generator">ai-illustration-generator</option>
                <option value="album-cover-generator">album-cover-generator</option>
                <option value="movie-poster-generator">movie-poster-generator</option>
              </select>
            </div>
          )}
        </CardContent>
      </Card>

      <Card variant="default" className="mb-4">
        <CardContent className="py-4">
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-xs uppercase tracking-wider">Animation Settings</p>
            <div className="flex gap-2 items-center">
              <span className="text-[10px] uppercase pt-1">Prompt-to-Video</span>
              <Button size="sm" variant={isPromptToVideo ? 'red' : 'secondary'} onClick={() => setIsPromptToVideo(!isPromptToVideo)}>
                {isPromptToVideo ? 'ON' : 'OFF'}
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <select value={videoModel} onChange={(e) => setVideoModel(e.target.value as ExplicitVideoModel)} className="h-10 px-3 border-2 border-[var(--ink)] bg-[var(--paper)] text-sm">
              {Object.keys(MODEL_DURATIONS).map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>

            <select value={videoQuality} onChange={(e) => setVideoQuality(e.target.value as Quality)} className="h-10 px-3 border-2 border-[var(--ink)] bg-[var(--paper)] text-sm">
              <option value="low">low</option>
              <option value="medium">medium</option>
              <option value="high">high</option>
            </select>

            <select value={videoDuration} onChange={(e) => setVideoDuration(Number(e.target.value))} className="h-10 px-3 border-2 border-[var(--ink)] bg-[var(--paper)] text-sm">
              {allowedDurations.map((d) => (
                <option key={d} value={d}>
                  {d}s
                </option>
              ))}
            </select>
          </div>
        </CardContent>
      </Card>

      <Card variant="default" className="mb-6">
        <CardContent className="flex flex-col md:flex-row md:items-center justify-between gap-3 py-4">
          <div className="text-sm font-mono">Est. Total: ${totalEstimatedCost.toFixed(2)}</div>
          <div className="flex gap-2">
            {!isPromptToVideo && (
              <Button variant="red" disabled={isGenerating || pendingCount === 0} onClick={() => setShowCostConfirm('images')}>
                Generate Images ({pendingCount})
              </Button>
            )}
            <Button variant="cyan" disabled={isGenerating || imageReadyCount === 0} onClick={() => setShowCostConfirm('videos')}>
              Animate All ({imageReadyCount})
            </Button>
          </div>
        </CardContent>
      </Card>

      {showCostConfirm && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--ink)]/80" onClick={() => setShowCostConfirm(null)} />
          <div className="relative w-full max-w-md bg-[var(--paper)] border-2 border-[var(--ink)] p-6">
            <p className="mb-4 font-mono text-sm">CONFIRM EXPENDITURE OF APPROX. ${totalEstimatedCost.toFixed(3)}?</p>
            <div className="flex gap-2">
              <Button variant="ghost" className="flex-1" onClick={() => setShowCostConfirm(null)}>
                Cancel
              </Button>
              <Button
                variant="red"
                className="flex-1"
                onClick={() => {
                  if (showCostConfirm === 'images') void generateAllImages();
                  if (showCostConfirm === 'videos') void generateAllVideos();
                  setShowCostConfirm(null);
                }}
              >
                PROCEED
              </Button>
            </div>
          </div>
        </div>
      )}

      {previewMedia && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--ink)]/90" onClick={() => setPreviewMedia(null)} />
          <div className="relative w-full max-w-5xl">
            {previewMedia.type === 'image' ? (
              <img src={mediaSrc(previewMedia.url)} alt={previewMedia.prompt} className="w-full h-auto max-h-[75vh] object-contain" />
            ) : (
              <video src={mediaSrc(previewMedia.url)} controls autoPlay loop className="w-full h-auto max-h-[75vh] object-contain" />
            )}
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="mb-6">
          <Progress value={generationProgress} variant="red" showLabel size="lg" />
        </div>
      )}

      <div className="grid grid-cols-3 gap-3 md:gap-4 mb-6">
        <Card variant="default">
          <CardContent className="py-4 text-center">
            <p className="text-3xl">{pendingCount}</p>
            <p className="text-xs">Pending</p>
          </CardContent>
        </Card>
        <Card variant="cyan">
          <CardContent className="py-4 text-center">
            <p className="text-3xl">{imageReadyCount}</p>
            <p className="text-xs">Images</p>
          </CardContent>
        </Card>
        <Card variant="red">
          <CardContent className="py-4 text-center">
            <p className="text-3xl">{videoReadyCount}</p>
            <p className="text-xs">Videos</p>
          </CardContent>
        </Card>
      </div>

      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={scenes.map((s) => s.id)} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 md:gap-4">
            {scenes.map((scene, index) => (
              <SortableImageCard
                key={scene.id}
                scene={scene}
                index={index}
                onRegenerate={generateSingleImage}
                onDelete={deleteScene}
                onGenerateVideo={generateSingleVideo}
                onPreview={(type, url, prompt) => setPreviewMedia({ type, url, prompt })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>
    </div>
  );
}