# Plugin-Defined Extension Points — Research

**Goal:** Understand how software systems allow ANY plugin to define new extension points that OTHER plugins can implement — not just the core.

---

## 1. Drupal Hook Discovery

**Source:** <https://www.drupal.org/docs/develop/creating-modules/understanding-hooks>

### How it works

In Drupal, a module invokes all implementations of a hook by calling something like `\Drupal::moduleHandler()->invokeAll('help')`. The module handler scans all enabled modules for functions matching the pattern `{module_name}_help(...)`. The `hook_` prefix in documentation is replaced with the module's machine name by convention.

In Drupal 11.1+, hooks can also be implemented via PHP 8 attributes (`#[Hook('help')]`) on class methods in the module's `Hook` namespace. The `HookCollectorPass` scans PHP files recursively using reflection.

### What "any plugin can define new extension points" means

Any module can call `moduleHandler->invokeAll('my_custom_hook')` with a name it invents. It doesn't need permission, registration, or central approval. If no other module implements it, nothing happens — no error. If another module creates a function named `{their_module}_my_custom_hook()`, they get called. This is the purest "define at will" model.

### Collision avoidance

- Module machine names must be unique on a site (validated at install time).
- Hook function names include the module name, so they're namespaced by module.
- Documentation is provided in `*.api.php` files — these files define `hook_help()` as a documentation prototype, but the actual functions never execute. They're parsed for API docs only.

### Unused hook behavior

`moduleHandler->invokeAll('nonexistent_hook')` returns an empty array. No error. No warning. The calling module can check `count()` on the return to decide what to do.

### Flux example

```typescript
// A third-party plugin "yt-captions" defines a new hook:
// In its main.ts, it calls:
const results = await pluginHost.invokeAll('yt_captions_translate', {
  text: 'Hello',
  sourceLang: 'en',
  targetLang: 'es',
});
// If no plugin implements it, results = [].

// Another plugin "yt-captions-google" implements it by registering:
pluginHost.registerHook('yt_captions_translate', async (params) => {
  return callGoogleTranslate(params);
});
```

---

## 2. WordPress Actions & Filters

**Source:** <https://developer.wordpress.org/reference/functions/do_action/>
**Source:** <https://developer.wordpress.org/plugins/hooks/actions/>
**Source:** <https://github.com/WordPress/wordpress-develop/blob/7.0/src/wp-includes/plugin.php>

### How it works

`do_action('myplugin_myaction', $arg1, $arg2)` creates a hook at call time. PHP's `...$arg` splat operator passes all extra arguments to every registered callback. `add_action('myplugin_myaction', 'callback_func', $priority, $accepted_args)` registers a listener. WordPress stores these in the global `$wp_filter` array (an array of `WP_Hook` objects since WP 4.7).

Internally, the `WP_Hook` class stores callbacks in a priority-sorted map: `callbacks[priority][] = {function, accepted_args}`. When `do_action` fires, it iterates priority levels in order, then callbacks within each level in insertion order.

### What "any plugin can define new extension points" means

Any plugin can call `do_action('myplugin_new_event', $data)`. That's it — no registration, no central store. The string name is the extension point. Another plugin can `add_action('myplugin_new_event', 'my_callback')` to intercept it. There is zero validation that the hook string is known or that the callback signature matches.

### Collision avoidance (or lack thereof)

- **No formal namespacing.** Convention is to prefix with plugin name: `do_action('myplugin_myaction')`. But nothing enforces it.
- **Collisions are silent.** If two plugins use `do_action('save_data')`, they share the same hook space unintentionally. Callbacks for one fire for the other.
- **No argument validation.** If `do_action('my_hook', $user_id, $post_id)` passes 2 args but the callback expects 3, PHP just passes `null` for the missing arg. No error.

### What breaks at scale

- **Typo bugs.** A typo in the hook string creates a new hook silently — callbacks never fire, no error.
- **Namespace pollution.** Thousands of hooks on a large site (common hooks like `init` can have 100+ callbacks). Debugging becomes hard.
- **Performance.** Iterating hundreds of callbacks per hook on every request. WP 4.7's `WP_Hook` class improved this by tracking nesting levels and prioritizing iterators.
- **Recursion bugs.** Pre-4.7, if a callback called `do_action` on the same hook, the internal `next()` array pointer got corrupted, skipping later callbacks. Fixed by `$nesting_level` tracking in `WP_Hook`.

