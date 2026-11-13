import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import "./player.css";
import { useVideo } from "./useVideo";
import type { Track } from "./useVideo";

/* ── tiny helpers ─────────────────────────────────────────────────────── */

function fmt(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = Math.floor(s % 60);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  return `${h > 0 ? h + ":" : ""}${mm}:${String(sec).padStart(2, "0")}`;
}

const SPEEDS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];

/* ── icons (every path copied from movi-player's markup) ──────────────── */

// One <svg> shell for every line icon. movi draws all of them in a 24x24 box
// with 2px strokes, so the shell is the shared part and each icon owns only
// its shapes.
const Ico = ({ d, children }: { d?: string; children?: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    {d ? <path d={d} /> : null}
    {children}
  </svg>
);

const PlayIco = () => (
  <svg
    viewBox="0 0 24 24"
    fill="currentColor"
    stroke="currentColor"
    strokeWidth={2.6}
    strokeLinejoin="round"
  >
    <path d="M6.4 5.6L17.6 12L6.4 18.4Z" />
  </svg>
);

const PauseIco = () => (
  <svg viewBox="0 0 24 24" fill="currentColor">
    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
  </svg>
);

const SkipIco = ({ dir }: { dir: -1 | 1 }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path
      d={
        dir < 0
          ? "M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"
          : "M21 12a9 9 0 1 1-9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"
      }
    />
    <path d={dir < 0 ? "M3 3v5h5" : "M21 3v5h-5"} />
    <text
      x="50%"
      y="54%"
      fontSize="7"
      fontFamily="sans-serif"
      fontWeight="bold"
      fill="currentColor"
      textAnchor="middle"
      dominantBaseline="middle"
      stroke="none"
    >
      10
    </text>
  </svg>
);

const VolIco = ({ muted, low }: { muted: boolean; low: boolean }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth={2}
    strokeLinecap="round"
    strokeLinejoin="round"
  >
    <path d="M11 5L6 9H2v6h4l5 4V5z" />
    {muted ? (
      <>
        <line x1="23" y1="9" x2="17" y2="15" />
        <line x1="17" y1="9" x2="23" y2="15" />
      </>
    ) : low ? (
      <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
    ) : (
      <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
    )}
  </svg>
);

const AudioIco = () => (
  <Ico>
    <path d="M9 18V5l12-2v13" />
    <circle cx="6" cy="18" r="3" />
    <circle cx="18" cy="16" r="3" />
  </Ico>
);

const SubIco = () => (
  <Ico>
    <rect width="20" height="16" x="2" y="4" rx="2" ry="2" />
    <path d="M10 8.5H8a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2 M18 8.5h-2a2 2 0 0 0-2 2v3a2 2 0 0 0 2 2h2" />
  </Ico>
);

// A gauge, not the text "1×". movi tints the circle while the rate is off
// normal and keeps the number in the menu.
const SpeedIco = () => (
  <Ico>
    <path d="M5.64 18.36a9 9 0 1 1 12.72 0" />
    <path d="m12 12 4-4" />
  </Ico>
);

const PipIco = () => (
  <Ico>
    <rect x="2" y="4" width="20" height="16" rx="2" />
    <rect x="12" y="11" width="8" height="6" rx="1" fill="currentColor" opacity="0.35" />
  </Ico>
);

const FullIco = ({ on }: { on: boolean }) => (
  <Ico
    d={
      on
        ? "M4 14h6v6m10-6h-6v6M4 10h6V4m10 6h-6V4"
        : "M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"
    }
  />
);

// movi's title bar is a toolbar row: arrow, then name. Not a floating ✕.
const BackIco = () => (
  <Ico>
    <path d="M22 12H3" />
    <path d="M10 19l-7-7 7-7" />
  </Ico>
);

// The top-right button opens the long list. Three dots, not a gear: movi's
// bar already has a gear and two of them ask the viewer to guess.
const MoreIco = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" stroke="none">
    <circle cx="12" cy="5.5" r="2.3" />
    <circle cx="12" cy="12" r="2.3" />
    <circle cx="12" cy="18.5" r="2.3" />
  </svg>
);

const ChevronIco = () => <Ico d="M15 18l-6-6 6-6" />;

/* ── the seek bar ─────────────────────────────────────────────────────── */

