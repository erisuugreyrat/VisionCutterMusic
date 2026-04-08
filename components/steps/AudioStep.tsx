'use client';

import { useCallback, useState, useEffect } from 'react';
import { useDropzone } from 'react-dropzone';
import { useAppStore } from '@/stores/app-store';
import { detectBpm, getAudioBufferFromFile, getAudioDuration } from '@/lib/audio/bpm-detector';
import { formatDuration, formatFileSize } from '@/lib/utils/helpers';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { initFalClient } from '@/lib/magichour/client';

export function AudioStep() {
  const {
    audioFile,
    setAudioFile,
    setAudioUrl,
    bpm,
    setBpm,
    setBeatOffset,
    audioDuration,
    setAudioDuration,
    falApiKey,
    setFalApiKey,
    aspectRatio,
    setAspectRatio,
    beatsPerScene,
    setBeatsPerScene,
  } = useAppStore();

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [mounted, setMounted] = useState(false);

  // Prevent hydration mismatch by only showing dynamic content after mount
  useEffect(() => {
    setMounted(true);
    if (falApiKey) {
      setApiKeyInput(falApiKey);
    }
  }, [falApiKey]);

  const analyzeAudio = async (file: File) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const audioBuffer = await getAudioBufferFromFile(file);
      const duration = getAudioDuration(audioBuffer);
      setAudioDuration(duration);

      const { bpm: detectedBpm, offset } = await detectBpm(audioBuffer);
      setBpm(detectedBpm);
      setBeatOffset(offset);

      const url = URL.createObjectURL(file);
      setAudioUrl(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to analyze audio');
      setBpm(null);
      setBeatOffset(0);
      setAudioDuration(null);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (file) {
        setAudioFile(file);
        await analyzeAudio(file);
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [setAudioFile]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'audio/*': ['.mp3', '.wav', '.ogg', '.m4a', '.flac'],
    },
    maxFiles: 1,
  });

  const clearAudio = () => {
    setAudioFile(null);
    setAudioUrl(null);
    setBpm(null);
    setAudioDuration(null);
    setError(null);
  };

  const saveApiKey = () => {
    if (apiKeyInput.trim()) {
      setFalApiKey(apiKeyInput.trim());
      initFalClient(apiKeyInput.trim());
    }
  };

  return (
    <div className="w-full max-w-2xl mx-auto px-4">
      <div className="text-center mb-12 animate-slide-up">
        <h2 className="font-display text-5xl md:text-6xl uppercase tracking-wider mb-4">
          <span className="gradient-text">Drop Your Track</span>
        </h2>
        <p className="text-[var(--text-secondary)] text-lg max-w-md mx-auto">
          We&apos;ll detect the BPM and sync your visuals to the beat
        </p>
      </div>

      {!audioFile ? (
        <div
          {...getRootProps()}
          className={`
            relative group cursor-pointer animate-scale-in
            ${isDragActive ? 'scale-[1.02]' : ''}
          `}
        >
          <Card variant="halftone" className={`
            transition-all duration-150
            ${isDragActive ? 'border-[var(--red)] shadow-[6px_6px_0_var(--red)]' : ''}
          `}>
            <CardContent className="py-20 md:py-24">
              <input {...getInputProps()} />

              <div className="relative flex flex-col items-center">
                {/* Icon */}
                <div className={`
                  relative w-24 h-24 mb-8
                  flex items-center justify-center
                  bg-[var(--ink)] border-2 border-[var(--ink)]
                  transition-all duration-150
                  group-hover:-translate-x-1 group-hover:-translate-y-1
                  group-hover:shadow-[4px_4px_0_var(--red)]
                  ${isDragActive ? '-translate-x-1 -translate-y-1 shadow-[4px_4px_0_var(--red)]' : ''}
                `}>
                  {/* Waveform bars */}
                  <div className="flex items-end gap-1 h-10">
                    {[0.3, 0.6, 1, 0.7, 0.4].map((h, i) => (
                      <div
                        key={i}
                        className="w-2 bg-[var(--paper)]"
                        style={{
                          height: `${h * 100}%`,
                          animation: `waveform 0.8s ease-in-out infinite`,
                          animationDelay: `${i * 0.1}s`,
                        }}
                      />
                    ))}
                  </div>
                </div>

                <p className={`
                  font-display text-3xl md:text-4xl uppercase tracking-wider mb-3 text-center
                  transition-colors duration-150
                  ${isDragActive ? 'text-[var(--red)]' : 'text-[var(--ink)]'}
                `}>
                  {isDragActive ? 'Release to Upload' : 'Drop Audio Here'}
                </p>

                <p className="text-[var(--text-muted)] text-sm mb-6 font-mono uppercase tracking-wider">
                  or click to browse
                </p>

                <div className="flex flex-wrap justify-center gap-2">
                  {['MP3', 'WAV', 'OGG', 'M4A', 'FLAC'].map((format) => (
                    <span
                      key={format}
                      className="px-3 py-1 text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] border-2 border-[var(--ink)]"
                    >
                      {format}
                    </span>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      ) : (
        <div className="animate-scale-in">
          <Card variant="default">
            <CardContent>
              {/* File info header */}
              <div className="flex items-start gap-4 mb-8">
                <div className="relative">
                  <div className="w-16 h-16 bg-[var(--ink)] flex items-center justify-center">
                    <div className="flex items-end gap-0.5 h-8">
                      {[0.4, 0.7, 1, 0.6, 0.3].map((h, i) => (
                        <div
                          key={i}
                          className="w-1.5 bg-[var(--paper)]"
                          style={{ height: `${h * 100}%` }}
                        />
                      ))}
                    </div>
                  </div>
                  {bpm && (
                    <div className="absolute -bottom-2 -right-2 w-8 h-8 bg-[var(--red)] flex items-center justify-center">
                      <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                  )}
                </div>

                <div className="flex-1 min-w-0">
                  <h3 className="font-display text-xl uppercase tracking-wider text-[var(--ink)] truncate">
                    {audioFile.name}
                  </h3>
                  <p className="text-[var(--text-muted)] text-sm font-mono">
                    {formatFileSize(audioFile.size)}
                  </p>
                </div>

                <Button variant="ghost" size="sm" onClick={clearAudio}>
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </Button>
              </div>

              {/* Loading state */}
              {isAnalyzing && (
                <div className="flex items-center gap-4 p-4 border-2 border-[var(--ink)] bg-[var(--paper-dark)]">
                  <div className="w-10 h-10 border-2 border-[var(--ink)] border-t-transparent animate-spin" />
                  <div>
                    <p className="font-display uppercase tracking-wider text-[var(--ink)]">Analyzing Audio...</p>
                    <p className="text-sm text-[var(--text-muted)]">Detecting BPM and tempo</p>
                  </div>
                </div>
              )}

              {/* Error state */}
              {error && (
                <div className="flex items-center gap-3 p-4 bg-[var(--red-soft)] border-2 border-[var(--red)]">
                  <svg className="w-5 h-5 text-[var(--red)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  <span className="text-[var(--red)]">{error}</span>
                </div>
              )}

              {/* Results */}
              {bpm && !isAnalyzing && (
                <div className="grid grid-cols-2 gap-4">
                  <div className="relative p-6 border-2 border-[var(--red)] shadow-[4px_4px_0_var(--red)] bg-[var(--red-soft)]">
                    <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">BPM Detected</p>
                    <p className="font-display text-6xl text-[var(--red)]">{bpm}</p>
                  </div>

                  {audioDuration && (
                    <div className="relative p-6 border-2 border-[var(--cyan)] shadow-[4px_4px_0_var(--cyan)] bg-[var(--cyan-soft)]">
                      <p className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">Duration</p>
                      <p className="font-display text-6xl text-[var(--cyan)]">
                        {formatDuration(audioDuration)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Info card */}
          {bpm && (
            <Card variant="yellow" className="mt-4 animate-slide-up">
              <CardContent className="py-4 px-6 flex items-center gap-4">
                <div className="w-10 h-10 bg-[var(--yellow)] flex items-center justify-center flex-shrink-0">
                  <svg className="w-5 h-5 text-[var(--ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                </div>
                <p className="text-sm text-[var(--text-secondary)]">
                  Your visuals will sync to <span className="font-mono text-[var(--yellow)]">{bpm} BPM</span>.
                  Each beat lasts <span className="font-mono text-[var(--ink)]">{(60 / bpm).toFixed(2)}s</span>.
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Video Settings */}
      <Card variant="default" className="mt-8 animate-slide-up">
        <CardContent>
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-[var(--cyan)] flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--ink)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
              </svg>
            </div>
            <div>
              <h3 className="font-display text-lg uppercase tracking-wider text-[var(--ink)]">Video Settings</h3>
              <p className="text-xs text-[var(--text-muted)]">Choose format and timing</p>
            </div>
          </div>

          {/* Aspect Ratio */}
          <div className="mb-6">
            <p className="text-sm font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-3">Aspect Ratio</p>
            <div className="grid grid-cols-3 gap-3">
              {(['16:9', '1:1', '9:16'] as const).map((ratio) => (
                <button
                  key={ratio}
                  onClick={() => setAspectRatio(ratio)}
                  className={`
                    relative p-4 border-2 transition-all duration-150
                    ${aspectRatio === ratio
                      ? 'border-[var(--red)] bg-[var(--red-soft)] shadow-[4px_4px_0_var(--red)]'
                      : 'border-[var(--ink)] hover:border-[var(--red)]'
                    }
                  `}
                >
                  <div className="flex flex-col items-center gap-2">
                    {/* Ratio preview box */}
                    <div
                      className={`
                        border-2 border-current
                        ${ratio === '16:9' ? 'w-12 h-7' : ratio === '1:1' ? 'w-8 h-8' : 'w-5 h-9'}
                        ${aspectRatio === ratio ? 'bg-[var(--red)]' : 'bg-[var(--paper-dark)]'}
                      `}
                    />
                    <span className={`
                      font-mono text-sm
                      ${aspectRatio === ratio ? 'text-[var(--red)]' : 'text-[var(--text-secondary)]'}
                    `}>
                      {ratio}
                    </span>
                    <span className="text-xs text-[var(--text-muted)]">
                      {ratio === '16:9' ? 'Landscape' : ratio === '1:1' ? 'Square' : 'Portrait'}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Beats Per Scene */}
          <div>
            <p className="text-sm font-mono uppercase tracking-wider text-[var(--text-secondary)] mb-3">Beats Per Scene</p>
            <div className="grid grid-cols-2 gap-3">
              {([1, 2] as const).map((beats) => (
                <button
                  key={beats}
                  onClick={() => setBeatsPerScene(beats)}
                  className={`
                    relative p-4 border-2 transition-all duration-150
                    ${beatsPerScene === beats
                      ? 'border-[var(--cyan)] bg-[var(--cyan-soft)] shadow-[4px_4px_0_var(--cyan)]'
                      : 'border-[var(--ink)] hover:border-[var(--cyan)]'
                    }
                  `}
                >
                  <div className="flex flex-col items-center gap-2">
                    <span className={`
                      font-display text-4xl
                      ${beatsPerScene === beats ? 'text-[var(--cyan)]' : 'text-[var(--ink)]'}
                    `}>
                      {beats}
                    </span>
                    <span className={`
                      font-mono text-sm
                      ${beatsPerScene === beats ? 'text-[var(--cyan)]' : 'text-[var(--text-secondary)]'}
                    `}>
                      {beats === 1 ? 'Beat' : 'Beats'}
                    </span>
                    {bpm && (
                      <span className="text-xs text-[var(--text-muted)]">
                        {((60 / bpm) * beats).toFixed(2)}s per scene
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* FAL API Key Input */}
      <Card variant="default" className="mt-8 animate-slide-up">
        <CardContent>
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-[var(--ink)] flex items-center justify-center">
              <svg className="w-5 h-5 text-[var(--paper)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
            </div>
            <div>
              <h3 className="font-display text-lg uppercase tracking-wider text-[var(--ink)]">FAL API Key</h3>
              <p className="text-xs text-[var(--text-muted)]">Required for AI image & video generation</p>
            </div>
          </div>

          <div className="flex gap-3">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter your FAL API key..."
              className="flex-1"
            />
            <Button
              variant={mounted && falApiKey ? 'cyan' : 'primary'}
              onClick={saveApiKey}
              disabled={!apiKeyInput.trim()}
            >
              {mounted && falApiKey ? 'Update' : 'Save'}
            </Button>
          </div>

          {mounted && falApiKey && (
            <p className="mt-3 text-sm text-[var(--cyan)] flex items-center gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
              API key saved
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