### Flux example

```typescript
// Plugin "yt-captions" defines an action:
pluginHost.doAction('yt_captions:before_translate', { text, lang });

// Plugin "yt-captions-audit" listens:
pluginHost.addAction('yt_captions:before_translate', (event) => {
  logToFile(`Translate: ${event.text} -> ${event.lang}`);
});

// If no one listens, doAction returns immediately. No error.
```

---

## 3. Linux Kernel Device Driver Model

**Source:** <https://docs.kernel.org/core-api/kobject.html>
**Source:** <https://docs.kernel.org/driver-api/driver-model/bus.html>
**Source:** <https://docs.kernel.org/driver-api/driver-model/driver.html>
**Source:** <https://docs.kernel.org/driver-api/driver-model/binding.html>

### How it works

The kernel maintains a global set of registered `bus_type` objects. Each bus (PCI, USB, platform, etc.) is a `struct bus_type` with:
- A name
- A `match()` callback (bus-specific device/driver matching logic)
- Linked lists of devices and drivers

When you write an out-of-tree driver, you call `driver_register(&my_driver)` which:
1. Inserts the driver into the bus's driver list
2. Iterates the bus's device list, calling `bus->match()` for each unclaimed device
3. If matched, calls `driver->probe()` to initialize

Bus types themselves can be registered at runtime via `bus_register()`. A new bus can be defined by any kernel module (e.g., a virtual bus for FPGA devices).

### What "any plugin can define new extension points" means

A kernel module can define a NEW bus type (`struct bus_type my_bus_type = { ... }; bus_register(&my_bus_type)`). This creates a new category of devices. Other modules can then register drivers on this bus, and devices on this bus, completely independently. The core doesn't need to know about the bus ahead of time.

### How discovery works

- Bus types are registered into a global linked list.
- When a device is registered, the bus iterates its driver list and calls `match()`.
- When a driver is registered, the bus iterates its device list and calls `match()`.
- sysfs exports the hierarchy: `/sys/bus/<bus_name>/devices/` and `/sys/bus/<bus_name>/drivers/`.

### Missing extension point behavior

If a driver registers on a bus that doesn't exist yet — or a device registers on a bus not yet registered — the kernel simply stores it in a deferred list. No crash. When the bus_type is later registered, deferred devices and drivers get matched.

### Collision avoidance

- Bus names are strings; `bus_register()` returns `-EEXIST` if the name conflicts.
- Driver names are unique per bus (validated by `driver_register()`).
- Type safety: `struct device` embeds a `struct kobject`, and `container_of()` macros cast between generic and bus-specific types safely.

### Flux example

```typescript
// Plugin "movi-player" defines a new "slot" bus type (conceptually):
host.registerBusType('slot.video.player', {
  match: (provider, consumer) => provider.provides === consumer.needs,
});

// Plugin "plugin-A" registers as a slot provider:
host.registerProvider('slot.video.player', {
  provides: 'video/mp4',
  createPlayer: () => new Mp4Player(),
});

// Plugin "plugin-B" discovers available providers:
const providers = host.resolveSlot('slot.video.player', { needs: 'video/mp4' });
```

---

## 4. NixOS / Nix Module System

**Source:** <https://wiki.nixos.org/wiki/NixOS:Modules>
**Source:** <https://ryantm.github.io/nixpkgs/functions/library/options/>
**Source:** <https://github.com/NixOS/nixpkgs/blob/master/lib/options.nix>

### How it works

A NixOS module is a Nix file that returns a set with `options` (declarations) and `config` (definitions):

```nix
{ lib, config, ... }: {
  options.services.hello = {
    enable = lib.mkOption { type = lib.types.bool; default = false; };
    greeter = lib.mkOption { type = lib.types.str; default = "world"; };
  };
  config = lib.mkIf config.services.hello.enable {
    systemd.services.hello = { ... };
  };
}
```

