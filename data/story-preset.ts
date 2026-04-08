import { StylePreset } from '@/stores/app-store';

export const stylePresets: StylePreset[] = [
    
];

export function getStyleById(id: string): StylePreset | undefined {
  return stylePresets.find((s) => s.id === id);
}
