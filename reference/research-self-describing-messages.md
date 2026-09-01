# Self-Describing Message Formats

> How can a message carry its own type information so the receiver can interpret it without a pre-shared schema? Research for Flux plugin system where plugins can define new hook types at runtime and the Registry needs to tell consumers what methods/parameters exist.

---

## Table of Contents

1. [JSON-LD / Hydra](#1-json-ld--hydra)
2. [HAL (Hypertext Application Language) / REST HATEOAS](#2-hal-hypertext-application-language--rest-hateoas)
3. [CBOR / CDDL (Concise Binary Object Representation)](#3-cbor--cddl)
4. [ASN.1 BER/DER](#4-asn1-berder)
5. [XML Namespaces + XSD](#5-xml-namespaces--xsd)
6. [Erlang/Elixir Pattern Matching](#6-erlangelixir-pattern-matching)
7. [TypeScript Tagged Unions / Discriminated Unions](#7-typescript-tagged-unions--discriminated-unions)
8. [JSON Schema / OpenAPI Schema Object](#8-json-schema--openapi-schema-object)
9. [Amazon Ion / Apache Avro](#9-amazon-ion--apache-avro)
10. [Synthesis for Flux](#10-synthesis-for-flux)

---

## 1. JSON-LD / Hydra

### What it is

JSON-LD (JSON for Linked Data) is a W3C standard that makes JSON self-describing by adding a `@context` key. The `@context` maps every property name in the document to a globally unique IRI (Internationalized Resource Identifier, a generalization of URL). A consumer can dereference that IRI to learn the meaning of the property.

```json
{
  "@context": "https://schema.org",
  "@type": "Person",
  "name": "Manu Sporny",
  "homepage": "http://manu.sporny.org/"
}
```

Source: [JSON-LD 1.1 W3C Recommendation](https://www.w3.org/TR/json-ld11/) (2020-07-16)

The `@context` URL returns a machine-readable document that defines each term. JSON-LD also supports inline contexts so you don't even need network access:

```json
{
  "@context": {
    "name": "http://schema.org/name",
    "age": {
      "@id": "http://schema.org/age",
      "@type": "http://www.w3.org/2001/XMLSchema#integer"
    }
  },
  "name": "John",
  "age": "41"
}
```

Without the `@context`, `"age": "41"` is just a string. With it, a processor knows `age` is actually an integer and maps to the schema.org property.

### Hydra extends JSON-LD for API discovery

Hydra is a vocabulary (built on JSON-LD) for describing REST APIs. It defines classes like `Operation`, `IriTemplate`, and `ApiDocumentation`. A Hydra API returns links annotated with what operations the client can perform, what parameters each operation expects, and what HTTP method to use.

Source: [Hydra Core Vocabulary](https://www.hydra-cg.com/spec/latest/core/)

Source: [Hydra: A Vocabulary for Hypermedia-Driven Web APIs (PDF)](https://ceur-ws.org/Vol-996/papers/ldow2013-paper-03.pdf)

Example: a Hydra response might include:

```json
{
  "@context": "/api/context.jsonld",
  "@id": "/api/people/1",
  "name": "John",
  "operations": [
    {
      "@type": "Operation",
      "method": "POST",
      "expects": {
        "@id": "http://schema.org/UpdateAction"
      },
      "returns": "Person"
    }
  ]
}
```

A generic Hydra client sees this response, discovers an Operation on the resource, knows it can POST to this URL, and knows what schema the POST body should conform to. It can navigate an entirely unfamiliar API.

### Self-describing?

**Almost 100%** — every property's meaning is resolvable via the `@context`. However, the consuming application must understand JSON-LD and Hydra's vocabulary concepts (like `Operation`, `IriTemplate`) to act on them. The meaning of "name" is discoverable, but *what to do* with an Operation requires library support.

### Overhead

- **Network round-trip** to fetch the `@context` if not inlined
- Payload size can be 2-3x plain JSON for small messages (the `@context` URL or inline definitions)
- JSON-LD processing requires a processor library; simple `JSON.parse` is not enough

### For Flux

**Yes, a plugin could describe its hook interface this way.** The Registry would return an `@context` document defining the plugin's hook names, their parameter types, and return types. A consumer reads the `@context`, learns the method shapes, and can call them. This is heavyweight but very flexible.

### Registry returning a method signature

```
GET /registry/hooks/yt-feed

→ {
  "@context": {
    "methods": { "@id": "flux:Hook#methods", "@container": "@set" },
    "feed": { "@id": "flux:HookFeed" },
    "params": { "@id": "flux:Method#params" },
    "maxResults": { "@id": "flux:Param#maxResults", "@type": "xsd:integer" }
  },
  "methods": [
    {
      "@id": "flux:Method/feed",
      "label": "feed",
      "params": { "maxResults": 10 }
    }
  ]
}
```

---

## 2. HAL (Hypertext Application Language) / REST HATEOAS

### What it is

HAL is a simple JSON convention (not a full vocabulary like Hydra) that standardizes how resources link to each other. It uses two reserved keys:

- `_links` — an object whose keys are link relation names (like `self`, `next`, `edit`) and values are `{ "href": "..." }` objects
- `_embedded` — optionally embeds related resources inline

Source: [JSON Hypertext Application Language (IETF draft)](https://www.ietf.org/archive/id/draft-kelly-json-hal-11.html) (2023-10-19)

```json
{
  "_links": {
    "self": { "href": "/orders/123" },
    "next": { "href": "/orders/124" },
    "cancel": { "href": "/orders/123/cancel" }
  },
  "orderId": 123,
  "total": 29.99
}
```

HATEOAS (Hypermedia As The Engine Of Application State) is the broader REST constraint: the server tells the client what it can do next, via links in every response. The client never hardcodes URLs.

Source: [RESTful Web APIs (O'Reilly) — Richardson & Amundsen, 2013](https://api7.ai/learning-center/api-101/hypermedia-apis)

HAL has **no form/action metadata** — it only links. You cannot describe "POST to this URL with body shape X" in HAL alone; that requires an extension like Hydra or Siren.

### Self-describing?

**Partial.** HAL tells you *where* to go next (the URLs) and what *rel* each link has (the semantics of the relationship). It does NOT tell you what parameters the linked endpoint expects. A client still needs domain knowledge to understand that `"cancel"` means POST with no body vs. PUT with a reason.

### Overhead

- `_links` and `_embedded` add ~15-30% to response size
- No schema resolution overhead — it's just JSON with a convention
- Very simple to parse (no libraries needed)

### For Flux

**Limited but simple.** HAL would let the Registry tell a consumer "here are the available plugin hooks as links." But it wouldn't describe parameters or return types. You'd need a separate mechanism for that.

### Registry returning a method signature

```
{
  "_links": {
    "self": { "href": "/registry/hooks/yt-feed" },
    "invoke": { "href": "/rpc/yt-feed/feed" }
  },
  "name": "yt-feed",
  "methods": ["feed"]
}
```

The consumer must know *out of band* that calling `invoke` with `{ "method": "feed", "params": { "maxResults": 10 } }` is the right shape. Not self-describing for the parameters.

---

## 3. CBOR / CDDL

### What it is

CBOR (RFC 8949) is a binary JSON replacement that supports "tagged" data items. Every CBOR item has a **major type** (0-7) encoded in the first byte — unsigned int, negative int, byte string, text string, array, map, tagged item, or floating-point/simple. That's the self-describing part: any CBOR decoder can determine the type of every value without a schema.

Source: [RFC 8949 — CBOR (IETF STD 94)](https://www.rfc-editor.org/rfc/rfc8949.html) (2020-12)

CBOR also has **tag numbers** (major type 6) that add semantic meaning. For example:
- Tag 0: date/time string in RFC 3339
- Tag 1: epoch-based timestamp (numeric)
- Tag 32: text string that's a URI
- Tag 55799: "self-described CBOR" — a magic marker at the start of raw CBOR data

CDDL (RFC 8610) is a schema language for describing CBOR structures, like JSON Schema but for CBOR.

Source: [RFC 8610 — CDDL](https://datatracker.ietf.org/doc/html/rfc8610) (2019-06)

### Self-describing?

**The data types are self-describing** (the decoder always knows whether it's reading an int, string, array, map, etc.). **The semantics are NOT** — knowing something is a byte string doesn't tell you it's an RSA public key. Semantic tags help but are application-specific.

### Overhead

- Very compact: a 64-bit unsigned int is 1-9 bytes depending on magnitude
- A typical JSON-like object is ~30-40% smaller than equivalent JSON
- Tagged items add ~1 byte overhead per tag
- Parsing is slightly more complex than JSON but well within reach for constrained devices

### For Flux

**Yes.** A plugin could declare that its parameter formats are CDDL schemas. The Registry stores the CDDL and serves it to consumers. The consumer uses the CDDL to validate parameters before sending. Actual data can be CBOR for compact IPC, or JSON (since CDDL works for JSON too — JSON's data model is a subset of CBOR's).

### Registry returning a method signature

As CDDL (served as text by the Registry):

```
feed-params = {
  maxResults: uint .default 5
  language?: text
}
```

Or equivalently in CBOR tagged form (binary):

```
A3                               # map(3)
   6A 6D 61 78 52 65 73 75 6C 74 73  # "maxResults" -- key as text string
   0A                               # 10 (unsigned int) -- default value
```

---

## 4. ASN.1 BER/DER

### What it is

ASN.1 (Abstract Syntax Notation One) is a schema language (1984, ITU-T X.680). BER (Basic Encoding Rules, X.690) is its original binary encoding. Every BER-encoded value has a **TLV** structure: **Tag** (type identifier), **Length** (how many bytes follow), **Value** (the actual data, possibly nested TLV).

Source: [ITU-T X.690 — ASN.1 Encoding Rules](https://www.itu.int/rec/T-REC-X.690) (2021)

Tags are universal (same meaning everywhere):
- `0x02` = INTEGER
- `0x03` = BIT STRING
- `0x04` = OCTET STRING
- `0x30` = SEQUENCE (constructed)

Source: [A Layman's Guide to ASN.1, BER, and DER](http://luca.ntop.org/Teaching/Appunti/asn1.html)

Example encoding of INTEGER 5:
```
02 01 05
|  |  |
|  |  +-- value (5)
|  +----- length (1 byte)
+-------- tag (INTEGER = 0x02)
```

Because every value carries its own tag, a decoder can traverse the entire TLV tree without knowing the schema. This is why generic ASN.1 dump tools exist — they don't need the schema to display the structure.

### Self-describing?

**Partially.** The low-level types (INTEGER, OCTET STRING, SEQUENCE) are self-describing. But SEQUENCE field names are NOT encoded — only their order. You need the schema to know "field 1 is `name` of type UTF8String, field 2 is `age` of type INTEGER." Some tags are context-specific (class `[0]`, `[1]`, etc.) which provide positional disambiguation but not semantic names.

### Overhead

- Small: 1+1 bytes of T+L per value (minimum 2 bytes overhead per value)
- X.509 certificates are typically 900-1400 bytes DER
- ~40% smaller than equivalent XML
- Parsing complexity is moderate (but historically error-prone — many CVEs in ASN.1 parsers)

### Why X.509 succeeded, CORBA failed

**X.509 certificates** succeeded because:
- The schema is well-known and fixed (RFC 5280)
- DER gives a unique encoding (canonical = verifiable signatures)
- Every TLS library has a battle-tested ASN.1 parser
- The domain is narrow (cryptographic identities)

**CORBA** (Common Object Request Broker Architecture) failed because:
- Required full schema agreement between client and server at compile time
- GIOP (its protocol) used CDR encoding which is NOT self-describing — you MUST have the schema (IDL stubs) to decode messages
- The complexity of the full CORBA stack was enormous (ORB, IDL compiler, POA, etc.)
- Binary wire format was opaque without the schema — debugging required matching the exact IDL

Source: [Campbell, "CORBA: A Failed Promise" — comparison analysis](https://geniestool.com/crypto-tools/asn1-decoder)

### For Flux

**BER/DER style TLV is overkill** — it predates JSON and targets constrained telecoms/crypto. But the insight (every value carries its type tag) is valuable. Flux could use a simpler tagged format.

### Registry returning a method signature

Not natural in ASN.1 without a schema. You'd define:

```asn1
Method-Signature ::= SEQUENCE {
  method-name UTF8String,
  params SEQUENCE OF Param-Definition
}
```

But the consumer needs this schema ahead of time to parse it. That's the opposite of self-describing for the *structural* level.

---

## 5. XML Namespaces + XSD

### What it is

XML Namespaces (W3C, 1999) let elements from different vocabularies coexist in one document. A namespace URL identifies the vocabulary:

```xml
<root xmlns:html="http://www.w3.org/1999/xhtml">
  <html:body>
    <html:p>Hello from XHTML inside my document</html:p>
  </html:body>
</root>
```

Source: [W3C XML Namespaces](https://www.w3.org/TR/xml-namespaces/) (2009-12-08)

`xsi:schemaLocation` hints at where to find the XSD schema for a namespace:

```xml
<root xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
      xsi:schemaLocation="http://example.com/myns myns.xsd">
```

Source: [W3C XML Schema Definition Language (XSD) 1.1](https://www.w3.org/TR/xmlschema11-1/) (2012-04-05)

In theory, an XML parser encountering `foo:bar` could:
1. Resolve `foo` to a namespace URL
2. Dereference that URL (or use `schemaLocation`) to fetch the schema
3. Validate the element against the schema

In practice, most parsers do NOT fetch schemas automatically (security and performance concerns). The `schemaLocation` is a hint, not a requirement.

### Self-describing?

**In theory: yes.** Every element's namespace URL can point to a schema that defines it. **In practice: no.** Most XML consumers don't fetch schemas. They're written to know the expected namespace/shape ahead of time. The namespace acts as a versioning/disambiguation mechanism, not a runtime schema discovery mechanism.

### Overhead

- Massive: namespace declarations, qualified names, angle brackets
- Typical XML payload is 4-10x larger than equivalent binary
- Parsing is relatively expensive (DOM builds a tree, SAX is stream-based but complex)
- Schema fetching adds network latency if done at runtime

### For Flux

**Too heavyweight.** But the concept of a namespace URL as an interface identifier is useful. A plugin hook could be identified by a namespace-like string (`"flux:yt-feed/feed"`) that the consumer can query to the Registry for details.

### Registry returning a method signature

As XSD:

```xml
<xs:schema xmlns:xs="http://www.w3.org/2001/XMLSchema"
           targetNamespace="flux:yt-feed">
  <xs:element name="feed">
    <xs:complexType>
      <xs:sequence>
        <xs:element name="maxResults" type="xs:int" default="5"/>
      </xs:sequence>
    </xs:complexType>
  </xs:element>
</xs:schema>
```

---

## 6. Erlang/Elixir Pattern Matching

### What it is

In the Actor model, messages are untyped data structures (tuples, atoms, maps). A process receives a message and pattern-matches against its shape:

```elixir
receive do
  {:hello, name} -> greet(name)
  {:ping} -> pong()
  {:add, x, y} -> x + y
  other -> {:unknown, other}
end
```

Source: [Elixir Patterns and Guards](https://elixir.hexdocs.pm/elixir/patterns-and-guards.html)

Source: [Erlang Reference Manual — Pattern Matching](https://www2.erlang.org/documentation/doc-5.3/doc/reference_manual/patterns.html)

The first matching clause wins. Messages that don't match any pattern remain in the mailbox and are retried on the next `receive` call.

### Handling unknown shapes

Three outcomes:
1. **No match, no `after` timeout** — the process blocks forever (messages pile up in mailbox)
2. **No match, with `after`** — the timeout fires and the process handles it
3. **Catch-all clause** — an `_` or `other` variable catches everything

```elixir
receive do
  {:expected, data} -> handle(data)
  {:shutdown} -> :ok
after
  5000 -> {:error, :timeout}
end
```

Without a catch-all, unhandled messages sit in the mailbox. Over time, the mailbox grows, consuming memory. If a process crashes and restarts via OTP supervision, old unhandled messages in the mailbox are lost.

### Self-describing?

**No.** The message carries no type metadata. The process decides what shapes it accepts. This is the opposite of self-describing — the consumer (process) has full knowledge, not the message.

### Error modes

- **Mailbox flooding**: unhandled messages accumulate until OOM
- **Silent drops**: restarting a process discards its mailbox
- **Implicit coupling**: sender and receiver must agree on message shape (no compile-time checking for messages across processes — all runtime)

### For Flux

This is actually the current Flux approach! The host sends JSON-RPC messages to plugins and vice versa. A plugin receives messages and matches on the `method` field. Unrecognized methods are ignored or error-returned.

The lesson: Erlang/Elixir shows that **a catch-all clause is essential** for robustness. Flux plugins already return errors for unknown methods, but the pattern (match on `method` string → dispatch → catch-all → error) mirrors Erlang exactly.

### Registry returning a method signature

Not applicable — Erlang doesn't use a Registry for this. The consumer (process) is compiled with knowledge of all accepted message shapes.

---

## 7. TypeScript Tagged Unions / Discriminated Unions

### What it is

A discriminated union is a type composed of several object shapes, each with a unique literal field (the "tag" or "discriminant"):

```typescript
type Result<T> =
  | { kind: "success"; data: T; timestamp: Date }
  | { kind: "error"; message: string; code: number }
  | { kind: "loading"; progress?: number }
```

Source: [TypeScript Handbook — Discriminated Unions](https://www.typescriptlang.org/docs/handbook/2/narrowing.html#discriminated-unions)

When you switch on the discriminant, TypeScript narrows the type:

```typescript
function handle<T>(result: Result<T>) {
  switch (result.kind) {
    case "success":
      // TypeScript knows: result.data is T, result.timestamp is Date
      return result.data;
    case "error":
      // TypeScript knows: result.message is string, result.code is number
      return result.message;
    case "loading":
      return "loading...";
  }
}
```

A `default: assertNever(result)` branch gives compile-time exhaustiveness checking — if you add a new variant and forget to handle it, the compiler errors.

### Self-describing?

**In the type system: yes.** Any valid JSON object conforming to a discriminated union can be recognized by reading the `kind` field. **In the runtime: no.** TypeScript types are erased at compile time. The `kind` field is a runtime string, but there's no automatic schema to tell a runtime consumer what shapes exist. You need a separate validation step (Zod, io-ts, JSON Schema) to verify incoming data at runtime.

### Overhead

- Zero runtime overhead for TypeScript (types are compile-time only)
- The `kind` field adds a small per-object string (~5-20 bytes in JSON)
- Zod's `z.discriminatedUnion()` is O(1) by building a lookup map — much faster than sequential `oneOf` checks

### For Flux

**This is the recommended simplest approach** — the JSON-RPC messages Flux uses can be formalized as a discriminated union. Every plugin message has `method` as the discriminant. The Registry tells consumers "for hook X, expect method Y with parameters matching shape Z." The consumer creates a discriminated union from those descriptions and uses it for type-safe dispatch.

### Registry returning a method signature

The Registry returns the method schema in a form that maps directly to a TypeScript discriminated union:

```json
{
  "hook": "feed.video",
  "methods": [
    {
      "method": "feed",
      "params": {
        "type": "object",
        "properties": {
          "maxResults": { "type": "integer", "default": 5 },
          "language": { "type": "string" }
        },
        "required": []
      },
      "returns": { "type": "array", "items": { "type": "object" } }
    }
  ]
}
```

Which the consumer compiles to:

```typescript
type FeedVideoParams = { maxResults?: number; language?: string };
```

---

## 8. JSON Schema / OpenAPI Schema Object

### What it is

JSON Schema (draft 2020-12) provides `oneOf` for saying "the data matches exactly one of these schemas." Combined with `const` on a discriminator property, you get polymorphic type dispatch:

```json
{
  "oneOf": [
    {
      "properties": {
        "type": { "const": "circle" },
        "radius": { "type": "number" }
      },
      "required": ["type", "radius"]
    },
    {
      "properties": {
        "type": { "const": "rectangle" },
        "width": { "type": "number" },
        "height": { "type": "number" }
      },
      "required": ["type", "width", "height"]
    }
  ]
}
```

Source: [JSON Schema — Applying `oneOf`](https://json-schema.org/understanding-json-schema/reference/combining) (2020-12)

OpenAPI 3.x adds a `discriminator` keyword as a hint for code generators:

```yaml
components:
  schemas:
    WebhookEvent:
      oneOf:
        - $ref: '#/components/schemas/PaymentSucceeded'
        - $ref: '#/components/schemas/UserCreated'
      discriminator:
        propertyName: type
        mapping:
          payment.succeeded: '#/components/schemas/PaymentSucceeded'
          user.created: '#/components/schemas/UserCreated'
```

Source: [OpenAPI 3.1 Specification — Discriminator Object](https://spec.openapis.org/oas/v3.1.0#discriminator-object)

### Self-describing?

**With a registry: yes.** If the consumer has access to the JSON Schema (via the Registry), the shapes of all methods are fully described. The consumer can:
- Validate parameters before sending (using Ajv or any JSON Schema validator)
- Generate client code (with openapi-typescript, etc.)
- Know the return type shape

**Without a registry: no.** The JSON Schema itself must be retrieved ahead of time.

### Overhead

- Schema fetching: one network round-trip per plugin (can be cached)
- Schema files can be large (a complex API may have 100KB+ of schemas)
- Validation at runtime adds CPU cost (but small: Ajv validates simple objects in microseconds)
- Zod's `discriminatedUnion()` is ~100x faster than `union()` for 10+ variants (O(1) vs O(n)) — important for hot paths

Source: [JSON Schema Discriminator Guide (jsonic.io)](https://jsonic.io/guides/json-schema-discriminator)

### For Flux

**This is the most directly applicable approach.** The Flux Registry is already designed to store plugin metadata. Extending it to store JSON Schemas for each hook's parameters is natural:

```
Registry response for /hooks/yt-feed:
→ {
  "name": "yt-feed",
  "hooks": ["feed.video"],
  "methods": {
    "feed": {
      "params": <JSON Schema>,
      "returns": <JSON Schema>
    }
  }
}
```

The consumer:
1. Calls Registry to discover available hooks
2. Gets the JSON Schema for each hook's method parameters
3. Can validate any parameter payload before sending via `callHook()`
4. Uses the return type schema to safely interpret the response

### JSON Schema `if/then/else` for discriminated dispatch

JSON Schema also supports `if/then/else` which performs faster than `oneOf`:

```json
{
  "if": { "properties": { "type": { "const": "circle" } } },
  "then": { "properties": { "radius": { "type": "number" } }, "required": ["radius"] }
}
```

This avoids trying each branch — only one check is performed. Useful if the Registry serves schemas for dispatch, not just validation.

---

## 9. Amazon Ion / Apache Avro

### Amazon Ion

Ion is a self-describing format with interchangeable text (JSON superset) and binary representations. Every binary value is prefixed with a **type descriptor byte** (4-bit type code + 4-bit length). This means a decoder can parse any value without a schema — it knows the type and length of every field.

Source: [Amazon Ion Documentation](https://amazon-ion.github.io/ion-docs/) (2025)

Source: [Ion Binary Encoding](https://amazon-ion.github.io/ion-docs/docs/binary.html) — TL type prefix

Types: null, bool, int, float, decimal, timestamp, symbol, string, clob, blob, list, sexp, struct.

Annotations attach metadata to any value:

```
dollars::100.0
height::inches::72
lotto_numbers::[7, 9, 19, 40, 42, 44]
```

### Apache Avro

Avro is NOT self-describing on the wire. Binary Avro data includes no type tags — it's compact but requires a schema to decode. The schema is typically stored alongside the data (in Avro files) or fetched from a Schema Registry (in Kafka/streaming contexts).

Source: [Apache Avro Specification 1.11.1](https://avro.apache.org/docs/1.11.1/specification) — "Binary encoded Avro data does not include type information or field names. The benefit is that the serialized data is small, but as a result a schema must always be used in order to read Avro data correctly."

Avro's key contribution is **schema evolution** with **reader/writer schemas**:
- The **writer schema** is the schema used when the data was written
- The **reader schema** is what the consumer expects
- Avro's resolution rules reconcile differences: fields present in writer but not reader are dropped; fields in reader but not writer use defaults

Source: [Confluent — Avro Schema Evolution & Compatibility](https://docs.confluent.io/platform/current/schema-registry/fundamentals/schema-evolution.html)

Evolution rules:
- BACKWARD: new schema can read old data (adding fields OK if they have defaults)
- FORWARD: old schema can read new data (removing fields OK)
- FULL: both directions
- TRANSITIVE variants: check against all historical schemas, not just previous

### Self-describing?

**Ion: 100% self-describing at the data-type level.** Every value's type is encoded on the wire. But structural/semantic understanding (what a struct field means) requires external context.

**Avro: 0% self-describing at the wire level.** Must have the schema. But schemas are versioned and discoverable via a Registry.

### Overhead

- **Ion binary**: ~10% larger than compact CBOR for equivalent data (longer type descriptors, symbol table overhead)
- **Avro binary**: ~10-30% smaller than CBOR (no type tags on wire), but schema must be stored/fetched separately (~2-5KB per schema version)
- Schema Registry latency: 1-20ms per schema fetch (tolerable with caching)

### For Flux

**Ion** is overkill — you're already on JSON. But the insight (every value declares its type inline) is useful for binary IPC between host and plugins if you switch from JSON.

**Avro** is interesting for its **reader/writer schema pattern**: the Registry stores "writer schemas" (what each plugin expects). A consumer sends parameters conforming to the plugin's schema. If the consumer has an older schema, Avro-style resolution could reconcile differences (with defaults for new fields). However, Avro's binary format is not self-describing, so it's worse for debugging than JSON.

### Registry returning a method signature (Avro)

```json
{
  "type": "record",
  "name": "FeedParams",
  "fields": [
    { "name": "maxResults", "type": "int", "default": 5 },
    { "name": "language", "type": ["null", "string"], "default": null }
  ]
}
```

The consumer stores this as the "writer schema" for `yt-feed.feed`. It validates that its parameter payload conforms.

---

## 10. Synthesis for Flux

### Spectrum of self-description

| Approach | Self-Describing? | Overhead | Best For |
|---|---|---|---|
| **JSON-LD/Hydra** | Meanings (via @context) | High (fetch context, processing) | Open-world APIs; semantic web |
| **HAL/HATEOAS** | Links (where to go next) | Low (just _links key) | Navigation discovery only |
| **CBOR/CDDL** | Data types (major type in 1st byte) | Low (1 byte/type tag) | Compact binary IPC |
| **ASN.1 BER/DER** | Low-level types (TLV tags) | Medium (2+ bytes T+L per value) | Crypto, telecoms (X.509) |
| **XML+XSD** | Schema URL per namespace (theory) | High (XML verbosity) | Documents, SOAP legacy |
| **Erlang matching** | None (consumer knows shapes) | Zero | Actor systems with fixed contracts |
| **TypeScript tagged unions** | Tag only (kind field) | Zero at runtime | Type-safe dispatch in code |
| **JSON Schema + discriminator** | Full schema via Registry | Schema fetch + validation | Plugin parameter validation |
| **Amazon Ion** | Data types (type byte prefix) | Medium (type byte per value) | Long-term data preservation |
| **Apache Avro** | None on wire (schema via Registry) | Low on wire; schema fetch needed | High-throughput streaming |

### Simplest possible self-describing mechanism

**A JSON object with a `method` field as the discriminant.** That's what Flux already uses:

```json
{"id": 1, "method": "yt-feed.feed", "params": {"maxResults": 10}}
```

The `method` string IS the type tag. The Registry tells the consumer: "for method `yt-feed.feed`, the params schema is X." That's the tagged union pattern.

**Step up from simplest**: Add a `@schema` URL field to each message, pointing to the JSON Schema in the Registry:

```json
{
  "id": 1,
  "@schema": "flux://registry/schemas/yt-feed/feed",
  "method": "yt-feed.feed",
  "params": {"maxResults": 10}
}
```

Now the message carries a pointer to its own schema. The consumer can fetch it (once, then cache) to validate the params. This is JSON-LD-flavored but minimal.

### Recommended approach for Flux

**Hybrid of JSON Schema + tagged union pattern:**

1. **Plugin registration** — each plugin tells the Registry about its hooks and methods, including a JSON Schema for each method's parameters and return type.

2. **Registry serves schema via API** — `GET /registry/hooks/feed.video` returns:
   ```json
   {
     "hook": "feed.video",
     "provider": "yt-feed",
     "methods": {
       "feed": {
         "params": {
           "type": "object",
           "properties": {
             "maxResults": { "type": "integer", "minimum": 1, "maximum": 50, "default": 10 }
           },
           "additionalProperties": false
         },
         "returns": {
           "type": "object",
           "properties": {
             "items": { "type": "array" },
             "error": { "type": "string" }
           }
         }
       }
     }
   }
   ```

3. **Consumer queries Registry** before calling the hook:
   - Gets the `feed` method's params schema
   - Validates its parameters against the schema (using Ajv or similar)
   - Calls `window.callHook("feed.video", "feed", { maxResults: 10 })`
   - Validates response against `returns` schema

4. **Fallback behavior** for unknown/poorly-described hooks:
   - Consumer passes params through as-is (no validation)
   - Plugin validates on its end and returns a `{"id": n, "error": "..."}` if params don't match
   - This mirrors the Erlang "catch-all" pattern

### Key insight for Flux

You don't need the message to be fully self-describing. **You need the Registry to describe the message shapes.** The consumer queries the Registry once per plugin (at startup, cached thereafter) and learns all method signatures. Then messages between consumer and plugin are plain JSON — lightweight, debuggable, and their meaning is known from the cached Registry response.

This is the **Avro Schema Registry** pattern adapted for JSON: schemas live in a central Registry, messages on the wire are just data. The difference: Avro's wire format is opaque binary; Flux's wire format is plain JSON that humans can read even without the schema. Best of both worlds.

### Summary for a beginner

| Concept | One-line explanation |
|---|---|
| **Tagged union** | Every message has a `type` or `method` field that says what it is |
| **JSON Schema** | A machine-readable description of the shape of a JSON object |
| **Registry** | A service that stores and serves plugin schemas |
| **Schema fetch** | Consumer asks Registry "what params does hook X accept?" once, then knows forever |
| **Validation** | Consumer checks params against schema before sending |
| **Reader/writer schema** | If consumer and plugin have different schema versions, resolve differences with defaults |
| **Namespacing** | `flux:yt-feed/feed.video` = globally unique identifier for a hook |
| **Self-describing message** | A message that includes enough metadata for a generic consumer to understand it without pre-shared knowledge |
