// YouTube's IFrame Player API, typed for the parts the snippet player and
// editor use (https://developers.google.com/youtube/iframe_api_reference).
// The script is loaded on first use, which is always a click (AGENTS.md:
// load the player only after a click or consent), and players use the
// privacy-enhanced youtube-nocookie.com domain.

const PRIVACY_ENHANCED_HOST = "https://www.youtube-nocookie.com";
const IFRAME_API_URL = "https://www.youtube.com/iframe_api";

export const PlayerState = {
  UNSTARTED: -1,
  ENDED: 0,
  PLAYING: 1,
  PAUSED: 2,
  BUFFERING: 3,
  CUED: 5,
} as const;

export type YouTubePlayer = {
  cueVideoById(videoId: string): void;
  seekTo(seconds: number, allowSeekAhead: boolean): void;
  playVideo(): void;
  pauseVideo(): void;
  getCurrentTime(): number;
  /** 0 until the video's metadata has loaded. */
  getDuration(): number;
  getPlayerState(): number;
  /**
   * Not in the reference, but present: right after switching videos the
   * player still reports the previous one's time and length for a moment,
   * and this tells which video it reports on.
   */
  getVideoData?(): { video_id?: string } | undefined;
  destroy(): void;
};

type PlayerOptions = {
  host: string;
  videoId: string;
  playerVars: Record<string, string | number>;
  events: {
    onReady?: (event: { target: YouTubePlayer }) => void;
    onStateChange?: (event: { data: number }) => void;
    onError?: (event: { data: number }) => void;
  };
};

export type YouTubeIframeApi = {
  Player: new (element: HTMLElement, options: PlayerOptions) => YouTubePlayer;
};

declare global {
  interface Window {
    YT?: Partial<YouTubeIframeApi> & { loaded?: number };
    onYouTubeIframeAPIReady?: () => void;
  }
}

let loading: Promise<YouTubeIframeApi> | null = null;

function readyApi(): YouTubeIframeApi | null {
  const api = window.YT;
  return api?.loaded === 1 && api.Player ? { Player: api.Player } : null;
}

/** Loads the API once per page; later calls share the same promise. */
export function loadYouTubeIframeApi(): Promise<YouTubeIframeApi> {
  const ready = readyApi();
  if (ready) return Promise.resolve(ready);
  loading ??= new Promise<YouTubeIframeApi>((resolve, reject) => {
    const script = document.createElement("script");
    // A failed load is forgotten, so the next click tries again.
    const fail = (message: string) => {
      loading = null;
      script.remove();
      reject(new Error(message));
    };
    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      const api = readyApi();
      if (api) resolve(api);
      else fail("The YouTube player API did not start.");
    };
    script.src = IFRAME_API_URL;
    script.async = true;
    script.onerror = () => fail("The YouTube player could not be loaded.");
    document.head.append(script);
  });
  return loading;
}

const PLAYER_ERRORS: Record<number, string> = {
  2: "YouTube refused the video id or the player settings.",
  5: "This browser could not play the video.",
  100: "The video is no longer on YouTube: it was removed or made private.",
  101: "The uploader does not allow this video to be played on other sites.",
  150: "The uploader does not allow this video to be played on other sites.",
  153: "YouTube refused to play the video because the page sent no referrer.",
};

export function playerErrorMessage(code: number): string {
  return (
    PLAYER_ERRORS[code] ?? `The YouTube player stopped with error ${code}.`
  );
}

/**
 * Puts a privacy-enhanced player in `host`, replacing what it held. YouTube
 * swaps the inner element for its iframe; React never renders that element,
 * so the swap cannot confuse React.
 */
export function mountPlayer(
  api: YouTubeIframeApi,
  host: HTMLElement,
  videoId: string,
  {
    playerVars = {},
    events,
  }: {
    playerVars?: Record<string, string | number>;
    events: PlayerOptions["events"];
  },
): YouTubePlayer {
  const mount = document.createElement("div");
  host.replaceChildren(mount);
  return new api.Player(mount, {
    host: PRIVACY_ENHANCED_HOST,
    videoId,
    playerVars: {
      rel: 0,
      playsinline: 1,
      origin: window.location.origin,
      ...playerVars,
    },
    events,
  });
}

export function thumbnailUrl(youtubeId: string): string {
  return `https://i.ytimg.com/vi/${youtubeId}/hqdefault.jpg`;
}

export function watchUrl(youtubeId: string, start_s = 0): string {
  return `https://www.youtube.com/watch?v=${youtubeId}&t=${Math.floor(start_s)}s`;
}
