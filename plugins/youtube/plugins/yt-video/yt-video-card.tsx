export default function YTVideoCard({ item }: { item: any }) {
  if (!item)
    return (
      <div className="p-4 text-sm" style={{ color: "var(--text-muted)" }}>
        Loading...
      </div>
    );

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
          {item.views ? ` · ${item.views}` : ""}
          {item.published ? ` · ${item.published}` : ""}
        </p>
      </div>
    </div>
  );
}
