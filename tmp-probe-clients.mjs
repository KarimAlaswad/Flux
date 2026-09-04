import { Innertube, UniversalCache, ClientType } from "youtubei.js";

for (const client of ["ANDROID", "IOS", "TV", "WEB_EMBEDDED_PLAYER"]) {
  try {
    const tube = await Innertube.create({ cache: new UniversalCache(false) });
    // switch session client
    const info = await tube.getBasicInfo("y8kneKeNyCI", { client });
    const sd = info.streaming_data;
    const fmts = sd?.formats || [];
    const adap = sd?.adaptive_formats || [];
    const first = fmts[0];
    console.log(
      `--- client=${client} playability=${info.playability_status?.status} formats=${fmts.length} adaptive=${adap.length} firstUrlLen=${first?.url?.length || 0} firstHasCipher=${!!first?.cipher} firstSig=${(first?.signature_cipher || "").slice(0, 40)}`,
    );
  } catch (e) {
    console.log(
      `--- client=${client} ERR ${((e && e.message) || String(e)).slice(0, 120)}`,
    );
  }
}
