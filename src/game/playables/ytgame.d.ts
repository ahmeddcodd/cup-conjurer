/** Minimal YouTube Playables SDK surface used by Cup Conjurer. */
declare const ytgame: YtGameNamespace;

interface YtGameNamespace {
  readonly IN_PLAYABLES_ENV: boolean;
  readonly SDK_VERSION: string;
  readonly game: {
    firstFrameReady(): void;
    gameReady(): void;
    loadData(): Promise<string>;
    saveData(data: string): Promise<void>;
  };
  readonly engagement: {
    sendScore(score: { value: number }): Promise<void>;
  };
  readonly system: {
    isAudioEnabled(): boolean;
    onAudioEnabledChange(callback: (isAudioEnabled: boolean) => void): () => void;
    onPause(callback: () => void): () => void;
    onResume(callback: () => void): () => void;
    getLanguage(): Promise<string>;
  };
}