The module system:
1. Recursively collects all modules via `imports`.
2. Merges all `options` declarations. If two modules declare the same option at the same attribute path, the types must be compatible (or extensible via `enum` extension).
3. Collects all `config` definitions and merges them using type-specific merge functions (lists concatenate, attrsets union, booleans OR, strings concat, etc.).
4. Evaluates lazily — only options you read get evaluated.

### What "any plugin can define new extension points" means

Any module can introduce a new option under any namespace: `options.mypackage.mySetting = mkOption { ... }`. Other modules can then set `config.mypackage.mySetting = "value"` or read `config.mypackage.mySetting` in their own config. There is no central registry of valid options — the merge step discovers them.

### Collision / conflict resolution

- **Priority system:** `lib.mkDefault` (low), `lib.mkForce` (high), etc. allow override without merge errors.
- **Unique types:** Using `lib.types.uniq str` causes an error if two modules set different values.
- **Extensible enums:** `type = with types; nullOr (enum [ "gdm" ])` can be extended by another module declaring the same option with `enum [ "sddm" ]`. The result merges to `enum [ "gdm" "sddm" ]`.
- **Undefined options:** Reading an option that's declared but has no default AND no definition -> `throw "The option '...' is used but not defined."`.

### Flux example

```typescript
// In Flux terms, imagine a declarative plugin config system:
// Plugin "yt-feed" declares an option:
host.declareOption('yt-feed.api.baseUrl', {
  type: 'string',
  default: 'https://www.youtube.com',
});

// Another module (user config) sets it:
host.setConfig('yt-feed.api.baseUrl', 'https://yewtu.be');

// The module system merges: if two places set it with same priority, error.
// Use mkDefault / mkForce for override semantics.
```

---

## 5. Web Components / Custom Elements

**Source:** <https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define>
**Source:** <https://html.spec.whatwg.org/multipage/custom-elements.html>
**Source:** <https://developer.chrome.com/blog/scoped-registries>

### How it works

```javascript
class MyButton extends HTMLElement {
  connectedCallback() { this.textContent = 'Hello'; }
}
customElements.define('my-button', MyButton);
```

Any JavaScript code can call `customElements.define(tagName, constructor)`. The browser adds the mapping to the global `CustomElementRegistry`. After that, any `<my-button>` in HTML is automatically upgraded: the browser calls the constructor and `connectedCallback()`.

### Scoped registries (Chrome 146+, Edge 146+)

Since 2026, you can create isolated registries:

```javascript
const scoped = new CustomElementRegistry();
scoped.define('my-button', MyButton);
const shadow = host.attachShadow({ mode: 'open', customElementRegistry: scoped });
shadow.innerHTML = '<my-button></my-button>'; // uses scoped definition
```

Different shadow trees can have different definitions for the same tag name.

### What "any plugin can define new extension points" means

Any script can define a new HTML tag. That tag becomes a new "extension point" — any other component can use `<my-button>` in its template, and the browser resolves it. The defining script doesn't need to know about consumers, and consumers don't need to know where the definition came from.

### Discovery

- `customElements.get('my-button')` returns the constructor if defined, `undefined` otherwise.
- `customElements.whenDefined('my-button')` returns a Promise that resolves when the element is defined.
- The browser's parser and `innerHTML` setter attempt to upgrade elements automatically.

### Missing element behavior

If a custom element tag is used in HTML before `define()` is called, the browser renders it as `HTMLUnknownElement`. When `define()` is called later, all existing instances get "upgraded" — their constructor runs and `connectedCallback` fires. This is called **lazy definition**.

### Collision avoidance

- The global registry throws `NotSupportedError` if you `define` the same name twice.
- Scoped registries solve cross-library naming conflicts — each shadow tree can have its own set of definitions.
- Custom element names MUST contain a hyphen (`my-button`, not `mybutton`), enforced by the parser.

### Flux example

```typescript
// Plugin "yt-video-card" defines a new element:
customElements.define('yt-video-card', class extends HTMLElement {
  set item(video) {
    this.render(video);
  }
});

// Plugin "feed-widget" uses it without knowing where it came from:
const card = document.createElement('yt-video-card');
card.item = { title: 'My Video', url: '...' };
container.appendChild(card);
// Works if yt-video-card was defined anywhere in the page.
```

