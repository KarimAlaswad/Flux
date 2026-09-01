# Research: Service Registries & Capability Discovery

**Project:** Flux — Tauri v2 + React desktop app with subprocess-based plugin architecture
**Date:** 2026-07-28
**Scope:** 8 systems analyzed for registration, discovery, health, SPOF mitigation, and applicability to a 100% modular desktop app

---

## Table of Contents

1. [Consul](#1-consul)
2. [etcd](#2-etcd)
3. [DNS-SD / RFC 6763 (Bonjour / Avahi)](#3-dns-sd--rfc-6763-bonjour--avahi)
4. [Kubernetes Services](#4-kubernetes-services)
5. [Home Assistant Supervisor / MQTT Discovery](#5-home-assistant-supervisor--mqtt-discovery)
6. [OSGi / Eclipse RCP](#6-osgi--eclipse-rcp)
7. [Unix /etc/services + getaddrinfo](#7-unix-etc-services--getaddrinfo)
8. [JupyterLab / Lumino Token Registry](#8-jupyterlab--lumino-token-registry)

---

## 1. Consul

### Overview

Consul is a service mesh solution from HashiCorp. It provides service discovery, health checking, a distributed key-value store, and multi-datacenter federation. It uses a **centralized registry model** with agent-based registration, Raft consensus for consistency, and gossip protocols for failure detection.

### What Information Is Stored

Each registered service stores:
- **Service name** (logical identifier, e.g. `web`, `api`)
- **Service ID** (unique instance identifier)
- **Node/IP address** (the host running the service)
- **Port** (the port the service listens on)
- **Tags** (arbitrary metadata strings for filtering, e.g. `"primary"`, `"v2"`)
- **Health checks** (associative: script, HTTP, TCP, TTL, or OS service checks)
- **Meta** (arbitrary key-value metadata pairs)

Source: https://developer.hashicorp.com/consul/docs/services/usage/register-services-checks

### How Services Register

There are **five ways** to register a service with Consul:

1. **Config file at agent startup** — Place a service definition JSON/HCL in Consul's config directory before starting the agent
2. **Agent reload** — Drop a new config file and send `SIGHUP` to the agent
3. **CLI** — `consul services register service.json`
4. **HTTP API (recommended for dynamic)** — `PUT /v1/agent/service/register` with a JSON body containing `Name`, `ID`, `Address`, `Port`, `Tags`, `Checks`, `Meta`
5. **API for checks alone** — `PUT /v1/agent/check/register` to register a health check independent of any service

When registered via API/CLI, checks persist in the agent's data folder and survive agent restarts.

Source: https://developer.hashicorp.com/consul/api-docs/agent/check

### How Consumers Discover

Consumers query via:

- **DNS interface** — `web.service.consul` resolves to the IP of a healthy `web` instance. SRV records give port info. DNS is the simplest discovery path — any application that does DNS lookups can use it.
- **HTTP API** — `GET /v1/catalog/service/:name` returns raw catalog entries. `GET /v1/health/service/:name` returns only healthy instances.
- **Client libraries** — Official Go, Java, Python, Ruby, .NET, Node.js clients wrap the API with load balancing and caching.

Source: https://developer.hashicorp.com/consul/api-docs/health

### Health Checks and Deregistration

Consul supports **multiple check types**:

| Check Type | Mechanism |
|-----------|----------|
| Script | Runs a command; exit code determines pass/warn/critical |
| HTTP | GETs a URL; 2xx = passing, 429 = warning, other = critical |
| TCP | Attempts TCP connection; success = passing |
| TTL | Service must periodically `PUT /v1/agent/check/update` to stay passing |
| UDP | Sends datagrams; success/timeout = passing, failure = critical |
| OSService | Checks OS-level service manager state |

**Deregistration after critical:** The `DeregisterCriticalServiceAfter` field (minimum 1m) causes Consul to automatically remove the service and all its checks if it stays critical for too long. A reaper process runs every 30s.

Source: https://developer.hashicorp.com/consul/api-docs/agent/check

### Key-Value Store

Consul includes a **hierarchical key-value store** accessed via `GET/PUT/DELETE /v1/kv/:key`. Features:
- Check-And-Set (CAS) with `ModifyIndex` for optimistic concurrency
- `?recurse` for prefix-based listing/deletion
- CLI equivalent: `consul kv get/put/delete`
- Useful for service configuration, feature flags, coordination

Source: https://developer.hashicorp.com/consul/api-docs/kv

### Architecture and SPOF Mitigation

Consul uses a **three-layer architecture**:

1. **Raft Consensus** — Server nodes (3 or 5 recommended) elect a leader. All writes go through the leader. A cluster of 3 tolerates 1 node failure; 5 tolerates 2. If quorum is lost, the cluster becomes unavailable.
2. **Gossip Protocol (Serf)** — Two gossip pools: LAN (within datacenter, port 8301) for member discovery and failure detection, and WAN (between datacenters, port 8302) for cross-datacenter federation. Gossip provides probabilistic failure detection without a central health checker.
3. **Client Agents** — Every node runs a local Consul agent. Agents forward requests to servers. If servers are unavailable, agents cache DNS results. The local agent is **not** a SPOF — it's a stateless forwarder.

**Mitigation:** Multi-server Raft cluster + gossip-based health + client-side caching. Consul is itself distributed and not a single point of failure.

Source: https://developer.hashicorp.com/consul/docs/architecture/control-plane
Source: https://developer.hashicorp.com/consul/docs/concept/consensus
Source: https://developer.hashicorp.com/consul/docs/concept/gossip

### Applicability to Flux

Consul's **agent pattern** is directly relevant: each plugin has a local "agent" (its subprocess) that registers capabilities with a central registry. The key insights:
- **Tags as capability markers** — Consul's arbitrary string tags map perfectly to Flux's method/hook/component declarations in `plugin.json`
- **Health checking via TTL** — A TTL check where the plugin must periodically heartbeat is ideal for subprocess plugins. If the process dies, TTL expires and the service is marked critical, then deregistered.
- **Agent as local proxy** — The pattern of a lightweight forwarder on each node maps to Flux's subprocess IPC: the subprocess is the "agent," the Rust host is the "server."
- **KV store for config** — Consul's KV store shows how a centralized key-value map (or in Flux's case, an in-memory Rust map) can store plugin configuration that's accessible by name.

**What doesn't fit:** Running a full Raft cluster or gossip protocol is severe overkill for a single-user desktop app. The **pattern** of agent registration + health TTL is what matters, not the distributed systems machinery.

---

## 2. etcd

### Overview

etcd is a **distributed, strongly consistent key-value store** that uses the Raft consensus algorithm. It was originally created by CoreOS and is best known as Kubernetes' backing store for all cluster state. It is a **general-purpose substrate** for distributed systems — not a service discovery tool per se, but often used as one.

Source: https://etcd.io/
Source: https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/

### What Information Is Stored

etcd stores data as **hierarchical key-value pairs** (like a filesystem). Keys are strings; values are arbitrary byte strings. Typical registration data:
- Key: `/services/web/instances/192.168.1.1:8080`
- Value: JSON with metadata (version, capabilities, health status, etc.)

A **lease** can be attached to any key. When the lease expires (because the client stops sending keepAlive), all keys under that lease are automatically deleted.

### How Services Register

Registration is a simple `PUT`:
```
etcdctl put /services/web/192.168.1.1 '{"port":8080,"version":"2.0"}'
```

For registration with **automatic cleanup on failure**, the key is created under a **lease**:
```go
lease, _ := cli.Grant(ctx, 10)  // 10-second TTL
cli.Put(ctx, "/services/web/ep1", value, clientv3.WithLease(lease.ID))
// Periodically: cli.KeepAlive(ctx, lease.ID)
```

etcd's gRPC APIs include:
- **KV** — Put, Range (get), Delete, Txn (atomic conditional operations)
- **Watch** — Monitor key changes via streaming
- **Lease** — TTL-based keepalive primitives

Source: https://etcd.io/docs/v3.8/learning/api/

### How Consumers Discover

Discovery uses the **Range** API with a prefix query:
```
etcdctl get /services/web/ --prefix
```

For continuous discovery, consumers use the **Watch** API:
```go
rch := cli.Watch(ctx, "/services/web/", clientv3.WithPrefix())
for wresp := range rch {
    for _, ev := range wresp.Events {
        // ev.Type: PUT or DELETE
        // ev.Kv.Key, ev.Kv.Value
    }
}
```

etcd also provides a **gRPC resolver** that watches a key prefix and returns endpoints to the gRPC load balancer:
```go
conn, _ := grpc.NewClient("etcd:///services/web",
    grpc.WithResolvers(etcdResolver),
    grpc.WithDefaultServiceConfig(`{"loadBalancingPolicy":"round_robin"}`))
```

Source: https://etcd.io/docs/v3.8/dev-guide/grpc_naming/

### Health and Expiration

etcd uses **leases with TTL** for liveness detection:
- Client creates a lease with a TTL (e.g., 10 seconds)
- Client must send `KeepAlive` periodically to refresh
- If the client crashes or the network partitions, the lease expires
- All keys attached to the expired lease are deleted atomically
- Consumers watching those keys see DELETE events and know the service is gone

Source: https://etcd.io/docs/v3.8/learning/api/#lease-api

### Architecture and SPOF Mitigation

etcd uses the **Raft consensus algorithm** (same as Consul):
- A cluster has 3, 5, or 7 members
- One leader handles all writes; followers replicate
- A quorum `(N/2)+1` must be available for writes
- Reads can be served by any node (with optional linearizability via `--consistency`)
- Tolerates `(N-1)/2` failures

**MVCC backend:** etcd retains historical key revisions. This allows watchers to resume from the last revision they saw, even after disconnection. Watches are multiplexed over gRPC streams to reduce overhead.

Source: https://etcd.io/docs/v3.8/learning/why/

### Why Kubernetes Uses etcd

Kubernetes stores **all cluster state** (pods, services, configmaps, secrets, etc.) in etcd because:
- **Consistency** — Raft ensures no split-brain. Two controllers can't accidentally create conflicting state.
- **Watch API** — The Kubernetes API server watches etcd keys to detect changes and reconcile state.
- **TTL/leases** — Node heartbeat uses etcd leases.
- Simpler than ZooKeeper (no session handling, no ephemeral nodes — leases cover the same need).

Source: https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/

### Applicability to Flux

etcd's **key-value + watch pattern** is the most directly applicable model for Flux:
- **Registry as a map** — A `Map<ServiceId, Registration>` in Rust is the simplest possible registry. etcd shows that the key-value abstraction is sufficient for complex discovery.
- **Lease = process heartbeat** — The lease/TTL mechanism is exactly what Flux needs: a subprocess registers, sends a heartbeat, and if the heartbeat stops, the registration is removed.
- **Watch = event-driven discovery** — Instead of polling, consumers get notified of changes. In Flux, this could be a Rust channel (`tokio::watch` or `tokio::sync::broadcast`) that emits registration/removal events.
- **Prefix queries = capability matching** — etcd's prefix queries (`/services/feed.video/`) are analogous to querying by hook or method name.

**What doesn't fit:** A distributed Raft cluster is unnecessary. The **data model** (hierarchical keys, leases, watchers) is the takeaway, implementable in-process with a `HashMap` + `tokio::sync::broadcast`.

---

## 3. DNS-SD / RFC 6763 (Bonjour / Avahi)

### Overview

DNS-Based Service Discovery (DNS-SD, RFC 6763) uses standard DNS resource records to advertise and discover services on a network. It can operate over both **Unicast DNS** (with a configured DNS server) and **Multicast DNS** (mDNS, RFC 6762, used by Apple Bonjour and Linux Avahi). With mDNS, it provides **zero-configuration operation** — devices on the same local link discover each other automatically with no setup.

Source: https://datatracker.ietf.org/doc/rfc6763/
Source: https://datatracker.ietf.org/doc/rfc6762/

### What Information Is Stored

DNS-SD uses three DNS record types per service instance:

| Record | Name Pattern | Content |
|--------|-------------|---------|
| **PTR** | `<Service>.<Domain>` | List of service instance names (`<Instance>.<Service>.<Domain>`) |
| **SRV** | `<Instance>.<Service>.<Domain>` | Target hostname + port number |
| **TXT** | `<Instance>.<Service>.<Domain>` | Key/value pairs (e.g., `"path=/printer"`, `"version=2.0"`) |

The **service name** follows the pattern `_<protocol>._<transport>`, e.g.:
- `_http._tcp` for web servers
- `_music._tcp` for music sharing
- `_printer._sub._http._tcp` for HTTP printers (subtype)

Source: RFC 6763 Sections 1, 4, 5, 6, 7 — https://datatracker.ietf.org/doc/rfc6763/

### How Services Register

**With mDNS (zero-config):**
1. The service calls `DNSServiceRegister()` (Apple API) or `avahi-publish-service` (Linux)
2. The local mDNS responder (`mDNSResponder` on macOS, `avahi-daemon` on Linux) announces the PTR, SRV, and TXT records to the multicast group `224.0.0.251`
3. The responder verifies uniqueness (no other device claims the same service instance name)
4. Registration is **live** — records exist only while the process runs. No persistence.

**With Unicast DNS (managed):**
- The device is configured with a DNS server and update credentials
- It uses DNS Update (RFC 2136) to add/modify/delete the PTR, SRV, and TXT records
- Records persist on the DNS server until explicitly removed or their TTL expires

Source: https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/NetServices/Articles/NetServicesArchitecture.html
Source: https://developer.apple.com/library/archive/documentation/Networking/Conceptual/dns_discovery_api/Articles/registering.html

### How Consumers Discover

**Browsing (finding services by type):**
1. Client queries `PTR` for `_http._tcp.local.`
2. All matching responders reply with PTR records containing service instance names like `"My Web Server._http._tcp.local."`

**Resolution (connecting to a specific instance):**
1. Client queries `SRV` for that instance name → gets hostname + port
2. Client queries `A`/`AAAA` for the hostname → gets IP address
3. Client optionally queries `TXT` for additional metadata

**Continuous browsing** (live updates): The client re-queries with exponential backoff and uses **Known-Answer Suppression** (sends list of already-known instances so responders only respond with updates).

Source: RFC 6763 Section 4 — https://datatracker.ietf.org/doc/rfc6763/
Source: RFC 6762 Section 5.2 — https://datatracker.ietf.org/doc/rfc6762/

### Health and Expiration

- **TTL on records** — Each DNS record has a Time-To-Live (commonly 120 seconds for mDNS). The responder must re-announce records before the TTL expires.
- **Goodbye messages** — When a service stops, it sends a record with a TTL of 0, indicating immediate expiry.
- **Passive observation** — If a device disconnects without sending a goodbye (crash, network failure), its records eventually expire (TTL-based). This means **up to TTL seconds of stale data**, but no persistent ghost entries.
- **Probing** — Before registering, a service probes for name conflicts. If no response, it takes the name.

Source: RFC 6762 Section 10 — https://datatracker.ietf.org/doc/rfc6762/
Source: Apple Bonjour Overview — https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/NetServices/Articles/NetServicesArchitecture.html

### Architecture and SPOF

**With mDNS:** There is **no central registry**. Every device runs its own mDNS responder. Discovery is fully distributed — any device can answer queries. There is no single point of failure. However, mDNS is limited to a single **local link** (subnet). It does not work across routers unless configured with a DNS-SD proxy.

**With Unicast DNS:** The DNS server is a potential SPOF, mitigated by:
- DNS replication (secondary DNS servers)
- DNS caching (results are cached by clients and recursive resolvers per TTL)
- Multi-DNS deployment (anycast, multiple authoritative servers)

Source: RFC 6763 Appendix A — https://datatracker.ietf.org/doc/rfc6763/

### Applicability to Flux

DNS-SD offers the **most decentralized model** of all the systems studied. Key takeaways for Flux:

- **Service type as interface** — The `_<protocol>._tcp` pattern maps to `feed.video` or `video.player` — a named capability that multiple plugins can provide.
- **TXT records as metadata** — The key/value TXT record is identical to what `plugin.json` already stores: version, methods, hooks. DNS-SD shows you can carry this metadata alongside the registration.
- **PTR query as capability discovery** — "List all `_video.player` instances" is analogous to "resolve all plugins providing the `video.player` hook."
- **TTL-based expiry** — If a subprocess dies without sending a goodbye, the registration naturally expires. No need for a complex health checker.
- **No SPOF** — The mDNS model shows that you don't need a central registry server. Each plugin "speaks for itself." The Flux host process acts as the multicast group — it's the aggregator, not the arbiter.

**What doesn't fit:** mDNS is network multicast, unnecessary for a single-machine app. But the **naming convention** (`capability._sub._type`) and **TTL-based expiry** are perfect for subprocess plugins.

---

## 4. Kubernetes Services

### Overview

Kubernetes service discovery is built on **three layers**: the API server (central registry), label selectors (capability matching), and DNS (endpoint resolution). Services are Kubernetes API objects that abstract a set of Pods behind a stable virtual IP or DNS name.

Source: https://kubernetes.io/docs/concepts/services-networking/service/

### What Information Is Stored

Each Kubernetes Service stores:
- **Name** (DNS-compatible label, e.g. `my-service`)
- **Type** (ClusterIP, NodePort, LoadBalancer, ExternalName)
- **Cluster IP** (virtual IP assigned automatically for ClusterIP type)
- **Selector** (label queries: `matchLabels` and `matchExpressions`)
- **Ports** (protocol, port, targetPort)
- **Annotations** (arbitrary key-value metadata)

The actual endpoints (Pod IP:port pairs) are stored in **EndpointSlice** objects, which the EndpointSlice controller creates automatically from the Service's selector.

Source: https://kubernetes.io/docs/reference/kubernetes-api/core/service-v1/
Source: https://kubernetes.io/docs/reference/kubernetes-api/discovery/endpoint-slice-v1/

### How Services Register

Registration is done by **creating a Service API object** via:
- `kubectl create -f service.yaml`
- API server `POST /api/v1/namespaces/{ns}/services`
- Programmatic client library calls

Service manifest example:
```yaml
apiVersion: v1
kind: Service
metadata:
  name: my-service
spec:
  selector:
    app.kubernetes.io/name: MyApp
  ports:
    - protocol: TCP
      port: 80
      targetPort: 9376
```

Behind the scenes:
1. The API server persists the Service object to etcd
2. The EndpointSlice controller watches for Services with selectors
3. It scans for Pods matching the label selector
4. It creates/updates EndpointSlice objects with the Pod IP:port pairs
5. kube-proxy watches EndpointSlices and programs iptables/ipvs rules
6. CoreDNS watches Services and EndpointSlices to serve DNS queries

Source: https://kubernetes.io/docs/concepts/services-networking/service/

### How Consumers Discover

**DNS (simplest):** A Pod in the same namespace can reach `my-service` by name. Cross-namespace: `my-service.my-namespace.svc.cluster.local`. Headless services (`.spec.clusterIP: None`) return Pod IPs directly (A/AAAA records) instead of the virtual IP.

**Environment variables (legacy):** Each Pod gets environment variables like `MY_SERVICE_SERVICE_HOST` and `MY_SERVICE_SERVICE_PORT`, set by the kubelet when the Pod starts.

**API server (programmatic):** Consumers can query the API server directly:
```
GET /api/v1/namespaces/{ns}/endpoints/{service}
GET /apis/discovery.k8s.io/v1/namespaces/{ns}/endpointslices
```

Source: https://kubernetes.io/docs/concepts/services-networking/service/#dns

### Capability Matching via Label Selectors

Kubernetes uses **labels** (key-value pairs) and **label selectors** to match Services to Pods. This is the standout feature for capability discovery:

- **Equality-based:** `environment = production`, `tier != frontend`
- **Set-based:** `environment in (production, qa)`, `tier notin (frontend)`

The selector is AND-ed: all conditions must match. This is equivalent to a **capability query** — "find all Pods matching these labels."

Source: https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/

### Health and Removal

- **Readiness probes** — A Pod can define a readiness probe (HTTP, TCP, exec). If it fails, the Pod is removed from the Service's EndpointSlice. Traffic stops flowing to it, but the Pod continues running.
- **Liveness probes** — If a liveness probe fails, kubelet restarts the container.
- **Endpoint lifecycle** — The EndpointSlice controller continuously reconciles. When a Pod disappears (deleted, crashes, scaled down), the controller updates the EndpointSlice. The old endpoint is removed from the data plane typically within seconds.
- **Headless services** — Just return whatever Pods match the selector at query time. If a Pod is gone, its IP won't be returned.

Source: https://kubernetes.io/docs/concepts/services-networking/service/

### Architecture and SPOF

Kubernetes has multiple layers of SPOF mitigation:
- **API server is stateless** — It reads from and writes to etcd. Multiple replicas can run behind a load balancer.
- **etcd cluster** — 3-5 members with Raft consensus (see [etcd section](#2-etcd)).
- **Controller manager is leader-elected** — Only one controller manager acts at a time; the leader election uses an etcd lease.
- **kube-proxy is per-node** — Each node runs its own proxy. One node failing doesn't affect others.
- **CoreDNS is replicated** — Multiple DNS pod replicas, each caching data, behind a ClusterIP service.

The API server + etcd is the **central registry**. If it goes down, no new registrations, no updates. But existing DNS entries still resolve (they're cached by CoreDNS and by each Pod's DNS resolver).

Source: https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/

### Applicability to Flux

Kubernetes service discovery is the most **complete reference model** for Flux:

- **API server as central registry** — Flux's `core-manifest` plugin already plays this role: it scans for `plugin.json` files and maintains a registry. Kubernetes validates that a central registry is the right pattern.
- **Label selectors as capability matching** — This is directly applicable. Every plugin gets labels (`"hooks": ["feed.video"]`, `"methods": ["feed"]`, `"name": "yt-feed"`). Consumers query: "give me all plugins with `feed.video` in their hooks."
- **EndpointSlice pattern** — Kubernetes separates the Service (declaration of intent) from the EndpointSlice (actual reachable addresses). Flux should separate the `plugin.json` manifest (declared capabilities) from the live subprocess instance (actual running process with PID, port, health).
- **Reconciler loop** — The continuous reconciliation (controller watches Services → finds matching Pods → updates EndpointSlices) is a good model for Flux: when a plugin subprocess starts/stops, the registry should reconcile.
- **Headless services** — For direct pod-to-pod communication without a virtual IP, analogous to plugin-to-plugin IPC without going through the host.

**What doesn't fit:** The scale, replication, and persistence machinery. No need for etcd, API server replicas, or load balancers. The **data model** (labels + selectors + endpoint reconciliation) is the takeaway.

---

## 5. Home Assistant Supervisor / MQTT Discovery

### Overview

Home Assistant (HA) uses a **two-tier** approach to plugin/service discovery:
1. **Supervisor add-on registry** — Each add-on has a `config.yaml` manifest declaring services, discovery entries, and dependencies. The Supervisor manages add-on lifecycle.
2. **MQTT Discovery** — Devices self-announce via MQTT topics. HA subscribes to discovery topics and automatically creates entities when new devices appear.

Source: https://developers.home-assistant.io/docs/apps/configuration/

### What Information Is Stored

**Add-on Registry (config.yaml):**

```yaml
version: 6.5.0
slug: mosquitto
name: Mosquitto broker
description: An Open Source MQTT broker
arch: [armhf, armv7, aarch64, amd64, i386]
discovery:
  - mqtt
services:
  - mqtt:provide
```

Key fields for registration: `slug` (unique ID), `name`, `version`, `arch`, `discovery` (services this add-on provides to HA), `services` (services it provides to other add-ons), `hassio_api` (can it call Supervisor API), `auth_api`, `homeassistant_api`, `docker_api`.

Source: https://developers.home-assistant.io/docs/apps/configuration/
Source: https://github.com/home-assistant/addons/blob/bb4bae39/mosquitto/config.yaml

**MQTT Discovery Payload:**

```json
{
  "name": "My Sensor",
  "unique_id": "sensor_abc123",
  "state_topic": "homeassistant/sensor/my_sensor/state",
  "unit_of_measurement": "°C",
  "device_class": "temperature"
}
```

Topic format: `<discovery_prefix>/<component>/<node_id>/<object_id>/config`
Default prefix: `homeassistant` (configurable)

Source: https://www.home-assistant.io/integrations/mqtt/

### How Services/Devices Register

**Add-on registration:**
1. Add-on folder is placed in the add-ons directory with a `config.yaml`
2. Supervisor scans and reads the manifest
3. Add-on is shown in the UI; user can install/start it
4. Supervisor manages Docker container lifecycle
5. When started, the add-on can register services via the Supervisor API

**MQTT Device registration:**
1. Device connects to the MQTT broker
2. Device publishes a JSON payload to `<prefix>/<component>/<id>/config`
3. Payload describes the entity/device: name, unique_id, state/command topics, device_class, etc.
4. HA receives the message, creates/updates the entity
5. Device publishes state updates to `state_topic`

Source: https://www.home-assistant.io/integrations/mqtt/

### How Consumers Discover

**Add-on services:** The Supervisor API at `/discovery` lists available discovery services. Add-ons can query the Supervisor to see what services are available.

**MQTT discovery:** HA subscribes to `homeassistant/+/+/config` and automatically creates entities from discovery messages. No explicit query needed — discovery is **push-based** (publish to the topic, HA receives it).

Source: https://developers.home-assistant.io/docs/api/supervisor/endpoints/

### Health and Expiration

**MQTT Birth and Last Will messages:**
- **Birth message:** HA publishes `online` to `homeassistant/status` when it starts. Devices subscribe to this topic and re-send their discovery payloads on startup.
- **Last Will and Testament (LWT):** When a device connects to MQTT, it sets a Will message. If the device disconnects (clean or unclean), the broker publishes the Will. HA marks those entities as "unavailable."
- **Availability topics:** Each entity can have an `availability_topic` with `payload_available` and `payload_not_available` values.

**Retained messages:** Discovery payloads can be sent with the `retain` flag set on the MQTT broker. This ensures HA re-discovers them after a restart without the device needing to republish. However, retained messages can create "ghost entities" if the device never returns.

**Recommended pattern:** Subscribe to HA's Birth message, then publish discovery payloads with a random delay (to avoid IO spike on the broker), rather than using retained messages.

Source: https://www.home-assistant.io/integrations/mqtt/

### Architecture and SPOF

- **MQTT broker** — The MQTT broker (typically Mosquitto) is a centralized message hub. If it goes down, discovery and communication stop. This is a SPOF, but MQTT brokers can be clustered (Mosquitto supports bridges and clustering).
- **Supervisor** — A single Supervisor process manages add-ons. If it fails, add-ons continue running but cannot be managed.
- **Home Assistant Core** — The core process subscribes to MQTT topics. If it restarts, all entities become unavailable until it reconnects and receives Birth-triggered or retained discovery messages.

Source: https://www.home-assistant.io/integrations/mqtt/

### Applicability to Flux

Home Assistant shows a **hybrid approach** that's very relevant:

- **Manifest-file-first registration** — Like `plugin.json`. The Supervisor scans the filesystem; Flux's `core-manifest` does the same. This is the simplest registration pattern: a file declares what the plugin provides.
- **Discovery = services list** — The `discovery` field in `config.yaml` lists what capabilities the add-on provides to HA. This is exactly Flux's `hooks` array.
- **MQTT push discovery** — Devices push their capabilities to a broker. In Flux, the subprocess could push its capabilities to the host via IPC. The MQTT topic hierarchy (`prefix/component/node_id/config`) maps to a JSON-RPC method like `plugin.register`.
- **Birth/LWT pattern** — The birth message + random delay pattern for re-registration after host restart is a robust way to handle the host restarting while plugins were already registered.
- **Availability topics** — Every plugin entity has its own availability status. In Flux, each subprocess registration carries a health state.
- **Retained messages problem** — HA discovered that retained discovery messages lead to ghost entities. This is a warning for Flux: if a plugin's registration persists on disk but the process died, stale entries linger. Use **TTL-based lease** (like etcd) instead of persistent registration.

**What doesn't fit:** Full MQTT broker infrastructure is unnecessary. But the **topic hierarchy pattern** (`prefix/component/node_id`) is a good naming convention for registry keys.

---

## 6. OSGi / Eclipse RCP

### Overview

OSGi (Open Services Gateway initiative) is a Java-based module system and service platform. At its core is a **dynamic service registry** where bundles (plugins) can register, find, and track services. The **Service Layer** (OSGi Core Specification Chapter 5) defines the publish/find/bind model. The **Declarative Services** specification (Chapter 112) adds annotation-based, lifecycle-aware component management.

Source: https://docs.osgi.org/specification/osgi.core/8.0.0/framework.service.html
Source: https://docs.osgi.org/specification/osgi.cmpn/7.0.0/service.component.html

### What Information Is Stored

In the OSGi Service Registry, each registration stores:

- **Service interface** (the Java interface class the service implements, e.g. `org.osgi.service.eventadmin.EventHandler`)
- **Service object** (the Java instance)
- **Service properties** (a `Dictionary<String, Object>` of arbitrary metadata):
  - Standard properties: `service.id` (assigned by framework), `service.pid` (persistent ID), `service.scope` (singleton/bundle/prototype)
  - Custom properties: version, vendor, location, cardinality, any key-value pairs

The registry is a **flat map** of `ServiceReference` objects, indexed by interface name, filterable by properties.

Source: OSGi Core 8.0.0, Section 5.2 — https://docs.osgi.org/specification/osgi.core/8.0.0/framework.service.html

### How Bundles Register

**Programmatic registration (Service Layer):**
```java
BundleContext context = bundle.getBundleContext();
Dictionary<String, Object> props = new Hashtable<>();
props.put("version", "2.0");
props.put("vendor", "MyCompany");
ServiceRegistration reg = context.registerService(
    EventHandler.class.getName(),
    myEventHandlerInstance,
    props
);
```

**Declarative Services (annotations — the modern approach):**
```java
@Component(service = EventHandler.class)
public class MyEventHandler implements EventHandler {
    @Override
    public void handleEvent(Event event) {
        // handle event
    }
}
```

The **Service Component Runtime (SCR)** reads component descriptions from XML files (or annotations) inside bundles. When a component's dependencies are satisfied, SCR activates it and registers its service automatically.

Key component types:
- **Immediate** — Activated as soon as dependencies are satisfied
- **Delayed** — Registers the service but defers instantiation until the first service request
- **Factory** — Creates new instances on demand

Source: OSGi Compendium 7.0.0, Section 112 — https://docs.osgi.org/specification/osgi.cmpn/7.0.0/service.component.html

### How Consumers Discover

**ServiceTracker (the recommended way):**
```java
ServiceTracker<EventHandler, EventHandler> tracker =
    new ServiceTracker<>(context, EventHandler.class, null);
tracker.open();
EventHandler service = tracker.getService();
```

The `ServiceTracker`:
- Watches for services matching a class name, a `Filter` (LDAP-style property filter), or a specific `ServiceReference`
- Automatically receives `ServiceEvent` notifications on registration, modification, and unregistration
- Handles `getService`/`ungetService` lifecycle correctly

**Direct API (discouraged):**
```java
ServiceReference<?>[] refs = context.getServiceReferences(
    EventHandler.class.getName(),
    "(version>=2.0)"  // LDAP filter on properties
);
```

**Declarative Services references:**
```java
@Component
public class MyConsumer {
    @Reference
    private EventHandler eventHandler;
}
```

References can be:
- **Static** — bound once at activation, never change
- **Dynamic** — can be rebound while the component is active
- **Optional** — `null` if no matching service
- **Multiple** — collect all matching services
- **Target filter** — LDAP filter to narrow which services match

Source: OSGi Core 8.0.0, Section 701 — https://docs.osgi.org/specification/osgi.core/8.0.0/util.tracker.html

### Health and Service Dynamics

OSGi is **inherently dynamic**:
- Services can come and go at any time
- `ServiceTracker` fires `addingService`, `modifiedService`, `removedService` callbacks
- Declarative Services automatically (de)activates components when dependencies appear/disappear
- A service reference becomes invalid if the registering bundle stops
- OSGi framework tracks bundle lifecycle: STARTING, ACTIVE, STOPPING. When a bundle stops, all its registered services are automatically unregistered.

**Stale references:** The spec warns about stale references causing memory leaks. `ServiceTracker` and Declarative Services prevent this by managing the `getService`/`ungetService` lifecycle.

Source: OSGi Core 8.0.0, Section 5.3 — https://docs.osgi.org/specification/osgi.core/8.0.0/framework.service.html

### Architecture and SPOF

- **OSGi Framework** — The framework itself is a single Java VM process. If it crashes, everything stops.
- **Service Registry** — Lives in-memory within the framework. No persistence. No distribution (services exist only within one JVM).
- **Remote Services (RFC 119)** — An extension for distributed OSGi, but not part of the core spec.

There is **no built-in SPOF mitigation** — this is a single-process architecture by design. Mitigation comes from JVM redundancy (clustering at the application level, not the framework level).

### Applicability to Flux

OSGi is the **most philosophically aligned** system for Flux:

- **Service Registry as a map of interfaces → implementations** — This is exactly what Flux needs. A `Map<HookName, PluginProcess>` where the hook name is the interface and the plugin subprocess is the implementation.
- **Service properties for capability matching** — OSGi's LDAP filter on properties is equivalent to Flux's label/hook query. `"(hook=feed.video)"` is the same concept.
- **Declarative Services pattern** — The annotation-driven model where a component declares its required services (`@Reference`) and provided service (`@Component` with `service=`) is directly analogous to Flux's `plugin.json` with `requires`, `provides`, and `hooks`.
- **ServiceTracker** — The observer pattern (track a class, get callbacks on registration/change/removal) is the right model for Flux's dynamic plugin lifecycle.
- **Dynamic references** — The ability to handle services that appear and disappear at runtime is critical for subprocess plugins (process may crash and restart).
- **Delayed component** — Register the service interface, but don't activate until someone needs it. Flux could lazily start subprocesses: register the hook immediately, but only spawn the process when a consumer requests it.
- **Stale reference prevention** — OSGi's lesson is that you must explicitly manage service object lifecycle. Flux must handle the case where a plugin subprocess dies and the registry reference becomes stale.

**What doesn't fit:** The Java class-loader complexity and LDAP filter syntax. The **concepts** (interface-based registry, property filters, declarative references, tracker callbacks) are directly applicable. The LDAP filter can be replaced with simple predicate matching.

---

## 7. Unix /etc/services + getaddrinfo

### Overview

The `/etc/services` file is the **original service registry** — a plain-text mapping of human-friendly service names to port numbers and protocols. It has existed since the early days of Unix networking and is defined by POSIX. The C library functions `getservbyname()`, `getservbyport()`, and `getaddrinfo()` provide programmatic access.

Source: https://man7.org/linux/man-pages/man5/services.5.html

### What Information Is Stored

Each line in `/etc/services`:
```
service-name   port/protocol   [aliases ...]
```

Example:
```
http            80/tcp          www www-http
ssh             22/tcp
domain          53/tcp          nameserver
domain          53/udp          nameserver
```

The port numbers are assigned by IANA (Internet Assigned Numbers Authority) and distributed as the "Service Name and Transport Protocol Port Number Registry." The `/etc/services` file is a local snapshot of this registry.

Source: https://man7.org/linux/man-pages/man5/services.5.html
Source: https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.txt

### How Services Register

**Manual editing** — System administrators add entries directly to `/etc/services`. The format is simple:
```
my-service      8080/tcp
```

**OS package** — The file is typically provided by the `base-passwd` or `netbase` package and updated with system updates.

**No dynamic registration** — `/etc/services` is a static file. There is no API to add/remove entries at runtime. Changes require file write access (typically root) and take effect immediately for subsequent lookups.

Source: https://askubuntu.com/questions/1121473/where-does-etc-services-come-from

### How Consumers Discover

**`getservbyname(3)`:**
```c
struct servent *s = getservbyname("http", "tcp");
if (s != NULL) {
    // s->s_name = "http"
    // s->s_port = 80 (in network byte order)
    // s->s_proto = "tcp"
}
```

**`getaddrinfo(3)`:**
```c
struct addrinfo hints = { .ai_family = AF_UNSPEC, .ai_socktype = SOCK_STREAM };
struct addrinfo *result;
int rc = getaddrinfo("example.com", "http", &hints, &result);
// If rc == 0, result contains resolved address(es) with port 80
```

`getaddrinfo` combines hostname resolution (DNS) with service resolution (`/etc/services`) into a single call. This is the **most widely deployed service discovery mechanism in existence** — it's what every TCP/IP application uses by default.

Source: https://man7.org/linux/man-pages/man3/getaddrinfo.3.html
Source: https://snapshots.sourceware.org/glibc/trunk/2024-03-19_18-54_1710874442/manual/html_node/Services-Database.html

### Health and Expiration

- **No health checks** — The file contains port-to-name mappings only. If a service is not running, the entry still exists. The file says nothing about availability.
- **No TTL** — The file is static. The C library may cache the file contents, but there's no expiry mechanism.
- **No removal** — Entries are never automatically removed. Manual cleanup required.

### Architecture and SPOF

- **Local file** — `/etc/services` is a single file on each machine. There is no network dependency for local lookups.
- **Distributed via NIS/LDAP** — The file can be distributed over a network using Yellow Pages/NIS or Hesiod, which introduces a network SPOF.
- **No server** — On a standalone machine, the file is always available (it's just a file). This is the **most resilient possible registry** — no process, no network, no daemon needed.

Source: https://man7.org/linux/man-pages/man5/services.5.html

### Applicability to Flux

The Unix `/etc/services` model is the **simplicity baseline** — the simplest possible thing that could work:

- **Registry as a static file** — Flux already has this: `plugin.json` files. Each plugin declares its capabilities in a file. The simplest registry is just reading these files.
- **Name → port mapping** — `/etc/services` maps service name to port. Flux maps hook name to plugin subprocess.
- **`getaddrinfo` as unified resolution** — The concept of a single function that resolves both identity and location is useful. In Flux, `callHook(hook, method, params)` resolves the hook to a plugin, then routes the RPC.
- **No health awareness** — This is the key limitation. `/etc/services` doesn't know if a service is running. Flux must go beyond this model with active health checking.

**The lesson:** Start with the static manifest model (already done with `plugin.json`), then add dynamic registration, health, and discovery on top. Don't over-engineer the registry before the basics work.

---

## 8. JupyterLab / Lumino Token Registry

### Overview

JupyterLab is built on **Lumino** (formerly Phosphor JS), which provides a **token-based dependency injection registry**. The core concept: a plugin declares what it **provides** (a service identified by a `Token`) and what it **requires** (other `Token`s). The Lumino `PluginRegistry` resolves dependencies automatically, activating plugins in dependency order.

Source: https://jupyterlab.readthedocs.io/en/4.4.x/extension/extension_dev.html
Source: https://lumino.readthedocs.io/en/latest/api/classes/coreutils.PluginRegistry-1.html

### What Information Is Stored

Each plugin in the registry stores:

- **`id`** — Unique string identifier
- **`provides`** — A `Token<T>` (or `null` if the plugin provides nothing). The token is a unique symbol that identifies the service type.
- **`requires`** — Array of `Token`s that must be resolved before activation. If any cannot be resolved, the plugin is not activated.
- **`optional`** — Array of `Token`s that are resolved if available, but `null` is passed if not.
- **`activate`** — Factory function `(app, ...requiredServices, ...optionalServices) => T`
- **`autoStart`** — `boolean | "defer"` — whether to activate on application start

The registry internally maintains:
- `_plugins: Map<string, IPlugin>` — all registered plugins
- `_services: Map<Token, string>` — maps each provided token to the plugin ID that provides it
- `_activated: Set<string>` — currently activated plugins

Source: https://lumino.readthedocs.io/en/latest/api/interfaces/coreutils.IPlugin.html
Source: https://github.com/jupyterlab/jupyterlab/blob/060d85006b35144cb7d48bcf68af1eecb740bfec/packages/application/src/lab.ts

### How Plugins Register

```typescript
// Define a token (in a shared package)
export const IFileBrowser = new Token<IFileBrowser>(
    '@jupyterlab/filebrowser:IFileBrowser'
);

// Provider plugin registers
const plugin: JupyterFrontEndPlugin<IFileBrowser> = {
    id: '@my-org/filebrowser-provider',
    provides: IFileBrowser,
    autoStart: true,
    activate: (app: JupyterFrontEnd) => {
        return new FileBrowser(app);
    }
};

// Register with application
app.registerPlugin(plugin);
```

**Token is the key insight:** A `Token` is not just a string — it's a typed unique object. Two packages that import the same token from the same package get the **exact same object reference**, which is how the registry can match providers to consumers. This is why **token deduplication** is critical in JupyterLab (handled by Webpack Module Federation).

Source: https://lumino.readthedocs.io/en/latest/api/interfaces/coreutils.IPlugin.html

### How Consumers Discover

**Declarative (recommended):**
```typescript
const consumerPlugin: JupyterFrontEndPlugin<void> = {
    id: '@my-org/filebrowser-consumer',
    requires: [IFileBrowser],          // required — error if not available
    optional: [ICommandPalette],       // optional — null if not available
    activate: (app: JupyterFrontEnd, fileBrowser: IFileBrowser, palette: ICommandPalette | null) => {
        // Use fileBrowser and palette
    }
};
```

**Programmatic (rarely needed):**
```typescript
const fileBrowser = await app.resolveRequiredService(IFileBrowser);
const maybePalette = await app.resolveOptionalService(ICommandPalette);
```

The `PluginRegistry.resolveRequiredService` method:
1. Looks up which plugin provides the token (from `_services` map)
2. If that plugin is not yet activated, activates it first (recursive resolution)
3. Returns the service instance (singleton — same instance for all consumers)

**Dependency ordering:** The registry uses **topological sorting** to activate plugins in dependency order. Circular dependencies are detected and rejected at registration time.

Source: https://lumino.readthedocs.io/en/latest/api/classes/coreutils.PluginRegistry-1.html

### Health and Lifecycle

- **Static check at registration** — Circular dependencies are detected immediately. Missing required services are detected at activation time (throws error).
- **Override behavior** — If a second plugin provides the same token, the new service **overrides** the old one. This enables extension swapping without removing the original.
- **No dynamic unregistration** — The Lumino registry doesn't natively handle services appearing/disappearing at runtime (unlike OSGi). Plugins are typically registered once at startup.
- **Deactivation** — A `deactivate` function can be provided for cleanup, but it's optional.
- **`autoStart: "defer"`** — Plugins marked deferred are activated after the main startup sequence completes.

Source: https://lumino.readthedocs.io/en/latest/api/classes/coreutils.PluginRegistry-1.html

### Architecture and SPOF

- **Single `PluginRegistry` instance** — The registry is an in-memory JavaScript object inside the browser/Electron process. If the app crashes, everything is lost. This is a SPOF by design — it's a single-user desktop app, not a distributed system.
- **Token deduplication** — The biggest architectural challenge is ensuring the same `Token` object is shared between provider and consumer. JupyterLab uses Webpack Module Federation's singleton shared modules to guarantee this.
- **No persistence** — The registry is purely in-memory. Extensions are re-registered on every app start.

### Applicability to Flux

JupyterLab's token registry is the **closest analogue** to Flux's current architecture:

- **`Token` as service identifier** — This is the pattern Flux's hooks are trying to achieve. A `Token<IFeedProvider>` is equivalent to a hook name `"feed.video"`. The typed token provides compile-time safety that the string hook name lacks.
- **`requires` / `optional`** — Exactly mirrors OSGi's mandatory/optional service references. In Flux, a plugin that requires `feed.video` is analogous to `requires: [IFeedProvider]`.
- **`provides`** — What the plugin contributes to the system. In Flux, this maps to the hooks array in `plugin.json`.
- **Automatic dependency resolution** — The Lumino registry activates plugins in the correct order. Flux currently has no dependency ordering — plugins are loaded in filesystem scan order. Adopting this pattern would ensure plugins are activated only after their dependencies.
- **Override semantics** — "If two plugins provide the same token, the last one wins" is a simple and powerful extension mechanism. Flux could adopt this for hook resolution: if two plugins provide `"feed.video"`, the last-registered one wins.
- **Token deduplication lesson** — For Flux, the equivalent problem is hook name uniqueness. If two plugins claim the same hook name, which one wins? JS module deduplication doesn't apply (subprocess plugins are separate processes), but the naming convention issue does.

**What doesn't fit:** Lumino doesn't handle dynamic registration/removal of plugins at runtime (subprocess crash and restart). Flux needs the **OSGi ServiceTracker** pattern on top of the **JupyterLab token model**.

---

## Synthesis: What Flux Should Borrow

| Concept | Source System | How It Applies to Flux |
|---------|--------------|----------------------|
| **Agent pattern** | Consul | Each plugin subprocess registers with the host (the "server"). The host is the registry. |
| **TTL-based health checks** | Consul, etcd | Subprocess sends heartbeat via IPC; if silent for N seconds, registration expires. |
| **Lease-based auto-deregistration** | etcd | Keys (registrations) are attached to a lease. Expired lease → automatic removal. |
| **Watch / event stream** | etcd, OSGi | Consumers get notified when services appear/disappear via Rust channels. |
| **Label selectors** | Kubernetes | Query plugins by label: `hooks: ["feed.video"]`, `methods: ["feed"]`, `name: "yt-feed"`. |
| **Endpoint reconciliation** | Kubernetes | A loop that continuously reconciles manifest-declared capabilities with live subprocess instances. |
| **Push-based discovery + Birth/Will** | Home Assistant (MQTT) | Subprocess publishes capabilities on startup. Host subscribes. Plugin death → deregistration. |
| **Topic hierarchy naming** | Home Assistant (MQTT) | Registry key naming: `/<hook>/<plugin_id>/` for prefix-based querying. |
| **Service properties for filtering** | OSGi | Each registration carries metadata (version, methods, hooks) as key-value properties for filtering. |
| **Interface = capability contract** | OSGi, JupyterLab | A hook name (`Token` or string) is a typed contract. Multiple plugins can implement the same contract. |
| **Declarative references (`requires`/`optional`)** | JupyterLab | Plugin manifest declares what services it needs (required) and what it can use if available (optional). |
| **Dependency ordering** | JupyterLab | Plugins are activated in dependency order, not filesystem scan order. |
| **Override semantics** | JupyterLab, PluginKit | Last-registered plugin for a given hook wins. Enables swapping implementations. |
| **Static manifest as source of truth** | Unix /etc/services, Home Assistant | `plugin.json` is the static declaration. The live registry is reconciled against it. |
| **Decentralized without central server** | DNS-SD / mDNS | Each plugin speaks for itself. The host aggregates, not arbitrates. No single registry server needed. |

---

## Concrete Recommendation for Flux

### Data Model

```rust
/// A registered service in the Flux registry.
struct Registration {
    /// Plugin identity
    plugin_id: String,       // e.g. "yt-feed"
    /// Capabilities this plugin provides
    hooks: Vec<String>,      // e.g. ["feed.video"]
    methods: Vec<String>,    // e.g. ["feed"]
    /// Components/WC tags
    components: Vec<String>, // e.g. ["yt-video-card"]
    /// Slots this plugin fills
    slots: Vec<String>,      // e.g. ["video.player"]
    /// Metadata for filtering
    labels: HashMap<String, String>,
    /// Runtime state
    pid: Option<u32>,        // None if not yet spawned
    health: HealthState,     // Healthy, Unhealthy, Unknown
    last_seen: Instant,      // for TTL expiry
}

enum HealthState {
    Healthy,       // Subprocess running and responding
    Unhealthy,     // Subprocess running but check failed
    Unknown,       // Registered in manifest but not yet spawned
    Expired,       // TTL passed without heartbeat
}
```

### Registration Flow

```
1. Host starts → core-manifest scans `plugins/**/plugin.json`
2. For each manifest:
   a. Create Registration from manifest data (pid=None, health=Unknown)
   b. Store in registry: registry.insert(plugin_id, registration)
   c. If plugin has `run` field, spawn subprocess
3. Subprocess starts → sends IPC message:
   { method: "plugin.hello", params: { plugin_id: "yt-feed" } }
4. Host receives hello → updates registration:
   pid = subprocess.pid, health = Healthy, last_seen = now
5. Subprocess sends periodic heartbeat:
   { method: "plugin.ping" }
6. Host receives ping → updates last_seen
7. If no heartbeat for N seconds → health = Expired → emit removal event
```

### Discovery Flow

```rust
// Query plugins by hook
let feed_plugins = registry.query(|r| r.hooks.contains("feed.video"));

// Query by label
let yt_plugins = registry.query(|r| r.labels.get("source") == Some("youtube"));

// Resolve a specific hook (override semantics: last writer wins)
let player = registry.resolve("video.player");
```

### Architecture

```
┌─────────────────────────────────────────┐
│              Registry (Host)            │
│  ┌──────────────────────────────────┐   │
│  │  HashMap<PluginId, Registration> │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  tokio::sync::broadcast          │   │
│  │  (registration/removal events)   │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │  Heartbeat checker (tokio task)  │   │
│  │  - Iterates registrations        │   │
│  │  - Marks expired if old          │   │
│  │  - Emits removal event           │   │
│  └──────────────────────────────────┘   │
└─────────────────────────────────────────┘
         ▲ IPC            │ IPC
         │                ▼
┌─────────────────┐  ┌─────────────────┐
│  Plugin A        │  │  Plugin B        │
│  (subprocess)    │  │  (subprocess)    │
│  - hello on boot │  │  - hello on boot │
│  - ping every 5s │  │  - ping every 5s │
└─────────────────┘  └─────────────────┘
```

### Key Design Decisions

1. **Single host process as registry** — No external daemon. The Tauri Rust process holds the registry in memory. This is sufficient for a single-user desktop app.

2. **TTL-based health** — Every registration has a `last_seen` timestamp. A background tokio task wakes every N seconds and expires stale entries. No need for leases or complex consensus.

3. **Event-driven discovery** — Consumers don't poll. They subscribe to a `tokio::sync::broadcast` channel that emits `RegistryEvent::PluginRegistered`, `RegistryEvent::PluginRemoved`, `RegistryEvent::PluginHealthChanged`. This is the etcd Watch pattern adapted for single-process.

4. **Manifest-first, IPC-second** — The static `plugin.json` declares capabilities. The IPC hello/ping confirms liveness. This separation means the system works even without the subprocess running (you can see what's available).

5. **Override semantics** — If two plugins register the same hook, the last one to register wins. This allows extension swapping without source changes.

6. **No persistence of runtime state** — Registration state (pid, health) is in-memory only. On each app start, reconciliation begins fresh. This avoids the "retained discovery ghost entity" problem Home Assistant experienced.

---

## Sources (Consolidated)

| System | Primary Source |
|--------|---------------|
| Consul — Service Registration | https://developer.hashicorp.com/consul/docs/services/usage/register-services-checks |
| Consul — Health Checks API | https://developer.hashicorp.com/consul/api-docs/agent/check |
| Consul — Health Endpoint | https://developer.hashicorp.com/consul/api-docs/health |
| Consul — KV Store | https://developer.hashicorp.com/consul/api-docs/kv |
| Consul — Architecture | https://developer.hashicorp.com/consul/docs/architecture/control-plane |
| Consul — Raft Consensus | https://developer.hashicorp.com/consul/docs/concept/consensus |
| Consul — Gossip Protocol | https://developer.hashicorp.com/consul/docs/concept/gossip |
| etcd — Homepage | https://etcd.io/ |
| etcd — API Design | https://etcd.io/docs/v3.8/learning/api/ |
| etcd — gRPC Naming & Discovery | https://etcd.io/docs/v3.8/dev-guide/grpc_naming/ |
| etcd — Why etcd | https://etcd.io/docs/v3.8/learning/why/ |
| etcd — Kubernetes integration | https://kubernetes.io/docs/tasks/administer-cluster/configure-upgrade-etcd/ |
| DNS-SD — RFC 6763 (full text) | https://datatracker.ietf.org/doc/rfc6763/ |
| mDNS — RFC 6762 (full text) | https://datatracker.ietf.org/doc/rfc6762/ |
| Bonjour — Architecture | https://developer.apple.com/library/archive/documentation/Cocoa/Conceptual/NetServices/Articles/NetServicesArchitecture.html |
| Bonjour — Registration | https://developer.apple.com/library/archive/documentation/Networking/Conceptual/dns_discovery_api/Articles/registering.html |
| Kubernetes — Services | https://kubernetes.io/docs/concepts/services-networking/service/ |
| Kubernetes — Service API | https://kubernetes.io/docs/reference/kubernetes-api/core/service-v1/ |
| Kubernetes — EndpointSlice | https://kubernetes.io/docs/reference/kubernetes-api/discovery/endpoint-slice-v1/ |
| Kubernetes — Labels & Selectors | https://kubernetes.io/docs/concepts/overview/working-with-objects/labels/ |
| Home Assistant — Add-on config | https://developers.home-assistant.io/docs/apps/configuration/ |
| Home Assistant — Supervisor API | https://developers.home-assistant.io/docs/api/supervisor/endpoints/ |
| Home Assistant — MQTT Discovery | https://www.home-assistant.io/integrations/mqtt/ |
| Home Assistant — Mosquitto config.yaml | https://github.com/home-assistant/addons/blob/bb4bae39/mosquitto/config.yaml |
| OSGi — Core Service Layer (v8) | https://docs.osgi.org/specification/osgi.core/8.0.0/framework.service.html |
| OSGi — Declarative Services (v7) | https://docs.osgi.org/specification/osgi.cmpn/7.0.0/service.component.html |
| OSGi — ServiceTracker (v8) | https://docs.osgi.org/specification/osgi.core/8.0.0/util.tracker.html |
| Unix — /etc/services | https://man7.org/linux/man-pages/man5/services.5.html |
| Unix — getaddrinfo(3) | https://man7.org/linux/man-pages/man3/getaddrinfo.3.html |
| Unix — glibc Services Database | https://snapshots.sourceware.org/glibc/trunk/2024-03-19_18-54_1710874442/manual/html_node/Services-Database.html |
| IANA — Service Name Registry | https://www.iana.org/assignments/service-names-port-numbers/service-names-port-numbers.txt |
| JupyterLab — Extensions Dev Guide | https://jupyterlab.readthedocs.io/en/4.4.x/extension/extension_dev.html |
| Lumino — PluginRegistry | https://lumino.readthedocs.io/en/latest/api/classes/coreutils.PluginRegistry-1.html |
| Lumino — IPlugin Interface | https://lumino.readthedocs.io/en/latest/api/interfaces/coreutils.IPlugin.html |
| JupyterLab — Application source | https://github.com/jupyterlab/jupyterlab/blob/060d85006b35144cb7d48bcf68af1eecb740bfec/packages/application/src/lab.ts |
| JupyterLab — Tokens source | https://github.com/jupyterlab/jupyterlab/blob/b13a3c1d8d8e34e5bffc16a2fc371e31010916a4/packages/application/src/tokens.ts |
| Plugin Kit — Service Registry | https://plugin-kit.saad-ardati.dev/concepts/service-registry/ |
