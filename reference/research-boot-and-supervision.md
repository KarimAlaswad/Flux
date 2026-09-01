# Research: Bootstrapping, Process Supervision, and Minimal Init

**Date:** 2026-07-28
**Context:** Flux wants a 100% modular architecture where the core is as small as possible — just enough to start a Registry plugin, which then starts everything else.

---

## Table of Contents

1. [s6 / s6-rc](#1-s6--s6-rc)
2. [supervisord](#2-supervisord)
3. [systemd --user](#3-systemd---user)
4. [Docker / Container Orchestration](#4-docker--container-orchestration)
5. [Erlang/OTP Supervision Trees](#5-erlangotp-supervision-trees)
6. [Android init / init.rc](#6-android-init--initrc)
7. [launchd (macOS/iOS)](#7-launchd-macosios)
8. [Windows Service Manager (SCM)](#8-windows-service-manager-scm)
9. [Cross-Cutting Analysis](#9-cross-cutting-analysis)
10. [Flux-Specific Recommendation](#10-flux-specific-recommendation)
11. [Sources](#11-sources)

---

## 1. s6 / s6-rc

### What boots first?

`s6-svscan` is the root of the supervision tree. It can run as PID 1 (with help from `s6-linux-init`) or as a regular process under another init. It scans a **scan directory** (`/service` or similar) containing symlinks to service directories, and for each one it spawns an `s6-supervise` process.

Source: https://skarnet.org/software/s6/overview.html

> "s6-svscan is, in a manner of speaking, a supervisor for the supervisors. It watches and maintains a collection of s6-supervise processes: it is the branch of the supervision tree that all supervisors are stemming from."

### How does it discover what to start?

The **scan directory** is a directory containing symbolic links to **service directories**. Each service directory (`./run` script) defines one long-lived process. `s6-svscan` watches this directory — when a new symlink appears, it spawns a new `s6-supervise` for it. When a symlink is removed, it kills the supervisor.

Source: https://skarnet.org/software/s6/servicedir.html

> "The place to gather all service directories to be watched by a s6-svscan instance is called a scan directory."

### Dependencies between services

`s6` itself does NOT handle dependencies. That's the job of `s6-rc` (the service manager). s6 provides lower-level tools for readiness notification:
- `s6-svwait` — blocks until a service is up, ready, or down
- Notification mechanism: when a daemon is ready it writes a newline to a file descriptor; `s6-supervise` picks this up and broadcasts readiness

Source: https://skarnet.org/software/s6-rc/overview.html

> "s6 does not provide a complete dependency management framework... That functionality belongs to a service manager, and is implemented for instance in the s6-rc package."

`s6-rc` introduces three service types:
- **longrun** — a supervised long-lived process (the daemon itself)
- **oneshot** — a script that runs to completion (e.g., mount a filesystem)
- **bundle** — a named collection of atomic services

Dependencies between services are declared in source files; `s6-rc-compile` bakes them into a compiled database. At runtime, `s6-rc change` brings services up in the correct order, respecting the dependency graph.

### What happens when a service crashes?

`s6-supervise` is the direct parent of each daemon. When the daemon dies:
1. `s6-supervise` detects the death immediately (it gets SIGCHLD)
2. It runs `./finish` (if present) for cleanup
3. It restarts `./run` automatically

If `./finish` exits with code 125, the service is marked as permanently failed and NOT restarted (like `s6-svc -O`).

Source: https://skarnet.org/software/s6/servicedir.html (finish script section)

> "If the finish script exits 125, then s6-supervise interprets this as a permanent failure for the service, and does not restart it."

### Can services be added/removed without restarting the supervisor?

Yes. The scan directory is live. Adding a symlink causes `s6-svscan` to notice and spawn a new supervisor. Removing one causes it to kill the supervisor. You can also use `s6-svscanctl` to send commands to the scanner.

Source: https://skarnet.org/software/s6/overview.html

> "Alternatively, you can start s6-svscan on an empty scan directory, then populate it step by step and send an update command to s6-svscan via s6-svscanctl whenever the supervision tree should pick up the differences."

### The "init" process / PID 1

`s6-svscan` can be PID 1 with the help of `s6-linux-init`. When it's PID 1, it handles:
- Signal reaping (SIGCHLD from orphans)
- Catch-all logging for services without dedicated loggers
- Shutdown coordination via `s6-svscanctl`

Source: https://skarnet.org/software/s6/s6-svscan-1.html

---

## 2. supervisord

### What boots first?

`supervisord` is the daemon that starts first. It reads a config file (INI-style, typically `/etc/supervisord.conf`). It can be started at boot by any init system, or manually.

Source: https://supervisord.readthedocs.io/en/latest/introduction.html

> "The server piece of supervisor is named supervisord. It is responsible for starting child programs at its own invocation, responding to commands from clients, restarting crashed or exited subprocesseses."

### How does it discover what to start?

Configuration file with `[program:x]` sections. Each defines a command, autostart flag, autorestart policy, etc. There are also `[group:x]` sections for grouping programs, and `[include]` for splitting config across files.

Source: https://supervisord.readthedocs.io/en/latest/configuration.html

### Dependencies between services

Supervisord supports a **priority** value (lower = starts first, shuts down last). There's no built-in dependency graph like s6-rc or systemd. You can group programs with `[group:x]` and use `startsecs`/`startretries` for basic startup checks.

Source: https://supervisord.readthedocs.io/en/latest/configuration.html#program-x-section-values

> "The relative priority of the program in the start and shutdown ordering. Lower priorities indicate programs that start first and shut down last."

### What happens when a service crashes?

Configurable via `autorestart` (true/false/unexpected) and `exitcodes`:
- `autorestart=true` — always restart
- `autorestart=unexpected` — restart only on unexpected exit codes
- `autorestart=false` — never restart

Additionally, `startsecs` controls how long the process must stay running to count as "started", and `startretries` limits retry attempts before giving up (FATAL state).

Source: https://supervisord.readthedocs.io/en/latest/configuration.html#program-x-section-values

### Can services be added/removed without restarting the supervisor?

Yes. `supervisorctl` can `add` and `remove` programs (via the XML-RPC interface) after `supervisord` is running, as long as they're defined in config files that have been included. However, adding entirely new `[program:x]` sections requires a reread (`supervisorctl reread` then `supervisorctl update`).

### The "init" process

`supervisord` runs as a regular user process (not PID 1). It calls `fork/exec` for child processes and receives SIGCHLD immediately when they die. It does NOT handle orphan reaping or other PID 1 duties.

---

## 3. systemd --user

### What boots first?

The **system manager** (PID 1) starts first. Per-user instances are started by `pam_systemd` when the user logs in, as `user@UID.service`. The user instance is then responsible for that user's units.

Source: https://wiki.archlinux.org/title/Systemd/User

> "As per default configuration in `/etc/pam.d/system-login`, the `pam_systemd` module automatically launches a `systemd --user` instance when the user logs in for the first time."

Source for `user@.service`: https://www.freedesktop.org/software/systemd/man/latest/user@.service.html

> "The systemd(1) system manager (PID 1) starts user manager instances as user@UID.service."

### How does it discover what to start?

User units live in (in order of precedence):
- `~/.config/systemd/user/`
- `/etc/systemd/user/`
- `/usr/lib/systemd/user/`

The user instance brings up `default.target`, which pulls in all enabled units via `WantedBy=default.target`.

Source: https://wiki.archlinux.org/title/Systemd/User

### Dependencies between services

systemd has rich dependency types:
- `Requires=` — hard dependency; if this fails, the dependent unit also fails
- `Wants=` — soft dependency; won't fail if unmet
- `After=` / `Before=` — ordering only (no dependency implied)
- `BindsTo=` — stronger than Requires; if the bound unit stops, this one stops too
- `Conflicts=` — cannot run at the same time

Source: https://systemd.io/ARCHITECTURE

> "The Service Manager takes configuration in the form of unit files, credentials, kernel command line options and D-Bus commands, and based on those manages the system and spawns other processes."

### What happens when a service crashes?

Configured via `Restart=` directive in the `[Service]` section:
- `no` (default) — never restart
- `on-success` — restart only on clean exit code (0)
- `on-failure` — restart on non-zero exit or signal
- `on-abnormal` — restart on signal, timeout, or watchdog
- `on-watchdog` — restart on watchdog timeout
- `on-abort` — restart only on uncaught signal
- `always` — always restart

Combined with `RestartSec=` for delay between restarts and `StartLimitInterval=` / `StartLimitBurst=` for rate limiting.

Source: https://www.freedesktop.org/software/systemd/man/latest/systemd.service.html

### Can services be added/removed without restarting the supervisor?

Yes. `systemctl --user daemon-reload` picks up new/edited unit files. `systemctl --user enable --now` adds and starts a service. No need to restart the user manager.

### The "init" process

In system mode, PID 1 is systemd itself. In user mode, the user instance runs as a child process of the system manager. It handles signal delivery, cgroup management, and logging for its user's services.

---

## 4. Docker / Container Orchestration

### ENTRYPOINT and CMD (what boots first in a container)

The container's first process is determined by `ENTRYPOINT` + `CMD`:
- `ENTRYPOINT ["executable", "param"]` + `CMD ["more", "params"]` → runs executable with params as PID 1
- `ENTRYPOINT` with shell form → wraps in `/bin/sh -c`, shell becomes PID 1

Key signal-handling insight: when the container's PID 1 doesn't handle SIGTERM (or is a shell that doesn't forward signals), `docker stop` has to wait 10 seconds then SIGKILL. This is the "PID 1 problem" in containers.

Source: https://docs.docker.com/reference/dockerfile/#entrypoint

> "If you would like your container to run the same executable every time, then you should consider using ENTRYPOINT in combination with CMD."

Solutions include `docker run --init` (uses `tini` as a lightweight init) or including `tini` directly in the image.

Source: https://devopsdirective.com/posts/2023/06/container-init-process/

### Docker Compose `depends_on`

Two syntaxes:
- **Short**: `depends_on: - db` — ensures db is started before, but doesn't wait for it to be ready
- **Long**: `depends_on: db: condition: service_healthy` — waits for healthcheck to pass

Source: https://docs.docker.com/compose/compose-file/05-services/#depends_on

### Kubernetes Init Containers

Init containers run **before** app containers, **sequentially**, each must complete successfully. If an init container fails:
- With `restartPolicy: Always` or `OnFailure` → kubelet restarts the init container
- With `restartPolicy: Never` → pod is marked as Failed

After all init containers succeed, all app containers start in parallel.

Source: https://kubernetes.io/docs/concepts/workloads/pods/init-containers/

> "Each init container must complete successfully before the next one starts."

This is Kubernetes' answer to "bootstrapping" — the init container pattern lets you sequence startup without coupling the main application to its initialization logic.

### Comparison: Init vs Sidecar

| Feature | Init Container | Sidecar Container |
|---------|--------------|-------------------|
| Runs during | Pod initialization only | Alongside main container |
| Restart | Restarts from first init on failure | Restarts independently |
| Lifetime | Completes then exits | Runs for pod's lifetime |
| Use case | DB migration, config download, wait-for | Log shipper, proxy, mesh sidecar |

Since Kubernetes 1.29, you can declare sidecars with `restartPolicy: Always` in `initContainers[]`.

Source: https://kubernetes.io/docs/concepts/workloads/pods/init-containers/

---

## 5. Erlang/OTP Supervision Trees

### The "Let It Crash" philosophy

The core idea: don't write defensive error-handling code inside your processes. Instead, let the process crash and rely on a **supervisor** to restart it. This keeps business logic clean and moves recovery responsibility to a dedicated hierarchy.

Source: https://www.erlang.org/doc/design_principles/sup_princ.html

> "A supervisor is responsible for starting, stopping, and monitoring its child processes. The basic idea of a supervisor is that it must keep its children alive by restarting them when necessary."

### Supervision tree

A tree where:
- **Supervisors** only supervise children (they never do "work")
- **Workers** only do work (they never supervise)
- Any node can be a supervisor or worker

The root supervisor is started by the application callback `start/2`.

### Restart strategies

From the Erlang docs (https://www.erlang.org/doc/apps/stdlib/supervisor.html):

- **one_for_one** — If a child dies, only that child is restarted. Independent workers.
- **one_for_all** — If a child dies, ALL children are killed and restarted. Tightly coupled group.
- **rest_for_one** — If a child dies, that child AND all children started after it are terminated, then restarted in order. Dependency chain.
- **simple_one_for_one** — Dynamic children all of the same type (e.g., connection handlers).

### Restart intensity

```erlang
{ok, {{one_for_one, 5, 10}, [ChildSpecs]}}.
```

If more than **5** restarts happen within **10 seconds**, the supervisor gives up and crashes itself (propagating failure up the tree). This prevents infinite restart loops.

### Child types

- **permanent** — always restarted, regardless of exit reason
- **transient** — only restarted if the exit reason is not `:normal`
- **temporary** — never restarted (even if `:normal` exit)

Source: https://www.erlang.org/doc/apps/stdlib/supervisor.html

### What this means for Flux

Erlang's tree is the most refined expression of "start as little as possible, let the supervisor handle everything else." The pattern maps directly to Flux:
- Root supervisor (the shell script / bootstrap process) starts the Registry
- Registry loads manifests, then acts like a "bundle supervisor" — it starts each plugin as a child
- If a plugin crashes, the Registry (or a supervisor layer) restarts it
- If the Registry crashes... the shell script restarts it (or the OS does)

---

## 6. Android init / init.rc

### What boots first?

Android's `init` is PID 1, compiled from `system/core/init/`. It runs as the first userspace process after the kernel boots. There is no "shell script" — init is a C program that parses `.rc` files.

Source: https://android.googlesource.com/platform/system/core/+/refs/heads/main/init/README.md

> "Init is the first userspace process started by the kernel (PID 1). It is responsible for starting and managing system services."

### How does it discover what to start?

`.rc` files define **actions** and **services**. Actions are triggered by events (triggers). Services are daemons that init manages.

```
service ueventd /sbin/ueventd
    class core
    critical
    seclabel u:r:ueventd:s0
```

Services can belong to **classes** (`core`, `main`, `late_start`). Class commands control groups:

```
class_start core       # starts all services in "core" class
class_start main       # starts all services in "main"
class_start late_start # starts all "late_start" services
```

### Trigger sequence (boot ordering)

Init uses a fixed trigger sequence (from https://android.googlesource.com/platform/system/core/+/refs/heads/main/init/README.md):

1. `early-init` — first, before ueventd coldboot
2. `init` — after coldboot
3. `late-init` — triggers sub-triggers:
   - `early-fs` → `fs` → `post-fs` → `late-fs` → `post-fs-data`
   - `zygote-start` → `early-boot` → `boot`

In `init.rc`, `on boot` typically triggers `class_start core` and `class_start main`.

Source: https://android.googlesource.com/platform/system/core/+/refs/heads/main/init/README.md

### Dependencies

Android init does NOT have explicit dependency declarations. Instead it uses:
1. **Trigger ordering** — actions are queued and executed in parse order within each trigger
2. **Service classes** — `core` starts first, then `main`, then `late_start`
3. **Property triggers** — `on property:sys.something=ready` blocks until a property is set

There are "critical" services (like `ueventd`, `servicemanager`) — if they die, init reboots the system.

### What happens when a service crashes?

Default behavior: init restarts the service. Options:
- `oneshot` — do NOT restart (run once and done)
- `disabled` — do NOT start automatically at boot
- `critical` — if it dies, restart; if it dies too many times, reboot

From https://android.googlesource.com/platform/system/core/+/refs/heads/main/init/README.md: "`restart_period <seconds>` — If a non-oneshot service exits, it will be restarted at its start time plus this period. It defaults to 5s to rate limit crashing services."

### Can services be added/removed without restarting init?

In production Android, no — `.rc` files are parsed at boot time. However, properties can trigger actions dynamically (`on property:sys.powerctl=*`), and services can be started/stopped at runtime via `start <name>` and `stop <name>` commands.

### The "init" process

Android's init combines PID 1 duties (signal reaping, zombie cleanup) with service management and property system. It never dies. Special responsibilities:
- `ueventd` (device node creation via uevent)
- Property service (system-wide key-value store)
- Service restart supervision
- `setprop` / `getprop` global state

---

## 7. launchd (macOS/iOS)

### What boots first?

`launchd` is PID 1 on macOS/iOS. After the kernel boots, `launchd` finishes system initialization.

Source: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/Introduction.html

> "After the system is booted and the kernel is running, launchd is run to finish the system initialization."

### How does it discover what to start?

Property list (`.plist`) files in standard directories:
- **LaunchDaemons**: `/System/Library/LaunchDaemons/`, `/Library/LaunchDaemons/` — system-wide, run whether a user is logged in or not
- **LaunchAgents**: `/System/Library/LaunchAgents/`, `/Library/LaunchAgents/`, `~/Library/LaunchAgents/` — per-user, run when that user is logged in

Source: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html

### Dependencies

launchd rejects explicit dependency ordering. Instead it uses **on-demand launching** based on socket/file descriptor registration. launchd registers ALL sockets and file descriptors first, then starts services. If a connection arrives for a service that isn't running, launchd starts it on-demand.

Source: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html

> "Because launchd registers the sockets and file descriptors used by all daemons before it launches any of them, daemons can be launched in any order."

### What happens when a service crashes?

Controlled by the `KeepAlive` key:
- `KeepAlive <true/>` — always keep running, restart on crash
- `KeepAlive <false/>` — launch on-demand only (default)
- `KeepAlive <dict><key>SuccessfulExit</key><false/></dict>` — restart only if crashed (not if exited normally)

Source: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html

> "If your daemon shuts down too quickly after being launched, launchd may think it has crashed. Daemons that continue this behavior may be suspended and not launched again when future requests arrive. To avoid this behavior, do not shut down for at least 10 seconds after launch."

### Other event triggers

- `WatchPaths` — start the job when watched paths change
- `QueueDirectories` — start the job when a directory is non-empty
- `StartInterval` — run on a timer
- `StartOnMount` — start when a new filesystem is mounted

### Can services be added/removed without restarting launchd?

Yes. Use `launchctl load /path/to/plist` and `launchctl unload`. launchd reads the plist and adds/removes it from its configuration without restarting.

### The "init" process

launchd as PID 1:
1. Loads all LaunchDaemon plists
2. Registers sockets and FDs
3. Launches KeepAlive daemons
4. Listens for connections (on-demand launch)

For per-user: when user logs in, a per-user launchd instance starts and follows the same pattern with LaunchAgent plists.

---

## 8. Windows Service Manager (SCM)

### What boots first?

The **Service Control Manager (SCM)** is started at system boot (part of `services.exe`). It is an RPC server that maintains the database of installed services.

Source: https://learn.microsoft.com/en-us/windows/win32/services/service-control-manager

> "The service control manager (SCM) is started at system boot. It's a remote procedure call (RPC) server, so that service configuration and service control programs can manipulate services on remote machines."

### How does it discover what to start?

Registry-based database of installed services at `HKLM\SYSTEM\CurrentControlSet\Services\<ServiceName>`. Each service entry defines:
- `ImagePath` — executable path
- `Start` — boot, system, auto, demand, disabled, or delayed-start
- `Dependencies` — service names that must start first
- `ErrorControl` — what to do if the service fails to load (ignore/normal/severe/critical)

Source: https://learn.microsoft.com/en-us/windows/win32/services/service-control-manager

### Dependencies

Explicit dependency declarations. When the SCM starts a service, it first starts all services listed in its `Dependencies` registry value. If a dependency fails to start, the dependent service also fails (Error 1068).

Source: https://learn.microsoft.com/en-us/windows/win32/services/service-control-manager

### What happens when a service crashes?

Configured via **Recovery** tab (in service properties) or `sc failure` command:
- **First failure** / **Second failure** / **Subsequent failures** actions: `restart`, `run` (program), `reboot`
- **Reset fail count after** — time before the failure counter resets
- **Restart service after** — delay before restart action

Source: https://learn.microsoft.com/en-us/windows/win32/rstmgr/guidelines-for-services

> "Critical services should use the following recovery settings to specify that the service be restarted one minute after the first failure to restart the service, restarted two minutes after the second failure, and that the computer be restarted one minute after the third failure."

### Can services be added/removed without restarting the SCM?

Yes. `sc create`, `sc delete`, `sc config` all work at runtime. The SCM reads from the registry each time.

### The "init" process

The SCM is NOT PID 1. On Windows:
- `ntoskrnl.exe` is the kernel (not a process in the traditional sense)
- `System` process is PID 4 (kernel-mode)
- `smss.exe` (Session Manager) starts the kernel-mode and user-mode subsystems
- `csrss.exe` (Client/Server Runtime Subsystem) and `wininit.exe` start
- `wininit.exe` starts `services.exe` (which includes the SCM) and `lsass.exe`
- PID 1 in the usual sense doesn't exist on Windows the way it does on Unix

SCM is a component within `services.exe`, which is one of the critical system processes.

---

## 9. Cross-Cutting Analysis

### 9.1 The Init Process: What PID 1 Does

Every Unix init system (and every container) has a PID 1. Its special duties:

| Duty | Description | Relevant for Flux? |
|------|-------------|-------------------|
| Signal reaping | Orphaned child processes become zombies unless PID 1 calls `wait()` on them | Yes — plugin subprocesses could orphan |
| Signal forwarding | PID 1 must forward SIGTERM/SIGINT to child processes | Yes — clean shutdown |
| Service restart | Restart crashed services | Yes — core requirement |
| Logging | Collect and route stdout/stderr from services | Nice-to-have |

Source: https://devopsdirective.com/posts/2023/06/container-init-process/

### 9.2 Discovery Mechanisms Compared

| System | How it finds what to start | Dynamic add? |
|--------|--------------------------|-------------|
| s6 | Scan directory (symlinks to service dirs) | Yes — add symlink |
| s6-rc | Compiled database from source definitions | Yes — `s6-rc-update` |
| supervisord | INI config file, `[program:x]` sections | Yes — reread + update |
| systemd | Unit files on disk | Yes — daemon-reload |
| launchd | Plist files in LaunchDaemons/LaunchAgents dirs | Yes — launchctl load |
| Android init | .rc files (compiled C parser) | No — parsed at boot only |
| Windows SCM | Registry database | Yes — sc create/delete |
| Docker | Dockerfile ENTRYPOINT+CMD | Per image build |
| Kubernetes | Pod spec initContainers + containers | Per deployment |

### 9.3 Dependency Models Compared

| System | Model | Explicit or Implicit? |
|--------|-------|----------------------|
| s6-rc | Graph with dep declarations | Explicit |
| supervisord | Priority numbers only | Implicit (ordering) |
| systemd | `Requires=` / `Wants=` / `After=` | Explicit |
| Docker Compose | `depends_on` with healthcheck | Explicit |
| Kubernetes | Init containers (sequential) + health probes | Explicit per-pod |
| launchd | Socket-based on-demand | Implicit (no deps needed) |
| Android init | Trigger ordering + service classes | Implicit (timing) |
| Windows SCM | Dependencies registry value | Explicit |
| Erlang/OTP | Supervisor tree + child specs | Explicit |

### 9.4 Crash Recovery Compared

| System | Restart on crash? | Rate limiting? | Permanent failure? |
|--------|-----------------|----------------|-------------------|
| s6 | Yes (automatic) | Through finish script | finish exit 125 |
| supervisord | Configurable (true/false/unexpected) | `startsecs` + `startretries` | FATAL state |
| systemd | Configurable (no/on-failure/always etc.) | `StartLimitBurst` / `StartLimitInterval` | failed state |
| launchd | Via `KeepAlive` | 10s minimum (throttling) | Suspended if too fast |
| Android init | Yes (default) | `restart_period` (default 5s) | `critical` → reboot |
| Windows SCM | Via Recovery tab actions | Configurable delays | After N failures, take different action |
| Erlang/OTP | Per child spec (permanent/transient/temporary) | MaxR/MaxT intensity check | Supervisor gives up → propagates up |

---

## 10. Flux-Specific Recommendation

### The Core Question

> If Flux has a 10-line shell script as its boot process that starts a Registry plugin, is that enough? Or does it need a full supervisor for production?

### Answer: The shell script is NOT enough for production. But you don't need systemd-level complexity either.

**Why the shell script isn't enough:**

1. **No crash recovery.** If the Registry plugin crashes, the shell script exits. The Tauri app has no way to know the plugin is dead (unless the Rust host polls it). The user sees a broken app with no auto-recovery.

2. **No signal handling.** A shell script as PID 1 does not forward SIGTERM to its children. When the Tauri window closes, the Rust host sends a shutdown signal; the shell ignores it, plugins become orphans, and `bun` processes linger.

3. **No zombie reaping.** If any plugin spawns sub-processes that die, they become zombies until the shell (or the Tauri host, which is PID 1 in the Tauri context) reaps them. A simple shell does not do this unless it `wait`s.

4. **No restart limits.** A plugin that crashes immediately on start will be restarted by a naive `while true; do ...; done` loop infinitely, eating 100% CPU.

### What Flux actually needs

Looking at the landscape, the pragmatic answer sits between two extremes:

| Too much | Just right | Too little |
|----------|-----------|------------|
| systemd --user (900+ deps, D-Bus, cgroups) | **s6** or **supervisord** embedded | Shell script `while true` |

**For a desktop app, the simplest thing that works is `s6-rc` embedded in the Tauri process.** Here's why:

1. **Minimal core**: s6's `s6-svscan` + `s6-supervise` are a few hundred KB of C code. Binary size is trivial.

2. **No root needed**: Runs as a regular user. No cgroups, no D-Bus, no polkit.

3. **No external dependencies**: Unlike systemd (which needs D-Bus, udev, etc.) and supervisord (which needs Python), s6 is statically linkable C.

4. **Live service management**: The scan directory approach means the Registry can add/remove plugin service directories at runtime by creating/deleting symlinks. Zero-configuration hot-add.

5. **Auto-restart with rate limiting**: `s6-supervise` handles restart with `./finish` exit code 125 for permanent failure. No infinite loops.

6. **Per-service logging**: s6's pipe-based logger mechanism (`./log/run`) gives each plugin its own log rotation without any configuration.

7. **Readiness notification**: s6 has built-in readiness protocol (`notification-fd`), so the Registry can wait until a plugin signals "I'm ready" before proceeding.

### The recommended architecture

```
Tauri App (Rust)
  │
  ├── PID 1 housekeeping (tokio handles signals, reaps orphans)
  │
  └── s6-svscan (supervision tree root)
        │
        ├── s6-supervise → Registry plugin (./run)
        │     │
        │     ├── s6-supervise → yt-feed plugin
        │     ├── s6-supervise → yt-search plugin
        │     └── s6-supervise → peertube plugin
        │
        └── [catch-all logger via s6-log]
```

The Tauri Rust host (`lib.rs`) runs `s6-svscan` on a tmpfs scan directory. The Registry plugin writes service directories for each discovered plugin into that scan directory. `s6-svscan` picks them up automatically.

### If Python is already available: supervisord

If you don't mind the Python dependency, supervisord is simpler to configure (INI file, documented everywhere). It's the most common choice for "I just want to keep my processes running" in desktop/server contexts. But it's heavier than s6 and doesn't handle PID 1 duties.

### Summary comparison: s6 vs supervisord for Flux

| Criterion | s6 | supervisord |
|-----------|-----|-------------|
| Language | C (static binary) | Python |
| Binary size | ~100KB | ~2MB + Python runtime (~20MB) |
| PID 1 capable | Yes (with s6-linux-init) | No |
| Live service add | Symlink to scan dir | supervisorctl reread/update |
| Per-service logging | Built-in (pipe to logger) | Built-in (logfile config) |
| Signal forwarding | Via s6-svc | Via stopsignal config |
| Crash rate limiting | finish exit 125 pattern | startsecs + startretries |
| Windows support | No | No |
| Dependency management | s6-rc (separate package) | Manual (priority only) |
| Readiness notification | Native (notification-fd) | Manual (via events) |

### Verdict

**Use s6.** It's the smallest, most elegant, and most production-proven of the minimalist supervision suites. For a desktop app that wants 100% modular architecture, s6 maps perfectly:
- The scan directory IS your plugin registry at the process level
- The supervision tree IS your dependency graph
- Service directories ARE your plugin manifests rendered into runnable form

The "10-line shell script" can be replaced by a ~20-line s6 service directory for the Registry plugin, with the supervision tree compiled into the Tauri binary. No shell needed at all.

---

## 11. Sources

1. s6 overview: https://skarnet.org/software/s6/overview.html
2. s6 service directories: https://skarnet.org/software/s6/servicedir.html
3. s6-rc overview: https://skarnet.org/software/s6-rc/overview.html
4. s6-svscan as PID 1: https://skarnet.org/software/s6/s6-svscan-1.html
5. supervisord introduction: https://supervisord.readthedocs.io/en/latest/introduction.html
6. supervisord configuration: https://supervisord.readthedocs.io/en/latest/configuration.html
7. systemd architecture: https://systemd.io/ARCHITECTURE
8. systemd user units (ArchWiki): https://wiki.archlinux.org/title/Systemd/User
9. user@.service: https://www.freedesktop.org/software/systemd/man/latest/user@.service.html
10. Dockerfile ENTRYPOINT: https://docs.docker.com/reference/dockerfile/#entrypoint
11. Compose depends_on: https://docs.docker.com/compose/compose-file/05-services/#depends_on
12. Kubernetes init containers: https://kubernetes.io/docs/concepts/workloads/pods/init-containers/
13. Erlang OTP supervision principles: https://www.erlang.org/doc/design_principles/sup_princ.html
14. Erlang supervisor docs: https://www.erlang.org/doc/apps/stdlib/supervisor.html
15. Android init README: https://android.googlesource.com/platform/system/core/+/refs/heads/main/init/README.md
16. launchd daemons and services: https://developer.apple.com/library/archive/documentation/MacOSX/Conceptual/BPSystemStartup/Chapters/CreatingLaunchdJobs.html
17. Windows SCM: https://learn.microsoft.com/en-us/windows/win32/services/service-control-manager
18. Windows service recovery guidelines: https://learn.microsoft.com/en-us/windows/win32/rstmgr/guidelines-for-services
19. Container init process: https://devopsdirective.com/posts/2023/06/container-init-process/
