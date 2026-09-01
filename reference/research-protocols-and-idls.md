# Component Communication Protocols & Contract Specifications

> Research for Flux — a modular desktop app plugin system.
> All claims cite primary sources. Explanations assume no prior IPC/IDL knowledge.

**Table of Contents**

1. [Interface Definition Languages (IDLs)](#1-interface-definition-languages-idls)
2. [D-Bus](#2-d-bus)
3. [WebSocket + Sub-protocol Negotiation](#3-websocket--sub-protocol-negotiation)
4. [JSON-RPC 2.0](#4-json-rpc-20)
5. [MessagePack-RPC](#5-messagepack-rpc)
6. [Cap'n Proto RPC](#6-capn-proto-rpc)
7. [Unix Domain Sockets + SO_PEERCRED](#7-unix-domain-sockets--so_peercred)
8. [FlatBuffers / FlexBuffers](#8-flatbuffers--flexbuffers)

---

## 1. Interface Definition Languages (IDLs)

### What is an IDL and why were they invented?

An **Interface Definition Language** is a declarative language for describing the shape of data and the operations that can be performed on it, independent of any programming language. The core idea: you write a description once, and tools generate code in whatever language you need (C++, Python, Rust, etc.) that can produce and consume messages matching that description.

IDLs were invented because distributed systems need a **contract** between a producer and consumer. If two processes written in different languages need to talk, they must agree on:
- What types of data exist (integers, strings, nested objects)
- What operations are available (method names, parameters, return types)
- How bytes on the wire map to those types

Without an IDL, each pair of communicating programs must hand-write parsing and serialization logic, which is error-prone and doesn't scale. IDLs provide a single source of truth.

Source: [OMG IDL 4.2 spec, Introduction](https://www.omg.org/spec/IDL/ISO/19516/PDF) — "IDL is a descriptive language used to define data types and interfaces in a way that is independent of the programming language or operating system/processor platform."

### Comparison of IDLs

#### CORBA IDL (the original)

Created by the Object Management Group (OMG) in the early 1990s for CORBA (Common Object Request Broker Architecture). This was the first widely-used IDL.

**What it looks like:**
```idl
module Calculator {
    interface Basic {
        long add(in long a, in long b);
        long subtract(in long a, in long b);
    };
};
```

**Key concepts:**
- Defines **interfaces** (like classes) with **operations** (methods) that have typed parameters with direction (`in`, `out`, `inout`)
- Supports modules for namespacing, inheritance between interfaces
- Language mappings exist for C, C++, Java, Ada, COBOL, etc.

**How it defines message shape:** The IDL describes the interface contract. The actual wire format is defined by a separate **GIOP** (General Inter-ORB Protocol) standard, typically IIOP over TCP.

**Type safety:** Very strong — the IDL compiler generates stubs and skeletons that enforce types at compile time in the target language.

**Introspectable?** Yes — CORBA includes an **Interface Repository** that stores IDL definitions and can be queried at runtime. A client can ask "what interfaces does this object support?" and get back IDL descriptions.

Source: [OMG IDL 3.5 spec](https://www.omg.org/spec/IDL/3.5/PDF) — "OMG IDL is the language used to describe the interfaces that client objects call and object implementations provide."

#### Protocol Buffers (protobuf)

Created by Google, released open-source in 2008. The dominant IDL for internal service communication at Google and many other companies.

**What it looks like:**
```protobuf
syntax = "proto3";

message Person {
  string name = 1;
  int32 id = 2;
  string email = 3;
  repeated string phone_numbers = 4;
}
```

**Key concepts:**
- Defines **messages** (data structures) with typed fields, each numbered with a unique tag
- Numbers are used in the binary wire format (not field names), making messages compact
- `repeated` = array/list
- Supports proto2, proto3, and Editions syntax variants

**How it defines message shape:** The `.proto` file is compiled by `protoc` into language-specific classes. The binary wire format packs field tag + wire type + value. Unknown fields are preserved (forward compatibility).

**Type safety:** Strong — code generation produces typed getters/setters. A field's type is fixed at schema compile time. No runtime type checking needed.

**Introspectable?** Partially. The messages are **not self-describing** on the wire — you need the `.proto` file to interpret them. However, protobuf supports a `Descriptor` API for reflection if the schema is available at runtime.

**Designed for process boundaries?** Protobuf is transport-agnostic. It's layered with gRPC for RPC, but the serialization itself doesn't care about network vs. process. It's designed for *network* boundaries primarily (bandwidth-conscious), but used everywhere.

Source: [Protocol Buffers Overview](https://protobuf.dev/overview/) — "Protocol Buffers are a language-neutral, platform-neutral extensible mechanism for serializing structured data."

Source: [Google Open Source Blog (2008)](https://opensource.googleblog.com/2008/07/protocol-buffers-googles-data.html) — "One of Protocol Buffers' major design goals is simplicity. By sticking to a simple lists-and-records model..."

#### Thrift IDL

Created by Facebook, now Apache project. Similar goals to protobuf but with built-in RPC support.

**What it looks like:**
```thrift
struct Person {
  1: string name,
  2: i32 id,
  3: string email,
}

service PersonService {
  Person getPerson(1: i32 id) throws (1: NotFoundException e),
}
```

**Key concepts:**
- Combines data definition (`struct`) and service definition (`service`) in one file
- Services define RPC methods with return types, parameters, and exceptions
- Multiple transport protocols (binary, compact, JSON) and transports (sockets, HTTP, etc.)

**How it defines message shape:** The `.thrift` file is compiled into language-specific code. The binary protocol is field-tagged like protobuf. Thrift supports multiple **protocols** (encoding formats) on top of **transports** (communication channels).

**Type safety:** Strong — code generation enforces types. Services are interface contracts that both client and server compile against.

**Introspectable?** No native introspection on the wire. Need the `.thrift` file.

**Designed for process boundaries?** Primarily network RPC, though can be used over any transport. It's a full RPC framework, not just serialization.

Source: [Apache Thrift IDL documentation](https://thrift.apache.org/docs/idl) — "The Thrift interface definition language (IDL) allows for the definition of Thrift Types."

#### Smithy IDL

Created by Amazon, open-sourced in 2020. A modern IDL designed for code generation and modeling.

**What it looks like:**
```
$version: "2.0"

namespace example.weather

/// Provides weather forecasts
service Weather {
    version: "2021-01-07",
    operations: [GetForecast]
}

@readonly
operation GetForecast {
    input: GetForecastInput,
    output: GetForecastOutput
}

structure GetForecastInput {
    latitude: Float,
    longitude: Float,
}
```

**Key concepts:**
- Uses **traits** (annotations like `@readonly`) to add metadata
- Separates shape definitions from transport/protocol — Smithy doesn't prescribe HTTP or any transport
- Can be represented as JSON or in the Smithy IDL
- Designed for "model transformations" — tools consume a Smithy model and produce clients, servers, docs, etc.

**How it defines message shape:** Shapes (structures, unions, enums, etc.) are the core abstraction. Traits add constraints and behavior.

**Type safety:** Full type system with shapes, constraints, and valid values.

**Introspectable?** Yes — the Smithy model can be serialized as JSON and introspected at build time or runtime.

Source: [Smithy 2.0 Specification](https://smithy.io/2.0/spec/) — "Smithy 2.0, an interface definition language and set of tools used to build clients, servers, and other kinds of artifacts through model transformations."

#### OpenAPI / Swagger

A specification for describing REST/HTTP APIs. Not an IDL in the traditional sense (data+operations together), but serves the same purpose for HTTP services.

**What it looks like (YAML):**
```yaml
openapi: "3.0.0"
info:
  title: Weather API
  version: "1.0.0"
paths:
  /forecast:
    get:
      parameters:
        - name: latitude
          in: query
          schema:
            type: number
      responses:
        "200":
          content:
            application/json:
              schema:
                $ref: "#/components/schemas/Forecast"
```

**Key concepts:**
- Describes HTTP endpoints (paths, methods, parameters, request bodies, responses)
- Uses JSON Schema for data types
- Not tied to any specific programming language or framework
- Ecosystem includes code generators, documentation tools, mock servers

**How it defines message shape:** JSON Schema (or equivalent YAML) inline or `$ref`-referenced.

**Type safety:** Weak compared to protobuf/Thrift — JSON Schema is descriptive, not prescriptive. Code generators exist but output quality varies.

**Introspectable?** Yes — the OpenAPI document is JSON/YAML and can be served, discovered, and used to generate clients dynamically.

Source: [OpenAPI Specification 3.0.4](https://spec.openapis.org/oas/v3.0.html) — "The OpenAPI Specification (OAS) defines a standard, programming language-agnostic interface description for HTTP APIs."

### Summary table

| IDL | Primary purpose | Wire format | Self-describing? | Code gen? | Versioning |
|-----|----------------|-------------|-------------------|-----------|------------|
| CORBA IDL | Object RPC | IIOP (binary) | Yes (Interface Repo) | Yes | Interface inheritance |
| Protobuf | Data serialization | Custom binary | No (need `.proto`) | Yes | Field numbers, optional |
| Thrift | RPC + serialization | Multiple (binary, compact) | No (need `.thrift`) | Yes | Field numbers, required/optional |
| Smithy | Model-driven dev | Any (transport-agnostic) | Yes (JSON model) | Yes | Version in model |
| OpenAPI | HTTP API description | JSON/HTTP | Yes (it's the doc) | Yes (tools) | URL versioning |

### Which one is designed for *process* boundaries (not network)?

**None of the above, natively.** All these IDLs were designed with network communication as the primary use case. However:

- **D-Bus** (see next section) is designed for local same-machine IPC, not network. It's the closest thing to a "process boundary IDL."
- **Cap'n Proto** (section 6) straddles both — its RPC protocol handles local capability passing with a "four-party handshake" for direct connections.
- **FlatBuffers** can be used over shared memory or `mmap`'d files, which is a process-boundary case sans network.

For Flux's subprocess stdin/stdout model, JSON-RPC + a schema definition (even just a README or TypeScript types) is the simplest approach. Adding protobuf or Thrift buys type safety but adds compilation complexity. D-Bus-style introspection is the gold standard for discoverability.

---

## 2. D-Bus

D-Bus is the standard IPC system on Linux desktops. It's a message bus that allows multiple applications to communicate with each other. It is designed for **same-machine** IPC, not network communication.

Source: [D-Bus Specification](https://dbus.freedesktop.org/doc/dbus-specification.html) — "D-Bus is a low-overhead because it uses a binary protocol, and does not have to convert to and from a text format such as XML. Because D-Bus is intended for potentially high-resolution same-machine IPC, not primarily for Internet IPC, this is an interesting optimization."

### Architecture

D-Bus has two layers:

1. **libdbus** — a one-to-one peer-to-peer protocol library. Two applications can communicate directly.
2. **Bus daemon** — a central message router that sits between multiple applications. The daemon forms a hub with spokes.

The bus daemon has two standard instances:
- **System bus** — a machine-global singleton for system services (hardware events, systemd, network manager)
- **Session bus** — one per user login session for desktop applications

### How it works

**Message types:**
- `METHOD_CALL` — a request to invoke a method on an object
- `METHOD_RETURN` — the response from a method call
- `ERROR` — an error response
- `SIGNAL` — a broadcast notification (no reply expected)

**Addressing:**
- Each connection has a **unique bus name** (e.g., `:1.234`) assigned automatically
- Services can claim a **well-known bus name** (e.g., `org.freedesktop.NetworkManager`)
- Methods target an **object path** (e.g., `/org/freedesktop/NetworkManager`)
- Methods belong to an **interface** (e.g., `org.freedesktop.NetworkManager.Device`)
- A method call specifies: destination bus name, object path, interface name, method name, and parameters

Source: [D-Bus Tutorial](https://dbus.freedesktop.org/doc/dbus-tutorial.html) — "Each object supports one or more interfaces. Think of an interface as a named group of methods and signals, just as it is in GLib or Qt or Java."

### The message format

D-Bus uses a **binary protocol** for efficiency. Messages are composed of:
1. **Header** — fixed fields: type, flags, serial number, header fields (path, interface, member, error name, reply serial, destination, sender, signature, etc.)
2. **Body** — marshaled according to a **type signature** string

The type system is rich: bytes, booleans, int16/32/64, uint16/32/64, doubles, strings, object paths, signatures, arrays, structs, variants, dictionaries. Type signatures are encoded as strings like `a{sv}` (array of dict entries with string keys and variant values).

### Introspection

This is D-Bus's killer feature. Every D-Bus object may implement the `org.freedesktop.DBus.Introspectable` interface, which has a single method `Introspect` that takes no arguments and returns an XML string.

The XML describes:
- All interfaces the object supports
- For each interface: methods (with parameter names, directions, types), signals, properties
- Child objects (forming a tree of objects)

Source: [D-Bus Specification - Introspection](https://dbus.freedesktop.org/doc/dbus-specification.html) — "D-Bus objects may support the interface `org.freedesktop.DBus.Introspectable`. This interface has one method `Introspect` which takes no arguments and returns an XML string."

Example introspection XML:
```xml
<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
 "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.example.MyService1">
    <method name="AddContact">
      <arg name="name" direction="in" type="s"/>
      <arg name="email" direction="in" type="s"/>
      <arg name="id" direction="out" type="u"/>
    </method>
    <signal name="ContactAdded">
      <arg name="id" type="u"/>
    </signal>
    <property name="Version" type="s" access="read"/>
  </interface>
</node>
```

There are tools like **d-spy** that use introspection to show every service on the bus, its objects, interfaces, methods, signals, and properties. This is the closest desktop analogy to what Flux needs — a plugin can declare "I provide these methods" and the host can discover them.

### Properties

D-Bus defines a standard `org.freedesktop.DBus.Properties` interface with:
- `Get(interface_name, property_name)` — returns the property value
- `Set(interface_name, property_name, value)` — sets the property value
- `GetAll(interface_name)` — returns all properties on an interface
- `PropertiesChanged(interface_name, changed_properties, invalidated_properties)` — signal emitted when properties change

This eliminates the need for custom `GetVersion()` / `SetVersion()` methods — properties are a standard pattern.

Source: [D-Bus API Design Guidelines](https://dbus.freedesktop.org/doc/dbus-api-design.html) — "The D-Bus specification defines the org.freedesktop.DBus.Properties interface, which should be used by all objects to notify clients of changes to their property values."

### Signals

Signals are one-way broadcast messages. A service emits a signal, and the bus daemon delivers it to all interested listeners. This enables an event-driven architecture — clients don't poll, they listen for events.

### Key takeaways for Flux

| D-Bus feature | What Flux can learn |
|---------------|---------------------|
| Introspection XML | A plugin should be able to declare "here are my methods." This is currently partially done via `plugin.json` manifest |
| Object path + interface | Two-level naming: a plugin has objects (e.g. `/feed`, `/auth`), each with interfaces (named methods) |
| Properties standard pattern | Instead of custom `get_config`/`set_config`, have a standard "get property" mechanism |
| Signals | Events emitted by plugins without expecting a reply — useful for feed updates, connection status changes |
| Binary protocol for performance | D-Bus is binary, but JSON-RPC is fine for low-volume plugin IPC on modern hardware |

D-Bus is **complex** — the spec is hundreds of pages, implementing a bus daemon from scratch is serious work. But the *patterns* (introspection, properties, signals, bus names) can be borrowed without adopting D-Bus itself.

---

## 3. WebSocket + Sub-protocol Negotiation

### What is WebSocket?

WebSocket (RFC 6455) is a protocol that provides a **full-duplex bidirectional communication channel** over a single TCP connection. Unlike HTTP (request-response), either side can send data at any time.

The connection starts as an HTTP upgrade request:
```
GET /chat HTTP/1.1
Host: server.example.com
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Key: dGhlIHNhbXBsZSBub25jZQ==
Sec-WebSocket-Protocol: chat, v2.chat
Sec-WebSocket-Version: 13
```

If the server supports it, it responds:
```
HTTP/1.1 101 Switching Protocols
Upgrade: websocket
Connection: Upgrade
Sec-WebSocket-Accept: s3pPLMBiTxaQ9kYGzzhZRbK+xOo=
Sec-WebSocket-Protocol: chat
```

After this handshake, both sides send **frames** (small binary or text packets) over the TCP connection. Frames have a type (text, binary, close, ping, pong), a length, and a payload. Text frames are UTF-8 encoded. Binary frames are raw bytes.

Source: [RFC 6455 - The WebSocket Protocol](https://www.rfc-editor.org/rfc/rfc6455.html)

### Sub-protocol negotiation

The `Sec-WebSocket-Protocol` header lets the client say "I can speak these protocols, in preference order" and the server picks one. This is an application-level protocol negotiation built into the WebSocket handshake.

**How it's useful:**
- The client proposes sub-protocols: `["json-rpc-v2", "json-rpc-v1", "msgpack-rpc"]`
- The server picks the best one it supports and echoes it back
- If the server doesn't support any, it omits the header and the connection proceeds without a sub-protocol (or the client can abort)

This is a form of **version negotiation without a separate endpoint** — the same URL works for multiple protocol versions.

Sub-protocol names should be namespaced to avoid collisions (e.g., `chat.example.com`). Backward-incompatible changes use different names (e.g., `v2.bookings.example.net`). Backward-compatible changes reuse the same name and handle differences within the protocol.

Source: [RFC 6455 Section 1.9](https://www.rfc-editor.org/rfc/rfc6455.html#section-1.9) — "Subprotocols can be versioned in backward-incompatible ways by changing the subprotocol name."

### Contrast with raw TCP or stdin/stdout

| | Raw TCP | stdin/stdout | WebSocket |
|---|---|---|---|
| Framing | None (stream) | None (stream) | Built-in (frames) |
| Negotiation | None | None | HTTP upgrade + sub-protocol |
| Bidirectional | Yes | Yes | Yes |
| Browser support | No | No | Yes (native) |
| Complexity | Low | Very low | Medium |

For Flux's current model (subprocess stdin/stdout), WebSocket isn't relevant — it's designed for browser-to-server and server-to-server over TCP. But the **sub-protocol negotiation concept** is valuable: Flux could use a similar mechanism where plugins declare which protocol versions they speak.

---

## 4. JSON-RPC 2.0

### The spec

JSON-RPC 2.0 is a lightweight RPC protocol that uses JSON as its data format. It defines:

1. **Request object**: sent from client to server
2. **Response object**: sent from server back to client
3. **Notification**: a request without an `id` (no response expected)
4. **Batch**: multiple requests sent as an array

Source: [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)

### Request object

```json
{
  "jsonrpc": "2.0",
  "method": "subtract",
  "params": [42, 23],
  "id": 1
}
```

Members:
- **jsonrpc** (string, required): MUST be exactly `"2.0"`
- **method** (string, required): the name of the method to invoke. Names starting with `rpc.` are reserved
- **params** (array or object, optional): the parameters for the method call
- **id** (string, number, or null, optional): used to match responses to requests. If omitted, it's a **notification** (no response)

### Response object

```json
{
  "jsonrpc": "2.0",
  "result": 19,
  "id": 1
}
```

On error:
```json
{
  "jsonrpc": "2.0",
  "error": {
    "code": -32601,
    "message": "Method not found"
  },
  "id": 1
}
```

Members:
- **jsonrpc** (string, required): MUST be exactly `"2.0"`
- **result**: present on success, MUST NOT exist if error is present
- **error** (object): present on error, MUST NOT exist if result is present — `code` (integer), `message` (string), `data` (optional additional info)
- **id**: MUST match the request's id

### Standard error codes

| Code | Message | Meaning |
|------|---------|---------|
| -32700 | Parse error | Invalid JSON |
| -32600 | Invalid Request | Request object is not valid |
| -32601 | Method not found | Method doesn't exist |
| -32602 | Invalid params | Method parameters invalid |
| -32603 | Internal error | Server-side error |
| -32000 to -32099 | Server error | Reserved for implementation-defined errors |

### Notifications

A notification is a request without an `id`:
```json
{"jsonrpc": "2.0", "method": "update", "params": [1,2,3]}
```
The server does not reply. Use for fire-and-forget messages.

### Batch

An array of request objects is a batch:
```json
[
  {"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},
  {"jsonrpc": "2.0", "method": "notify", "params": [7]},
  {"jsonrpc": "2.0", "method": "subtract", "params": [42,23], "id": "2"}
]
```
The server responds with an array of response objects (notifications have no response). Responses can be in any order — the client matches by `id`.

### What would adding the `jsonrpc` field change in Flux?

Flux currently uses a bare JSON format WITHOUT the `jsonrpc` field:
```json
{"id": 1, "method": "feed", "params": {}}
```

Adding `"jsonrpc": "2.0"` would change:

1. **Version identification** — A server can immediately distinguish between different protocol versions. If Flux ever changes the protocol, a plugin receiving an old-format request can detect incompatibility.

2. **Standard error handling** — JSON-RPC 2.0 specifies exactly how errors are reported. Flux currently uses ad-hoc error formats (`error: "<message>"`). Switching to the standard error object enables compatibility with JSON-RPC tooling and libraries.

3. **Interoperability** — With the `jsonrpc` field, the format becomes standard JSON-RPC 2.0. This means existing JSON-RPC libraries and debugging tools work out of the box. Without it, every tool needs custom handling.

4. **Minimal cost** — Adding one string field per message. The overhead is negligible (19 bytes per message).

5. **Notifications become standard** — Currently Flux doesn't appear to use notifications (requests without responses). JSON-RPC 2.0 defines them explicitly: omit `id`, get no response.

**Recommendation:** Add `"jsonrpc": "2.0"` to all messages. It's a single field that opens up compatibility with the entire JSON-RPC ecosystem. The change from Flux's current format is minimal — just add the field to request and response objects.

---

## 5. MessagePack-RPC

### What is MessagePack?

MessagePack is a **binary serialization format** — like JSON but in bytes instead of text. A JSON string `{"name":"Alice","age":30}` becomes about 22 bytes of MessagePack instead of 23 bytes of JSON text. More importantly, binary data (images, files) doesn't need Base64 encoding — it's stored as raw bytes.

Source: [MessagePack specification](https://github.com/msgpack/msgpack/blob/master/spec.md)

### MessagePack-RPC protocol

MessagePack-RPC uses MessagePack arrays as its wire format. It defines two message types:

**Request message** — a 4-element array:
```
[type, msgid, method, params]
```
- `type`: integer 0 (request)
- `msgid`: 32-bit unsigned integer (sequence number)
- `method`: string (method name)
- `params`: array of parameters

**Response message** — a 4-element array:
```
[type, msgid, error, result]
```
- `type`: integer 1 (response)
- `msgid`: 32-bit unsigned integer (matches request)
- `error`: nil on success, arbitrary error object on failure
- `result`: arbitrary result value (nil on error)

Source: [MessagePack-RPC spec](https://github.com/msgpack-rpc/msgpack-rpc/blob/master/spec.md)

### Comparison with JSON-RPC

| | JSON-RPC | MessagePack-RPC |
|---|---|---|
| Data format | Text (JSON) | Binary (MessagePack) |
| Human-readable | Yes | No (need a tool) |
| Binary data | Base64 (33% overhead) | Raw bytes (0 overhead) |
| Message size | Larger (text + whitespace) | Smaller (binary encoding) |
| Parsing speed | Slower (text parsing) | Faster (binary, schema-driven) |
| Debugging | Easy (read the wire) | Hard (must decode) |
| Complexity | Very simple | Simple |

### For Flux

MessagePack-RPC is attractive for:
- **Performance-critical plugins** — if a plugin sends large amounts of data frequently, MessagePack is significantly faster
- **Binary payloads** — if plugins ever need to send images, video frames, or other binary data, MessagePack handles them natively
- **Bandwidth-constrained environments** — though for stdin/stdout on the same machine, bandwidth is rarely an issue

**Verdict:** Not worth it for Flux's current use case unless binary data becomes important. JSON-RPC over stdin/stdout is fast enough for command-level IPC. The debugging benefit of JSON (you can `echo` a request to a plugin and see the response) outweighs the performance gain from MessagePack for a desktop app.

---

## 6. Cap'n Proto RPC

### What is Cap'n Proto?

Cap'n Proto is a **zero-copy serialization** format with a built-in **RPC protocol**. It was created by Kenton Varda (who also led Protocol Buffers v2 at Google). The core idea: instead of parsing bytes into a data structure, you **read directly from the bytes** — no parse step, no allocation, no copying.

Source: [Cap'n Proto: Schema Language](https://capnproto.org/language.html)

### How zero-copy works

With protobuf, when you receive 10KB of data:
1. Parse the binary into a `Person` object — allocates memory, copies fields, converts endianness
2. Access `person.name()` — reads from the new object

With Cap'n Proto, when you receive 10KB of data:
1. Point a `Person::Reader` at the bytes — no allocation, no parsing
2. Access `person.getName()` — reads directly from the original bytes

This is possible because Cap'n Proto's wire format is designed to match in-memory layout. A struct is laid out exactly as it would be in C — fixed-size data section, pointer section for variable-length fields. Alignment and endianness are fixed (little-endian).

Source: [Cap'n Proto Encoding Spec](https://capnproto.org/encoding.html) — "A struct value is encoded as a pointer to its content. The content is split into two sections: data and pointers, with the pointer section appearing immediately after the data section."

### Schema language

```capnp
struct Person {
  name @0 :Text;
  birthdate @3 :Date;
  email @1 :Text;
  phones @2 :List(PhoneNumber);
}
```

Notable design choice: **types come after names** (unlike C). Field numbers (`@0`, `@1`) are sequential and must start from 0. This makes version tracking visible in the schema — you can see that `birthdate` was added after `email` because it has a higher number.

### RPC Protocol (Level 1)

Cap'n Proto RPC has **levels** of implementation:

**Level 1**: Object references + promise pipelining.
- Capabilities (object references) are first-class — you can pass a reference to an object as a parameter
- **Promise pipelining**: you can start using a result before it's returned. If you call `getFile()` which returns a `File` capability, you can immediately call `getFile().getSize()` in the same round-trip — the server chains the calls internally

**Example** (from the docs — 4-step calculator evaluation in 1 round trip instead of 4):
```
Client sends: add(2, 3), mul(that_result, 4), add(that_result, 1), div(that_result, 2)
Server chains: computes add(2,3)=5, uses 5 in mul(5,4)=20, uses 20 in add(20,1)=21, uses 21 in div(21,2)=10
Result: 1 round trip instead of 4
```

Source: [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html) — "Promise Pipelining solves all of this!"

### Four-party handshake (Level 3)

When Alice (Vat A) wants to give Bob (Vat B) a reference to Carol (Vat C):
1. Alice sends `Provide` to Vat C, designating Bob as recipient
2. Alice sends `Resolve` to Bob, containing a `ThirdPartyCapId` for Carol
3. Bob sends `Accept` to Vat C to pick up the capability
4. Bob can now call Carol directly — no proxying through Alice

This is the "four-party handshake" or "third-party introduction." It ensures that object references can be passed around a network without all traffic going through a central hub.

Source: [Cap'n Proto RPC schema](https://github.com/capnproto/capnproto/blob/master/c%2B%2B/src/capnp/rpc.capnp) — defines `Provide`, `Accept`, `Disembargo` message types.

### Object-capability model

Cap'n Proto is designed for **capability-based security**. A capability is both a reference to an object AND the authority to use it. You can only call a method if you hold a capability reference. There are no global names, no ambient authority. This is fundamentally different from URL-based systems (REST) where anyone who knows a URL can access it.

### For Flux

Cap'n Proto is **overkill** for Flux's current architecture (subprocess stdin/stdout). However:
- The **capability model** is interesting for security — a plugin can only call methods on objects it has been explicitly given references to
- **Promise pipelining** doesn't apply to stdin/stdout (no network latency)
- The schema language is clean and the zero-copy property is impressive, but unnecessary for JSON-sized messages

---

## 7. Unix Domain Sockets + SO_PEERCRED

### What are Unix domain sockets?

Unix domain sockets are a form of IPC where two processes on the same machine communicate through a special file (e.g., `/tmp/myapp.sock`). Unlike TCP sockets (which go through the network stack), Unix sockets go through the kernel and are faster — they're essentially a pipe with socket semantics.

They support:
- **SOCK_STREAM** (bidirectional, reliable byte stream, like TCP)
- **SOCK_DGRAM** (datagram, like UDP)
- **SOCK_SEQPACKET** (reliable sequenced packets)

### The problem: authenticating the peer

When a plugin connects to a host, the host needs to know: "who is on the other end?" With TCP, you can't reliably identify the peer (IPs can be spoofed). With Unix domain sockets, the OS tells you.

### SO_PEERCRED (Linux)

On Linux, the `SO_PEERCRED` socket option returns a `ucred` structure:
```c
struct ucred {
    pid_t   pid;    /* Process ID of the peer */
    uid_t   uid;    /* User ID of the peer */
    gid_t   gid;    /* Group ID of the peer */
};
```

Usage:
```c
int len = sizeof(struct ucred);
struct ucred creds;
getsockopt(sock, SOL_SOCKET, SO_PEERCRED, &creds, &len);
printf("Peer is PID %d, UID %d\n", creds.pid, creds.uid);
```

The kernel fills this in automatically. The peer cannot fake it — the values are set by the kernel at `connect()` time. This is **not** a check the user can bypass.

Source: [`unix(7)` man page](https://linux.die.net/man/7/unix) — "Return the credentials of the foreign process connected to this socket."

### getpeereid() (BSD / macOS)

FreeBSD, OpenBSD, and macOS provide `getpeereid()` which returns `uid_t` and `gid_t`:
```c
uid_t euid;
gid_t egid;
getpeereid(sock, &euid, &egid);
```

The implementation differs per OS. FreeBSD uses `LOCAL_PEERCRED`. The structure order differs between Linux (`{pid, uid, gid}`) and OpenBSD (`{uid, gid, pid}`).

Source: [getpeereid(3) man page](https://linux.die.net/man/3/getpeereid) — "The getpeereid() function returns the effective user and group IDs of the peer connected to a UNIX-domain socket."

### SCM_CREDENTIALS (sending credentials with data)

Beyond `SO_PEERCRED` (which is a "who are you?" query), Unix sockets also support **ancillary data** — extra data sent alongside the main payload. With `SCM_CREDENTIALS`, a process can send its credentials (PID, UID, GID) as ancillary data. The kernel verifies these — a process can't claim to be someone else.

Source: [`unix(7)` man page](https://linux.die.net/man/7/unix) — "The credentials which the sender specifies are checked by the kernel."

### Why this matters for Flux

Flux spawns subprocesses and communicates via stdin/stdout. The host (Tauri process) knows the PID of each plugin subprocess it spawned. But what if a plugin could be tricked into connecting to a different host? Or what if we want plugins to communicate directly with each other?

If Flux ever moves from stdin/stdout to Unix domain sockets, `SO_PEERCRED` provides:

1. **Authentication without secrets** — the host knows exactly which plugin is connecting. No API keys, no tokens, no passwords.
2. **Prevention of spoofing** — a malicious process cannot pretend to be a plugin. The kernel enforces identities.
3. **PID-based resource tracking** — the host can associate each connection with a specific process and enforce quotas or limits.

**Caveat:** stdin/stdout subprocesses don't use sockets — they inherit the parent's stdin/stdout file descriptors. Plugins don't "connect" to the host; they read from stdin and write to stdout. This is simpler but loses the identity guarantee. However, the host already knows the PID because it spawned the process. For stdin/stdout, identity is implicit.

---

## 8. FlatBuffers / FlexBuffers

### The problem serialization formats solve

When you receive data over a network (or a pipe), you get bytes. To use them, you typically **parse** them into in-memory objects:

```
Raw bytes → Parser → Allocate objects → Copy data → Access fields
```

This has costs: allocation (malloc), copying, garbage collection, CPU time for parsing.

### FlatBuffers: zero-copy serialization

FlatBuffers (by Google, same team as protobuf) takes a different approach: **access the bytes directly**. There is no parse step.

```
Raw bytes → Point reader at it → Access fields directly
```

Source: [FlatBuffers White Paper](https://flatbuffers.dev/white_paper/) — "A FlatBuffer is a binary buffer containing nested objects organized using offsets so that the data can be traversed in-place just like any pointer-based data structure."

### How it works

A FlatBuffer is a binary buffer with:

1. **Data** laid out in a specific order, all in one contiguous block
2. **Offsets** (relative pointers) that let you navigate from one object to another
3. **vtables** (virtual tables) that enable forward/backward compatibility of optional fields

**Vtables** are the key innovation for schema evolution. Each table has a vtable that maps field IDs to byte offsets. If a field doesn't exist (because the sender used an older schema), the vtable says "not present" and a default value is returned. Multiple tables sharing the same layout share the same vtable entry — so vtables are small.

### Example

```fbs
table Person {
  name: string;
  age: int;
  email: string;  // New field added later
}
```

An older version of the code writes a `Person` without `email`. A newer version reads it — the vtable for `email` says "not present," so `getEmail()` returns `""` (default). No crash. No need to regenerate data.

### When it matters

FlatBuffers excels when:
- **Reading large amounts of data where only a small portion is accessed** — a game objects file with 10,000 monsters, but you only render 50 at a time. With protobuf, you'd parse all 10,000. With FlatBuffers, you only traverse the 50 you need.
- **Memory-mapped files** — `mmap` a file and access it as FlatBuffers without loading it into RAM. The OS pages in only what you touch.
- **Real-time constraints** — no garbage collection pauses from parsing. The data stays as bytes.

### FlexBuffers (schema-less FlatBuffers)

FlexBuffers is the schema-less variant of FlatBuffers. Like JSON, you can store arbitrary data without a predefined schema. Unlike JSON, it's binary and you can traverse it without parsing (the same zero-copy promise).

- Strings are pooled automatically (shared between identical strings)
- Numbers use the smallest width that fits (8/16/32/64 bits)
- Maps support binary-search key lookup
- Much more compact than JSON for many cases

Source: [FlexBuffers documentation](https://flatbuffers.dev/flexbuffers/) — "FlexBuffers can also be accessed without parsing / copying / object allocation. This is a huge win in efficiency / memory friendly-ness."

### For Flux

FlatBuffers is **not a good fit** for Flux's current IPC:
- Plugin communication involves small messages (a few KB at most). The complexity cost of a schema compilation step isn't worth it for such small payloads.
- JSON-RPC is debuggable (you can `cat` the request and see it). FlatBuffers is opaque binary.
- The subprocess stdin/stdout model has negligible parse overhead for JSON.

Where FlatBuffers **would** matter:
- Large data files (e.g., cached feeds, video metadata databases)
- Shared memory IPC (if two processes share an `mmap`'d region, FlatBuffers lets them read each other's writes without copying)
- Real-time rendering data (e.g., sending frame metadata to a video player)

---

## Synthesis: What should Flux adopt?

### The current state

```
Flux host (Rust/Tauri) ←──stdin/stdout──→ Plugin subprocess (Bun/TS)
Protocol: {"id": N, "method": "name.action", "params": {}}  // no jsonrpc field
```

### Recommendations

**1. Add `"jsonrpc": "2.0"` to the wire format.**

Current: `{"id": 1, "method": "feed", "params": {}}`
Proposed: `{"jsonrpc": "2.0", "id": 1, "method": "feed", "params": {}}`

This single change makes Flux compatible with the JSON-RPC 2.0 ecosystem. Standard error codes, notifications, and batch processing become available. Libraries in any language already understand this format.

**2. Borrow D-Bus introspection, not D-Bus itself.**

D-Bus's `Introspect` method (returning XML describing all methods and signals) is the gold standard for discoverability. Flux already has `plugin.json` manifests with `methods` arrays. Extending this to include parameter types and return types would give introspection.

A lightweight approach: add an optional `"introspect"` method that plugins can implement, returning a description of their methods, parameter types, and signals. The format could be JSON (simpler than XML) but follow the same pattern: a plugin describes itself so the host doesn't need hardcoded knowledge.

**3. Keep stdin/stdout, don't over-engineer.**

Unix domain sockets + `SO_PEERCRED` are powerful but unnecessary for Flux's current model. The host spawns subprocesses and controls their stdin/stdout — identity is implicit. If Flux ever needs plugin-to-plugin communication without host mediation, Unix sockets with `SO_PEERCRED` provide authentication without secrets.

**4. Don't adopt protobuf/Thrift/FlatBuffers yet.**

The complexity of a schema compilation step is not justified for Flux's current message sizes and volumes. JSON-RPC is simple, debuggable, and fast enough for desktop IPC. If a plugin needs to send large binary data (videos, images), consider MessagePack for just that plugin rather than changing the entire system.

**5. Consider capability patterns from Cap'n Proto.**

The idea that a plugin holds references to objects (capabilities) rather than calling global methods is a powerful security model. Flux already has a version of this: methods are namespaced (`yt-feed.feed`) and the host routes them. Formalizing this into a capability model (plugins can only call methods on objects explicitly given to them) would improve security without adding complexity.

### Summary table: Which technology for which Flux need?

| Need | Recommendation | Why |
|------|---------------|-----|
| Wire protocol | JSON-RPC 2.0 | Simple, debuggable, widely supported |
| Message typing | TypeScript types + plugin.json | Schemas already exist as TS types in the codebase |
| Introspection | JSON-RPC `introspect` method | Borrow D-Bus pattern without D-Bus complexity |
| Binary data | MessagePack per-plugin | Only when needed, not as default |
| Authentication | stdin/stdout implicit identity | Host controls subprocess lifecycle |
| Large data files | FlatBuffers | Only for mmap'd data, not IPC |
| Plugin-to-plugin | Unix sockets + SO_PEERCRED | Future concern, not needed now |
| Version negotiation | jsonrpc field + manifest version | The `"jsonrpc": "2.0"` field handles wire version; manifest version handles plugin API |

---

## Sources Index

| Topic | Source |
|-------|--------|
| CORBA IDL | [OMG IDL 4.2 spec](https://www.omg.org/spec/IDL/ISO/19516/PDF) |
| CORBA IDL (alt) | [OMG IDL 3.5 spec](https://www.omg.org/spec/IDL/3.5/PDF) |
| Protocol Buffers | [protobuf.dev/overview](https://protobuf.dev/overview/) |
| Protobuf history | [Google Open Source Blog 2008](https://opensource.googleblog.com/2008/07/protocol-buffers-googles-data.html) |
| Protobuf language spec | [protobuf.com/docs/language-spec](https://protobuf.com/docs/language-spec) |
| Protobuf Wikipedia | [Wikipedia: Protocol Buffers](https://en.wikipedia.org/wiki/Protocol_Buffers) |
| Cap'n Proto language | [capnproto.org/language.html](https://capnproto.org/language.html) |
| Cap'n Proto encoding | [capnproto.org/encoding.html](https://capnproto.org/encoding.html) |
| Cap'n Proto RPC | [capnproto.org/rpc.html](https://capnproto.org/rpc.html) |
| Cap'n Proto promise pipelining | [capnproto.org/news/2013-12-13-promise-pipelining-capnproto-vs-ice.html](https://capnproto.org/news/2013-12-13-promise-pipelining-capnproto-vs-ice.html) |
| Cap'n Proto RPC schema | [github.com/capnproto/capnproto/blob/master/c++/src/capnp/rpc.capnp](https://github.com/capnproto/capnproto/blob/master/c%2B%2B/src/capnp/rpc.capnp) |
| Apache Thrift IDL | [thrift.apache.org/docs/idl](https://thrift.apache.org/docs/idl) |
| Thrift tutorial | [github.com/apache/thrift/blob/master/tutorial/tutorial.thrift](https://github.com/apache/thrift/blob/master/tutorial/tutorial.thrift) |
| Smithy 2.0 spec | [smithy.io/2.0/spec/](https://smithy.io/2.0/spec/) |
| Smithy IDL | [smithy.io/2.0/spec/idl.html](https://smithy.io/2.0/spec/idl.html) |
| OpenAPI 3.0.4 | [spec.openapis.org/oas/v3.0.html](https://spec.openapis.org/oas/v3.0.html) |
| OpenAPI Wikipedia | [Wikipedia: OpenAPI Specification](https://en.wikipedia.org/wiki/OpenAPI_Specification) |
| D-Bus specification | [dbus.freedesktop.org/doc/dbus-specification.html](https://dbus.freedesktop.org/doc/dbus-specification.html) |
| D-Bus tutorial | [dbus.freedesktop.org/doc/dbus-tutorial.html](https://dbus.freedesktop.org/doc/dbus-tutorial.html) |
| D-Bus API design | [dbus.freedesktop.org/doc/dbus-api-design.html](https://dbus.freedesktop.org/doc/dbus-api-design.html) |
| D-Bus daemon man page | [linux.die.net/man/1/dbus-daemon](https://linux.die.net/man/1/dbus-daemon) |
| WebSocket RFC 6455 | [datatracker.ietf.org/doc/rfc6455/](https://datatracker.ietf.org/doc/rfc6455/) |
| JSON-RPC 2.0 spec | [www.jsonrpc.org/specification](https://www.jsonrpc.org/specification) |
| MessagePack-RPC spec | [github.com/msgpack-rpc/msgpack-rpc/blob/master/spec.md](https://github.com/msgpack-rpc/msgpack-rpc/blob/master/spec.md) |
| SO_PEERCRED / getpeereid | [linux.die.net/man/3/getpeereid](https://linux.die.net/man/3/getpeereid) |
| unix(7) man page | [linux.die.net/man/7/unix](https://linux.die.net/man/7/unix) |
| Unix socket credentials SO | [stackoverflow.com/questions/9898961](https://stackoverflow.com/questions/9898961) |
| FlatBuffers white paper | [flatbuffers.dev/white_paper/](https://flatbuffers.dev/white_paper/) |
| FlatBuffers internals | [flatbuffers.dev/internals/](https://flatbuffers.dev/internals/) |
| FlexBuffers | [flatbuffers.dev/flexbuffers/](https://flatbuffers.dev/flexbuffers/) |
| Secure IPC (Dan Bernstein) | [cr.yp.to/docs/secureipc.html](https://cr.yp.to/docs/secureipc.html) |
| Cap'n Proto FAQ | [capnproto.org/faq.html](https://capnproto.org/faq.html) |
