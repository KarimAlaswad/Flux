# Runtime Protocol Negotiation: How Systems Discover Capabilities at Runtime

**Goal:** Understand how two components can discover each other's capabilities at
runtime and negotiate how to communicate — without a pre-defined interface. This
is for Flux's plugin system, where plugins can define new hook types the core
never knew about.

---

## 1. HTTP Content Negotiation (`Accept`, `Content-Type`, `Accept-Encoding`)

### Mechanism

HTTP content negotiation lets a client and server agree on the "best"
representation of a resource. RFC 7231 §3.4 defines two patterns:

**Proactive (server-driven) negotiation:** The client sends preference headers.
The server picks the best representation and sends it.

```
Client request:
  GET /resource
  Accept: text/html, application/json;q=0.9
  Accept-Encoding: gzip, br;q=0.8

Server response:
  200 OK
  Content-Type: text/html
  Content-Encoding: gzip
  Vary: Accept, Accept-Encoding
```

- `Accept` lists MIME types the client can handle, with quality values (`q`).
- `Accept-Encoding` lists compression algorithms.
- Server responds with `Content-Type` (what it actually sent) and
  `Content-Encoding` (how it was encoded).
- `Vary` tells caches which headers were used for the decision so they can
  cache correctly.

**Reactive (agent-driven) negotiation:** Server returns a 300 Multiple Choices
or 406 Not Acceptable with alternatives the client picks from.

### Trade-offs

| Pro | Con |
|-----|-----|
| Simple, stateless, well-understood | Server can't truly know what's "best" |
| Works with existing HTTP infrastructure | Client must describe capabilities per request |
| Extensible via new MIME types | Privacy concern (client reveals capabilities) |
| No out-of-band metadata needed | Limited to content format, not method semantics |

### Flux application

Flux's JSON-RPC method calls could carry an `Accept`-style header indicating
which response format the caller understands. A plugin method could return
multiple representations of its data (e.g., raw JSON vs typed struct vs
compressed). The `Content-Type` of the response tells the consumer how to
decode.

But this only negotiates *format*, not *which methods are available*. It solves
"how do I parse this?" not "what can you do?"

### Consumer knowledge

- **Before call:** Client must know the URL/endpoint to reach. Preferences are
  declared in-band via headers.
- **At call time:** Server negotiates the best representation. Client discovers
  the actual `Content-Type` in the response.

### Sources

