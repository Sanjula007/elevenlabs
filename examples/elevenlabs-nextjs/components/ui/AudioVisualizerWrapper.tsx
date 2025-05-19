// components/AudioVisualizerClient.tsx
'use client';

import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const AudioVisualizer = dynamic(
  () => import('react-audio-visualize').then(mod => mod.AudioVisualizer),
  { ssr: false } // Prevent server-side rendering
);

type Props = {
  audioSrc: string;
};

export default function AudioVisualizerClient({ audioSrc }: Props) {
  return (
    <Suspense fallback={<div>Loading visualizer...</div>}>
    <AudioVisualizer
      blob={audioSrc}
      themeColor="deepskyblue"
      backgroundColor="#1a1a1a"
    />
    </Suspense>
  );
}