function SeekBar({
  position,
  duration,
  seeking,
  onStart,
  onSeek,
  onEnd,
}: {
  position: number;
  duration: number;
  seeking: boolean;
  onStart: () => void;
  onSeek: (t: number) => void;
  onEnd: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const pct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  const at = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (e.clientX - r.left) / r.width));
    return ratio * (duration || 0);
  };

  return (
    <div
      ref={ref}
      className="vp-seek"
      onPointerDown={(e) => {
        if (!duration) return;
        e.currentTarget.setPointerCapture(e.pointerId);
        onStart();
        onSeek(at(e));
      }}
      onPointerMove={(e) => {
        if (seeking) onSeek(at(e));
      }}
      onPointerUp={(e) => {
        if (!seeking) return;
        onEnd();
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onPointerCancel={() => seeking && onEnd()}
    >
      <div className="vp-seek-track">
        <div className="vp-seek-fill" style={{ width: `${pct}%` }} />
      </div>
      <div className="vp-seek-knob" style={{ left: `${pct}%` }} />
    </div>
  );
}

/* ── one row of the context menu ──────────────────────────────────────── */

function CtxRow({
  icon,
  label,
  shortcut,
  arrow,
  on,
  onClick,
}: {
  icon?: ReactNode;
  label: string;
  shortcut?: string;
  arrow?: boolean;
  on?: boolean;
  onClick?: () => void;
}) {
  return (
    <button
      className={`vp-ctx-item${on ? " vp-ctx-item--on" : ""}`}
      onClick={onClick}
    >
      {icon ? <span className="vp-ctx-icon">{icon}</span> : null}
      <span className="vp-ctx-label">{label}</span>
      {shortcut ? <span className="vp-ctx-key">{shortcut}</span> : null}
      {arrow ? <span className="vp-ctx-arrow">▶</span> : null}
    </button>
  );
}

/* ── the player ───────────────────────────────────────────────────────── */

function Player({
  url,
  title,
  onClose,
}: {
  url: string;
  title: string;
  onClose: () => void;
}) {
  const { state, actions, surface } = useVideo(url);

  const rootRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);

  const [ui, setUi] = useState(true);
  const [scrub, setScrub] = useState<number | null>(null);
  const [menu, setMenu] = useState<null | "speed" | "audio" | "subs">(null);
  const [ctx, setCtx] = useState<null | "root" | "speed" | "audio" | "subs">(
    null,
  );
  const [tip, setTip] = useState<null | {
    text: string;
    key: string;
    left: number;
    bottom: number;
  }>(null);
  const [isFs, setIsFs] = useState(false);

  /* ── chrome visibility ── */

  // The bar must not fade while you are reading it: paused, or with a dropdown
  // or the context menu open. Read through a ref so the timer armed 2.5s ago
  // sees today's answer rather than the one captured when it was armed.
  const timer = useRef<number>(0);
  const holdRef = useRef(true);
  holdRef.current = state.paused || Boolean(menu) || Boolean(ctx);

  const poke = useCallback(() => {
    setUi(true);
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      if (!holdRef.current) setUi(false);
    }, 2500);
  }, []);

  useEffect(() => {
    poke();
    return () => window.clearTimeout(timer.current);
  }, [poke]);

  /* ── fullscreen ── */

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) document.exitFullscreen();
    else rootRef.current?.requestFullscreen().catch(() => {});
  }, []);

  useEffect(() => {
    const onFs = () => setIsFs(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", onFs);
    return () => document.removeEventListener("fullscreenchange", onFs);
  }, []);

  /* ── click to pause, double-click to go fullscreen ── */

  // A double-click starts with a click, so the pause cannot be sent at once —
  // it is held for 220ms and dropped if a partner arrives.
  const clickTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(clickTimer.current), []);

  const surfaceClick = () => {
    if (menu) return setMenu(null);
    if (ctx) return setCtx(null);
    window.clearTimeout(clickTimer.current);
    clickTimer.current = window.setTimeout(() => actions.toggle(), 220);
  };

  const surfaceDoubleClick = () => {
    window.clearTimeout(clickTimer.current);
    toggleFullscreen();
  };

  /* ── keyboard ── */

  // One listener for the whole lifetime: `latest` always holds this render's
  // values, so we never re-register on every position tick.
  const latest = useRef({ actions, state, onClose, poke, toggleFullscreen });
  latest.current = { actions, state, onClose, poke, toggleFullscreen };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.altKey || e.metaKey) return;
      const t = e.target as HTMLElement | null;
      if (
        t &&
        (t.tagName === "INPUT" ||
          t.tagName === "TEXTAREA" ||
          t.isContentEditable)
      )
        return;

      const { actions, state, onClose, poke, toggleFullscreen } = latest.current;

      // Walk the track list and pick the one after the selected track.
      const cycle = (kind: "audio" | "subtitle") => {
        const list = state.tracks.filter((t) => t.kind === kind);
        if (list.length < 2) return;
        const i = list.findIndex((t) => t.selected);
        const next = list[(i + 1) % list.length];
        if (kind === "audio") actions.setAudioTrack?.(next.id);
        else actions.setSubtitleTrack?.(next.id);
      };

      switch (e.key) {
        case " ":
        case "k":
        case "K":
          e.preventDefault();
          actions.toggle();
          break;
        case "ArrowLeft":
          e.preventDefault();
          actions.seekBy(-5);
          break;
        case "ArrowRight":
          e.preventDefault();
          actions.seekBy(5);
          break;
        case "ArrowUp":
          e.preventDefault();
          actions.setVolume(state.volume + 5);
          break;
        case "ArrowDown":
          e.preventDefault();
          actions.setVolume(state.volume - 5);
          break;
        case "m":
        case "M":
          actions.setMute(!state.muted);
          break;
        case "f":
        case "F":
          toggleFullscreen();
          break;
        case "a":
        case "A":
          cycle("audio");
          break;
        case "v":
        case "V":
          cycle("subtitle");
          break;
        case "p":
        case "P":
          actions.pip?.();
          break;
        case "[":
          actions.setSpeed(Math.max(0.25, +(state.speed - 0.25).toFixed(2)));
          break;
        case "]":
          actions.setSpeed(Math.min(4, +(state.speed + 0.25).toFixed(2)));
          break;
        case "Escape":
          if (document.fullscreenElement) document.exitFullscreen();
          else onClose();
          break;
        default:
          return;
      }
      poke();
    };

    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  /* ── tooltip ── */

  const showTip = (el: HTMLElement) => {
    const bar = barRef.current;
    const text = el.dataset.tip;
    if (!bar || !text || menu || ctx) return setTip(null);

    const barRect = bar.getBoundingClientRect();
    const btnRect = el.getBoundingClientRect();
    // Clear of the seek bar, not just of the button: sitting directly over the
    // track covers the one thing a viewer watches while reaching for a button.
    const seek = bar.querySelector(".vp-seek")?.getBoundingClientRect();

    setTip({
      text,
      key: el.dataset.tipKey || "",
      left: btnRect.left + btnRect.width / 2 - barRect.left,
      bottom: barRect.bottom - (seek ? seek.top : btnRect.top) + 6,
    });
  };

  // The row moves under a still cursor (PiP appears, the clock widens past ten
  // minutes), so the tip is re-clamped on every render instead of once.
  useLayoutEffect(() => {
    const el = tipRef.current;
    const bar = barRef.current;
    if (!el || !bar || !tip) return;
    const half = el.offsetWidth / 2;
    const limit = Math.max(half + 4, bar.clientWidth - half - 4);
    el.style.left = `${Math.max(half + 4, Math.min(limit, tip.left))}px`;
  });

  /* ── derived ── */

  const shown = scrub ?? state.position;
  const waiting = (state.buffering || state.duration === 0) && !state.error;

  const audio = state.tracks.filter((t) => t.kind === "audio");
  const subs = state.tracks.filter((t) => t.kind === "subtitle");

  const pick = (t: Track | null) => {
    if (!t) return;
    if (t.kind === "audio") actions.setAudioTrack?.(t.id);
    else actions.setSubtitleTrack?.(t.id);
    setMenu(null);
  };

  return (
    <div
      ref={rootRef}
      className="vp-root"
      onPointerMove={poke}
      onPointerDown={poke}
    >
      {surface}

      {/* click-to-play layer, under the bar */}
      <div
        className="vp-click"
        style={{ cursor: ui ? "default" : "none" }}
        onClick={surfaceClick}
        onDoubleClick={surfaceDoubleClick}
      />

      {/* centre play button, only while paused */}
      {state.paused && !waiting && !state.error && (
        <div className="vp-center">
          <button aria-label="Play" onClick={actions.toggle}>
            <PlayIco />
          </button>
        </div>
      )}

      {/* movi's loader: the play mark with a segment running round it */}
      {waiting && (
        <div className="vp-loader">
          <svg className="vp-loader-mark" viewBox="0 0 48 48" aria-hidden="true">
            <path className="vp-loader-track" d="M18 12L36 24L18 36Z" />
            <path className="vp-loader-chase" d="M18 12L36 24L18 36Z" />
          </svg>
        </div>
      )}

      {state.error && (
        <div className="vp-error">
          <p className="vp-error-title">Can't Play This</p>
          <p className="vp-error-body">{state.error}</p>
        </div>
      )}

      {title && (
        <div className={`vp-title${ui ? " vp-title--on" : ""}`}>
          <button className="vp-title-back" aria-label="Back" onClick={onClose}>
            <BackIco />
          </button>
          <span className="vp-title-text">{title}</span>
        </div>
      )}

      <button
        className={`vp-gear${ui && !ctx ? " vp-gear--on" : ""}`}
        aria-label="More options"
        title="More options"
        onClick={() => setCtx(ctx ? null : "root")}
      >
        <MoreIco />
      </button>

      {/* ── bottom bar ── */}
      <div
        ref={barRef}
        className={`vp-bar ${ui ? "" : "vp-bar--hidden"}`}
        onPointerOver={(e) => {
          const el = (e.target as HTMLElement).closest(
            "[data-tip]",
          ) as HTMLElement | null;
          if (el) showTip(el);
        }}
        onPointerLeave={() => setTip(null)}
      >
        <SeekBar
          position={shown}
          duration={state.duration}
          seeking={scrub !== null}
          onStart={() => setScrub(state.position)}
          onSeek={(t) => {
            setScrub(t);
            actions.seek(t);
          }}
          onEnd={() => setScrub(null)}
        />

        <div className="vp-row">
          <div className="vp-left">
            <button
              className="vp-btn vp-play"
              aria-label={state.paused ? "Play" : "Pause"}
              data-tip={state.paused ? "Play" : "Pause"}
              data-tip-key="Space"
              onClick={actions.toggle}
            >
              {state.paused ? <PlayIco /> : <PauseIco />}
            </button>

            <div className="vp-capsule">
              <button
                className="vp-btn"
                aria-label="Back 10 seconds"
                data-tip="Back 10 seconds"
                data-tip-key="←"
                onClick={() => actions.seekBy(-10)}
              >
                <SkipIco dir={-1} />
              </button>
              <button
                className="vp-btn"
                aria-label="Forward 10 seconds"
                data-tip="Forward 10 seconds"
                data-tip-key="→"
                onClick={() => actions.seekBy(10)}
              >
                <SkipIco dir={1} />
              </button>
            </div>

            <div className="vp-capsule vp-vol-wrap">
              <button
                className="vp-btn"
                aria-label={state.muted ? "Unmute" : "Mute"}
                data-tip={state.muted ? "Unmute" : "Mute"}
                data-tip-key="M"
                onClick={() => actions.setMute(!state.muted)}
              >
                <VolIco muted={state.muted} low={state.volume < 50} />
              </button>
              <input
                className="vp-vol"
                type="range"
                min={0}
                max={100}
                step={1}
                value={state.muted ? 0 : Math.round(state.volume)}
                style={
                  {
                    "--vp-vol-pct": `${state.muted ? 0 : Math.round(state.volume)}%`,
                  } as any
                }
                onChange={(e) => {
                  const v = Number(e.target.value);
                  actions.setVolume(v);
                  if (v > 0 && state.muted) actions.setMute(false);
                }}
                aria-label="Volume"
              />
            </div>

            <div className="vp-capsule vp-time">
              <span className="vp-now">{fmt(shown)}</span>
              <span className="vp-sep">/</span>
              <span className="vp-dur">{fmt(state.duration)}</span>
            </div>
          </div>

          <div className="vp-right">
            {actions.setAudioTrack && audio.length > 0 && (
              <button
                className="vp-btn"
                aria-label="Audio Track"
                data-tip="Audio Track"
                data-tip-key="A"
                onClick={() => setMenu(menu === "audio" ? null : "audio")}
              >
                <AudioIco />
              </button>
            )}

            {actions.setSubtitleTrack && subs.length > 0 && (
              <button
                className="vp-btn"
                aria-label="Subtitle Track"
                data-tip="Subtitle Track"
                data-tip-key="V"
                onClick={() => setMenu(menu === "subs" ? null : "subs")}
              >
                <SubIco />
              </button>
            )}

            <button
              className={`vp-btn${state.speed !== 1 ? " vp-btn--on" : ""}`}
              aria-label="Playback Speed"
              data-tip="Playback Speed"
              data-tip-key="[/]"
              onClick={() => setMenu(menu === "speed" ? null : "speed")}
            >
              <SpeedIco />
            </button>

            {actions.pip && (
              <button
                className="vp-btn"
                aria-label="Picture in Picture"
                data-tip="Picture in Picture"
                data-tip-key="P"
                onClick={actions.pip}
              >
                <PipIco />
              </button>
            )}

            <button
              className="vp-btn"
              aria-label="Fullscreen"
              data-tip="Fullscreen"
              data-tip-key="F"
              onClick={toggleFullscreen}
            >
              <FullIco on={isFs} />
            </button>
          </div>
        </div>

        {tip && (
          <div
            ref={tipRef}
            className="vp-tip"
            style={{ left: tip.left, bottom: tip.bottom }}
          >
            <span>{tip.text}</span>
            {tip.key ? <kbd className="vp-tip-key">{tip.key}</kbd> : null}
          </div>
        )}
      </div>

      {/* ── bar dropdown: speed / audio / subtitles ── */}
      {menu && (
        <div className="vp-menu" onClick={(e) => e.stopPropagation()}>
          {menu === "speed" && (
            <>
              {SPEEDS.map((s) => (
                <button
                  key={s}
                  className={`vp-item ${state.speed === s ? "vp-item--on" : ""}`}
                  onClick={() => {
                    actions.setSpeed(s);
                    setMenu(null);
                  }}
                >
                  {s}x{s === 1 && <span className="vp-normal">(Normal)</span>}
                </button>
              ))}
            </>
          )}

          {menu === "audio" && (
            <>
              <div className="vp-menu-head">Audio Track</div>
              {audio.map((t) => (
                <button
                  key={t.id}
                  className={`vp-item ${t.selected ? "vp-item--on" : ""}`}
                  onClick={() => pick(t)}
                >
                  {t.label}
                </button>
              ))}
            </>
          )}

          {menu === "subs" && (
            <>
              <div className="vp-menu-head">Subtitle Track</div>
              <button
                className={`vp-item ${subs.every((t) => !t.selected) ? "vp-item--on" : ""}`}
                onClick={() => {
                  actions.setSubtitleTrack?.(false);
                  setMenu(null);
                }}
              >
                Off
              </button>
              {subs.map((t) => (
                <button
                  key={t.id}
                  className={`vp-item ${t.selected ? "vp-item--on" : ""}`}
                  onClick={() => pick(t)}
                >
                  {t.label}
                </button>
              ))}
            </>
          )}
        </div>
      )}

      {/* ── context menu: movi's long list, entry for entry ── */}
      {ctx && (
        <>
          <div className="vp-ctx-backdrop" onClick={() => setCtx(null)} />
          <div className="vp-ctx">
            {ctx === "root" && (
              <>
                <CtxRow
                  icon={state.paused ? <PlayIco /> : <PauseIco />}
                  label={state.paused ? "Play" : "Pause"}
                  shortcut="Space"
                  onClick={() => {
                    actions.toggle();
                    setCtx(null);
                  }}
                />
                <CtxRow
                  icon={<SpeedIco />}
                  label="Playback Speed"
                  shortcut="[/]"
                  arrow
                  onClick={() => setCtx("speed")}
                />
                {(audio.length > 0 || subs.length > 0) && (
                  <div className="vp-ctx-divider" />
                )}
                {audio.length > 0 && (
                  <CtxRow
                    icon={<AudioIco />}
                    label="Audio Track"
                    shortcut="A"
                    arrow
                    onClick={() => setCtx("audio")}
                  />
                )}
                {subs.length > 0 && (
                  <CtxRow
                    icon={<SubIco />}
                    label="Subtitle Track"
                    shortcut="V"
                    arrow
                    onClick={() => setCtx("subs")}
                  />
                )}
                <div className="vp-ctx-divider" />
                {actions.pip && (
                  <CtxRow
                    icon={<PipIco />}
                    label="Picture in Picture"
                    shortcut="P"
                    onClick={() => {
                      actions.pip?.();
                      setCtx(null);
                    }}
                  />
                )}
                <CtxRow
                  icon={<FullIco on={isFs} />}
                  label="Fullscreen"
                  shortcut="F"
                  onClick={() => {
                    toggleFullscreen();
                    setCtx(null);
                  }}
                />
                {/* movi's full list, kept in order for when the backends land:
                    Aspect Ratio · Audio Output · HDR Mode · Rotate Video · Loop
                    · Stable Volume · Crop Black Bars · Ambient Mode · Snapshot
                    · Timeline · Stats for nerds · Keyboard Shortcuts.
                    They are not drawn because nothing behind them can act
                    yet — one more, and it looks broken rather than unfinished. */}
              </>
            )}

            {ctx === "speed" && (
              <>
                <CtxRow
                  icon={<ChevronIco />}
                  label="Back"
                  onClick={() => setCtx("root")}
                />
                {SPEEDS.map((s) => (
                  <CtxRow
                    key={s}
                    label={`${s}x${s === 1 ? " (Normal)" : ""}`}
                    on={state.speed === s}
                    onClick={() => {
                      actions.setSpeed(s);
                      setCtx("root");
                    }}
                  />
                ))}
              </>
            )}

            {ctx === "audio" && (
              <>
                <CtxRow
                  icon={<ChevronIco />}
                  label="Back"
                  onClick={() => setCtx("root")}
                />
                {audio.map((t) => (
                  <CtxRow
                    key={t.id}
                    label={t.label}
                    on={t.selected}
                    onClick={() => {
                      actions.setAudioTrack?.(t.id);
                      setCtx("root");
                    }}
                  />
                ))}
              </>
            )}

            {ctx === "subs" && (
              <>
                <CtxRow
                  icon={<ChevronIco />}
                  label="Back"
                  onClick={() => setCtx("root")}
                />
                <CtxRow
                  label="Off"
                  on={subs.every((t) => !t.selected)}
                  onClick={() => {
                    actions.setSubtitleTrack?.(false);
                    setCtx("root");
                  }}
                />
                {subs.map((t) => (
                  <CtxRow
                    key={t.id}
                    label={t.label}
                    on={t.selected}
                    onClick={() => {
                      actions.setSubtitleTrack?.(t.id);
                      setCtx("root");
                    }}
                  />
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/* ── plugin entry: the `video.player` contract ────────────────────────── */

export default function VideoPlayer({
  item,
  manifests,
}: {
  item?: any;
  manifests?: any[];
}) {
  const [active, setActive] = useState<{ url: string; title: string } | null>(
    null,
  );

  useEffect(() => {
    const onLoad = async (e: any) => {
      const { url, title, source } = e.detail || {};
      if (!url) return;

      const resolved = source
        ? (window as any).__pluginRpc?.(source + ".resolve", { url })
        : Promise.resolve({ url });
      const result = (await resolved?.catch(() => ({ url }))) || { url };
      let streamUrl: string = result?.url || url;

      // YouTube blocks cross-origin fetches; route googlevideo through the
      // local proxy when the core-stream plugin is running.
      if (streamUrl.includes("googlevideo.com")) {
        let base: string | null = null;
        try {
          const proxy: any = await (window as any).__pluginRpc?.(
            "core-stream.getUrl",
            {},
          );
          base = proxy?.base || proxy?.result?.base || null;
        } catch {}
        streamUrl = `${base || "http://127.0.0.1:1935"}/stream?u=${encodeURIComponent(streamUrl)}`;
      }

      setActive({ url: streamUrl, title: title || "" });
    };

    window.addEventListener("video.player.load", onLoad);
    return () => window.removeEventListener("video.player.load", onLoad);
  }, []);

  if (!active) return null;

  return (
    <Player
      url={active.url}
      title={active.title}
      onClose={() => setActive(null)}
    />
  );
}
