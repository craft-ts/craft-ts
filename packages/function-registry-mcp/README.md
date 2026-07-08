# Function registry MCP bridge

This package exposes the demo application's function registry through MCP over
stdio. It also listens on `ws://127.0.0.1:3333` for the browser application.

```sh
npm run start --workspace @ng-craft/function-registry-mcp
```

Set `REGISTRY_BRIDGE_HOST` and `REGISTRY_BRIDGE_PORT` to override the WebSocket
listener. MCP tools are `registry.list`, `registry.get`, `registry.call`, and
`registry.logs`. Their WebSocket methods use the corresponding slash form
(`registry/list`, etc.), and each request and response carries a `callId`.
