# Plugin Interconnection: Research Report

**Question:** In a modular plugin architecture where multiple subprocess peers communicate, what interconnection/transport options exist? Specifically for Flux — a Tauri v2 desktop app where plugins currently communicate via stdin/stdout JSON-RPC through a Rust host that will be replaced.

**Date:** 2026-07-28

---

## Table of Contents

1. [How Real Systems Handle Plugin-to-Plugin Communication](#1-how-real-systems-handle-plugin-to-plugin-communication)
   - [VS Code / Theia](#11-vs-code--theia)
   - [Kubernetes Pods / Sidecars](#12-kubernetes-pods--sidecars)
   - [D-Bus](#13-d-bus)
   - [Erlang/OTP](#14-erlangotp)
   - [Apache Kafka / NATS](#15-apache-kafka--nats)
   - [Kubernetes Aggregate API Server](#16-kubernetes-aggregate-api-server)
   - [Web Workers / Service Workers](#17-web-workers--service-workers)
   - [systemd Socket Activation](#18-systemd-socket-activation)
   - [JSON-RPC over stdio (LSP/MCP)](#19-json-rpc-over-stdio-lspmcp)
2. [Specific Options for Flux](#2-specific-options-for-flux)
   - [Option A: Stdin/Stdout Fan-Out (Current + Evolution)](#option-a-stdinstdout-fan-out-current--evolution)
   - [Option B: Registry as a Socket Server](#option-b-registry-as-a-socket-server)
   - [Option C: Message Broker (NATS)](#option-c-message-broker-nats)
   - [Option D: Shared-Nothing Peer-to-Peer](#option-d-shared-nothing-peer-to-peer)
   - [Option E: Unix Sockets per Plugin](#option-e-unix-sockets-per-plugin)
   - [Option F: gRPC](#option-f-grpc)
3. [Tradeoffs Analysis](#3-tradeoffs-analysis)
4. [Recommendation for Flux](#4-recommendation-for-flux)

---

## 1. How Real Systems Handle Plugin-to-Plugin Communication

### 1.1 VS Code / Theia

**Transport:** Multiplexed — Electron IPC (`ipcMain`/`ipcRenderer`), MessagePort (Web standard), named pipes (Unix sockets), and WebSockets for remote. The abstraction layer is the **Channel pattern** (`IChannel`/`IServerChannel`) from `src/vs/base/parts/ipc/common/ipc.ts`. [VS Code IPC Architecture](https://roopik.com/blog/vscode-internals-advanced-ipc)

**Addressing:** Named channels (e.g. `"files"`, `"settings"`). The Renderer process connects to the Main process via Electron IPC; the Extension Host communicates with the Renderer via MessagePort. Remote scenarios use WebSocket with the same channel abstraction.

**Key design choices:**
- One transport abstraction (`IChannel`) with pluggable backends: Electron IPC, Node named pipes, MessagePort, WebSocket.
- The Extension Host runs as a separate OS process (Node.js child process). The Renderer talks to it via `MessagePort`, not directly via stdio.
- Extensions cannot talk to each other directly — they communicate only through registered commands on the workbench API. This is intentional isolation. [Extension Host Architecture](https://code.visualstudio.com/api/advanced-topics/extension-host)
- The `vscode:` prefix on channel names is enforced by security validation in `ipcMain.ts` — messages without the prefix are silently dropped.

**Strengths:** Clean abstraction, strong security boundary, works across local and remote.
**Weaknesses:** Complex (many layers of abstraction), ~140 RPC interface pairs defined in a single 3,900-line protocol file.

**Relevance to Flux:** VS Code proves that a channel-based abstraction over multiple transports works well for desktop applications. Its pattern of isolating extensions in separate processes and routing through a central host is exactly what Flux does today.

---

### 1.2 Kubernetes Pods / Sidecars

**Transport:** Containers within the same Pod share a **network namespace** and communicate over **localhost** (TCP or Unix sockets). They can also share volumes for file-based exchange. [Kubernetes Pods documentation](https://kubernetes.io/docs/concepts/workloads/pods)

**Addressing:** By port number on localhost. Container A listens on port 8080, Container B connects to `localhost:8080`. Service discovery is handled externally (kubelet, DNS).

**Key patterns:**
- **Sidecar pattern:** A helper container runs alongside the main container, sharing its network namespace. Used for logging (Fluentd), proxying (Istio Envoy), authentication. [Sidecar Containers](https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers)
- **Ambassador pattern:** A proxy sidecar that handles external communication on behalf of the main container.
- **Adapter pattern:** A sidecar that normalizes the main container's output.

**Strengths:** Simple (localhost networking is well-understood), filesystem permissions for Unix sockets, no DNS needed, shared lifecycle.
**Weaknesses:** Must coordinate port numbers (no two containers can listen on the same port), limited to single-machine (a Pod is bound to one node), shared network namespace means no network isolation between containers.

**Relevance to Flux:** The closest analogy to Flux's architecture. Each plugin is like a container in a Pod — they share the same "host" (the Tauri desktop app) and must communicate locally. The sidecar pattern (proxy/ambassador) maps directly to the Rust host's routing role.

---

### 1.3 D-Bus

**Transport:** Unix domain sockets (primary), with TCP as an alternative transport. The wire protocol is a well-defined binary format. [D-Bus Specification](https://dbus.freedesktop.org/doc/dbus-specification.html)

**Addressing:** **Bus names** — each service claims a well-known name (e.g. `org.freedesktop.NetworkManager`). Clients send messages to a bus name + object path + interface + method. The message bus daemon (`dbus-daemon` or `dbus-broker`) routes messages.

**Architecture:**
- A central **message bus daemon** accepts connections from multiple applications and forwards messages among them.
- Two buses: **system bus** (system services: BlueZ, NetworkManager, systemd) and **session bus** (desktop apps).
- Services can be **activated on demand** — the bus daemon starts a service when a client tries to call it, using `.service` files in `/usr/share/dbus-1/services/`.
- The wire protocol also supports **peer-to-peer** connections without a bus daemon.

**Strengths:** Standardized, well-known addressing, service activation built-in, widely adopted on Linux, language bindings for C/C++, Java, Python, Perl, Ruby.
**Weaknesses:** Linux-only (no native Windows/macOS support), ~100μs marshaling overhead per message, requires a running daemon, heavy for simple use cases, the reference implementation (`dbus-daemon`) has known performance issues (partially addressed by `dbus-broker`). [Rethinking D-Bus](https://www.osnews.com/story/29976/rethinking-the-d-bus-message-bus)

**Relevance to Flux:** D-Bus is the canonical message-bus model. The "registry as a socket server" option for Flux is inspired by this pattern. However, D-Bus itself is not cross-platform, so Flux would need its own lightweight bus.

---

### 1.4 Erlang/OTP

**Transport:** TCP/IP sockets (default), with pluggable transports (including Unix domain sockets via custom transport factories). The distribution protocol is a custom binary format over TCP. [Erlang Distribution Protocol](https://www.erlang.org/doc/apps/erts/erl_dist_protocol.html)

**Addressing:** **EPMD (Erlang Port Mapper Daemon)** — a name server running on port 4369 on each host. When a node starts, it registers its name and port with EPMD. Other nodes query EPMD to find the port for a given node name. Nodes connect in a **fully connected mesh** — every node knows about every other node. [EPMD documentation](https://www.erlang.org/doc/apps/erts/epmd_cmd.html)

**Key features:**
- **Transparent message passing** — sending a message to a process on another node uses the same syntax as local message passing (when using pids).
- **Hidden nodes** — nodes that are connected but not transitive (don't propagate connections). Useful for monitoring tools.
- **Magic cookies** — shared secret for authentication between nodes (not cryptographically secure by default; TLS available as an add-on).
- **Custom discovery** — alternative node discovery mechanisms can be plugged in (e.g. for Kubernetes).

**Strengths:** Transparent distribution, mature (decades of production use), hot code swapping, fault-tolerant by design.
**Weaknesses:** TCP by default (overkill for same-machine), fully-connected mesh doesn't scale to large node counts, cookies are not secure by default, EPMD is a single point of failure for discovery.

**Relevance to Flux:** Erlang shows that a **registry daemon (EPMD) + direct peer connections** is a proven pattern. The EPMD model maps directly to Flux's potential "Registry as a socket server" approach. The magic cookie auth maps to Flux's need for simple local trust.

---

### 1.5 Apache Kafka / NATS

#### Apache Kafka

**Transport:** Custom binary protocol over **TCP** (not HTTP). Default port 9092. Persistent TCP connections are maintained between clients and brokers. [Kafka Protocol Guide](https://github.com/apache/kafka/blob/trunk/docs/design/protocol.md)

**Addressing:** **Topics** — producers publish to named topics, consumers subscribe to topics. Brokers handle routing, partitioning, and replication. A ZooKeeper or KRaft cluster manages metadata (which broker has which partition).

**Strengths:** Massive throughput (millions of messages/sec), persistence, replay, partitioning for horizontal scaling, strong durability guarantees.
**Weaknesses:** Heavyweight (requires a cluster of brokers), high operational complexity, high memory footprint (JVM), overkill for local-only desktop IPC, 15-30 second startup time.

#### NATS

**Transport:** Custom lightweight TCP protocol (not HTTP/2). Single ~20MB binary. Sub-millisecond latency. [NATS Architecture](https://github.com/nats-io/nats-general/blob/main/architecture/ARCHITECTURE.md)

**Addressing:** **Subjects** with hierarchical naming (e.g. `orders.created`, `sensors.temperature.room1`). Wildcard subscriptions (`*` for single token, `>` for multi-token). Publish/subscribe, request/reply, and queue groups are all built on this subject model.

**Key features:**
- **At-most-once delivery** in Core NATS (fire and forget, no persistence).
- **JetStream** adds persistence, replay, exactly-once semantics.
- **Queue groups** for load-balanced work distribution.
- **Leaf nodes** for edge/offline operation.
- **No server-side persistence** by default — messages are lost if no subscriber is listening.

**Strengths:** Extremely lightweight, sub-ms latency, very simple protocol, built-in request/reply pattern (maps perfectly to Flux's JSON-RPC), pub/sub for event broadcasting.
**Weaknesses:** At-most-once by default (need JetStream for durability), adds a server process dependency, still another moving part for a desktop app.

**Relevance to Flux:** NATS is the most attractive broker option. Its request/reply pattern maps 1:1 to Flux's JSON-RPC calls. However, running a NATS server alongside the desktop app adds complexity.

---

### 1.6 Kubernetes Aggregate API Server

**Transport:** HTTPS (HTTP/2). The main kube-apiserver acts as a **reverse proxy** — it authenticates the client, then forwards requests to extension API servers over HTTPS. [Kubernetes API Aggregation Layer](https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/apiserver-aggregation/)

**Addressing:** **APIService objects** register URL paths (e.g. `/apis/metrics.k8s.io/v1beta1/`) and map them to a Service + port. The main API server proxies matching requests to the extension server's pod.

**Flow:**
1. Client sends request to main API server.
2. Main server checks registered APIService objects.
3. If matched, proxies the request to the extension server (via Kubernetes Service networking).
4. Extension server processes and returns response.
5. Main server forwards response back to client.

**Strengths:** Unified API surface, authentication/authorization handled by the main server, extension servers are independent, works with standard Kubernetes tooling.
**Weaknesses:** Complex to set up (mutual TLS, CA management), extension server downtime can block namespace deletion, requires a Kubernetes cluster.

**Relevance to Flux:** This is the reverse-proxy model — the Rust host in Flux today plays the same role as the kube-apiserver aggregation layer. The insight is that **removing the host doesn't mean removing the router** — you can replace it with a lighter-weight broker without changing the pattern.

---

### 1.7 Web Workers / Service Workers

**Transport:** `postMessage()` with the **structured clone algorithm**. Messages are copied (or transferred via Transferable objects) between threads. No shared memory (except `SharedArrayBuffer` with `Atomics`). [MDN: Worker.postMessage()](https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage)

**Addressing:** Implicit — the creator has a reference to the worker. Service Workers use `self.clients.matchAll()` to broadcast to all controlled clients, or `event.source` to reply to a specific client.

**Key patterns:**
- **Dedicated Workers:** 1:1 relationship with creator.
- **Shared Workers:** 1:many (multiple tabs share one worker).
- **Service Workers:** Programmable network proxy between browser and network. Communicate via `postMessage` with controlled pages.

**Strengths:** Built into browsers, no extra infrastructure, structured clone handles complex objects, Transferable objects for zero-copy buffers.
**Weaknesses:** Single-origin scope (Service Workers), no direct Worker-to-Worker communication (must go through main thread), structured clone has overhead for large objects, no addressing beyond implicit references.

**Relevance to Flux:** The Web Worker model shows that **message-passing with structured clones** is a viable pattern. The limitation of no direct Worker-to-Worker communication (must go through main thread) is analogous to Flux's current Rust host routing. Service Workers' `clients.matchAll()` pattern is like a pub/sub broadcast.

---

### 1.8 systemd Socket Activation

**Transport:** **Unix domain sockets** or **TCP sockets**. systemd creates the listening socket and passes the file descriptor to the service process when it starts. [systemd socket activation documentation](https://www.freedesktop.org/software/systemd/man/systemd-socket-activate.html)

**Addressing:** By socket path (for Unix sockets) or port (for TCP). The socket is configured in a `.socket` unit file. Multiple services can share one socket (using `Accept=false` and handling multiple connections in one process) or get one socket each (`Accept=true` spawns a process per connection).

**Key features:**
- **On-demand activation** — services start only when a connection arrives. Saves resources.
- **Zero-downtime restarts** — systemd keeps the socket open during service restart; connections queue in the kernel's accept queue.
- **File descriptor passing** — the socket FD is passed to the service process (FDs 3 and above, indicated by `LISTEN_FDS` environment variable).
- **Security isolation** — services can use `PrivateNetwork=true`, `SystemCallFilter=`, etc.

**Strengths:** Zero-downtime, on-demand, well-integrated with Linux init system, simple model, Unix socket permissions for access control.
**Weaknesses:** Linux-specific, adds systemd dependency, less control over protocol (raw socket FDs), service must be written to accept socket FDs.

**Relevance to Flux:** Socket activation is the extreme version of the "Registry as a socket server" pattern — the OS itself manages the sockets and activation. If Flux targeted only Linux, this would be attractive. The **file descriptor passing** model is relevant: a boot process can create sockets and pass them to child processes.

---

### 1.9 JSON-RPC over stdio (LSP/MCP)

**Transport:** Subprocess **stdin/stdout** — the client spawns the server, reads JSON-RPC from stdout, writes JSON-RPC to stdin. Messages are newline-delimited JSON. Each message must be on a single line (no pretty-printing). [MCP stdio Transport Specification](https://modelcontextprotocol.io/specification/draft/basic/transports/stdio)

**Addressing:** Implicit — the client has a direct pipe to each server. There is no addressing because there's exactly one peer on each end of the pipe.

**Protocol (LSP/MCP):**
- Client → Server: JSON-RPC requests and notifications on stdin.
- Server → Client: JSON-RPC responses and notifications on stdout.
- stderr: Free-form logging (not JSON-RPC), may be captured or ignored by the client.
- Messages are newline-delimited and MUST NOT contain embedded newlines.

**Variations:** LSP also supports named pipes, TCP sockets, and (in Node.js) custom transports. But stdio is the default and most common. [LSP Specification §3.17](https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/)

**Strengths:** Extremely simple, zero configuration, works on every OS, no network stack overhead, perfect for 1:1 parent-child relationship, easy to debug (just look at the byte stream).
**Weaknesses:** 1:1 only (not suitable for N:M communication), parent must manage child lifecycle, no built-in discovery, stderr can interleave with JSON output if not careful, stdout cannot be used for anything else.

**Relevance to Flux:** This is Flux's **current architecture**. The host spawns each plugin as a subprocess and routes JSON-RPC messages between them. The key limitation is that plugins cannot talk directly to each other — all traffic goes through the host. This is the problem Flux needs to solve: how to evolve from this 1:1 fan-out model to a peer-to-peer or broker model.

---

## 2. Specific Options for Flux

### Option A: Stdin/Stdout Fan-Out (Current + Evolution)

**How it works:** Keep the current model but replace the Rust host with a simpler boot process. The boot process spawns each plugin, holds all stdio pairs, and routes messages. If the boot process is written in TypeScript (like the plugins), it removes the Rust dependency entirely.

**Discovery:** The boot process knows all plugins from `plugin.json` manifests. It maintains a routing table: `method → plugin`. When plugin A sends a request for `yt-feed.feed`, the boot process looks up `yt-feed` in the route table and forwards to that plugin's stdin.

**Pros:**
- Works today (no architectural change).
- No ports, no sockets, no network configuration.
- Process lifecycle is clear (boot process owns all children).
- stdout is sacred — easy to validate correctness.

**Cons:**
- Single point of failure (the boot process).
- All traffic must pass through the router — no direct plugin-to-plugin communication.
- Router becomes a bottleneck under high message volume.
- If the boot process crashes, all plugins lose connectivity.
- Adding a plugin requires restarting the router (though hot-reload could mitigate this).

### Option B: Registry as a Socket Server

**How it works:** A lightweight Registry process listens on a **Unix domain socket** (or TCP port). Each plugin connects to the Registry as a client. The Registry maintains a list of connected plugins and their capabilities. When plugin A wants to call plugin B, it sends the request to the Registry, which forwards it to B (or tells A how to connect directly to B).

**Inspired by:** D-Bus, Erlang EPMD.

**Variants:**
- **Smart Registry (proxy):** All messages go through the Registry (like D-Bus daemon). Simplest for clients — they only need one connection.
- **Dumb Registry (discovery only):** Registry just stores addresses. Plugins connect directly to each other after looking up the target (like EPMD).

**Pros:**
- Single connection per plugin (to the Registry).
- Dumb Registry is very simple (a few hundred lines).
- Unix socket permissions restrict which processes can connect.
- Can implement service activation (start plugin on first request).
- Cross-platform (Unix sockets on Linux/macOS, named pipes on Windows).

**Cons:**
- Registry is a single point of failure.
- Smart Registry becomes a bottleneck (all traffic through one process).
- Dumb Registry requires each plugin to accept incoming connections (more complex plugin code).
- Need to handle reconnection if Registry restarts.
- Port/socket path must be coordinated (e.g., passed via environment variable or well-known path).

### Option C: Message Broker (NATS)

**How it works:** A NATS server runs alongside the app (embedded or as a subprocess). Each plugin connects to NATS as a client. JSON-RPC requests are wrapped in NATS request/reply subjects (e.g., `plugin.yt-feed.feed`). Responses come back on the reply subject.

**Inspired by:** NATS, Kafka.

**Pros:**
- Battle-tested, production-grade message broker.
- Built-in request/reply pattern — maps directly to JSON-RPC.
- Pub/sub for events (e.g., `video.selected`).
- Queue groups for load balancing.
- Sub-millisecond latency.
- Very small (~20MB binary, minimal RAM).
- Persistence available via JetStream if needed.

**Cons:**
- Adds a server process dependency.
- More moving parts than a simple Registry.
- At-most-once delivery by default (okay for Flux's use case, but a caveat).
- Protocol is not JSON-RPC — requires a thin adapter layer.
- Overkill if Flux will only ever have 5-10 plugins.

### Option D: Shared-Nothing Peer-to-Peer

**How it works:** Each plugin listens on its own Unix domain socket (or TCP port). A static Registry (or filesystem-based discovery) stores the mapping of plugin name to socket address. When plugin A wants to call plugin B, it reads the Registry to find B's address, connects directly, sends the request, and disconnects (or keeps a persistent connection).

**Inspired by:** Erlang EPMD (dumb mode), microservices.

**Pros:**
- No central bottleneck — fully distributed.
- No single point of failure.
- Scales horizontally.
- Each plugin is fully independent.

**Cons:**
- Every plugin must be a server (listen on a socket) — more complex plugin code.
- Connection management: each plugin pair needs a connection (N plugins = up to N² connections).
- Port/socket coordination — must avoid conflicts.
- Startup ordering: a plugin can't call another until it's registered.
- Debugging is harder (many sockets, many connections).

### Option E: Unix Sockets per Plugin

**How it works:** A boot process creates a pair of Unix sockets for each plugin-to-plugin connection that will be needed. It passes the already-connected socket file descriptors to the child processes at spawn time. No runtime discovery needed — the socket pairs are predetermined from the manifest.

**Inspired by:** systemd socket activation (FD passing), inetd.

**Pros:**
- No runtime discovery overhead.
- No listening sockets needed in plugins (they receive already-connected FDs).
- Unix socket performance (~2μs latency, ~1.7M msg/s).
- Filesystem permissions for access control.
- Dead connection detection via EPIPE.

**Cons:**
- Static topology — cannot add new plugin connections at runtime without restart.
- Complex FD passing logic in the boot process.
- Number of sockets grows as N² in worst case.
- Linux-specific (FD passing across processes is OS-dependent; Windows has limited support).
- Must know all communication patterns at startup.

### Option F: gRPC

**How it works:** Each plugin exposes a gRPC server. Protocol Buffers define the RPC interface. Plugins call each other via generated gRPC clients. The transport is HTTP/2 over localhost TCP or Unix sockets.

**Pros:**
- Strongly typed contracts (Protobuf IDL).
- Code generation for many languages.
- Streaming support (server, client, bidirectional).
- HTTP/2 multiplexing (one connection per plugin, not per pair).
- Good tooling ecosystem.
- Can run over Unix sockets for performance.

**Cons:**
- Heavyweight for a desktop app with 5-10 plugins.
- Protobuf compilation step adds build complexity.
- HTTP/2 over localhost is wasteful (TLS negotiation, HPACK, etc.).
- gRPC-Web needed if browser frontend wants direct access.
- Mindset mismatch: gRPC is designed for microservice clusters, not local plugin IPC.
- Requires schema management and versioning.

---

## 3. Tradeoffs Analysis

### Cross-Platform Support

| Option | Linux | macOS | Windows |
|--------|-------|-------|---------|
| A (stdin/stdout fan-out) | ✅ Native | ✅ Native | ✅ Native |
| B (Registry UDS) | ✅ Unix sockets | ✅ Unix sockets | ⚠️ Named pipes (different API) |
| C (NATS) | ✅ | ✅ | ✅ |
| D (P2P sockets) | ✅ Unix sockets | ✅ Unix sockets | ⚠️ Named pipes |
| E (FD passing) | ✅ | ⚠️ Limited | ❌ Not supported |
| F (gRPC) | ✅ | ✅ | ✅ |

### Complexity

| Option | Lines of code to implement | Failure modes | Debugging difficulty |
|--------|---------------------------|---------------|---------------------|
| A (fan-out) | Low (~200 lines router) | Few (router crash kills all) | Easy (just read stdin/stdout) |
| B (Registry) | Medium (~500 lines) | Registry crash, reconnection | Medium (netcat to socket) |
| C (NATS) | Low (use client library) | Server crash, connection loss | Medium (nats CLI tools) |
| D (P2P) | High (~1000+ lines) | Many (each connection is a state) | Hard (many sockets) |
| E (FD passing) | High (FD passing is tricky) | Medium (static config mismatch) | Hard (FDs are invisible to tools) |
| F (gRPC) | Medium (code gen handles most) | Medium | Easy (grpcurl, reflection) |

### Performance (same-machine)

| Option | Latency | Throughput | CPU overhead |
|--------|---------|------------|-------------|
| A (fan-out) | ~10μs (pipe round-trip) | ~1.7M msg/s (pipe bound) | Low |
| B (Registry proxy) | ~15-25μs (double-hop) | ~800K msg/s | Medium |
| B (Registry dumb) | ~5-10μs (direct UDS) | ~1.7M msg/s | Low |
| C (NATS) | ~1-5ms (NATS RTT) | ~500K msg/s | Medium (NATS server) |
| D (P2P UDS) | ~2μs | ~1.7M msg/s | Low |
| E (FD passing) | ~2μs (pre-connected UDS) | ~1.7M msg/s | Low |
| F (gRPC over UDS) | ~50-100μs | ~100K msg/s | High (HTTP/2 framing) |

Sources: [ipc-bench (rigtorp)](https://github.com/rigtorp/ipc-bench), [Redis benchmarks](http://redis.io/topics/benchmarks), [Unix socket vs TCP latency](https://krun.pro/unix-socket-tuning/)

### Startup Order

| Option | Registry must be up first? | Plugin startup order matters? |
|--------|---------------------------|------------------------------|
| A (fan-out) | N/A (boot process owns all) | No (boot process spawns all) |
| B (Registry) | Yes | Yes (plugins wait for Registry) |
| C (NATS) | Yes (NATS server must be running) | Yes (plugins wait for NATS) |
| D (P2P) | No (if using file-based discovery) | Yes (target must be registered) |
| E (FD passing) | No (boot process sets up all FDs first) | No (all sockets ready at spawn) |
| F (gRPC) | No (if using static config) | Yes (target must be listening) |

### Robustness (plugin crash behavior)

| Option | Plugin A crashes | Registry/NATS crashes |
|--------|-----------------|----------------------|
| A (fan-out) | Boot process detects, can restart | N/A (boot process is the single point) |
| B (Registry) | Registry detects disconnect, notifies peers | All plugins lose connectivity, must reconnect |
| C (NATS) | NATS detects disconnect, notifies subscribers | All plugins must reconnect to new NATS |
| D (P2P) | Each peer detects TCP disconnect independently | No central failure (most resilient) |
| E (FD passing) | EPIPE on connected sockets | N/A (no central process beyond boot) |
| F (gRPC) | gRPC client detects connection failure | N/A (no central process) |

### Security

| Option | Sniffable? | Access control | Sandboxing |
|--------|-----------|----------------|------------|
| A (fan-out) | Only by boot process (pipes are private) | OS process isolation | Natural (pipe isolation) |
| B (Registry UDS) | Socket file permissions | Filesystem permissions on socket | Limited |
| C (NATS) | TCP without TLS is plaintext | NATS auth tokens | None (same host) |
| D (P2P UDS) | Socket file permissions | Filesystem permissions | Limited |
| E (FD passing) | Not accessible (FDs are inherited) | Inherited from boot process | Strong (FDs can't be stolen) |
| F (gRPC) | TCP plaintext or TLS | TLS certs or tokens | None (same host) |

---

## 4. Recommendation for Flux

### Primary Recommendation: Dumb Registry over Unix Domain Sockets

The best fit for Flux's constraints (same-machine, cross-platform, subprocess plugins, graceful degradation) is a **hybrid of Options B and D**: a lightweight **Registry server** that provides **discovery only**, with plugins communicating **directly over Unix domain sockets** (or named pipes on Windows).

**Architecture:**

```
Boot Process
  │
  ├── Spawns Registry (listens on well-known UDS path)
  ├── Spawns Plugin A  ─── connects to Registry, listens on own UDS
  ├── Spawns Plugin B  ─── connects to Registry, listens on own UDS
  └── Spawns Plugin C  ─── connects to Registry, listens on own UDS

Plugin A wants to call Plugin B:
  1. A asks Registry: "Where is B?"  →  Registry returns B's UDS path
  2. A connects directly to B's UDS  →  sends JSON-RPC request
  3. B responds on the same connection
  4. A caches B's address for future calls
```

**Why this wins for Flux:**

1. **No Rust host needed.** The Registry is a TypeScript/Node.js process, just like the plugins. This eliminates the Rust dependency entirely.

2. **Direct connections.** Once A knows where B is, they talk directly. No bottleneck, no single point of failure for messages.

3. **Unix socket performance.** ~2μs latency, ~1.7M msg/s — far more than Flux needs, but ensures communication is never the bottleneck.

4. **JSON-RPC unchanged.** The wire format stays the same. Plugins already speak JSON-RPC. The only change is that instead of sending to stdin, they send to a Unix socket.

5. **Graceful degradation.** If the Registry crashes, existing direct connections continue working. New connections just need a reconnect to a new Registry (which the boot process can restart).

6. **Cross-platform.** Unix sockets work on Linux and macOS. Windows supports named pipes and (since Windows 10 17063) Unix domain sockets via `AF_UNIX`. [ipc-bench benchmarks](https://github.com/rigtorp/ipc-bench)

7. **Simple security.** Unix socket filesystem permissions control which processes can connect. No TLS, no tokens, no complexity.

8. **Discoverable debugging.** `socat`, `nc -U`, and `ss -x` all work with Unix sockets. Developers can inspect traffic directly.

**The Registry protocol (minimal):**

```
Plugin → Registry:  {"id": 1, "method": "registry.register", "params": {"name": "yt-feed", "hooks": ["feed.video"], "uds": "/tmp/flux/yt-feed.sock"}}
Registry → Plugin: {"id": 1, "result": {"ok": true}}

Plugin → Registry:  {"id": 2, "method": "registry.resolve", "params": {"hook": "feed.video"}}
Registry → Plugin: {"id": 2, "result": {"name": "yt-feed", "uds": "/tmp/flux/yt-feed.sock"}}

Plugin → Registry:  {"id": 3, "method": "registry.list"}
Registry → Plugin: {"id": 3, "result": [{"name": "yt-feed", ...}, {"name": "peertube", ...}]}
```

**What changes from today:**
- Rust host is replaced by a TypeScript boot process that spawns plugins and the Registry.
- Plugins gain a small server component (listen on their own Unix socket) in addition to their existing client logic.
- The Registry is a new ~200-line process.
- The JSON-RPC wire format and message structure stay identical.
- The frontend (web components) connects to the Registry instead of invoking Tauri commands.

**What about the frontend?** The Tauri frontend currently uses `invoke("plugin_request", ...)` which goes through Rust. Under the new model:
- The frontend (running in a webview) can connect to the Registry via Tauri's IPC (which would call the Registry instead of routing to a plugin).
- Or, if the webview supports it, the frontend connects directly via WebSocket to a bridge process.
- The simplest path: keep the Tauri IPC bridge thin (just forward to the Registry), and eventually replace with direct WebSocket when convenient.

### Second Choice: NATS (if complexity budget allows)

If the team is comfortable with adding a server process, NATS is an excellent choice. It provides:
- Built-in request/reply (maps to JSON-RPC perfectly).
- Pub/sub for events.
- Queue groups for load balancing.
- Sub-millisecond latency.
- Small footprint (~20MB binary).

The tradeoff is operational complexity — now you have a NATS server to manage alongside your plugins. For Flux's scale (5-10 plugins), this is probably unnecessary.

### What to avoid

- **gRPC** — too heavy, too much ceremony for local IPC. The Protobuf compilation step and HTTP/2 overhead are not worth it for Flux's needs.
- **File descriptor passing** — too Linux-specific. Flux targets cross-platform (the user mentioned Windows in the env).
- **Pure peer-to-peer without Registry** — too complex for the plugin authors. Every plugin would need a full server implementation.
- **Staying with stdin/stdout fan-out through Rust** — this is the current architecture and it works, but it doesn't scale to peer-to-peer communication and keeps the Rust dependency.

---

## Appendix: Key Sources

| Source | URL |
|--------|-----|
| VS Code IPC Architecture | https://roopik.com/blog/vscode-internals-advanced-ipc |
| VS Code Extension Host | https://code.visualstudio.com/api/advanced-topics/extension-host |
| Kubernetes Pods | https://kubernetes.io/docs/concepts/workloads/pods |
| Kubernetes Sidecar Containers | https://kubernetes.io/docs/concepts/workloads/pods/sidecar-containers |
| D-Bus Specification | https://dbus.freedesktop.org/doc/dbus-specification.html |
| D-Bus Tutorial | https://dbus.freedesktop.org/doc/dbus-tutorial.html |
| Erlang Distribution Protocol | https://www.erlang.org/doc/apps/erts/erl_dist_protocol.html |
| Erlang EPMD | https://www.erlang.org/doc/apps/erts/epmd_cmd.html |
| NATS Architecture | https://github.com/nats-io/nats-general/blob/main/architecture/ARCHITECTURE.md |
| NATS Publish-Subscribe | https://docs.nats.io/nats-concepts/core-nats/pubsub |
| Kafka Protocol Guide | https://github.com/apache/kafka/blob/trunk/docs/design/protocol.md |
| Kubernetes API Aggregation Layer | https://kubernetes.io/docs/concepts/extend-kubernetes/api-extension/apiserver-aggregation/ |
| MCP stdio Transport | https://modelcontextprotocol.io/specification/draft/basic/transports/stdio |
| LSP Specification | https://microsoft.github.io/language-server-protocol/specifications/lsp/3.17/specification/ |
| systemd Socket Activation | https://www.freedesktop.org/software/systemd/man/systemd-socket-activate.html |
| Web Workers (MDN) | https://developer.mozilla.org/en-US/docs/Web/API/Worker/postMessage |
| Service Workers (MDN) | https://developer.mozilla.org/en-US/docs/Web/API/ServiceWorker/postMessage |
| IPC Benchmarks (rigtorp) | https://github.com/rigtorp/ipc-bench |
| Unix Socket vs TCP Loopback (Stack Overflow) | https://stackoverflow.com/questions/14973942/tcp-loopback-connection-vs-unix-domain-socket-performance |
| Unix Socket Performance Deep Dive | https://www.besthub.dev/articles/why-unix-domain-sockets-outperform-127-0-0-1-loopback-deep-dive-benchmarks-e27802388ab7 |
| Cap'n Proto RPC | https://capnproto.org/rpc.html |
| gRPC vs Alternatives | https://www.cse.wustl.edu/~jain/cse5700-25/ftp/grpc/index.html |
| Flux AGENTS.md (current architecture) | `/mnt/5TB/Projects/Flux/AGENTS.md` |