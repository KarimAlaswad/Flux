import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import {
	MpvPrismVideo,
	useMpvPrismPlayer,
	useMpvPrismEvent,
} from "@mpv-prism/react";
import type { MpvPrismTrack } from "@mpv-prism/core";

export interface Track {
	id: number | string;
	kind: "audio" | "subtitle";
	label: string;
	selected: boolean;
}

export interface VideoState {
	paused: boolean;
	position: number; // seconds
	duration: number; // seconds
	volume: number; // 0-100
	muted: boolean;
	speed: number;
	buffering: boolean;
	error: string | null;
	ended: boolean;
	tracks: Track[];
}

export interface VideoActions {
	toggle(): void;
	seek(seconds: number): void;
	seekBy(delta: number): void;
	setVolume(v: number): void;
	setMute(m: boolean): void;
	setSpeed(s: number): void;

	setAudioTrack?(id: number | string): void;
	setSubtitleTrack?(id: number | string | false): void;
	pip?(): void;
	stats?(): Promise<Record<string, unknown>>;
	raw?(command: string, ...args: unknown[]): void;
}

export interface VideoApi {
	state: VideoState;
	actions: VideoActions;
	surface: ReactNode;
}

const MPV_CONFIG = {
	options: {
		"keep-open": "yes",
		hwdec: "auto-safe",
		"user-agent": "Mozilla/5.0",
	},
};

const INITIAL: VideoState = {
	paused: true,
	position: 0,
	duration: 0,
	volume: 100,
	muted: false,
	speed: 1,
	buffering: false,
	error: null,
	ended: false,
	tracks: [],
};

function mapTracks(raw?: MpvPrismTrack[]): Track[] {
  if (!raw) return [];
  return raw
    .filter((t) => t.type === "audio" || t.type === "sub" || t.type === "subtitle")
    .map((t) => ({
      id: (t.id ?? 0) as number,
      kind: t.type === "audio" ? "audio" : "subtitle",
      label:
        t.title ||
        t.lang ||
        `${t.type === "audio" ? "Audio" : "Subtitle"} ${t.id ?? "?"}`,
      selected: Boolean(t.selected),
    }));
}

export function useVideo(url: string): VideoApi {
  const player = useMpvPrismPlayer({
    playerId: "flux-video-player",
    mpv: MPV_CONFIG,
  });

  const [state, setState] = useState<VideoState>(INITIAL);
  const patch = (p: Partial<VideoState>) =>
    setState((s) => ({ ...s, ...p }));

  // mpv property events -> our state.
  useMpvPrismEvent(player, "paused", (e) => patch({ paused: e.paused }));
  useMpvPrismEvent(player, "position", (e) => patch({ position: e.position ?? 0 }));
  useMpvPrismEvent(player, "duration", (e) => patch({ duration: e.duration ?? 0 }));
  useMpvPrismEvent(player, "volume", (e) => patch({ volume: e.volume ?? 0 }));
  useMpvPrismEvent(player, "mute", (e) => patch({ muted: e.muted }));
  useMpvPrismEvent(player, "speed", (e) => patch({ speed: e.speed ?? 1 }));
  useMpvPrismEvent(player, "error", (e) => patch({ error: e.message }));
  useMpvPrismEvent(player, "ended", () => patch({ ended: true, paused: true }));
  useMpvPrismEvent(player, "tracks", (e) => patch({ tracks: mapTracks(e.tracks) }));

  // The cache event carries either a number (cache-buffering-state, 0-100)
  // or an object (demuxer-cache-state, with an `underrun` flag).
  useMpvPrismEvent(player, "cache", (e) => {
    const v = e.state as any;
    if (typeof v === "number") patch({ buffering: v < 100 });
    else if (v && typeof v.underrun === "boolean") patch({ buffering: v.underrun });
  });

  // Load (or reload) the source. This effect MUST live below every
  // useMpvPrismEvent call, because effects run in declaration order and
  // load() emits `paused:false` synchronously (MpvPrismPlayer.load ->
  // syncPlaybackPaused(false)). Declared above the subscriptions, that event
  // fires with nobody listening and the UI keeps INITIAL.paused = true while
  // the file plays. Reading player.paused back afterwards is the belt to this
  // braces, so a future effect added below cannot resurrect the bug.
  useEffect(() => {
    if (!player || !url) return;
    player.load(url).catch((e: any) => patch({ error: String(e?.message ?? e) }));
    // Fresh file => fresh UI state, plus the one fact load() just set.
    setState({ ...INITIAL, paused: player.paused ?? false });
  }, [player, url]);

  const actions: VideoActions = {
    toggle: () => player?.setPaused(!player.paused),
    seek: (t) => player?.seek(t, "absolute+exact"),
    seekBy: (d) =>
      player?.seek(Math.max(0, state.position + d), "absolute+exact"),
    setVolume: (v) => player?.setVolume(Math.max(0, Math.min(100, v))),
    setMute: (m) => player?.setMute(m),
    setSpeed: (s) => player?.setSpeed(s),

    setAudioTrack: (id) => player?.setAudioTrack(id),
    setSubtitleTrack: (id) =>
      player?.setSubtitleTrack(id === false ? "no" : id),
    pip: () => player?.enterPip(),

    stats: async () => {
      if (!player) return {};
      const read = (p: string) => player.getProperty(p).catch(() => null);
      const [w, h, fps, hw, cache, drops] = await Promise.all([
        read("width"),
        read("height"),
        read("container-fps"),
        read("hwdec-current"),
        read("cache-buffering-state"),
        read("frame-drop-count"),
      ]);
      return {
        resolution: `${w ?? "?"}x${h ?? "?"}`,
        fps,
        hwdec: hw,
        cache,
        dropped: drops,
      };
    },
    raw: (cmd, ...args) => player?.runCommand(cmd, ...(args as any)),
  };

  return {
    state,
    actions,
    surface: player ? (
      <MpvPrismVideo
        player={player}
        style={{ position: "absolute", inset: 0 }}
        fit="contain"
        presentationMode="canvas"
        frameTransport="cpu"
      />
    ) : null,
  };
}

/* When the web backend lands, this is the only line that changes:
   export const useVideo = hasMpvBridge() ? useMpvVideo : useMoviVideo;      */