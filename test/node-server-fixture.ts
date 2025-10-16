
import { WebSocketServer, type AddressInfo } from 'ws'
import type { TestProject } from 'vitest/node'
import * as url from 'url'
import { newWebSocketRpcSession, nodeHttpBatchRpcResponse } from 'capnweb';
import http from "node:http";
import { TestTarget } from "./test-target"

let httpServer: http.Server | undefined;
let wsServer: WebSocketServer | undefined

export async function setup(project: TestProject) {
  // Run standard HTTP server on a port.
  httpServer = http.createServer((request, response) => {
    if (request.headers.upgrade?.toLowerCase() === 'websocket') {
      // Ignore, should be handled by WebSocketServer instead.
      return;
    }

    // Here we're just routing all requests to RPC, but normally you'd do some routing on
    // request.url and then call this only for your API route.
    nodeHttpBatchRpcResponse(request, response, new TestTarget(), {
      // The unit test runs on a different origin, so for the sake of the browser test runners,
      // we'll need to enable CORS. Real apps may or may not want this. Understanding CORS is
      // beyond the scope of this example.
      headers: { "Access-Control-Allow-Origin": "*" }
    });
  });

  // Arrange to handle WebSockets as well, using the `ws` package. You can skip this if you only
  // want to handle batch requests.
  wsServer = new WebSocketServer({ server: httpServer })
  wsServer.on('connection', (ws) => {
    // The `as any` here is because the `ws` module seems to have its own `WebSocket` type
    // declaration that's incompatible with the standard one. In practice, though, they are
    // compatible enough for Cap'n Web!
    newWebSocketRpcSession(ws as any, new TestTarget());
  })

  // Listen on an ephemeral port for testing purposes.
  httpServer.listen(0);
  let addr = httpServer.address() as AddressInfo;

  // Provide the server address to tests.
  //
  // We use the Node-specific `url.format` here because it automatically handles adding brackets to
  // IPv6 addresses. Unfortunately, the standard `URL` class doesn't seem to provide this.
  project.provide("testServerHost", url.format({hostname: addr.address, port: addr.port}));
}

export async function teardown() {
  if (wsServer) {
    // NOTE: close() calls a callback when done, but it waits for all clients to disconnect. If
    //   we wait on it here, vitest hangs on shutdown whenever there's a client that failed to
    //   disconnect. This is annoying and pointless, so we don't wait.
    wsServer.close();
    wsServer = undefined;
  }
  if (httpServer) {
    httpServer.close();
    httpServer = undefined;
  }
}