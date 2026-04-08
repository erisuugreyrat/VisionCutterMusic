'use client';

import { useState, useEffect } from 'react';
import { useAppStore, Step } from '@/stores/app-store';
import { Button } from '@/components/ui/Button';
import { Logo } from '@/components/ui/Logo';
import { initFalClient } from '@/lib/magichour/client';
import {
  AudioStep,
  StyleStep,
  StoryStep,
  GenerateStep,
  ExportStep,
} from '@/components/steps';

const steps: { id: Step; label: string; number: string }[] = [
  { id: 'audio', label: 'Upload', number: '01' },
  { id: 'style', label: 'Style', number: '02' },
  { id: 'story', label: 'Story', number: '03' },
  { id: 'generate', label: 'Generate', number: '04' },
  { id: 'export', label: 'Export', number: '05' },
];

function getCompletedSteps(state: ReturnType<typeof useAppStore.getState>): string[] {
  const completed: string[] = [];
  if (state.audioFile && state.bpm) completed.push('audio');
  if (state.selectedStyle) completed.push('style');
  if (state.scenes.length > 0) completed.push('story');

  // FIX: mark generate complete if at least one image OR video exists
  if (state.scenes.some((s) => s.status === 'image-ready' || s.status === 'video-ready')) {
    completed.push('generate');
  }

  if (state.finalVideoUrl) completed.push('export');
  return completed;
}

