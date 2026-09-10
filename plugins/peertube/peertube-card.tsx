export default function PeerTubeCard({ item }: { item: any }) {
  if (!item)
    return (
      <div className="p-4 text-sm" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );

  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  const handleClick = () => {
    if (item.url) {
      window.dispatchEvent(
        new CustomEvent("video.player.load", {
          detail: { url: item.url, title: item.title, source: item._plugin },
        }),
      );
    }
  };

  return (
    <div
      onClick={handleClick}
      className="flex gap-3 p-2 rounded-md cursor-pointer transition-colors"
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
      }}
    >
      {item.thumbnail && (
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-[128px] h-[72px] object-cover rounded-md flex-shrink-0"
          style={{ border: "1px solid var(--border)" }}
        />
      )}
      <div className="min-w-0 flex-1 py-0.5">
        <p
          className="font-medium text-sm truncate"
          style={{ color: "var(--text)" }}
        >
          {item.title}
        </p>
        <p className="mt-1 text-[11px]" style={{ color: "var(--text-muted)" }}>
          {item.channel}
          {item.views ? ` · ${item.views} views` : ""}
          {item.duration ? ` · ${formatDuration(item.duration)}` : ""}
        </p>
        <div className="flex gap-1 mt-1.5 flex-wrap">
          {item.category && (
            <span
              className="px-1.5 py-0.5 text-[10px] rounded"
              style={{
                background: "var(--accent-soft)",
                color: "var(--accent)",
              }}
            >
              {item.category}
            </span>
          )}
          {item.licence && (
            <span
              className="px-1.5 py-0.5 text-[10px] rounded"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--text-muted)",
              }}
            >
              {item.licence}
            </span>
          )}
          {item.language && (
            <span
              className="px-1.5 py-0.5 text-[10px] rounded"
              style={{
                background: "rgba(255,255,255,0.04)",
                color: "var(--text-muted)",
              }}
            >
              {item.language}
            </span>
          )}
        </div>
        {item.published && (
          <p
            className="mt-1 text-[10px]"
            style={{ color: "var(--text-muted)" }}
          >
            {item.published}
          </p>
        )}
      </div>
    </div>
  );
}