- [RFC 7231 §3.4 Content Negotiation](https://httpwg.org/specs/rfc7231.html#content.negotiation)
- [RFC 7231 §5.3 Content Negotiation fields](https://httpwg.org/specs/rfc7231.html#header.accept)
- [MDN: Content Negotiation](https://developer.mozilla.org/en-US/docs/Web/HTTP/Guides/Content_negotiation)

---

## 2. SOAP / WSDL — Web Services Description Language

### Mechanism

WSDL is an XML document that describes a Web service: its methods, parameters,
types, and network endpoints. A client fetches the WSDL (usually at
`?wsdl` or `.asmx?WSDL`), reads it, and constructs SOAP calls dynamically.

```xml
<wsdl:description targetNamespace="http://example.com/stockquote">
  <wsdl:types>
    <xs:schema>
      <xs:element name="GetLastTradePriceInput">
        <xs:complexType>
          <xs:all>
            <xs:element name="tickerSymbol" type="xs:string"/>
          </xs:all>
        </xs:complexType>
      </xs:element>
    </xs:schema>
  </wsdl:types>

  <wsdl:interface name="StockQuoteInterface">
    <wsdl:operation name="GetLastTradePrice"
      pattern="http://www.w3.org/ns/wsdl/in-out">
      <wsdl:input element="tns:GetLastTradePriceInput"/>
      <wsdl:output element="tns:GetLastTradePriceOutput"/>
    </wsdl:operation>
  </wsdl:interface>

  <wsdl:binding name="StockQuoteSoapBinding"
    interface="tns:StockQuoteInterface" type="http://www.w3.org/ns/wsdl/soap"
    wsoap:version="1.1"
    wsoap:protocol="http://www.w3.org/2006/01/soap11/bindings/HTTP/"/>

  <wsdl:service name="StockQuoteService"
    interface="tns:StockQuoteInterface">
    <wsdl:endpoint name="StockQuoteEndPoint"
      binding="tns:StockQuoteBinding"
      address="http://example.com/endpoint/stockquote"/>
  </wsdl:service>
</wsdl:description>
```

The structure is:
- **Types** — XML Schema defining data types
- **Interface (was PortType)** — abstract operations grouped together
- **Binding** — concrete protocol and data format for an interface
- **Service** — collection of endpoints (network addresses)

### Why it failed in practice

1. **WSDL 1.1 vs 2.0 fragmentation** — WSDL 2.0 was a complete redesign,
   incompatible with 1.1. Most tooling only supported 1.1. The W3C's own spec
   was poorly adopted.
2. **XML overhead** — WSDL files were enormous, complex, and hard to read.
3. **Tight coupling** — Generating client stubs from WSDL created brittle code.
   Any server change broke the client until stubs were regenerated.
4. **WS-* stack explosion** — SOAP accumulated dozens of specifications
   (WS-Security, WS-AtomicTransaction, WS-Addressing, etc.) that were complex
   to implement and rarely interoperable.
5. **REST won** — Simpler HTTP-based APIs with JSON replaced SOAP's XML
   ceremony.
6. **Runtime discovery was rare** — Most WSDL was used at *design time* to
   generate code, not at runtime to discover methods dynamically.

### Trade-offs

| Pro | Con |
|-----|-----|
| Machine-readable, complete interface description | Extremely verbose XML |
| Language-agnostic (any SOAP toolkit) | Tight coupling — WSDL changes break clients |
| Types, methods, bindings all in one document | Two incompatible versions (1.1 vs 2.0) |
| Auto-discovery via HTTP GET `?wsdl` | Bloated WS-* ecosystem |

### Flux application

Flux could use a WSDL-like approach where each plugin exposes a manifest
describing its methods and their parameter schemas. This is actually what
Flux's `plugin.json` already does — the `methods` array lists available
method names. But WSDL goes further by describing parameter *types and
schemas*, not just names.

To match WSDL's power, each plugin method should declare:
- Method name
- Parameter names, types, and whether required
- Return type schema
- An example or description

The lesson from WSDL's failure: keep the description *simple*, use *JSON*
not XML, and avoid a sprawling ecosystem of optional add-on specs.

### Consumer knowledge

- **Before call:** Consumer fetches WSDL (or plugin manifest) and learns all
  available methods, their parameter types, and endpoint addresses.
- **At call time:** Consumer already has the full interface description. It can
  validate requests against known types.

### Sources

- [W3C WSDL 2.0 Specification](https://www.w3.org/TR/wsdl20/)
- [Wikipedia: Web Services Description Language](https://en.wikipedia.org/wiki/Web_Services_Description_Language)
- [WSDL 2.0 SOAP 1.1 Binding](https://www.w3.org/TR/wsdl20-soap11-binding/)
- [Microsoft: XML Web Service Discovery](https://learn.microsoft.com/en-us/previous-versions/aa720021(v=vs.71))

---

## 3. JSON-RPC 2.0 Introspection (`rpc.discover`)

### Mechanism

The JSON-RPC 2.0 spec reserves method names beginning with `rpc.` for system
extensions. The OpenRPC specification defines `rpc.discover` as a standard
discovery method. Calling it returns an OpenRPC document describing every
method the server supports.

```
Request:
  {"jsonrpc": "2.0", "id": 1, "method": "rpc.discover"}

Response:
  {
    "jsonrpc": "2.0", "id": 1,
    "result": {
      "openrpc": "1.2.6",
      "info": {"title": "My API", "version": "1.0"},
      "methods": [
        {
          "name": "subscribe",
          "params": [
            {"name": "channel", "required": true,
             "schema": {"type": "string"}}
          ],
          "result": {
            "name": "subscription",
            "schema": {"type": "object"}
          }
        }
      ]
    }
  }
```

The OpenRPC schema is a JSON document that mirrors OpenAPI concepts but for
JSON-RPC. It describes each method, its parameters (name, required, schema),
return type, and error codes.

EIP-1901 proposed this for Ethereum JSON-RPC APIs, and implementations like
`ultimate_json_rpc` (Ruby) and `tx3-lang/protocol-gateway` (Rust) use it.

### Trade-offs

| Pro | Con |
|-----|-----|
| Built on JSON-RPC's reserved `rpc.` namespace | Not part of the core JSON-RPC spec — optional |
| Self-describing: the discovery method appears in its own output | Adds implementation complexity to the server |
| Standard enough for tooling (EIP-1901, OpenRPC playground) | Method list can be large |
| JSON Schema for parameter validation | Generated dynamically or served statically |

### Flux application

This is the most directly applicable pattern for Flux. Since Flux already uses
JSON-RPC as its IPC protocol, adding `rpc.discover` to every plugin would be
natural.

Each plugin would:
1. Implement `rpc.discover` which returns an OpenRPC document listing all its
   methods.
2. The methods array describes each operation: name, parameter schemas, return
   type.
3. The core's `call_hook` / `resolve_hook` can call `rpc.discover` on a plugin
   to learn what hooks and methods it provides.

The Flux plugin manifest (`plugin.json`) already has a `methods` array and
`hooks` array. `rpc.discover` would be the *runtime* equivalent: it lets a
caller ask "what can you do right now?" and get the full interface, not just
the static manifest.

### Consumer knowledge

- **Before call:** Consumer must know the method name exists. It calls
  `rpc.discover` first to get the full list.
- **At call time:** Consumer validates parameters against the schema from the
  discovery response. It knows exactly what the return type will be.

### Sources

- [JSON-RPC 2.0 Specification](https://www.jsonrpc.org/specification)
- [OpenRPC Specification — Service Discovery Method](https://spec.open-rpc.org/#service-discovery-method)
- [EIP-1901: Add OpenRPC Service Discovery To JSON-RPC Services](https://eips.ethereum.org/EIPS/eip-1901)
- [tx3-lang/protocol-gateway: OpenRPC Discovery Spec](https://github.com/tx3-lang/protocol-gateway/blob/main/design/002-openrpc-discovery-spec.md)

---

## 4. OpenAPI / Swagger — Runtime Discovery

### Mechanism

OpenAPI is a specification for describing HTTP APIs. A server exposes an
OpenAPI document (usually at `/openapi.json` or `/v3/api-docs`) that describes
all endpoints, methods, parameters, request bodies, and response types.

```json
{
  "openapi": "3.0.0",
  "info": {"title": "Pet Store", "version": "1.0.0"},
  "paths": {
    "/pets": {
      "get": {
        "operationId": "listPets",
        "parameters": [
          {"name": "limit", "in": "query",
           "schema": {"type": "integer"}}
        ],
        "responses": {
          "200": {
            "description": "A list of pets",
            "content": {
              "application/json": {
                "schema": {
                  "type": "array",
                  "items": {"$ref": "#/components/schemas/Pet"}
                }
              }
            }
          }
        }
      }
    }
  }
}
```

Frameworks generate this dynamically:
- **FastAPI** — scans routes, Pydantic models, generates OpenAPI on first
  request to `/openapi.json`, caches it.
- **ASP.NET Core** — `AddOpenApi()` registers services, `MapOpenApi()` serves
  it. Generated on demand from cached controller metadata.
- **springdoc** — scans Spring annotations, serves at `/v3/api-docs`.
- **Swagger UI** — reads the OpenAPI document and renders an interactive
  exploration UI.

### Trade-offs

| Pro | Con |
|-----|-----|
| Mature ecosystem with broad tooling support | HTTP-specific — not directly applicable to JSON-RPC |
| Interactive UI for humans (Swagger UI) | Document can be very large for complex APIs |
| Strong type system via JSON Schema refs | If routes change dynamically, doc must be regenerated |
| Code generation for clients in many languages | Convention over configuration — no standard discovery URL |

### Flux application

Each plugin could expose an OpenRPC-equivalent document (since OpenAPI is
HTTP-specific but OpenRPC is JSON-RPC-specific). The concept is the same:
a discoverable endpoint that returns a schema describing all available
operations.

Alternatively, the Flux core's `core-manifest` plugin already scans
`plugin.json` files. It could also call `rpc.discover` on each plugin at
startup and cache the results. This would give the core a unified registry
of every plugin's capabilities — the same way ASP.NET Core caches controller
metadata for OpenAPI generation.

### Consumer knowledge

- **Before call:** Consumer fetches the OpenAPI/OpenRPC doc to learn all
  available endpoints, methods, parameters, and types.
- **At call time:** Consumer constructs the request using the schema from the
  doc. It can validate the response against the expected schema.

### Sources

- [OpenAPI Specification 3.0](https://spec.openapis.org/oas/v3.0.3)
- [FastAPI OpenAPI Schema Generation](https://deepwiki.com/fastapi/fastapi/2.5-openapi-schema-generation)
- [ASP.NET Core OpenAPI](https://github.com/dotnet/AspNetCore.Docs/blob/main/aspnetcore/fundamentals/openapi/aspnetcore-openapi.md)
- [springdoc OpenAPI Library](https://springdoc.org/)
- [OpenAPI/Swagger JSON auto-discovery discussion](https://github.com/OAI/OpenAPI-Specification/issues/864)

---

## 5. Cap'n Proto RPC — Capability Model & Promise Pipelining

### Mechanism

Cap'n Proto is a distributed object protocol where **capabilities** (interface
references) are first-class types. A capability is an object reference that
carries its own type — the receiver knows the interface from the reference
type itself.

Key features:

1. **Capabilities are first-class** — You can pass a capability as a method
   parameter, embed it in a struct, or return it from a call. The receiver
   can immediately call methods on it.

2. **Promise pipelining** — When you call a method that returns a capability,
   you can immediately start calling methods on the *promise* of that
   capability, before the server has responded. The client sends both calls
   together; the server chains them internally.

```
// Without pipelining: 4 round trips
file = openFile("foo")
stat = file.stat()        // round trip 2
data = file.read(0, 100)  // round trip 3
file.close()              // round trip 4

// With Cap'n Proto pipelining: 1 round trip
// Client sends all 4 calls at once, server chains them
```

3. **Capability-based security** — A capability both designates an object and
   confers permission to call it. Passing a capability over a connection gives
   the receiver permission but no one else.

4. **Protocol levels** — The RPC spec defines numbered levels (0-4) of
   capability support, from basic call/return (level 0) through promise
   pipelining (level 1), persistent capabilities (level 2), three-way
   introductions (level 3), and distributed equality (level 4). Implementations
   advertise which level they support.

### Can capabilities be dynamically discovered?

**Not directly.** Cap'n Proto is strongly typed. A capability's interface is
defined in a `.capnp` schema file at compile time. There is no built-in
"introspect this capability to see what methods it has" mechanism.

However, the capability *model* enables dynamic discovery in a different way:
since capabilities can be passed around at runtime, a plugin could return a
capability that the core has never seen before. The core receives the
capability reference and can call methods on it *because the type was known
when the capability was created*. The type travels with the reference.

This means: the consumer doesn't need to discover what methods exist — it
already knows the interface from the type of the capability it received. The
negotiation happens at the type level, not at the method level.

### Trade-offs

| Pro | Con |
|-----|-----|
| Capabilities carry their own type — no discovery needed | Requires compile-time schema definition |
| Promise pipelining eliminates round trips | Complex protocol implementation |
| Object-oriented RPC — natural programming model | Not hot-reloadable (types are fixed at compile) |
| Capability-based security model | Learning curve for the capability model |

### Flux application

Flux could adopt a capability-style model where the `resolve_hook` call
returns a capability reference to the resolving plugin's hook handler. Once
the core has that capability, it can call methods on it without needing to
re-discover the interface each time.

However, this requires that the hook interface types be known at compile time,
which contradicts Flux's goal of letting plugins define *new* hook types the
core never knew about. Cap'n Proto is best for well-defined interfaces that
change slowly.

For Flux, the capability model is more useful as an *analogy*: when the core
resolves a hook, it gets back something like a capability — an opaque reference
that can be called — even if the method signatures are discovered at call time
rather than compile time.

### Consumer knowledge

- **Before call:** Consumer must have the capability reference and know its
  type (from the schema). The type tells the consumer what methods are
  available.
- **At call time:** Consumer calls methods directly on the capability. The
  promise pipelining model lets it chain calls without waiting.

### Sources

- [Cap'n Proto RPC Protocol](https://capnproto.org/rpc.html)
- [Cap'n Proto: Promise Pipelining and Dependent Calls](https://capnproto.org/news/2013-12-13-promise-pipelining-capnproto-vs-ice.html)
- [Cap'n Proto C++ RPC](https://capnproto.org/cxxrpc.html)
- [rpc.capnp — protocol definition](https://github.com/capnproto/capnproto/blob/master/c%2B%2B/src/capnp/rpc.capnp)

---

## 6. TypeScript Declaration Files (.d.ts) vs Runtime Validation

### The Problem

TypeScript types exist only at compile time. When compiled to JavaScript,
all type annotations are erased. This means:

```typescript
// Compile-time: TypeScript catches this error
function greet(name: string): string {
  return `Hello ${name}`;
}
// greet(42);  // Error: Argument of type 'number' is not assignable

// Runtime: TypeScript cannot help here
const data = JSON.parse('{"name": "Alice"}');
// data is `any` — TS trusts you. But if the API returns
// {"name": ["Alice", "Bob"]}, TS won't catch it.
```

At runtime, there is no type information. A JSON payload that doesn't match
your TypeScript interfaces will silently corrupt your application state.

### The Solution: Runtime Validation Libraries

Three approaches exist to get runtime type safety:

#### Approach A: Zod (TypeScript-first)

Define a schema once, get both runtime validation and TypeScript type
inference:

```typescript
import { z } from "zod";

const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;
// type User = { id: string; name: string; email: string }

// Runtime validation:
const raw = JSON.parse(apiResponse);
const user = UserSchema.parse(raw);  // throws if invalid
// user is now typed as User
```

Zod's `.parse()` validates at runtime and returns a properly typed object.
`.safeParse()` returns a result object instead of throwing.

#### Approach B: JSON Schema + Ajv

Define a JSON Schema (portable across languages), validate with Ajv:

```typescript
import Ajv from "ajv";

const schema = {
  type: "object",
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", minLength: 1 },
    email: { type: "string", format: "email" },
  },
  required: ["id", "name", "email"],
};

const ajv = new Ajv();
const validate = ajv.compile(schema);

const raw = JSON.parse(apiResponse);
if (!validate(raw)) {
  throw new Error(ajv.errorsText(validate.errors));
}
// raw is now validated
```

Ajv compiles schemas to JavaScript functions for maximum performance
(~14M ops/sec vs Zod's ~2M ops/sec). The schema is a plain JSON document —
portable to Python, Go, Java, etc.

#### Approach C: TypeBox + Ajv (best of both)

TypeBox is a TypeScript-first JSON Schema builder. It gives you Zod-like
developer experience but produces real JSON Schema for Ajv validation:

```typescript
import { Type } from "@sinclair/typebox";
import Ajv from "ajv";

const UserSchema = Type.Object({
  id: Type.String({ format: "uuid" }),
  name: Type.String({ minLength: 1 }),
  email: Type.String({ format: "email" }),
});

type User = Static<typeof UserSchema>;

const ajv = new Ajv();
const validate = ajv.compile(UserSchema);
```

### Trade-offs

| Library | Approach | Type Inference | Performance | Bundle | Portable Schema |
|---------|----------|---------------|-------------|--------|-----------------|
| Zod | Builder API | Native (z.infer) | Medium (2M ops/s) | 12KB | No (Zod code only) |
| Ajv | JSON Schema | Via json-schema-to-ts | Fastest (14M ops/s) | 30KB | Yes (JSON) |
| TypeBox | Builder → JSON Schema | Native | Fast (12M ops/s) | 3KB | Yes (produces JSON Schema) |
| Valibot | Modular builder | Native | Fast (4M ops/s) | 1.4KB | Via conversion |

### Flux application

Flux's plugin protocol uses JSON-RPC with JSON payloads. Every message sent
between the core and a plugin is untrusted data. Flux should validate messages
at the boundary.

**Recommendation:** Each plugin exposes parameter schemas (via `rpc.discover`
or the plugin manifest) using JSON Schema. The core uses Ajv to validate
outgoing requests against the plugin's declared schema. The plugin uses Ajv
(or Zod) to validate incoming requests against its own schema.

The Flux core itself uses TypeScript. `.d.ts` files provide compile-time safety
for internal code. But at the IPC boundary, every message must be
runtime-validated. This is the "validate at the boundary" pattern: type-safe on
the inside, validated on the outside.

### Consumer knowledge

- **Before call:** Consumer has a TypeScript type (compile time) or a JSON
  Schema (runtime) describing the method parameters.
- **At call time:** Consumer validates request parameters against the schema
  before sending, and validates the response after receiving.

### Sources

- [JSON Schema vs TypeScript: Runtime vs Compile-Time Validation (Jsonic)](https://jsonic.io/guides/json-schema-vs-typescript)
- [Zod vs JSON Schema: Which Should TypeScript Teams Use? (FrameworkKit)](https://frameworkkit.dev/compare/json-to-zod-vs-json-schema)
- [AJV vs Zod vs Valibot: Speed, Bundle & TypeScript 2026 (PkgPulse)](https://www.pkgpulse.com/guides/ajv-vs-zod-vs-valibot-schema-validation-2026)
- [TypeScript & Zod: Clearing up validation confusion (LogRocket)](https://blog.logrocket.com/when-use-zod-typescript-both-developers-guide/)
- [Ajv TypeScript Guide](https://ajv.js.org/guide/typescript.html)

---

## 7. gRPC Server Reflection Protocol

### Mechanism

gRPC's Server Reflection Protocol lets a client query a server for its
service definitions at runtime. The server exposes a standard
`grpc.reflection.ServerReflection` service (defined in
`reflection.proto`).

The protocol defines four queries, all sent over a bidirectional stream:

| Query | Purpose |
|-------|---------|
| `file_by_filename` | Get a `.proto` file descriptor by filename |
| `file_containing_symbol` | Get the file descriptor for a fully-qualified symbol |
| `file_containing_extension` | Get the file for an extension definition |
| `list_services` | Get all registered service names |

Each query returns `FileDescriptorProto` objects (protobuf's own format for
describing a `.proto` file), including transitive dependencies.

**Example usage with `grpcurl`:**

```sh
# List all services
$ grpcurl -plaintext localhost:50051 list
grpc.examples.echo.Echo
grpc.reflection.v1alpha.ServerReflection
helloworld.Greeter

# Describe a service
$ grpcurl -plaintext localhost:50051 describe helloworld.Greeter
helloworld.Greeter is a service:
service Greeter {
  rpc SayHello ( .helloworld.HelloRequest ) returns ( .helloworld.HelloReply );
}

# Call a method dynamically
$ grpcurl -plaintext -d '{"name": "World"}' \
  localhost:50051 helloworld.Greeter.SayHello
{
  "message": "Hello World"
}
```

**Server side** (Python example):

```python
from grpc_reflection.v1alpha import reflection

def serve():
    server = grpc.server(...)
    helloworld_pb2_grpc.add_GreeterServicer_to_server(Greeter(), server)
    SERVICE_NAMES = (
        helloworld_pb2.DESCRIPTOR.services_by_name['Greeter'].full_name,
        reflection.SERVICE_NAME,
    )
    reflection.enable_server_reflection(SERVICE_NAMES, server)
    server.add_insecure_port('[::]:50051')
    server.start()
```

**Client side** (using the reflection database):

```python
from grpc_reflection.v1alpha.proto_reflection_descriptor_database \
    import ProtoReflectionDescriptorDatabase
from google.protobuf.descriptor_pool import DescriptorPool

reflection_db = ProtoReflectionDescriptorDatabase(channel)
desc_pool = DescriptorPool(reflection_db)

# Get available services
services = reflection_db.get_services()

# Get a method descriptor
service_desc = desc_pool.FindServiceByName("helloworld.Greeter")
method_desc = service_desc.FindMethodByName("SayHello")

# Build a request dynamically
request_desc = desc_pool.FindMessageTypeByName("helloworld.HelloRequest")
request = MessageFactory(desc_pool).GetPrototype(request_desc)()
request.name = "World"
```

### Why this is the closest production system

gRPC reflection is the most mature runtime-introspection system in production
use. It solves exactly the problem Flux faces: "a client needs to discover
what methods a server provides, and construct calls dynamically, without
pre-compiled stubs."

It works by returning the **actual schema definitions** (protobuf file
descriptors) from the server. The client uses these to:
1. Learn what services and methods exist
2. Learn the parameter and return types for each method
3. Dynamically construct messages of the correct type
4. Encode/decode the wire format

### Trade-offs

| Pro | Con |
|-----|-----|
| Complete interface discovery (services, methods, types) | Requires protobuf schema — not JSON |
| Used in production by gRPC ecosystem | Adds dependency on `grpc-reflection` package |
| Works with `grpcurl` and other generic tools | Bidirectional stream design is complex |
| Returns transitive dependencies automatically | Not all languages implement it fully |
| Type-safe dynamic message construction | Server must opt in — not automatic |

### Flux application

Flux could implement a gRPC-style reflection protocol over its JSON-RPC
substrate. Instead of returning `FileDescriptorProto`, each plugin returns a
JSON Schema description of its methods and types.

The reflection method (analogous to `ServerReflection.ServerReflectionInfo`)
would be a set of JSON-RPC methods:

| Request | Response |
|---------|----------|
| `reflect.listMethods` | `["feed.getVideos", "feed.search", ...]` |
| `reflect.describeMethod("feed.getVideos")` | `{name, params: [{name, type, required}], returns}` |
| `reflect.listHooks` | `["feed.video", "yt-auth", ...]` |
| `reflect.describeType("Video")` | JSON Schema for the Video type |

This is simpler than gRPC's approach because JSON is self-describing — no
need for a separate type descriptor format. JSON Schema is the type system.

### Consumer knowledge

- **Before call:** Consumer calls `reflect.listMethods()` or
  `reflect.describeMethod(methodName)` to learn the interface.
- **At call time:** Consumer constructs the JSON-RPC request using the schema
  from the reflection response.

### Sources

- [gRPC Server Reflection Guide](https://grpc.io/docs/guides/reflection/)
- [gRPC Server Reflection Protocol Spec](https://github.com/grpc/grpc/blob/master/doc/server-reflection.md)
- [gRPC Server Reflection Tutorial](https://github.com/grpc/grpc/blob/master/doc/server_reflection_tutorial.md)
- [reflection.proto — the canonical proto definition](https://github.com/grpc/grpc-proto/blob/master/grpc/reflection/v1/reflection.proto)
- [gRPC Python Server Reflection](https://github.com/grpc/grpc/blob/master/doc/python/server_reflection.md)
- [gRPC Go Server Reflection Tutorial](https://github.com/grpc/grpc-go/blob/master/Documentation/server-reflection-tutorial.md)

---

## 8. D-Bus Introspectable Interface

### Mechanism

D-Bus has a standard interface called `org.freedesktop.DBus.Introspectable`.
Any D-Bus object can implement this interface. Calling `Introspect()` on the
object returns XML describing all interfaces, methods, signals, and properties
that the object exposes.

```
Introspect (OUT String xml_data)
```

The XML format is defined by the D-Bus specification:

```xml
<?xml version="1.0"?>
<!DOCTYPE node PUBLIC "-//freedesktop//DTD D-BUS Object Introspection 1.0//EN"
  "http://www.freedesktop.org/standards/dbus/1.0/introspect.dtd">
<node>
  <interface name="org.freedesktop.DBus.Introspectable">
    <method name="Introspect">
      <arg name="xml" type="s" direction="out"/>
    </method>
  </interface>
  <interface name="org.bluez.Adapter1">
    <method name="StartDiscovery"/>
    <method name="StopDiscovery"/>
    <method name="RemoveDevice">
      <arg name="device" type="o" direction="in"/>
    </method>
    <property name="Address" type="s" access="read"/>
    <property name="Name" type="s" access="read"/>
    <property name="Alias" type="s" access="readwrite"/>
    <property name="Powered" type="b" access="readwrite"/>
    <property name="Discovering" type="b" access="read"/>
  </interface>
  <node name="child_object"/>
</node>
```

The structure:
- `<node>` — a D-Bus object path, may contain child nodes and interfaces
- `<interface>` — a named interface (e.g., `org.bluez.Adapter1`)
  - `<method>` — a callable method with `<arg>` children
  - `<signal>` — a broadcast signal with `<arg>` children
  - `<property>` — a typed property with read/write access
- `<node name="...">` — child objects nested under this path

D-Bus also defines complementary standard interfaces:
- `org.freedesktop.DBus.Properties` — get/set properties dynamically
- `org.freedesktop.DBus.Peer` — ping and identity
- `org.freedesktop.DBus.ObjectManager` — get all objects and their interfaces

### Why this is exactly what Flux needs

The D-Bus introspectable interface is the closest analogue to what Flux needs:
a standard method (`Introspect()`) that any object can implement, returning a
description of all its capabilities in a standard format. The caller:
1. Knows the well-known method name (`Introspect`)
2. Gets back a structured description of everything the object can do
3. Can then call any method described in that response

This is *runtime discovery of arbitrary interfaces* — the caller discovers
what methods exist *at call time*, not at compile time.

### Trade-offs

| Pro | Con |
|-----|-----|
| Well-defined standard interface | XML format is verbose |
| Recursive — child nodes describe sub-objects | No type constraints beyond basic D-Bus types |
| Every object implements it automatically in most D-Bus frameworks | String-based type system (s, u, b, o, etc.) — limited expressiveness |
| Properties, methods, and signals all discoverable | No schema for complex nested types |

### Flux application

Flux should implement a D-Bus-style introspection interface. Each plugin
exposes an `introspect` method (or `rpc.discover`) that returns a description
of all its methods, parameters, return types, and registered hooks.

The D-Bus recursion pattern is also useful: a plugin's response could include
nested "sub-objects" (child capabilities), allowing the caller to discover a
tree of functionality rather than a flat list.

**Proposed Flux introspection interface:**

```
Request:
  {"jsonrpc": "2.0", "id": 1, "method": "introspect"}

Response:
  {
    "jsonrpc": "2.0", "id": 1,
    "result": {
      "name": "yt-feed",
      "description": "YouTube home feed plugin",
      "methods": [
        {
          "name": "feed",
          "params": {"limit": {"type": "integer", "default": 20}},
          "returns": {"type": "array", "items": {"$ref": "#/types/Video"}}
        }
      ],
      "hooks": {
        "feed.video": {"params": {}, "returns": {...}}
      },
      "types": {
        "Video": {
          "type": "object",
          "properties": {
            "id": {"type": "string"},
            "title": {"type": "string"}
          }
        }
      }
    }
  }
```

This combines:
- D-Bus's simple introspection pattern (one well-known method)
- OpenRPC's method description format
- JSON Schema for type definitions

### Consumer knowledge

- **Before call:** Consumer calls `introspect` to get the full description of
  all methods, hooks, and types the plugin exposes.
- **At call time:** Consumer uses the type schemas to construct valid requests
  and decode responses.

### Sources

- [D-Bus Specification](https://dbus.freedesktop.org/doc/dbus-specification.html)
- [D-Bus Java: Introspectable Interface](https://dbus.freedesktop.org/doc/dbus-java/api/org/freedesktop/DBus.Introspectable.html)
- [godbus/dbus introspect package](https://github.com/godbus/dbus/blob/master/introspect/introspect.go)
- [python-dbus-next introspection docs](https://python-dbus-next.readthedocs.io/en/latest/introspection.html)
- [BlueZ Part 9: Understanding D-Bus Introspectable (Linumiz)](https://blog.linumiz.com/bluez-part-9-understanding-dbus-introspectable-8/)

---

## 9. Apache Thrift — Binary Protocols with Schema-in-Message

### Mechanism

Apache Thrift embeds metadata in each message that lets the receiver
determine the wire format and schema. Unlike gRPC (which requires a separate
reflection service), Thrift puts version/protocol information directly in the
message header.

**Binary Protocol — strict encoding (12+ bytes):**

```
+--------+--------+--------+--------+--------+--------+--------+--------+
|1vvvvvvv|vvvvvvvv|unused  |00000mmm| name length                       |
+--------+--------+--------+--------+--------+--------+--------+--------+
| name (UTF-8)                                        | seq id          |
+--------+--------+--------+--------+--------+--------+--------+--------+
```

- Leading `1` bit distinguishes strict from old encoding
- `vvvvvvvvvvvvvvv` — 15-bit version number (fixed to 1)
- `mmm` — message type (Call=1, Reply=2, Exception=3, Oneway=4)
- `name` — method name string
- `seq id` — sequence number for matching responses

**Compact Protocol (4+ bytes):**

```
+--------+--------+--------+--------+
|pppppppp|mmmvvvvv| seq id (varint) | name (varint length + UTF-8)
+--------+--------+--------+--------+
```

- `pppppppp` — protocol ID (`0x82`)
- `mmm` — message type
- `vvvvv` — version (fixed to 1)

**Protocol detection:** The first byte distinguishes the protocols:
- `1000 0000` or `0000 0000` → binary protocol
- `1000 0010` (`0x82`) → compact protocol

The server can auto-detect which protocol a client speaks by inspecting the
first byte.

**Schema fingerprint (not in Thrift itself but common in practice):**

In systems like Avro or Protobuf, each schema has a hash/fingerprint. Messages
carry this fingerprint, and both sides have pre-shared schema tables. The
receiver looks up the schema by fingerprint, then decodes:

```
Message on wire:
  [schema_fingerprint: 8 bytes] [binary_data...]

Receiver:
  1. Read 8-byte fingerprint
  2. Look up schema in local registry: schema = registry[fingerprint]
  3. If not found, fail or fetch schema from schema registry
  4. Decode binary_data using schema
```

This is the approach used by:
- **Apache Avro** — Schema Registry (Confluent): messages carry a 4-byte
  schema ID. Kafka consumers fetch schemas by ID.
- **Protocol Buffers** — `FileDescriptorProto` can be fingerprinted.
  Self-describing messages can include the full descriptor.

### Trade-offs

| Pro | Con |
|-----|-----|
| No extra round trip for reflection — schema info is in-band | Adds per-message overhead (bytes for version/fingerprint) |
| Protocol auto-detection (binary vs compact) | Requires both sides to share schema tables |
| Version negotiation is built into the wire format | Schema registry is an additional infrastructure component |
| Forward and backward compatible with field IDs | Binary format is opaque — need schema to decode |

### Flux application

Flux's JSON-RPC protocol is already self-describing (JSON is human-readable).
But the Thrift lesson applies to two aspects:

1. **Version negotiation in-band** — Flux's JSON-RPC messages could include a
   protocol version or feature bits field, allowing plugins to negotiate
   capabilities at connect time without an extra round trip.

   ```json
   {
     "jsonrpc": "2.0",
     "id": 1,
     "method": "feed",
     "params": {},
     "capabilities": ["compression.gzip", "schema.v2", "batch"],
     "protocol_version": "2"
   }
   ```

2. **Schema fingerprint for types** — When Flux methods return complex types,
   they could include a `$type` or `$schema` field that references a known
   schema. The consumer looks up the schema in a local cache (loaded from the
   plugin's manifest or `rpc.discover` response) and validates/decodes
   accordingly.

   ```json
   {
     "result": {
       "$type": "yt:Video",
       "$schema_version": 1,
       "id": "abc123",
       "title": "..."
     }
   }
   ```

3. **Protocol auto-detection** — The Thrift approach of detecting protocol
   from the first byte could inform how Flux detects what encoding a plugin
   speaks (JSON vs msgpack vs CBOR) by inspecting the first message.

### Consumer knowledge

- **Before call:** Consumer must have the schema registry or table available
  (shared at deployment time or fetched on first connect).
- **At call time:** Consumer reads the schema ID/fingerprint from the message,
  looks up the format, and decodes. If the schema is unknown, it may fetch it
  from a remote registry.

### Sources

- [Apache Thrift Binary Protocol Spec](https://github.com/apache/thrift/blob/master/doc/specs/thrift-binary-protocol.md)
- [Apache Thrift Compact Protocol Spec](https://github.com/apache/thrift/blob/master/doc/specs/thrift-compact-protocol.md)
- [Apache Thrift RPC Spec](https://github.com/apache/thrift/blob/master/doc/specs/thrift-rpc.md)
- [Apache Thrift Protocol Spec (abstract)](https://github.com/apache/thrift/blob/master/doc/specs/thrift-protocol-spec.md)
- [Thrift Missing Specification](https://erikvanoosten.github.io/thrift-missing-specification/)

---

## Synthesis: What Flux Should Do

### The Core Pattern: D-Bus + OpenRPC + gRPC Reflection

All three converge on the same pattern: **a well-known, standard method that
returns a description of all available capabilities in a structured format.**

| System | Discovery Method | Return Format |
|--------|-----------------|---------------|
| D-Bus | `Introspect()` | XML with interfaces, methods, signals, properties |
| OpenRPC | `rpc.discover()` | JSON with methods, params, schemas |
| gRPC | `ServerReflection.ServerReflectionInfo()` | `FileDescriptorProto` (protobuf) |
| Flux proposal | `introspect` or `rpc.discover` | JSON with methods, hooks, types, schemas |

**Flux should implement a D-Bus-style `introspect` method that returns an
OpenRPC-format document describing the plugin's methods, parameter schemas,
hooks, and types.**

### What the Consumer Needs to Know

| Stage | Knowledge Required |
|-------|--------------------|
| **Before any call** | How to reach the plugin (plugin name for RPC routing) |
| **First interaction** | Call `introspect` to learn available methods + hooks + types |
| **Before each method call** | Method name, parameter names + types + required/optional, return type |
| **At call time** | Validate params against schema. Construct JSON-RPC request. Decode response. |

The consumer never needs *compile-time* knowledge of the plugin's interface.
Everything can be discovered at runtime through introspection.

### The One Unanswered Question

What if a plugin defines an entirely **new hook type** that the core has never
heard of? The introspection pattern handles this:

1. Plugin declares `"hooks": ["feed.video.archive"]` in its introspection
   response.
2. Core's `resolve_hook("feed.video.archive")` queries all plugins.
3. The implementing plugin returns a positive response.
4. Core calls the hook via `call_hook`.
5. The hook method's parameters and return type are described by the plugin's
   introspection.

The core never needs to understand the semantics — it only needs to route the
call. The type schemas ensure the payloads are well-formed.

### Recommendation for Flux

1. **Add `introspect` method** to every plugin. It returns:
   - All registered methods with JSON Schema for params/returns
   - All registered hooks and their signatures
   - All type definitions (as JSON Schema `$defs`)
   - Plugin metadata (name, version, author)

2. **Cache introspection results** in the core (like ASP.NET Core caches
   OpenAPI metadata). The core's `core-manifest` plugin calls `introspect` on
   every connected plugin at startup and caches the results.

3. **Validate at boundaries** using Ajv or Zod. The core validates outgoing
   requests against the plugin's declared schemas. Plugins validate incoming
   requests against their own schemas.

4. **Use JSON Schema as the type system** — it's portable, well-understood,
   and validates runtime data. It also generates OpenRPC/OpenAPI docs for
   free.

5. **Schema versioning** — Include a `$schema_version` in method parameters
   and responses so both sides can negotiate format changes (Thrift pattern).

6. **Protocol capabilities negotiation** — Include `capabilities` array
   on the first message or as a separate `rpc.hello` method, listing
   supported features (compression, batch calls, schema version, etc.).

### Summary Table

| System | Best For | Weakness | Flux Relevance |
|--------|----------|----------|----------------|
| HTTP Content Negotiation | Format negotiation | No method discovery | Use for format versioning |
| SOAP/WSDL | Full interface description | Verbose, brittle | Use for manifest structure lessons |
| JSON-RPC `rpc.discover` | JSON-RPC method discovery | Optional extension | **Directly applicable** |
| OpenAPI/Swagger | HTTP API discovery | HTTP-specific | Use pattern via OpenRPC |
| Cap'n Proto | Capability passing | Compile-time types | Capability model as analogy |
| TS + Zod/Ajv | Runtime type validation | TypeScript-only for Zod | **Essential** — use at IPC boundary |
| gRPC Reflection | Complete proto discovery | Protobuf-specific | **Model for implementation** |
| D-Bus Introspectable | Simple object introspection | XML, basic types | **Closest pattern to Flux's need** |
| Thrift Schema-ID | In-band protocol detection | Schema registry overhead | Use for version negotiation |

### Sources (master list)

- [RFC 7231 HTTP Semantics and Content](https://httpwg.org/specs/rfc7231.html)
- [W3C WSDL 2.0](https://www.w3.org/TR/wsdl20/)
- [JSON-RPC 2.0 Spec](https://www.jsonrpc.org/specification)
- [OpenRPC Spec](https://spec.open-rpc.org/)
- [EIP-1901 OpenRPC Discovery](https://eips.ethereum.org/EIPS/eip-1901)
- [OpenAPI 3.0 Spec](https://spec.openapis.org/oas/v3.0.3)
- [Cap'n Proto RPC](https://capnproto.org/rpc.html)
- [gRPC Server Reflection](https://grpc.io/docs/guides/reflection/)
- [gRPC Reflection Protocol Spec](https://github.com/grpc/grpc/blob/master/doc/server-reflection.md)
- [D-Bus Specification](https://dbus.freedesktop.org/doc/dbus-specification.html)
- [Apache Thrift Binary Protocol](https://github.com/apache/thrift/blob/master/doc/specs/thrift-binary-protocol.md)
- [Apache Thrift Compact Protocol](https://github.com/apache/thrift/blob/master/doc/specs/thrift-compact-protocol.md)
