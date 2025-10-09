import { McpAgent } from "agents/mcp";
import { Agent, callable, routeAgentRequest, type AgentContext } from "agents";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { newWorkersRpcResponse, RpcStub, RpcTarget } from "capnweb";
import { DurableObject } from "cloudflare:workers";

// Adapted from https://developers.openai.com/apps-sdk/build/examples
export class McpWidgetAgent extends McpAgent<Env> {
  server = new McpServer({ name: "Pizzaz", version: "v1.0.0" });

  constructor(ctx: DurableObjectState, public env: Env) {
    super(ctx, env);
    this.server = new McpServer({ name: "Pizzaz", version: "v1.0.0" });
  }

  async init() {
    const entrypoint = new ServerEntrypoint(this.env)
    this.server.registerResource(
      "pizzaz-map",
      "ui://widget/index.html",
      {},
      async (uri, extra) => ({
        contents: [
          {
            uri: "ui://widget/index.html",
            mimeType: "text/html+skybridge",
            text: `<div>
            <script>const sessionId = '${extra.sessionId}'; </script>
            ${await (await this.env.ASSETS.fetch("http://localhost/")).text()}
            </div>`
          }
        ]
      })
    );

    this.server.registerTool(
      "showCounter",
      {
        title: "Show counter",
        _meta: {
          "openai/outputTemplate": "ui://widget/index.html",
          "openai/toolInvocation/invoking": "Opening counter widget",
          "openai/toolInvocation/invoked": "Counter widget opened"
        }
      },
      async (params, extra) => {
        return {
          content: [{ type: "text", text: "Rendered a counter!" }],
          structuredContent: {},
          _meta: {
            sessionId: this.name
          }
        };
      }
    );

    this.server.registerTool(
      "incrementCounter",
      {
        title: "Increment counter",
        _meta: {
          "openai/toolInvocation/invoking": "Incrementing counter",
          "openai/toolInvocation/invoked": "Counter incremented"
        }
      },
      async () => {
        entrypoint.incrementCounter()
        return {
          content: [{ type: "text", text: "Counter incremented!" }],
          structuredContent: {}
        };
      }
    )

    this.server.registerTool(
      "getCounter",
      {
        title: "Get counter",
        _meta: {
          "openai/toolInvocation/invoking": "Getting counter",
          "openai/toolInvocation/invoked": "Counter retrieved"
        }
      },
      async () => {
        return {
          content: [{ type: "text", text: "Counter is " + (await entrypoint.getCounter()) }],
          structuredContent: {}
        };
      })
  }
}


export type State = {
  counter: number
}

export class Counter extends Agent<Env, State> {
  initialState: State = {
    counter: 0
  }
  onCounterChange: ((counter: number) => void)[] = []

  constructor(ctx: DurableObjectState, public env: Env) {
    super(ctx, env);
  }

  getCounter() {
    return this.state.counter
  }

  incrementCounter() {
    this.setState({
      counter: this.state.counter + 1
    })
    if (this.onCounterChange) {
      this.onCounterChange.map((onCounterChange) => onCounterChange(this.state.counter))
    }
  }

  setOnCounterChange(onStateUpdate: Rpc.Stub<(counter: number) => void>) {
    this.onCounterChange.push(onStateUpdate.dup())
  }
}

export class ServerEntrypoint extends RpcTarget {
  constructor(public env: Env) {
    super()
  }

  setOnCounterChange(onCounterChange: RpcStub<(counter: number) => void>) {
    const agent = this.env.COUNTER.idFromName('counter')
    const stub = this.env.COUNTER.get(agent)
    stub.setOnCounterChange(onCounterChange.dup())
  }

  async getCounter(): Promise<number> {
    const agent = this.env.COUNTER.idFromName('counter')
    const stub = this.env.COUNTER.get(agent)
    return stub.getCounter()
  }

  async incrementCounter() {
    const agent = this.env.COUNTER.idFromName('counter')
    const stub = this.env.COUNTER.get(agent)
    return stub.incrementCounter()
  }
}

export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(req.url)
    if (url.pathname.startsWith("/mcp")) {
      return McpWidgetAgent.serve("/mcp").fetch(req, env, ctx)
    }

    if (url.pathname.startsWith("/rpc")) {
      // allow cors
      const corsHeaders = {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      }
      if (req.method === "OPTIONS") {
        return new Response("OK", { headers: corsHeaders })
      }
      return newWorkersRpcResponse(req, new ServerEntrypoint(env));
    }

    return new Response("Not found", { status: 404 })
  }
}
