export default function YTVideoCard({ item }: { item: any }) {
  if (!item) return <div className="text-gray-400 p-4 text-sm">Loading...</div>;

  const handleClick = () => {
    if (item.url) {
      window.dispatchEvent(
        new CustomEvent("video.player.load", { detail: { url: item.url, title: item.title, source: item._plugin } })
      )
    }
  }

  return (
    <div
      onClick={handleClick}
      className="flex gap-3 p-3 bg-white rounded-lg shadow items-start cursor-pointer hover:bg-gray-50 transition-colors"
    >
      {item.thumbnail && (
        <img
          src={item.thumbnail}
          alt={item.title}
          className="w-[120px] h-[60px] object-cover rounded flex-shrink-0"
        />
      )}
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-sm text-gray-900 truncate">
          {item.title}
        </p>
        <p className="mt-1 text-xs text-gray-500">
          {item.channel}
          {item.views ? ` . ${item.views}` : ""}
          {item.published ? ` . ${item.published}` : ""}
        </p>
      </div>
    </div>
  );
}
