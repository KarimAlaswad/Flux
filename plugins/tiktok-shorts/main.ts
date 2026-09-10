import { startStdin } from "#shared/stdin.ts";

// normalizeTikTokItem: convert raw TikTok API/scraper results into the
// canonical item shape the feed expects. The fields mirror those produced by
// the YouTube provider so the feed can merge sources seamlessly.
function normalizeTikTokItem(raw: any, index: number) {
  // derive a stable videoId from the available raw fields; fall back to an
  // index-based id for demo/mock data
  const videoId =
    raw?.id || raw?.video?.id || raw?.aweme_id || `tiktok-${index}`;
  // prefer shareable URL fields that lead to the video page or a direct video
  const url =
    raw?.share_url ||
    raw?.webUrl ||
    raw?.video?.play_addr?.url_list?.[0] ||
    raw?.url ||
    "";
  // choose a best-effort thumbnail/cover image
  const cover =
    raw?.cover || raw?.thumbnail || raw?.video?.cover?.url_list?.[0] || "";

  return {
    videoId,
    title: raw?.desc || raw?.title || `TikTok short ${index + 1}`,
    author: raw?.author?.nickname || raw?.author?.unique_id || "TikTok",
    authorId: raw?.author?.uid || raw?.author?.id || null,
    thumbnails: cover ? [{ url: cover }] : [],
    thumbnail: cover,
    viewCount: raw?.statistics?.play_count || raw?.play_count || "",
    published: raw?.create_time
      ? new Date(raw.create_time * 1000).toLocaleDateString()
      : "",
    duration: raw?.video?.duration || raw?.duration || 0,
    // annotate the source/provider so the feed and player can route correctly
    source: "tiktok",
    provider: "tiktok-shorts",
    url,
    _raw: raw,
  };
}

// startStdin: subscribe to JSON-RPC-style requests over stdin. Each request
// is an object { id, method, params } and the plugin should call `send(id,
// result)` or `send(id, null, error)` when complete.
startStdin(async ({ method, params, id }, send) => {
  try {
    // METHOD: `feed` — return an array of normalized items and a continuation
    if (method === "feed") {
      // Respect a `limit` param if provided; default 20
      const limit = Math.max(1, Number(params?.limit || 20));
      // Demo fetch: oembed is used only to exercise the network path; the
      // returned text is not parsed here because the demo uses a mock item.
      const apiUrl =
        "https://www.tiktok.com/oembed?url=https://www.tiktok.com/@tiktok/video/7075837798939493678";
      const resp = await fetch(apiUrl, {
        headers: { Accept: "application/json" },
      });
      const text = await resp.text();

      // NOTE: production TikTok scraping or API integration is non-trivial
      // and out of scope for this prototype. We synthesize a mock item below
      // to demonstrate the contract and merging behavior with other providers.
      const mockItem = {
        id: "tiktok-demo-1",
        desc: "TikTok demo short",
        author: { nickname: "TikTok", unique_id: "tiktok", uid: "tiktok" },
        statistics: { play_count: "1.2M" },
        create_time: Math.floor(Date.now() / 1000),
        cover:
          "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80",
        duration: 15,
        share_url: "https://www.tiktok.com/@tiktok/video/7075837798939493678",
        video: {
          duration: 15,
          play_addr: {
            url_list: [
              "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4",
            ],
          },
          cover: {
            url_list: [
              "https://images.unsplash.com/photo-1517849845537-4d257902454a?auto=format&fit=crop&w=900&q=80",
            ],
          },
        },
      };

      // Normalize to the canonical shape and send back to the host.
      const items = [mockItem].map(normalizeTikTokItem);
      send(id, {
        items: items.slice(0, limit),
        continuation: null,
        hasMore: false,
      });
      return;
    }

    // METHOD: `resolve` — return a direct playable URL for a given item.
    if (method === "resolve") {
      const url = params?.url || "";
      // For demo items return a known MP4; otherwise return the provided URL
      const directUrl =
        params?.videoId && params.videoId.startsWith("tiktok-demo")
          ? "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4"
          : url ||
            "https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4";

      send(id, { url: directUrl, source: "tiktok" });
      return;
    }

    // Unknown method: reply with an error
    send(id, null, "Method not found: " + method);
  } catch (e: any) {
    // Unexpected failure: send error back to host
    send(id, null, e.message || String(e));
  }
});
