# Truly Decoupled Plugin Architectures

Research for Flux — a desktop app that wants 100% modularity: core never knows about plugins at compile time, every piece swappable, core rewritable in another language without breaking plugins.

---

## Table of Contents

1.  [Unix Philosophy / Unix Pipes](#1-unix-philosophy--unix-pipes)
2.  [Microkernels (L4, seL4, Mach, MINIX)](#2-microkernels-l4-sel4-mach-minix)
3.  [D-Bus (Desktop Bus)](#3-d-bus-desktop-bus)
4.  [Eclipse MicroProfile](#4-eclipse-microprofile)
5.  [Fuchsia / Zircon — Capability-based Security](#5-fuchsia--zircon--capability-based-security)
6.  [VS Code Extension Host Protocol](#6-vs-code-extension-host-protocol)
7.  [COM / OLE (Component Object Model)](#7-com--ole-component-object-model)
8.  [Apache Camel / Enterprise Integration Patterns](#8-apache-camel--enterprise-integration-patterns)
9.  [Synthesis: What Flux Should Steal From Each](#9-synthesis-what-flux-should-steal-from-each)

---

## 1. Unix Philosophy / Unix Pipes

### The One Key Idea

Programs are **filters** that read text from stdin and write text to stdout. The shell composes them with `|` (pipe). No program knows about any other program. Each does one thing well.

Source: Doug McIlroy's 1978 summary in Peter H. Salus, *A Quarter Century of UNIX* (1994):
> "Write programs that do one thing and do it well. Write programs to work together. Write programs to handle text streams, because that is a universal interface."
> (https://en.wikipedia.org/wiki/Unix_philosophy#Doug_McIlroy_on_Unix_programming)

### The Contract

**Text streams** — newline-delimited lines of plain text. A universal interface that any program can produce and consume. No binary layout, no struct alignment, no version negotiation. If your output looks like text, it composes.

### Discovery

The **user** (or a shell script) does discovery. The shell is the runtime. You type `grep foo | sort | uniq -c` — the shell spawns three processes, connects stdout of each to stdin of the next, and waits. There is no registry, no manifest, no central database. Composition is ad-hoc, done by the human at the keyboard.

### Boot

The shell starts first. Programs are loaded on demand from `$PATH`, which is an environment variable listing directories. `fork()` + `exec()` loads the binary. No runtime knows about any program until the user invokes it.

### Weaknesses

- **Error handling is catastrophic** — if one program in a pipeline crashes, the next program gets EOF or a broken pipe. There's no structured error propagation.
- **No structured data** — text is universal but fragile. A filename with a newline breaks a pipeline. There's no schema.
- **Latency** — each `fork()` + `exec()` is expensive. Programs are OS processes with full isolation overhead.
- **No bidirectional communication** — pipes are unidirectional. Two-way communication requires named pipes, sockets, or temp files (ad-hoc).

### What This Looks Like in a Desktop App (Flux)

Flux plugins communicate via **stdin/stdout JSON-RPC** (already the case). Each plugin is a subprocess. Flux core does not import plugin code — it spawns the process, sends JSON-RPC requests, reads JSON-RPC responses. Adding a plugin means adding a `plugin.json` manifest and a `run` command. No recompile. No import. No type sharing. This is already how Flux works — it inherits the Unix philosophy directly.

---

## 2. Microkernels (L4, seL4, Mach, MINIX)

### The One Key Idea

The kernel is **minimal** — only IPC, thread scheduling, and address space management run in privileged mode. Everything else (drivers, filesystems, network stacks) runs as **user-space processes** that communicate via IPC. A crash in a driver cannot crash the kernel. A driver can be replaced without rebooting.

Source: Heiser & Elphinstone, "L4 Microkernels: The Lessons from 20 Years of Research and Deployment" (2016):
> "the most general principles behind L4, minimality, including running device drivers at user level, generality, and a strong focus on performance"
> (https://dl.acm.org/doi/10.1145/2893177)

### The Contract

**IPC messages** — structured messages passed through kernel-mediated channels (endpoints in seL4, ports in Mach). In seL4, IPC uses `seL4_MessageInfo_t` to encode message description into a single word. Messages can carry data registers and capabilities (see: Fuchsia section for capabilities).

Source: seL4 documentation:
> "The seL4_MessageInfo_t data structure is used to encode the description of an IPC message into a single word."
> (https://docs.sel4.systems/Tutorials/ipc.html)

### Discovery

In L4, threads are IPC destinations — you send to a thread ID. Later microkernels (seL4) use **capabilities** — you hold a capability to an endpoint, and you send through it. Discovery is hierarchical: a parent creates children and grants them capabilities to communicate with specific services. There is no global namespace (unlike D-Bus).

### Boot

A minimal bootstrap loader starts the kernel. The kernel starts a single user-space process (the "root server" or "pager"). That root server creates other processes (driver servers, filesystem servers) and grants them capabilities. The root server is the only thing compiled into the boot image. Everything else loads dynamically.

### Weaknesses

- **IPC overhead** — every service call crosses a process boundary. L4 made IPC 10-20x faster than Mach, but it's still slower than a monolithic kernel's function call.
- **Complexity at scale** — managing capability graphs for hundreds of services is harder than a flat kernel with everything in one address space.
- **Driver complexity** — user-space drivers must handle DMA, interrupts, and MMIO through kernel-mediated channels. This is harder than in-kernel driver code.

### What This Looks Like in a Desktop App (Flux)

Flux core = microkernel. Plugins = user-space servers. The core only manages **process lifecycle** and **message routing**. It does not import plugin code, does not know plugin types. Each plugin is a separate process. If a plugin crashes, core keeps running and can restart it. This is already close to what Flux does — the Rust `lib.rs` routes JSON-RPC to plugin subprocesses with a 15s timeout.

---

## 3. D-Bus (Desktop Bus)

### The One Key Idea

A **message bus daemon** sits between all processes. Processes don't talk to each other directly — they talk to the bus. The bus routes messages to the right destination by **well-known bus name** (e.g., `org.freedesktop.NetworkManager`). A process discovers services by asking the bus: "who provides `org.freedesktop.ScreenSaver`?"

Source: D-Bus Specification:
> "Connections have one or more bus names associated with them. A connection has exactly one bus name that is a unique connection name... Other bus names are called well-known bus names."
> (https://dbus.freedesktop.org/doc/dbus-specification.html)

### The Contract

**D-Bus messages** — a binary wire protocol with a type system (integers, floats, strings, arrays, structs, variants). Messages can be method calls, method returns, signals (broadcasts), or errors. Every object has an **interface** (a named group of methods and signals) and an **object path** (like a filesystem path: `/org/freedesktop/NetworkManager`).

Interfaces are defined in XML:
```xml
<interface name="org.freedesktop.NetworkManager">
  <method name="state">
    <arg type="u" name="state" direction="out"/>
  </method>
  <signal name="StateChanged">
    <arg type="u" name="new_state"/>
  </signal>
</interface>
```

Source: D-Bus specification on introspection:
> "As described in the section called 'org.freedesktop.DBus.Introspectable', objects may be introspected at runtime, returning an XML string that describes the object."
> (https://dbus.freedesktop.org/doc/dbus-specification.html)

### Discovery

D-Bus has **two buses**: a system bus (for OS-level services) and a session bus (for user-session services). A process connects to a bus daemon. To find a service, it sends a `NameOwnerChanged` match or calls `org.freedesktop.DBus.ListNames`. Services register their well-known names with the bus daemon. The bus daemon can also **auto-start** services — if a client asks for a name that no one owns, the daemon launches the service executable as defined in `.service` files.

### Boot

The bus daemon (`dbus-daemon`) starts first, either at boot (system bus) or at session start (session bus). Services are started on-demand by the bus daemon when a client requests their well-known name, or they can register at startup and claim their name.

### Weaknesses

- **Central bottleneck** — the bus daemon is a single point of failure and a performance bottleneck. All traffic routes through it.
- **Performance** — D-Bus has at least 2.5x overhead over direct IPC (source: https://dbus.freedesktop.org/doc/dbus-faq.html).
- **Synchronous by default** — method calls block until the response arrives. Asynchronous calls require manual event loop integration.
- **Policy coupling** — the system bus has security policies (who can talk to whom) defined in XML files. These are configuration, not code, but they still couple services to the bus architecture.

### What This Looks Like in a Desktop App (Flux)

Flux core acts as the **message bus**. Plugins connect to core (today: core spawns them as subprocesses). A plugin registers its capabilities by publishing a manifest (`plugin.json`). Other plugins ask core: "who provides `feed.video`?" Core resolves the hook and routes the request. No plugin knows another plugin's process ID, language, or location. This is already mostly how Flux works — the Rust host routes to plugins by `"name.action"` method prefix.

The D-Bus lesson for Flux: formalize the **discovery protocol**. Today, Flux uses `resolve_hook` and `call_hook` — these are the equivalent of D-Bus's well-known names and auto-start. Make every plugin declare its interfaces explicitly (like D-Bus XML) and allow introspection at runtime.

---

## 4. Eclipse MicroProfile

### The One Key Idea

MicroProfile defines a **programming model** (a set of Java APIs) that any compliant application server can implement. You write your microservice against the API, not the server. You can deploy the same `.war` on Open Liberty, WildFly, Payara, or TomEE without changes. The server is just an implementation of the API contract.

Source: MicroProfile official site:
> "The goal of MicroProfile is to define standard APIs for building microservices and deliver portable applications across multiple MicroProfile runtimes."
> (https://microprofile.io/)

### The Contract

**Java interfaces + annotations** — the API itself. `@GET`, `@Path("/books")`, `@Inject`, `@Counted`, `@CircuitBreaker`. Your code imports `org.eclipse.microprofile.*` types, not server-specific types. The `microprofile` BOM is declared as `<scope>provided</scope>` in Maven — meaning the server provides the implementation at runtime.

### Discovery

**CDI (Contexts and Dependency Injection)** scans the classpath at startup for beans annotated with `@ApplicationScoped`, `@RequestScoped`, etc. Beans are discovered automatically during deployment. The server's CDI container creates instances, injects dependencies, and manages lifecycles. The application does not call constructors or factories.

### Boot

The application server starts first (Open Liberty, Payara, etc.). It reads `server.xml` or the equivalent configuration to know which features to enable. When you deploy a `.war`, the server:
1. Scans the classpath for CDI beans
2. Discovers JAX-RS resource classes
3. Registers metrics, health checks, OpenAPI endpoints
4. Serves HTTP traffic

The application never starts itself — the server starts and discovers the application.

### Weaknesses

- **Java-only** — the contract is a Java API. Plugins written in other languages cannot participate.
- **Version coupling** — if the API adds a method, all server implementations must implement it. If you depend on a non-standard server feature, you lose portability.
- **No dynamic loading** — apps are deployed as archives. You cannot add a new endpoint at runtime without redeploying.
- **Heavy runtime** — application servers are large. Open Liberty is relatively light, but it's still a ~200MB runtime.

### What This Looks Like in a Desktop App (Flux)

Flux defines a **protocol contract** (JSON-RPC method names, parameter shapes, response shapes) that any plugin can implement. The contract is the wire format — not a shared type system. A plugin written in Python, Rust, or shell script can participate as long as it speaks the protocol.

The MicroProfile lesson: the **core should never import plugin code**. The contract is the API. The core depends only on the contract (the JSON-RPC protocol). The plugin depends on nothing at all — it just happens to speak the right protocol.

---

## 5. Fuchsia / Zircon — Capability-based Security

### The One Key Idea

Components do not have **names**. They have **capabilities**. A component declares what capabilities it *uses* (consumes) and what it *offers* (provides). Capabilities are **routed** through the component framework — a parent offers a capability to a child, a child exposes a capability to its parent. A component never knows where a capability comes from. The component manager brokers every connection.

Source: Fuchsia documentation on capabilities:
> "Components interact with one another through capabilities. A capability combines access to a resource and a set of rights, providing both a mechanism for access control and a means for interacting with the resource."
> (https://fuchsia.dev/fuchsia-src/concepts/components/v2/capabilities)

### The Contract

**FIDL protocols** — Fuchsia Interface Definition Language. Every capability is a FIDL protocol. The `.fidl` file defines the methods that can be called on the protocol. At runtime, the capability is a **channel** (a Zircon kernel object) that speaks the FIDL protocol. Components hold handles to channels — they do not import or link against the implementation.

### Discovery

There is no global registry. Discovery is **explicit routing**:
- A component declares `use: [{ protocol: "fuchsia.example.Foo" }]`
- A component declares `capabilities: [{ protocol: "fuchsia.example.Foo" }]`
- A parent declares `offer: [{ protocol: "fuchsia.example.Foo", from: "child_a", to: "child_b" }]`
- A child declares `expose: [{ protocol: "fuchsia.example.Foo", from: "self" }]`

The component manager walks the component instance tree to find a valid route from consumer to provider. If no route exists, the connection fails at runtime.

Source: Fuchsia component introduction:
> "Component manager is responsible for resolving requests to access a capability (such as a directory or protocol) with the component providing that capability. This is known as capability routing."
> (https://fuchsia.dev/fuchsia-src/concepts/components/v2/introduction)

### Boot

`component_manager` starts first. It has a built-in `boot-resolver` (resolves `fuchsia-boot://` URLs) and a built-in ELF runner. It reads the root component manifest (from the boot image), which declares children. It resolves, starts, and routes capabilities for the root realm. From there, components start other components, and the capability graph is built dynamically.

### Weaknesses

- **Static routing complexity** — for large systems, the routing declarations become complex. Every intermediate component must explicitly route every capability.
- **Capability explosion** — with fine-grained capabilities, a component might need dozens of `use` declarations.
- **No ambient authority** is a feature, not a bug — but it means even trivial operations (reading a file) must be explicitly routed through the framework.
- **Component manager is a bottleneck** — all capability resolution goes through one process.

### What This Looks Like in a Desktop App (Flux)

Flux core = component manager. Each plugin declares in `plugin.json` what it **provides** (`feeds`, `hooks`, `methods`, `ui`) and what it **consumes** (`hooks` that it depends on). Core resolves the dependency graph at runtime.

The Fuchsia lesson: **explicit capability declarations**. Today, Flux plugins declare what they provide (hooks like `feed.video`). They should also declare what they consume. Core should refuse to start if a capability is declared but not provided by any plugin. This catches misconfiguration at boot instead of at runtime.

The most important idea: **a component doesn't know where a capability comes from**. In Flux, a plugin that calls `callHook("feed.video")` should not know whether the provider is a local subprocess, a remote server, or a built-in module. Core is the authority that resolves the capability to an implementation.

---

## 6. VS Code Extension Host Protocol

### The One Key Idea

The **workbench** (renderer process) and the **extension host** (Node.js process) communicate through a typed RPC protocol. The workbench does not import any extension code at compile time. The extension host can be **restarted independently** without closing the editor. The protocol is defined by a pair of interfaces: `MainThread*` (services the workbench exposes to extensions) and `ExtHost*` (services extensions expose to the workbench).

Source: VS Code documentation on Extension Host:
> "The Extension Host is responsible for running extensions. Depending on the configuration of VS Code, there are multiple extension hosts running, with different runtimes, at different locations."
> (https://code.visualstudio.com/api/advanced-topics/extension-host)

### The Contract

**`createProxyIdentifier<T>()`** generates a typed marker. The RPC system auto-generates proxy objects on both sides. When extension code calls `vscode.commands.executeCommand('myCmd')`, it hits a proxy. The proxy serializes the call to JSON, sends it across the process boundary (Electron IPC, MessagePort, named pipe, or WebSocket), and the main thread deserializes and dispatches it.

The protocol file is at `src/vs/workbench/api/common/extHost.protocol.ts`:
> ~60 pairs of `MainThread*` / `ExtHost*` service interfaces
> (https://github.com/microsoft/vscode/blob/main/src/vs/workbench/api/common/extHost.protocol.ts)

### Discovery

VS Code scans `~/.vscode/extensions/` for `package.json` files. Each extension declares **activation events** — conditions that tell VS Code "don't load me until this happens" (`onLanguage:python`, `onCommand:myExtension.formatCode`, `onView:myView`). Extensions are loaded **lazily** — they sit dormant (zero CPU, zero memory) until their activation event fires.

Source: VS Code API on Activation Events:
> "Extensions declare activation events in their package.json — conditions that tell VS Code 'don't load me until this happens.'"
> (https://code.visualstudio.com/api/references/activation-events)

### Boot

1. Main process starts
2. Main spawns renderer (BrowserWindow)
3. Renderer spawns extension host process
4. Extension host creates RPC protocol instance
5. Extension host sends "Ready" message
6. Renderer sends initialization data (extension list, workspace info, config)
7. Extension host builds `ExtensionsActivator` with activation event registry
8. Renderer starts firing activation events as conditions are met

### Weaknesses

- **Protocol surface area is massive** — ~60 service pairs, each with dozens of methods. The `extHost.protocol.ts` file is thousands of lines.
- **Serialization overhead** — all calls cross process boundaries. Even simple getters (like `editor.document.getText()`) become async RPC calls.
- **Type duplication** — both sides have parallel type hierarchies (`vscode.Uri` vs `URI`, `vscode.Position` vs `Position`). The RPC layer converts between them.
- **Extension host crash** — while the UI survives, all extension state is lost when the host restarts. Extensions must re-register everything.

### What This Looks Like in a Desktop App (Flux)

Flux core = workbench. Plugins = extension host. The core communicates with plugins through a **typed RPC protocol** (JSON-RPC, already in place). Plugins are loaded lazily — they are subprocesses that start on demand when a capability is first requested.

The VS Code lesson for Flux:
- **Lazy activation**: Don't start a plugin until its capability is actually needed. A feed plugin shouldn't start until the user opens the feed view. This is partially implemented (plugins are subprocesses), but Flux should add activation events (e.g., `onView:feed`, `onHook:feed.video`).
- **Crash isolation**: If a plugin process crashes, core should restart it transparently. Extension state can be lost, but the UI survives.
- **Proxy pattern**: Flux should generate proxy objects for plugin capabilities. When a plugin calls `callHook("feed.video")`, it should receive a typed proxy, not a raw `invoke()`.

---

## 7. COM / OLE (Component Object Model)

### The One Key Idea

COM defines a **binary standard** for component interoperability. Every component implements interfaces, and all interfaces inherit from `IUnknown`. A client asks an object "do you support interface X?" via `IUnknown::QueryInterface`. If the answer is yes, the object returns a pointer to that interface. If no, `E_NOINTERFACE`. No compilation needed — interfaces are identified by 128-bit GUIDs at runtime.

Source: Microsoft COM documentation:
> "IUnknown enables clients to get pointers to other interfaces on a given object through the QueryInterface method, and manage the existence of the object through the AddRef and Release methods. All other COM interfaces are inherited, directly or indirectly, from IUnknown."
> (https://learn.microsoft.com/en-us/windows/win32/api/unknwn/nn-unknwn-iunknown)

### The Contract

**Binary Interface (vtable)** — a COM interface is a pointer to a virtual function table (vtable). The first three entries are always `QueryInterface`, `AddRef`, `Release`. The rest are the interface's methods. This layout is defined at the ABI level — any language that can call through a function pointer can use COM. No shared runtime, no garbage collector, no type system compatibility required.

### Discovery

COM uses the **Windows Registry** to map CLSIDs (class identifiers) to implementations (DLL paths or EXE paths). A client calls `CoCreateInstance(CLSID_Foo)` — the COM runtime looks up `HKEY_CLASSES_ROOT\CLSID\{...}\InprocServer32` to find the DLL path, loads it, and calls `DllGetClassObject` to get a class factory. The factory creates the object and returns an `IUnknown` pointer.

For DCOM (distributed), the **Service Control Manager (SCM)** on the remote machine performs the same registry lookup and starts the server process if needed.

Source: Open Group COM Technical Overview:
> "A component called the Service Control Manager (SCM) is responsible for locating the server and running it."
> (https://pubs.opengroup.org/onlinepubs/009899899/CHP03CHP.HTM)

### Boot

COM has no central "boot" — the COM library (`ole32.dll`) is loaded into each process. When a process calls `CoInitializeEx`, the COM library sets up the local context. When `CoCreateInstance` is called, COM looks up the registry, loads the DLL or starts the EXE server, and returns the interface pointer. DLLs are loaded on demand. EXE servers are started on demand by the SCM.

### Weaknesses

- **Registry coupling** — the system registry is a global namespace. Every COM component must be registered. Unregistration must be careful. This is the classic "DLL hell" problem.
- **Reference counting** — manual `AddRef`/`Release`. A single mistake causes memory leaks or use-after-free crashes.
- **Threading model** — COM's apartment model (STA vs MTA) is complex and error-prone. Cross-apartment calls require marshaling.
- **Windows-only** — COM was designed for Windows. While DCOM has implementations on other platforms, they are not mainstream.
- **No versioning** — an interface, once published, must never change. If you need new methods, you create a new interface (IFoo2 inherits IFoo). This leads to interface proliferation.

### What This Looks Like in a Desktop App (Flux)

Flux plugins expose **interfaces** — but the interface is the set of JSON-RPC methods they handle, not a vtable. A plugin that handles `feed.video` effectively implements the `feed.video` interface.

The COM lesson for Flux:
- **QueryInterface pattern**: Flux needs a runtime mechanism for "do you support this?" — `resolve_hook` is already this. The core asks "who implements `feed.video`?" and gets a plugin name. This is Flux's QueryInterface.
- **GUIDs for stability**: Each JSON-RPC method name and parameter shape should have a stable identifier. If you change the parameter shape, change the method name (like COM's IFoo/IFoo2).
- **Binary independence**: Just as COM works across languages at the ABI level, Flux's JSON-RPC protocol works across languages at the wire level. Any language that can read/write JSON and stdin/stdout can participate.

---

## 8. Apache Camel / Enterprise Integration Patterns

### The One Key Idea

Components are **decoupled through message routing**. A Camel route is a configuration that connects endpoints — `from("file:inbox") -> transform -> to("jms:queue:out")`. No component in the route knows about any other component. They only know about **message formats**. The route configuration is the only thing that knows about the component graph.

Source: Apache Camel documentation:
> "The Message Router allows you to consume from an input destination, evaluate some predicate, then choose the right output destination."
> (https://camel.apache.org/components/4.18.x/eips/message-router.html)

### The Contract

**Messages** — a `Message` has a body (payload) and headers (metadata). The body can be any type (Java object, XML, JSON, bytes). Headers are name-value pairs. Components read headers to decide what to do, and modify headers to communicate with downstream components. The message is the universal interface.

### Discovery

Camel components are discovered through **Java's ServiceLoader** mechanism — JAR files in the classpath declare `META-INF/services/org/apache/camel/Component` files. When Camel starts, it scans the classpath for these files and registers each component by URI scheme (`file:`, `jms:`, `http:`, `direct:`, etc.). Routes are then configured using these URIs.

### Boot

CamelContext starts first. It instantiates the route builder, which wires endpoints together. Components are loaded on demand — if a route references `file:inbox`, Camel lazily loads the FileComponent. The route starts consuming messages as soon as CamelContext starts.

### Weaknesses

- **Java-centric** — Camel is a Java framework. While it can connect to non-Java systems (HTTP, JMS, files), the routing logic requires a JVM.
- **Static route configuration** — routes are typically defined at startup. Dynamic reconfiguration requires complex patterns (Dynamic Router, Routing Slip).
- **Message format coupling** — while components don't know each other, they must agree on message format. If a downstream component expects XML and upstream sends JSON, a translator component must sit between them.
- **No lifecycle management** — Camel doesn't manage component processes. If you want process isolation, you need an additional layer (e.g., running each component in a separate JVM with JMS between them).

### What This Looks Like in a Desktop App (Flux)

Flux core = CamelContext. Plugins = Camel components. Routes are configured by `hooks` in `plugin.json`. A plugin declares a hook like `feed.video`, and another plugin can call `callHook("feed.video", params)` without knowing which plugin provides it.

The Camel lesson for Flux:
- **Structured message format**: Flux should define a standard message envelope (body + headers) that all plugins use. Today, params are a raw JSON object. Add standard headers for metadata (source, timestamp, correlation ID, error info).
- **Pipeline composition**: Allow routes that chain multiple plugins — `pluginA.transform -> pluginB.filter -> pluginC.render`. Each step only knows about the message format, not the step before or after.
- **Dead letter channel**: If a plugin fails, route the failed message to an error handler instead of dropping it. This is the most important EIP for robustness.

---

## 9. Synthesis: What Flux Should Steal From Each

### Already Built Into Flux

| Idea | Source | Where Flux Has It |
|------|--------|-------------------|
| Subprocess isolation | Unix philosophy, Microkernels | Plugins run as separate processes |
| Stdin/stdout JSON-RPC | Unix philosophy, VS Code | `run: "bun ./main.ts"`, shared stdin/stdout |
| Core doesn't import plugins | VS Code, MicroProfile | Rust `lib.rs` routes by `"name.action"` prefix |
| Capability-based hook resolution | Fuchsia, COM | `resolve_hook` + `call_hook` in `lib.rs` |
| Manifests declare capabilities | COM, Fuchsia | `plugin.json` with hooks, methods, ui |
| Lazy loading (on-demand subprocess) | VS Code, MicroProfile | Subprocesses start only when needed |

### Gaps Flux Should Fill

| Idea | Source | How to Add |
|------|--------|------------|
| **Capability routing (explicit use/offer/expose)** | Fuchsia | Plugins declare what hooks they consume. Core validates the graph at boot. |
| **Introspection (list all interfaces at runtime)** | D-Bus, COM | Add an `introspect` method that returns all methods/hooks a plugin supports. |
| **Activation events (don't start until needed)** | VS Code | Add `activationEvents` to `plugin.json`. Plugin starts only when `onHook:feed.video` fires. |
| **Dead letter channel (error handling)** | Camel | If a plugin call fails, route to error handler instead of dropping. |
| **Standard message envelope (headers + body)** | Camel | Each JSON-RPC request gets standard headers (source, timestamp, correlation ID). |
| **Crash recovery (auto-restart plugins)** | VS Code, Microkernels | If plugin process exits non-zero, restart it. Notify UI. |
| **Binary interface stability (GUID per method)** | COM | Each JSON-RPC method gets a stable identifier. Breaking changes = new method name. |
| **Plugin runs anywhere (remote/codespaces)** | VS Code | Core should be able to route to a plugin running on another machine. |

### The Ultimate Architecture (For Flux 2.0)

```
┌─────────────────────────────────────────────────────┐
│                    Flux Core                         │
│  (Component Manager / Message Bus / Microkernel)     │
│                                                      │
│  - Process lifecycle (spawn, restart, kill)          │
│  - Capability routing (resolve which plugin)          │
│  - Message routing (pass messages between plugins)    │
│  - Health monitoring (watchdog, crash recovery)       │
│  - Introspection (list all capabilities)              │
│  - Dead letter channel (error handling)               │
│                                                      │
│  Dependencies: ZERO plugin code at compile time       │
│  Protocol: JSON-RPC stdin/stdout (or TCP/Unix socket) │
└──────────────────────┬──────────────────────────────┘
                       │
          ┌────────────┼────────────┐
          │            │            │
          ▼            ▼            ▼
   ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ Plugin A │ │ Plugin B │ │ Plugin C │
   │ (feed)   │ │ (auth)   │ │ (player) │
   │ Python   │ │ Rust     │ │ JS/React │
   │ subproc  │ │ subproc  │ │ IIFE WC  │
   └──────────┘ └──────────┘ └──────────┘
```

The core:
- Does NOT import any plugin code
- Does NOT know plugin types at compile time
- Does NOT share types with plugins
- Can be rewritten in any language without changing plugins
- Routes messages by capability name, not by plugin ID
- Recovers from plugin crashes transparently

This is the ur-goal: **the core is a routing engine, not an application**. The application is the sum of its plugins.