---

## 6. OCaml Functors / ML Module Systems

**Source:** <https://ocaml.org/manual/moduleexamples.html>
**Source:** <https://ocaml.org/docs/functors>
**Source:** <https://dev.realworldocaml.org/functors.html>

### How it works

A functor is a module-level function:

```ocaml
module type ORDERED_TYPE = sig
  type t
  val compare : t -> t -> int
end

module Set = functor (Elt: ORDERED_TYPE) -> struct
  type element = Elt.t
  type set = element list
  let empty = []
  let add x s = (* ... uses Elt.compare ... *)
end

module IntSet = Set(Int)  (* Int has type ORDERED_TYPE *)
```

The module system provides:
- **Module types (signatures):** `sig ... end` — define interfaces
- **Functors:** functions from modules to modules
- **`with type` constraints:** expose type equalities: `(SET with type element = Elt.t)`
- **Abstract module types:** `module type S` — hide the implementation of a module type entirely

### What "any plugin can define new extension points" means

A module can define a new signature (interface) and a functor that accepts any module matching that signature. This is essentially defining a new extension category. Another module can implement that signature and pass it to the functor. The functor author doesn't need to know about future implementations.

```ocaml
(* Plugin defines new extension point: *)
module type CAPTION_TRANSLATOR = sig
  type text
  val translate : text -> source:string -> target:string -> text
end

(* Another plugin implements it: *)
module GoogleTranslate = struct
  type text = string
  let translate t ~source ~target = (* call API *)
end

(* First plugin uses it via functor: *)
module CaptionUI (T : CAPTION_TRANSLATOR) = struct
  let show_captions text = T.translate text ~source:"en" ~target:"es"
end

module MyUI = CaptionUI(GoogleTranslate)
```

### Solving "unknown future types"

ML module systems solve this with **abstract types** and **applicative functors**:

- Abstract types in signatures: `type t` (no definition) creates an opaque type. Only operations in the signature can create/inspect it.
- `with type` constraints selectively reveal type equalities.
- Applicative functors ensure that `Set(Int)` and `Set(Int)` produce the same type (same abstraction), while `Set(String)` produces a different type. This is type-safe module composition.

### Collision avoidance

- Module names are hierarchical (path-based) — `Foo.Bar.baz`.
- Module types are structural (duck-typed), not nominal — a module matches a signature if it has the right fields with the right types, regardless of name.
- OCaml's module system is **sound** — if `Set.Make` returns a module with `type set`, two applications with the same argument have the same abstract `set` type; with different arguments, different types. You cannot accidentally mix them.

### Flux parallel

In Flux, plugin capabilities can be described as module signatures. A plugin declares a capability interface via its `hooks` field in `plugin.json`. Other plugins can declare fulfillment of that hook. The host validates structural matching (number/types of params match).

---

## 7. Java SPI (Service Provider Interface)

**Source:** <https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/ServiceLoader.html>
**Source:** <https://www.baeldung.com/java-spi>
**Source:** <https://blog.frankel.ch/rediscovering-java-serviceloader/>

### How it works

1. Define a service interface: `public interface MessageFormatter { String format(String msg); }`
2. A provider JAR places a file at `META-INF/services/com.example.MessageFormatter` containing the fully-qualified class name of the implementation: `com.example.JsonFormatter`
3. Consumer code discovers implementations via `ServiceLoader<MessageFormatter> loader = ServiceLoader.load(MessageFormatter.class);`
4. Iterating `loader` lazily loads and instantiates each provider (calls no-arg constructor).

Starting from Java 9, providers can also be declared via `module-info.java`:
```java
provides com.example.MessageFormatter with com.example.JsonFormatter;
```

### Limitation: interfaces, not extension points

Java SPI allows new **implementations** of known interfaces, but not new **interfaces** themselves. The service interface must exist at compile time as a Java class/interface. This is fundamentally different from Drupal hooks or NixOS options, where the extension point name is a string discovered at runtime.

### What "any plugin can define new extension points" means

