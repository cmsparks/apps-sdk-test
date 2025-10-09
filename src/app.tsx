import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import type { ServerEntrypoint } from ".";
import { newWebSocketRpcSession } from "capnweb";
import { useToolResponseMetadata } from "./react-utils";
import { useRef } from "react";
import { RpcStub } from "capnweb";

function connectEntrypoint(retriesRef: { current: number }, entrypointRef: { current: RpcStub<ServerEntrypoint> | null }, setInternalCounter: (counter: number) => void) {
    const entrypoint = newWebSocketRpcSession<ServerEntrypoint>(window.location.href.includes("localhost") ? `http://${window.location.host}/rpc` : "https://counter-mcp.cmsparks.workers.dev/rpc");

    (async () => {
        const counter = await entrypoint.getCounter()
        setInternalCounter(counter)
        const onCounterChange = (counter2: number) => {
            setInternalCounter(counter2)
        }
        entrypoint.setOnCounterChange(onCounterChange)
    })()

    entrypoint.onRpcBroken(async (error) => {
        console.log(`RPC broken: ${error}`)
        const RETRY_LIMIT = 5
        if (retriesRef.current < RETRY_LIMIT) {
            const BASE_MS = 200
            const MAX_MS = 5000
            const attempt = retriesRef.current
            const expDelay = Math.min(MAX_MS, BASE_MS * Math.pow(2, attempt))
            const jitter = Math.floor(Math.random() * BASE_MS)
            const delay = expDelay + jitter
            console.log(`retrying connection in ${delay}ms (attempt ${attempt + 1})`)
            setTimeout(() => {
                retriesRef.current++
                connectEntrypoint(retriesRef, entrypointRef, setInternalCounter)
            }, delay)
        }
    })

    entrypointRef.current = entrypoint
}

function useServerCounter() {
    const [counter, setInternalCounter] = useState(0)
    const entrypointRef = useRef<RpcStub<ServerEntrypoint> | null>(null)
    const retriesRef = useRef<number>(0)

    useMemo(() => {
        connectEntrypoint(retriesRef, entrypointRef, setInternalCounter)
    }, [])

    return {
        counter,
        incrementCounter: () => entrypointRef.current?.incrementCounter()
    }
}

function App() {
    const toolResponseMetadata: { sessionId: string } | null = useToolResponseMetadata() as { sessionId: string } | null
    const { counter, incrementCounter } = useServerCounter()

    return (
        <div className="container">
            <p className="session-id">{toolResponseMetadata?.sessionId}</p>
            <div className="counter-row">
                <p className="counter-value" aria-live="polite">{counter}</p>
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
root.render(<App />);

