'use client';
import JSZip from 'jszip';
import { formatDistanceToNow } from 'date-fns';
import { nanoid } from 'nanoid';
import Image from 'next/image';
import { useCallback, useState } from 'react';
import { toast } from 'sonner';

import { AudioPlayer } from '@/app/(examples)/text-to-speech/components/audio-player';
import { TextToSpeechPromptBar } from '@/components/prompt-bar/text-to-speech';
import { Card, CardContent } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { TextToSpeechRequest } from 'elevenlabs/api';
import { TTS_MODELS } from '@/lib/schemas';
import { useSpeech } from '@/hooks/use-speech';
import { undefined } from 'zod';

export default function TextToSpeechPage() {
  const [speeches, setSpeeches] = useState<GeneratedSpeech[]>([]);
  const [selectedSpeech, setSelectedSpeech] = useState<GeneratedSpeech | null>(null);
  const [autoplay, setAutoplay] = useState(true);
  const [oneSecSpeech, setOneSecSpeech] = useState<GeneratedSpeech | null>(null);
  const [title, setTitle] = useState('');
  const [combinedAudio, setCombinedAudio] = useState('');
  const [settings, setSettings] = useState<{
    voice_id: string;
    model_id: typeof TTS_MODELS.MULTILINGUAL | typeof TTS_MODELS.FLASH;
    stability: number;
    similarity_boost: number;
    style: number;
    speed: number;
    use_speaker_boost: boolean;
  } | null>(null);
  const {
    speak,
    isLoading: isSpeaking,
  } = useSpeech({
    onError: (errorMessage) => toast.error(errorMessage),
  });
  const handlePause = async (seconds) => {

    const pendingSpeech: GeneratedSpeech = {
      id: nanoid(),
      text: '<pause>',
      audioBase64: '',
      createdAt: new Date(),
      status: 'complete',
    };
    for (let i = 0; i < seconds; i++) {
      console.log(i);
      setSpeeches((prev) => [pendingSpeech, ...prev]);
    }


  };
  const onsSelectedAudioEnd = () => {

    if(!autoplay){
      return
    }
    // play next audio
    const currentIndex = speechToDisplay.findIndex(speech => speech.id === selectedSpeech?.id);
    const nextSpeech = speechToDisplay[currentIndex - 1];
    if (nextSpeech) {

      setSelectedSpeech(nextSpeech);
      if(nextSpeech.text.includes('<pause')){
        onsSelectedAudioEnd()
      }
    }
  }
  
  const speechToDisplay = speeches.filter(speech => speech.text !== '<pause>');
  const handleGenerateStart = (text: string) => {
    console.log(text);
    const pendingSpeech: GeneratedSpeech = {
      id: nanoid(),
      text,
      audioBase64: '',
      createdAt: new Date(),
      status: 'loading',
    };
    if (text.includes('<break time="1.0s" />')) {
      console.log('one sec speech');
      setOneSecSpeech({ ...pendingSpeech, status: 'complete' });
    }
    setSpeeches((prev) => [pendingSpeech, ...prev]);
    setSelectedSpeech(pendingSpeech);
    return pendingSpeech.id;
  };

  const handleGenerateComplete = (id: string, text: string, audioUrl: string) => {
    // Make sure we have a valid URL
    if (!audioUrl) {
      toast.error('Failed to generate speech audio');
      setSpeeches((prev) =>
        prev.map((item) => (item.id === id ? { ...item, status: 'error' as const } : item)),
      );
      return;
    }
    if (text.includes('<break time="1.0s" />') ) {
      setOneSecSpeech({ ...{
          id: nanoid(),
          text,
          audioBase64: '',
          createdAt: new Date(),
          status: 'loading',
        }, status: 'complete', audioBase64: audioUrl });
    }

    setSpeeches((prev) =>
      prev.map((item) =>
        item.id === id
          ? {
            ...item,
            text,
            audioBase64: audioUrl,
            status: 'complete' as const,
          }
          : item,
      ),
    );

    setSelectedSpeech((current) =>
      current?.id === id
        ? {
          ...current,
          text,
          audioBase64: audioUrl,
          status: 'complete' as const,
        }
        : current,
    );
  };

  const handleSettingsChange = (upSettings =>{
    setSettings(upSettings)
  })
  const regenerate = async ()=>{
    if(isSpeaking){
      alert('generating')
      return
    }

    if (selectedSpeech) {
      const pendingSpeech: GeneratedSpeech = {
        id: nanoid(),
        text: selectedSpeech.text,
        audioBase64: '',
        createdAt: new Date(),
        status: 'loading',
      };
      if(!settings){
        alert('no settings')
        return
      }

      setSpeeches((prev) =>
        prev.map((item) => (item.id === selectedSpeech.id ? pendingSpeech : item)),
      );
      const requestData: TextToSpeechRequest = {
        text: selectedSpeech.text,
        model_id: settings.model_id,
        voice_settings: {
          stability: settings.stability,
          similarity_boost: settings.similarity_boost,
          style: settings.style,
          speed: settings.speed,
          use_speaker_boost: settings.use_speaker_boost,
        },
      };

      pendingSpeech.audioBase64 = await speak(settings.voice_id, requestData) || '';
      pendingSpeech.status = 'complete'


      setSpeeches((prev) =>
        prev.map((item) => (item.id === selectedSpeech.id ? pendingSpeech : item)),
      );
      setSelectedSpeech(pendingSpeech);
    }
  }


  const handleCombineAndDownload = useCallback(async () => {
    const allSpeeches = speeches.map((speech) => {
      if (speech.text.includes('<pause>')) {
        return {
          ...speech,
          audioBase64: oneSecSpeech?.audioBase64,
        };
      }
      return speech;
    });

    const completedSpeeches = allSpeeches.filter((speech) => speech.status === 'complete');
    if (completedSpeeches.length === 0) {
      toast.error('No completed speeches to combine');
      return;
    }

    const audioUrls = completedSpeeches.map((speech) => speech.audioBase64).reverse();
    const zip = new JSZip();

    try {
      // Step 1: Add text files to the ZIP
      completedSpeeches.forEach((speech, index) => {
        zip.file(`clip-${index + 1}.txt`, speech.text);
      });

      // Step 2: Fetch all blobs and add them to the ZIP
      await Promise.all(
        audioUrls.map(async (url, index) => {
          if (!url) return;
          const response = await fetch(url);
          const blob = await response.blob();
          zip.file(`clip-${index + 1}.mp3`, blob);
        }),
      );

      // Step 3: Combine audio files
      const blobs = await Promise.all(
        audioUrls.map(async (url) => {
          if (!url) return;
          const response = await fetch(url);
          return await response.blob();
        }),
      );
      const activeBlobs = blobs.filter((blob) =>!! blob );
      const buffers = await Promise.all(activeBlobs.map((blob) => blob.arrayBuffer()));
      const totalLength = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0);
      const combinedBuffer = new Uint8Array(totalLength);

      let offset = 0;
      for (const buffer of buffers) {
        combinedBuffer.set(new Uint8Array(buffer), offset);
        offset += buffer.byteLength;
      }

      const combinedBlob = new Blob([combinedBuffer], { type: 'audio/mpeg' });
      zip.file(`${title || 'combined-audio'}.mp3`, combinedBlob);

      // Step 4: Generate ZIP and trigger download
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const zipUrl = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = zipUrl;
      a.download = `${title || 'audio-clips'}.zip`;
      a.click();
      URL.revokeObjectURL(zipUrl);
    } catch (err) {
      console.error('Error combining and downloading audio:', err);
    }
  }, [speeches, oneSecSpeech, title]);

  return (
    <div>
      <div className="container mx-auto">
        <div className="grid h-[600px] grid-cols-[1fr_auto_300px]">
          <div className="bg-card flex flex-col rounded-lg p-6">
            <h1 className="text-2xl font-bold">Text to speech</h1>
            <input
              id="title"
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Enter title..."
              className="mt-1 block w-full border border-gray-300 rounded-md shadow-sm p-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <button
              onClick={handleCombineAndDownload}
              className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600"
            >
              Combine, and Download
            </button>
            {
              combinedAudio && (
                <audio controls autoPlay={true} src={combinedAudio}>

                </audio>
              )
            }
            <div className="flex flex-1 flex-col justify-center">
              {selectedSpeech ? (
                <div className="space-y-4">
                  {selectedSpeech.status === 'complete' && (
                    <div>
                      <p className="text-muted-foreground text-sm">{selectedSpeech.text}</p>
                      <textarea
                        id="notes"
                        value={selectedSpeech.text}
                        onChange={(e) => setSelectedSpeech({
                          audioBase64: '',
                          createdAt: undefined,
                          id: '',
                          status: undefined,
                          ...selectedSpeech,
                          text: e.target.value})}
                        rows={4}
                        className="w-full p-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                        placeholder="Type something..."
                      />
                      <button  className="mt-4 rounded bg-blue-500 px-4 py-2 text-white hover:bg-blue-600" onClick={regenerate}> Regenerate</button>
                    </div>

                  )}
                  {selectedSpeech.status === 'loading' ? (
                    <div className="flex items-center justify-center p-8">
                      <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-white" />
                    </div>
                  ) : selectedSpeech.audioBase64 ? (
                    <AudioPlayer audioBase64={selectedSpeech.audioBase64} autoplay={autoplay} onAudioEnd={onsSelectedAudioEnd} />
                  ) : null}
                </div>
              ) : (
                <EmptyState />
              )}
            </div>
          </div>

          <Separator orientation="vertical" className="h-full" />

          <ScrollArea className="h-[600px] overflow-hidden rounded-tr-lg">
            <div className="flex items-center justify-between border-b p-3">
              <h2 className="font-semibold">Generations</h2>
              <div className="flex items-center gap-2">
                <label htmlFor="autoplay" className="text-sm">
                  Autoplay
                </label>
                <Switch id="autoplay" checked={autoplay} onCheckedChange={setAutoplay} />
              </div>
            </div>
            <div>
              {speechToDisplay.map((speech,i) => (
                <Card
                  key={speech.id+i}
                  className={cn(
                    'hover:bg-accent relative cursor-pointer rounded-none border-0 transition-colors',
                    selectedSpeech?.id === speech.id && 'bg-accent',
                    speech.status === 'loading' &&
                    'cursor-not-allowed opacity-70 hover:bg-transparent',
                  )}

                  onClick={() => speech.status === 'complete' && !isSpeaking && setSelectedSpeech(speech)}
                >
                  <CardContent className="px-3 py-3">
                    <p className="mb-1 max-w-[250px] truncate font-medium">{speech.text}</p>
                    {speech.status === 'loading' ? (
                      <div className="text-muted-foreground flex items-center gap-2 text-xs">
                        <div
                          className="h-3 w-3 animate-spin rounded-full border-b-2 border-current" />
                        <span>Generating...</span>
                      </div>
                    ) : (
                      <p className="text-muted-foreground text-xs">
                        {formatDistanceToNow(speech.createdAt, {
                          addSuffix: true,
                        })}
                      </p>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </ScrollArea>
        </div>
      </div>

      <div className="absolute bottom-0 left-0 right-0 p-4">
        <button onClick={() => {
          handlePause(1);
        }}>add Pause
        </button>
        <div className="mx-auto max-w-4xl">
          <TextToSpeechPromptBar
            onGenerateStart={handleGenerateStart}
            onGenerateComplete={handleGenerateComplete}
            onPause={handlePause}
            onSettingsChange={handleSettingsChange}
          />
        </div>
      </div>
    </div>
  );
}

const EmptyState = () => (
  <div className="flex flex-col items-center justify-center gap-4">
    <Image
      src="/empty-folder.png"
      alt="Speech placeholder"
      width={160}
      height={160}
      className="select-none"
      draggable={false}
    />
    <p className="text-muted-foreground font-medium">Select a speech to play or create a new one</p>
  </div>
);

interface GeneratedSpeech {
  id: string;
  text: string;
  audioBase64: string;
  createdAt: Date;
  status: 'loading' | 'complete' | 'error';
}