In Java SPI, plugins CANNOT define new extension points that other plugins extend. They can only implement existing ones. The SPI interface author defines the extension point; others implement it. This is a **core-defined** extension model, not a **plugin-defined** one.

### Discovery

`ServiceLoader` looks for files named `META-INF/services/<fully-qualified-interface-name>` on the classpath/module path. It uses `ClassLoader.getResources()` to find all matching files across all JARs. Parses each line as a class name. Loads and instantiates lazily.

### Missing provider behavior

`ServiceLoader.load(Foo.class).findFirst()` returns `Optional.empty()`. No error. The consumer must handle the case of no providers.

### Collision avoidance

- Namespaced by fully-qualified Java interface name (e.g., `com.example.MessageFormatter`).
- Java's module system enforces encapsulation: the service interface must be exported; the implementation can be hidden.
- AutoService annotation processor (`@AutoService`) generates the META-INF file automatically, reducing typos.

### Flux comparison

Flux's current `hooks` field in `plugin.json` is similar to Java SPI — a plugin declares it provides `feed.video`, and the host uses that to route. But Flux goes further because a plugin can also INVENT a new hook string (like `yt_captions_translate`) at any time, and other plugins can implement it without any central registry — this is more like Drupal than Java SPI.

---

## 8. Behavior-Driven Patterns (Blackboard, Linda Tuple Spaces, Pub-Sub)

**Source:** <https://paulserban.eu/blog/post/beyond-peer-to-peer-4-decoupled-patterns-for-multi-agent-systems/>
**Source:** <https://www.netlib.org/utk/papers/comp-phy7/node3.html>
**Source:** <https://en.wikipedia.org/wiki/Tuple_space>

### Blackboard Architecture

Multiple agents share a single data store (the blackboard). Each agent reads relevant data, processes it, and writes results back. Agents don't know about each other — they only know the blackboard's data schema.

**New extension points:** Any agent can write a new type of data to the blackboard. Other agents that understand that data type can react to it. The data type IS the extension point.

### Linda Tuple Spaces

Linda is the canonical implementation. A tuple space is an associative memory where:

- **`out(tuple)`** — write a tuple `("foo", 42, 3.14)`
- **`rd(pattern)`** — read a matching tuple (blocking if none exists)
- **`in(pattern)`** — read and remove (destructive read)
- **`eval(expression)`** — spawn a new process that becomes a tuple

Pattern matching is by position and type: `("foo", ?integer, ?float)` matches the tuple above.

**New extension points:** Any process can `out("new_event_type", arg1, arg2)`. Other processes can `rd("new_event_type", ?any, ?any)` to receive it. No central schema registry.

**Decoupling:**
- **Time decoupling:** Producer and consumer need not be alive at the same time (tuple persists)
- **Space decoupling:** Producer and consumer need not know each other's location
- **Content-based addressing:** Tuples found by pattern matching, not by address

### Publish-Subscribe

Publishers emit events to named topics. Subscribers express interest in topics. A broker mediates delivery.

**New extension points:** A publisher can emit to a new topic string any time. Subscribers can subscribe to it. If no one subscribes, the message is just dropped.

### What breaks at scale

| Pattern | Problem |
|---------|---------|
| Blackboard | Centralized bottleneck; schema evolution requires all agents to agree |
| Tuple space | Pattern matching can be slow with many tuples; no schema enforcement |
| Pub-sub | No delivery guarantees by default; message ordering not guaranteed |

### Flux example (Blackboard/Tuple Space hybrid)

```typescript
// Plugin "movi-player" writes to the shared space:
host.space.write({ type: 'video.load', url: 'https://...', title: 'My Video' });

// Plugin "feed-widget" reads matching tuples:
host.space.read({ type: 'video.load', url: ?string, title: ?string });
// This matches any video.load tuple, regardless of which plugin wrote it.

// Another plugin "analytics" also reads:
host.space.read({ type: 'video.load', ...rest });
// No coupling between producer and consumers. Schema is just the tuple shape.
```

---

## Synthesis: Design Dimensions