export default function Home() {
  const {
    currentStep,
    setCurrentStep,
    audioFile,
    bpm,
    selectedStyle,
    scenes,
    falApiKey,
    setFalApiKey,
  } = useAppStore();

  const [showApiKeyModal, setShowApiKeyModal] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    if (falApiKey) {
      setApiKeyInput(falApiKey);
    }
  }, [falApiKey]);

  const saveApiKey = () => {
    if (apiKeyInput.trim()) {
      setFalApiKey(apiKeyInput.trim());
      initFalClient(apiKeyInput.trim());
      setShowApiKeyModal(false);
    }
  };

  const currentIndex = steps.findIndex((s) => s.id === currentStep);
  const completedSteps = getCompletedSteps(useAppStore.getState());

  const goNext = () => {
    if (currentIndex < steps.length - 1) {
      setCurrentStep(steps[currentIndex + 1].id);
    }
  };

  const goBack = () => {
    if (currentIndex > 0) {
      setCurrentStep(steps[currentIndex - 1].id);
    }
  };

  const canGoNext = () => {
    switch (currentStep) {
      case 'audio':
        return audioFile !== null && bpm !== null;
      case 'style':
        return selectedStyle !== null;
      case 'story':
        return scenes.length > 0;
      case 'generate':
        // FIX: allow continue after image generation (video optional)
        return scenes.some((s) => s.status === 'image-ready' || s.status === 'video-ready');
      case 'export':
        return false;
      default:
        return false;
    }
  };

  const renderStep = () => {
    switch (currentStep) {
      case 'audio':
        return <AudioStep />;
      case 'style':
        return <StyleStep />;
      case 'story':
        return <StoryStep />;
      case 'generate':
        return <GenerateStep />;
      case 'export':
        return <ExportStep />;
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <div
        className="fixed top-0 left-0 w-32 h-32 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, var(--red) 1.5px, transparent 1.5px)',
          backgroundSize: '8px 8px',
        }}
      />
      <div
        className="fixed bottom-0 right-0 w-32 h-32 opacity-10 pointer-events-none"
        style={{
          backgroundImage: 'radial-gradient(circle at 2px 2px, var(--cyan) 1.5px, transparent 1.5px)',
          backgroundSize: '8px 8px',
        }}
      />

      <header className="fixed top-0 left-0 right-0 z-50 bg-[var(--paper)] border-b-2 border-[var(--ink)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-16 md:h-20 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Logo className="w-10 h-10" />
              <div className="hidden sm:block">
                <h1 className="font-display text-xl tracking-wider text-[var(--ink)]">VISIONCUTTER</h1>
                <p className="text-xs font-mono uppercase tracking-widest text-[var(--text-muted)]">
                  Music Video Generator
                </p>
              </div>
            </div>

            <nav className="hidden md:flex items-center gap-1">
              {steps.map((step, index) => {
                const isCompleted = completedSteps.includes(step.id);
                const isCurrent = step.id === currentStep;
                const isPast = index < currentIndex;
                const isClickable = isCompleted || isPast || isCurrent;

                return (
                  <button
                    key={step.id}
                    onClick={() => isClickable && setCurrentStep(step.id)}
                    disabled={!isClickable}
                    className={`
                      relative px-4 py-2 font-mono text-sm uppercase tracking-wider
                      transition-all duration-150 border-2
                      ${isCurrent
                        ? 'bg-[var(--ink)] text-[var(--paper)] border-[var(--ink)]'
                        : isCompleted || isPast
                          ? 'text-[var(--ink)] border-transparent hover:border-[var(--ink)]'
                          : 'text-[var(--text-muted)] border-transparent cursor-not-allowed'}
                    `}
                  >
                    <span className="text-xs mr-1 opacity-50">{step.number}</span>
                    {step.label}
                    {isCompleted && !isCurrent && (
                      <span className="ml-2 inline-flex items-center justify-center w-4 h-4 bg-[var(--red)] text-white text-xs">
                        ✓
                      </span>
                    )}
                  </button>
                );
              })}
            </nav>

            <div className="md:hidden flex items-center gap-2">
              <span className="font-mono text-sm text-[var(--red)]">{steps[currentIndex].number}</span>
              <span className="font-display text-sm uppercase tracking-wider text-[var(--ink)]">
                {steps[currentIndex].label}
              </span>
            </div>

            <a
              href="https://github.com/lovisdotio/VisionCutterMusic"
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-2 px-3 py-2 border-2 border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-all duration-150"
            >
              <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
              </svg>
              <span className="hidden sm:inline font-mono text-xs uppercase tracking-wider">GitHub</span>
            </a>

            <button
              onClick={() => setShowApiKeyModal(true)}
              className={`
                flex items-center gap-2 px-3 py-2 border-2 transition-all duration-150
                ${mounted && falApiKey
                  ? 'border-[var(--cyan)] text-[var(--cyan)] hover:bg-[var(--cyan-soft)]'
                  : 'border-[var(--red)] text-[var(--red)] hover:bg-[var(--red-soft)] animate-pulse'}
              `}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
              </svg>
              <span className="hidden sm:inline font-mono text-xs uppercase tracking-wider">
                {mounted && falApiKey ? 'API Key Set' : 'Add API Key'}
              </span>
            </button>
          </div>
        </div>
      </header>

      {showApiKeyModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-[var(--ink)]/80" onClick={() => setShowApiKeyModal(false)} />

          <div className="relative w-full max-w-md bg-[var(--paper)] border-2 border-[var(--ink)] shadow-[8px_8px_0_var(--ink)] animate-scale-in">
            <div className="flex items-center justify-between p-4 border-b-2 border-[var(--ink)]">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 bg-[var(--red)] flex items-center justify-center">
                  <svg className="w-5 h-5 text-[var(--paper)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                </div>
                <div>
                  <h3 className="font-display text-xl uppercase tracking-wider text-[var(--ink)]">FAL API Key</h3>
                  <p className="text-xs text-[var(--text-muted)]">Optional (legacy UI field)</p>
                </div>
              </div>
              <button
                onClick={() => setShowApiKeyModal(false)}
                className="w-8 h-8 flex items-center justify-center hover:bg-[var(--paper-dark)] transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-6">
              <div className="flex gap-3 mb-4">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Optional key..."
                  className="flex-1 bg-[var(--paper)] border-2 border-[var(--ink)] px-4 py-3 text-[var(--text-primary)] focus:border-[var(--red)] focus:outline-none"
                  onKeyDown={(e) => e.key === 'Enter' && saveApiKey()}
                />
              </div>

              <div className="flex gap-3">
                <Button variant="ghost" onClick={() => setShowApiKeyModal(false)} className="flex-1">
                  Cancel
                </Button>
                <Button variant="red" onClick={saveApiKey} disabled={!apiKeyInput.trim()} className="flex-1">
                  {mounted && falApiKey ? 'Update Key' : 'Save Key'}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="md:hidden fixed top-[68px] left-0 right-0 z-40 px-4 py-3 bg-[var(--paper)] border-b-2 border-[var(--ink)]">
        <div className="flex justify-center gap-3">
          {steps.map((step, index) => {
            const isCompleted = completedSteps.includes(step.id);
            const isCurrent = step.id === currentStep;
            return (
              <button
                key={step.id}
                onClick={() => (isCompleted || index <= currentIndex) && setCurrentStep(step.id)}
                className={`
                  w-3 h-3 border-2 transition-all duration-150
                  ${isCurrent
                    ? 'bg-[var(--red)] border-[var(--red)] w-8'
                    : isCompleted
                      ? 'bg-[var(--ink)] border-[var(--ink)]'
                      : 'bg-transparent border-[var(--ink)]'}
                `}
              />
            );
          })}
        </div>
      </div>

      <main className="pt-28 md:pt-32 pb-32">{renderStep()}</main>

      <footer className="fixed bottom-0 left-0 right-0 z-50 bg-[var(--paper)] border-t-2 border-[var(--ink)]">
        <div className="max-w-7xl mx-auto px-4 md:px-6">
          <div className="h-20 flex items-center justify-between">
            <Button variant="ghost" onClick={goBack} disabled={currentIndex === 0} className="gap-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
              <span className="hidden sm:inline">Back</span>
            </Button>

            <div className="flex items-center gap-4">
              <div className="hidden sm:flex items-center gap-1">
                {steps.map((step, index) => (
                  <div
                    key={step.id}
                    className={`
                      h-2 transition-all duration-300 border-2 border-[var(--ink)]
                      ${index <= currentIndex ? 'w-8 bg-[var(--red)] border-[var(--red)]' : 'w-4 bg-transparent'}
                    `}
                  />
                ))}
              </div>
              <span className="text-sm font-mono uppercase tracking-wider text-[var(--text-muted)]">
                {currentIndex + 1}/{steps.length}
              </span>
            </div>

            <Button
              variant={canGoNext() ? 'red' : 'primary'}
              onClick={goNext}
              disabled={!canGoNext() || currentIndex === steps.length - 1}
              className="gap-2"
            >
              <span className="hidden sm:inline">Continue</span>
              <span className="sm:hidden">Next</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Button>
          </div>
        </div>
      </footer>
    </div>
  );
}