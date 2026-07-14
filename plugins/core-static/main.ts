import { join } from "path";
import { startStdin } from "../_shared/stdin.ts";

const baseDir =
  process.env.PLUGIN_BASE_DIR || join(import.meta.dir, "..", "..");
const ALLOWED_PREFIX = join(baseDir, "build", "plugins");

startStdin(async ({ method, params, id }, send) => {
  if (method === "read") {
    if (!params.path) {
      send(id, null, "path required");
      return;
    }
    const fullPath = join(baseDir, params.path);
    if (!fullPath.startsWith(ALLOWED_PREFIX)) {
      send(id, null, "Access denied");
      return;
    }
    const file = Bun.file(fullPath);
    if (!(await file.exists())) {
      send(id, null, "Not found: " + params.path);
      return;
    }
    send(id, { code: await file.text() });
  } else {
    send(id, null, "Method not found: " + method);
  }
});
