import { useEffect, useReducer, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { UIEntrypoint } from "./counter";
import { useToolResponseMetadata } from "./react-utils";
import { useRpcContext, RpcProvider } from "./useRpc";
import { RpcSuspense } from "./rpc-components";

function App() {
    const toolResponseMetadata: { sessionId: string } | null = useToolResponseMetadata() as { sessionId: string } | null
    const rpc = useRpcContext<UIEntrypoint>()
      const [, triggerResolve] = useReducer(x => x + 1, 0);
      useEffect(() => {
        rpc.registerOnUIChange(triggerResolve)
      }, [rpc])

    return (
        <div className="container">
            <p className="session-id">{toolResponseMetadata?.sessionId}</p>
            <div className="counter-row">

                {/* local header */}
                <h1>List of items</h1>
                
                {/* suspense boundary for our RPC components */}
                <RpcSuspense
                    deferFallback
                    refreshOnRpcCallback
                    fallback={
                        <p className="counter-value" aria-live="polite">???</p>
                    }
                >
                    {/* @ts-ignore our RPC component */}
                    <rpc.CardList />
                </RpcSuspense>
            </div>
        </div>
    );
}
const root = createRoot(document.getElementById("root")!);
root.render(
    <RpcProvider url={window.location.href.includes("localhost") ? `http://${window.location.host}/rpc` : "https://counter-mcp.cmsparks.workers.dev/rpc"}>
        <App />
    </RpcProvider>
);

