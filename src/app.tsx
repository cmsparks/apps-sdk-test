import { Suspense, useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { CounterEntrypoint } from "./counter";
import { useToolResponseMetadata } from "./react-utils";
import { useRpcContext, RpcProvider } from "./useRpc";
import { inflate, RpcSuspense } from "./rpc-components";

/**
 * Client side react hook for our counter
 */
function useServerCounter() {
    const [counter, setCounter] = useState(0)
    const stub = useRpcContext<CounterEntrypoint>()

    useEffect(() => {
        stub.getCounter().then(setCounter)
        // the setCounter callback is being triggered by the counter changing on the server!
        stub.registerOnCounterChange(setCounter)
    }, [stub])

    return {
        counter,
        incrementCounter: () => stub.incrementCounter()
    }
}

function App() {
    const toolResponseMetadata: { sessionId: string } | null = useToolResponseMetadata() as { sessionId: string } | null
    const { incrementCounter } = useServerCounter()
    const rpc = useRpcContext<CounterEntrypoint>()

    return (
        <div className="container">
            <p className="session-id">{toolResponseMetadata?.sessionId}</p>
            <div className="counter-row">
                <RpcSuspense
                    deferFallback
                    fallback={
                        <p className="counter-value" aria-live="polite">???</p>
                    }
                >
                    <rpc.Counter />
                </RpcSuspense>
                <button
                    className="increment-btn"
                    onClick={() => {
                        incrementCounter()
                    }}
                >
                    Increment
                </button>
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

