# Dynamic Capabilities in Plugin Systems

**Research question:** How do existing systems handle plugin-defined extension points where the capability types are not known at compile time — any plugin can declare a new hook, and other plugins should be able to discover and call it without the core pre-defining the interface?

---

## 1. WordPress Hooks / Filters

### How it works

WordPress has two kinds of hooks: **actions** (side effects, no return) and **filters** (transform data, return modified value). Any plugin creates a custom hook by simply calling `do_action('my_custom_hook', $arg1, $arg2)` or `apply_filters('my_custom_hook', $value, $arg1)`. Another plugin registers a callback with `add_action('my_custom_hook', 'callback_func', $priority, $accepted_args)` or `add_filter()`. There is zero central registration — the hook name is just a string. If nobody called `do_action('that_hook')`, callbacks registered for it simply never fire.

Source: [WordPress Developer Docs — Custom Hooks](https://developer.wordpress.org/plugins/hooks/custom-hooks/)
Source: [WordPress Developer Docs — do_action()](https://developer.wordpress.org/reference/functions/do_action/)

### Can a plugin define a NEW hook that others consume?

**Yes.** Any plugin can call `do_action('any.string.here')` with any arguments. The string becomes a de facto hook that other plugins can `add_action()` to. No interface definition needed.

### How does the consumer know what arguments to expect?

**Documentation convention only.** The WordPress docs say: "To find out the number and name of arguments for an action, simply search the code base for the matching `do_action()` call." There is no runtime contract. The `add_action()` call accepts a 4th parameter `$accepted_args` (default 1) — but this is just the count, not type info. If the consumer guesses wrong, the callback receives `null` for missing args or ignores extras.

Source: [WordPress Developer Docs — add_action()](https://developer.wordpress.org/reference/functions/add_action/)

### What happens on mismatch?

- **Too few args declared:** Callback declared with 3 params but hooked with `$accepted_args = 1` → receives `null` for params 2 and 3 (PHP raises an undefined-variable notice but doesn't crash).
- **Wrong types:** PHP is dynamically typed — wrong types surface as runtime warnings in `error_log`.
- **No return from filter:** If a filter callback forgets to `return`, the filter chain delivers `null` onward, which may break the caller.

### Fundamental trade-off

**Maximum flexibility, zero safety.** Pattern is ideal for loosely-coupled extension but debugging is hard — you need to grep for `do_action('hook_name')` to find what arguments are passed. There is no tooling beyond naming conventions (e.g. `wporg_after_settings_page_html`).

---

## 2. Drupal Hooks

### How it works

Drupal's hook system is naming-convention-based. A module defines a function named `modulename_hookname()`. Drupal's `module_invoke_all('hookname')` iterates all enabled modules, constructs the function name as `$module . '_' . $hook`, and calls it if it exists. In Drupal 8+, this is done via PHP attributes (`#[Hook('hook_name')]`) on class methods.

Source: [Drupal API — module_invoke_all](https://api.drupal.org/api/drupal/includes%21module.inc/function/module_invoke_all/7.x)
Source: [Drupal API — ModuleHandler::invokeAll](https://api.drupal.org/api/drupal/core%21lib%21Drupal%21Core%21Extension%21ModuleHandler.php/function/ModuleHandler%3A%3AinvokeAll/10)
Source: [Creating Drupal 7 hooks](https://www.drupal.org/docs/7/creating-custom-modules/creating-drupal-7-hooks)

### Can a plugin define a NEW hook?

**Yes.** Any module can call `module_invoke_all('my_hook', $args)` to invoke all implementations of `module_my_hook()`. This creates a new hook at runtime. Modules can also define hooks for others by calling `\Drupal::moduleHandler()->invokeAll()`.

### How does consumer know what args to expect?

**Documentation in `.api.php` files.** The convention is: the module that defines a hook provides a `*.api.php` file with a sample function body, a docblock listing parameters and return values, and a `@param` for each argument. Implementors copy this sample, rename `hook_` to `mymodule_`, and fill in the body.

Source: [Drupal API — Hooks documentation](https://api.drupal.org/api/group/hooks)

### What happens on mismatch?

- **Wrong function signature:** PHP just passes the args via `call_user_func_array($function, $args)`. If the module's implementation declares different parameters, PHP raises warnings for undefined array keys or null arguments. Soft failure.
- **Return type mismatch:** `invokeAll()` merges arrays returned by implementations with `NestedArray::mergeDeep()`. If a module returns a non-array, it gets appended to the result list rather than merged. This may surprise the caller but doesn't crash.
- **Wrong module prefix:** If `mymodule_help()` doesn't match the `module_help` convention, it's silently never called. No error.

### Fundamental trade-off

**Discovery by naming convention is elegant but fragile.** The `.api.php` documentation convention is the only contract. Drupal relies on human diligence to keep docs in sync. The trade-off: maximum extensibility (any module can participate in any hook by following a naming pattern) versus runtime safety (mismatches surface as subtle bugs or PHP notices).

---

## 3. NPM Ecosystem / Duck Typing

### How it works

JavaScript has no compile-time type checks. An npm package exports functions/objects; consumers call them without interface verification. The only contract is the documentation and the code itself.

### Can a plugin define a NEW capability?

**Yes — trivially.** Any package can export any function, and any other package can import and call it. `require('some-package').doSomething(args)` — if `doSomething` exists, it runs; if not, you get a runtime `TypeError: doSomething is not a function`.

### How does consumer know what args to expect?

- **README / JSDoc / TypeScript types** (opt-in documentation)
- **TypeScript declaration files (`.d.ts`)** — increasingly common but still opt-in; studies show many `@types` packages are inaccurate
- **Trial and error** — run the code and see if it crashes

### What happens on mismatch?

- **Wrong arguments:** Silent failure (undefined behavior) or runtime `TypeError`.
- **Semver contract:** npm uses semver — major version = breaking changes. But studies show ~30% of "minor" updates actually contain breaking changes.
- **Deprecation:** No standard mechanism. Common practices: console.warn messages, JSDoc `@deprecated`, deprecation utility functions. 67% of deprecations include a replacement message.

Source: [JavaScript API Deprecation in the Wild](https://homepages.dcc.ufmg.br/~andrehora/pub/2020-saner-era-javascript-deprecation.pdf)
Source: [Breaking Changes in the NPM Ecosystem](https://arxiv.org/html/2408.14431v1)

### Fundamental trade-off

**Maximum speed of evolution, maximum runtime risk.** The lack of contracts means packages evolve fast, but consumers silently break. The entire ecosystem relies on semver discipline, which is frequently violated in practice. TypeScript adds an optional safety layer but is not enforced at runtime.

---

## 4. Racket / Scheme Macro Systems

### How it works

Racket's macro system lets libraries define new syntactic forms that the core language doesn't know about. `define-syntax` defines a macro — a compile-time function that transforms syntax objects into other syntax objects. The macro expander processes these transformations before any runtime code runs.

Source: [Racket Guide — Modules and Macros](https://docs.racket-lang.org/guide/module-macro.html)
Source: [1.2 Syntax Model](https://docs.racket-lang.org/reference/syntax-model.html)

### Can a library define a NEW language construct?

**Yes — this is the whole point.** Libraries can define new keywords, new binding forms, new control structures. The user imports them with `(require lib)` and uses them as if they were built-in. For example, a library can define a `match` macro that implements pattern matching — the core expander never needs to know about `match`.

### How does consumer know what to expect?

**Macro contracts and hygiene.** Racket macros are:
- **Hygienic:** Macros from one library cannot accidentally capture or be captured by bindings from another module — scopes are tracked as sets on syntax objects.
- **Phased:** Compile-time (macro expansion) and run-time are strictly separated. Macro transformers run in phase 1; their output runs in phase 0.
- **Structured:** The macro receives syntax objects (S-expressions with scope information), not raw strings. This allows compile-time error checking.

Source: [From Macros to DSLs: The Evolution of Racket](https://drops.dagstuhl.de/storage/00lipics/lipics-vol136-snapl2019/LIPIcs.SNAPL.2019.5/LIPIcs.SNAPL.2019.5.pdf)

### What happens on mismatch?

- **At compile time:** If a macro application doesn't match the expected pattern, the macro signals an error *during expansion* — before any runtime code runs. Error messages can be customized by the macro author.
- **Wrong number of arguments:** Pattern-based macros (`define-syntax-rule`) check shape at expansion time. Procedural macros can do arbitrary validation.
- **Type mismatches:** Racket is gradually typed — optional type annotations can be checked, but by default mismatches surface at runtime.

### Fundamental trade-off

**Compile-time safety + infinite flexibility.** Macros run before runtime, so errors in extension points are caught early. The cost: macro systems are complex to implement and understand. Expanding the language at compile time means the mental model of "what is the language" becomes dynamic — every `require` can change the grammar.

---

## 5. Unix Pipelines / Text Streams

### How it works

The pipe operator `|` connects stdout of one process to stdin of the next. Data is just bytes — no structural typing. Each process reads what it needs from stdin and writes results to stdout.

Source: [The Art of Unix Programming — Pipes](http://www.catb.org/~esr/writings/taoup/html/plumbing.html)
Source: [Basics of the Unix Philosophy](http://catb.org/~esr/writings/taoup/html/ch01s06.html)

### Can a program define a NEW data transformation that other programs can hook into?

**Yes — implicitly.** Any program that reads stdin and writes stdout can be inserted into a pipeline. The "hook" is the stream itself. There is no central registry — just the convention of reading/writing text.

### How does consumer know what format to expect?

**By convention.** Several well-known formats:
- **Line-oriented text:** Each line is a record (`grep`, `sort`, `wc`)
- **Column/field oriented:** Tab-separated (`cut -f`, `awk`), space-separated (`ps`)
- **Structured text:** JSON Lines (newline-delimited JSON), CSV, TSV
- **Headers + body:** HTTP, email (RFC 822 style)

The Unix philosophy says: "Write programs to handle text streams, because that is a universal interface."

### What happens on mismatch?

- **Garbage in, garbage out.** If a program receives a format it doesn't understand, it produces wrong output or crashes with an error.
- **Pipeline hangs:** If a program writes more than the 64KB Linux pipe buffer before the reader consumes, the writer blocks. If the reader crashes, the writer gets SIGPIPE.
- **No error propagation:** Error output goes to stderr (fd 2) by default, not through the pipe — errors from mid-pipeline stages are invisible to downstream consumers.

### Fundamental trade-off

**Maximum composability, minimum contract.** Text streams are the most flexible interface ever designed for program composition — you can connect any two programs that agree on a format. The entire burden of agreement is on the human operator or the programmer. There is zero runtime safety.

---

## 6. GraphQL Schema Federation (Apollo)

### How it works

Each service (subgraph) defines its own part of the overall GraphQL schema. The Apollo Federation composition engine merges all subgraph schemas into one "supergraph schema." A router uses this supergraph to route queries to the correct subgraph(s).

Source: [Apollo Federation — Composition Rules](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/reference/composition-rules)
Source: [Apollo Federation — Value Types](https://www.apollographql.com/docs/graphos/schema-design/federated-schemas/sharing-types)

### Can a subgraph define a NEW type/field that other subgraphs extend?

**Yes — and it's the core feature.** A subgraph can define a new type (e.g., `type Review @key(fields: "id")`) and another subgraph can extend it with `extend type Review @key(fields: "id")` to add fields. Each subgraph contributes its piece.

### How does consumer know what the schema looks like?

**Static composition with validation.** Before deployment, the composition engine:
1. Merges all subgraph schemas (union for output types, intersection for input types)
2. Validates type compatibility — a field must have the same return type in all subgraphs that define it (or be marked `@shareable`)
3. **Fails composition** if conflicts are unresolvable

The composition step is analogous to a compile step — if types conflict, the supergraph is not generated and the router doesn't update.

### What happens on mismatch?

- **Composition failure:** A subgraph pushes a schema that conflicts → composition fails → the old supergraph stays deployed. **No runtime impact.** This is the key safety feature: mismatches are caught before they reach production.
- **Runtime:** Once composed, the router validates all inputs against the supergraph schema before forwarding — so argument mismatches are caught at request time with clear error messages.

### Fundamental trade-off

**Strong safety through pre-deployment composition, moderate flexibility.** The composition step enforces a global schema contract — this prevents the runtime chaos of WordPress/Drupal but limits what subgraphs can do independently. Adding a new field requires coordinated updates or the `@inaccessible` directive for gradual rollout.

---

## 7. Mozilla WebExtensions API

### How it works

Firefox defines a fixed set of browser API namespaces (`browser.tabs`, `browser.storage`, `browser.webRequest`, etc.). Each namespace has predefined methods and events (e.g. `browser.tabs.onCreated.addListener(callback)`). Extensions can only listen to or call *existing* API surfaces — they cannot create new ones.

Source: [MDN — tabs API](https://developer.mozilla.org/en-US/docs/Mozilla/Add-ons/WebExtensions/API/tabs)
Source: [Firefox Source Docs — WebExtensions Background](https://firefox-source-docs.mozilla.org/toolkit/components/extensions/webextensions/background.html)

### Can an add-on define a NEW event that other add-ons consume?

**No.** The browser API is fixed at compile time of the browser. An add-on cannot define `browser.myCustomThing.onSomething`. The namespace, methods, events, and their signatures are all predefined in the browser source code (see `ext-browser.js` in the Firefox source).

### Why this limitation?

**Security & stability.** WebExtensions are designed to be safe — they run in a sandbox with limited privileges. Allowing arbitrary API extension would:
- Create privilege escalation paths (a malicious extension could define APIs that leak data)
- Break the review model (reviewers would need to understand every API surface)
- Complicate cross-browser compatibility (Chrome and Safari would not implement custom APIs)

The trade-off is accepted because the browser is the trusted runtime — it cannot allow untrusted code to define new primitives that other untrusted code depends on.

### What happens on mismatch?

- **API doesn't exist:** `browser.nonexistent.method()` throws a JavaScript `TypeError` at runtime.
- **Wrong arguments:** If a callback doesn't match the expected signature, the browser still calls it — missing params are `undefined`, extra params are ignored.
- **Deprecation:** Old APIs are marked as `deprecated` in MDN docs and may emit console warnings, but are rarely removed to avoid breaking extensions.

### Fundamental trade-off

**Maximum safety through fixed API surface, zero flexibility for extension-defined extension points.** This is the opposite of WordPress — the browser ecosystem chose safety over extensibility for good reasons (security sandboxing). Flux, which is not a browser, does not face these constraints.

---

## 8. Protobuf Any / JSON Schema Discriminators

### How it works

Systems that need to handle "any structured data" at runtime use three strategies:

**Protobuf `Any`:**
- Wraps an arbitrary protocol buffer message with a `type_url` (string) and `value` (bytes).
- The `type_url` identifies the message type (e.g. `type.googleapis.com/my.package.MyType`).
- Client code must know the type at compile time to call `Unpack<T>()` — the `is()`/`unpack()` API checks the type_url against the requested type and fails if they don't match.

Source: [Protocol Buffers — Any](https://protobuf.dev/reference/protobuf/google.protobuf/)
Source: [google/protobuf/any.proto](https://github.com/protocolbuffers/protobuf/blob/main/src/google/protobuf/any.proto)

**JSON Schema `oneOf` + `const` (Discriminated Unions):**
- Use `oneOf` array where each branch has a `const` on the discriminator property.
- Example: `{"oneOf": [{"properties": {"type": {"const": "circle"}, "radius": {}}}, {"properties": {"type": {"const": "square"}, "side": {}}}]}`.
- Validators test branches sequentially (O(n)) unless using `if/then/else` chaining.

Source: [JSON Schema Discriminator Guide](https://jsonic.io/guides/json-schema-discriminator)
Source: [Inheritance and Polymorphism in OpenAPI](https://swagger.io/docs/specification/v3_0/data-models/inheritance-and-polymorphism/)

**TypeScript discriminated unions:**
- `type Shape = { kind: 'circle'; radius: number } | { kind: 'square'; side: number }`
- Narrowed by checking `kind` — compile-time exhaustiveness check.
- At runtime, this is just JavaScript — no enforcement unless you use Zod/zod for validation.

### What happens on mismatch?

- **Protobuf `Any`:** `unpack<T>()` returns false if type_url doesn't match `T`. The caller must handle the failure. Without a type registry, you cannot dynamically deserialize unknown types.
- **JSON Schema:** Validation against `oneOf` with `const` checks every branch — if no branch matches, it returns a validation error listing which branches failed.
- **TypeScript:** Compile-time error if a case is unhandled (with `strict: true` + `exhaustive` checking). Runtime behavior is just JS — no protection.

### Fundamental trade-off

**For `Any`:** Type safety at the cost of dynamic flexibility — you must know types at compile time to unpack them. Protobuf explicitly considered launching a type resolution service at the type_url but abandoned it for security and complexity reasons.

**For discriminated unions:** Excellent static safety (compile-time exhaustiveness checks) but runtime validation requires an external validator like Ajv or Zod. The `oneOf` approach is self-documenting — the schema **is** the contract.

---

## Synthesis & Recommendation for Flux

### The Core Pattern

Across all eight systems, there is a consistent spectrum:

```
WordPress / Unix pipes / npm (no safety, max flexibility)
    ↓
Drupal (naming conventions + .api.php docs)
    ↓
Racket macros (compile-time expansion, hygiene, structural checks)
    ↓
Protobuf Any / JSON Schema (explicit type URLs, validation)
    ↓
Apollo Federation (pre-deployment composition validation)
    ↓
Mozilla WebExtensions (fixed API, no plugin-defined extension points)
(safety, min flexibility)
```

Flux is at the WordPress end — any plugin can define `hook("my.custom.hook")` and other plugins can listen for it. This is exactly the right choice for maximum flexibility. The question is: **what minimal safety layer can you add without sacrificing that flexibility?**

### Concrete Recommendation

**The Registry should use documentation-as-contract with optional schema validation.** Specifically:

1. **Hook naming convention:** `namespace.action` — enforce that hooks start with the plugin name (e.g. `yt-feed.feed.video`). This gives traceability and avoids collisions. The Registry already splits on `.` for routing — use the first segment as the "declaring plugin."

2. **Params schema as optional metadata:** When a plugin defines a hook, it can optionally declare a JSON Schema for the params in its manifest:
   ```json
   {
     "hooks": {
       "feed.video": {
         "params": {
           "type": "object",
           "properties": {
             "maxResults": { "type": "number" }
           }
         }
       }
     }
   }
   ```
   If the hook is declared without a schema (as in WordPress), the consumer gets no guarantees — same as today. If declared with a schema, the Registry CAN validate at dispatch time and warn on mismatch. This is a **soft contract** — validation warnings go to stderr but never block execution.

3. **No mandatory registration:** WordPress's model of `do_action()` being just a function call is the right level of simplicity. The Registry should NOT require plugins to pre-register hook names. Calling `hook("new.hook", params)` should work even if no one has ever declared it. This preserves the "any string is a hook" flexibility.

4. **Consumer guidance:** Help consumers discover param schemas. When a consumer listens to a hook via `callHook()`, the Registry could return the declaring plugin's schema in metadata alongside the result. Also, make the declaring plugin's source or manifest discoverable through the existing `core-manifest.scan` pipeline.

5. **What to do on mismatch:** **Warn, don't fail.** Log a structured warning (plugin, hook, expected schema, actual params) to the console. Never reject the call. Flux's current error handling pattern (`?? "Unknown error"`) already tolerates soft failures — extend this so that param schema validation is advisory only.

6. **Evolution path:** Keep the schema optional. The first version ships with no validation (pure WordPress model). As plugins mature, hook authors can add schemas incrementally. A future version could add an `@deprecated` annotation for hooks with a replacement hint.

### Why not Apollo-style composition?

Because Flux's hooks are **not a global schema** — they're named event buses. Composition (union/intersection merging) makes sense for a queryable type system like GraphQL but not for point-to-point event dispatch. The WordPress/Drupal model is a closer match.

### Why not Protobuf Any-style type URLs?

Type URLs add complexity (type resolution, registry management) and buy little for a desktop app where all plugins are loaded into the same process. JSON Schema on the params field is lighter and more natural for TypeScript/JavaScript.

### The Trade-off Decision

Flux should optimize for **developer ergonomics over runtime safety**, like WordPress. The key difference Flux can make is providing **discoverability tooling** — a) listing all hooks a plugin declares, b) showing the declared param schema (if any), and c) warning on mismatch at development time. This gives the *documentation* safety of Drupal's `.api.php` files with the *runtime simplicity* of WordPress's `do_action()`, without requiring either the compile-time complexity of Racket or the pre-deployment gate of Apollo.