| Dimension | Drupal | WordPress | Linux Kernel | NixOS | Web Comp. | OCaml | Java SPI | Tuple Space |
|-----------|--------|-----------|-------------|-------|-----------|-------|----------|-------------|
| Point defined by | String name | String name | struct type | Attribute path | Tag name | Module sig | Interface class | Tuple pattern |
| Can plugin define new? | Yes | Yes | Yes (bus_type) | Yes (options.*) | Yes | Yes (sig) | No (impl only) | Yes |
| Discovery | Regex scan modules | None (string match) | Linked list + sysfs | Merge step | Registry.get | Structural typing | File scan | Pattern match |
| Undefined behavior | Empty array | Silent no-op | Deferred list | Throw on use | HTMLUnknownElement | Type error | Optional.empty() | Blocking wait |
| Collision prevention | Module name prefix | Convention only | Name uniqueness validation | Priority + type system | Hyphen rule + scoped reg | Path hierarchy | FQN namespacing | Content matching |
| Type safety runtime | Weak | None | Strong (struct types) | Strong (type checks) | Weak (JS) | Strong (compile) | Strong (interface) | Weak (positional) |

### Key insight for Flux

The most flexible models (Drupal, WordPress, NixOS, tuple spaces) use **open string names** as extension points — no compilation step, no central registry, no core approval. The trade-off is that type safety and discoverability are weaker. The model that balances flexibility with safety best suits Flux's multi-language plugin ecosystem.

Flux's current hook system (`hooks: ["feed.video"]`) is similar to Java SPI. Moving toward Drupal-style open hook names would mean: any plugin can `host.invokeAll('any_string')` and any other plugin can `host.registerHook('any_string', handler)` without coordination. The `manifest.json` hooks field would become optional — it'd be documentation rather than a registration requirement.

---

## Sources

1. Drupal hooks: <https://www.drupal.org/docs/develop/creating-modules/understanding-hooks>
2. Drupal hooks API: <https://api.drupal.org/api/drupal/core%21core.api.php/group/hooks/11.x>
3. WordPress add_action: <https://developer.wordpress.org/reference/functions/add_action/>
4. WordPress do_action: <https://developer.wordpress.org/reference/functions/do_action/>
5. WordPress plugin.php source: <https://github.com/WordPress/wordpress-develop/blob/7.0/src/wp-includes/plugin.php>
6. Linux kobject docs: <https://docs.kernel.org/core-api/kobject.html>
7. Linux bus type docs: <https://docs.kernel.org/driver-api/driver-model/bus.html>
8. Linux driver binding: <https://docs.kernel.org/driver-api/driver-model/binding.html>
9. Linux driver registration: <https://docs.kernel.org/driver-api/driver-model/driver.html>
10. NixOS modules: <https://wiki.nixos.org/wiki/NixOS:Modules>
11. NixOS options library: <https://ryantm.github.io/nixpkgs/functions/library/options/>
12. NixOS lib/options.nix: <https://github.com/NixOS/nixpkgs/blob/master/lib/options.nix>
13. CustomElementRegistry.define: <https://developer.mozilla.org/en-US/docs/Web/API/CustomElementRegistry/define>
14. HTML spec custom elements: <https://html.spec.whatwg.org/multipage/custom-elements.html>
15. Scoped registries (Chrome): <https://developer.chrome.com/blog/scoped-registries>
16. OCaml module system: <https://ocaml.org/manual/moduleexamples.html>
17. OCaml functors: <https://ocaml.org/docs/functors>
18. Real World OCaml functors: <https://dev.realworldocaml.org/functors.html>
19. Java ServiceLoader docs: <https://docs.oracle.com/en/java/javase/25/docs/api/java.base/java/util/ServiceLoader.html>
20. Java SPI tutorial: <https://www.baeldung.com/java-spi>
21. Rediscovering ServiceLoader: <https://blog.frankel.ch/rediscovering-java-serviceloader/>
22. Decoupled patterns for multi-agent systems: <https://paulserban.eu/blog/post/beyond-peer-to-peer-4-decoupled-patterns-for-multi-agent-systems/>
23. Linda model: <https://www.netlib.org/utk/papers/comp-phy7/node3.html>
24. Tuple space Wikipedia: <https://en.wikipedia.org/wiki/Tuple_space>
