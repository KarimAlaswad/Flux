import { readdirSync, existsSync, lstatSync, readFileSync } from "fs";
import { join } from "path";
import { startStdin } from "../_shared/stdin.ts";

const baseDir =
  process.env.PLUGIN_BASE_DIR || join(import.meta.dir, "..", "..");

function getAllPluginManifests(dir: string): any[] {
  let manifests: any[] = [];
  for (const file of readdirSync(dir)) {
    const fullPath = join(dir, file);
    if (lstatSync(fullPath).isDirectory()) {
      if (existsSync(join(fullPath, "plugin.json")))
        manifests.push(
          JSON.parse(readFileSync(join(fullPath, "plugin.json"), "utf-8")),
        );
      manifests = manifests.concat(getAllPluginManifests(fullPath));
    }
  }
  return manifests;
}

startStdin(async ({ method, params, id }, send) => {
  if (method === "scan") {
    const pluginDir = join(baseDir, "plugins");
    if (!existsSync(pluginDir)) {
      send(id, []);
      return;
    }
    const manifests = getAllPluginManifests(pluginDir);
    if (params.full) {
      send(id, manifests);
      return;
    }
    const safe = manifests.map((m: any) => ({
      name: m.name,
      version: m.version,
      description: m.description,
      author: m.author,
      methods: m.methods || [],
      hooks: m.hooks || [],
      ui: m.ui || null,
      feeds: m.feeds || null,
      components: m.components || null,
      slots: m.slots || null,
    }));
    send(id, safe);
  } else {
    send(id, null, "Method not found: " + method);
  }
});
