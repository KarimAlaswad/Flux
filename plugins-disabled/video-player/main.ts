import { startStdin } from "#shared/stdin.ts"

startStdin(async ({ method, params, id }, send) => {
  if (method === "load") {
    send(id, "ok")
  } else {
    send(id, null, "Method not found: " + method)
  }
})