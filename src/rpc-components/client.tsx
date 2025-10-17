import { Children, isValidElement, lazy, Suspense, useId, useReducer, useRef, useState } from "react";
import { makeSerializable, unmakeSerializable } from "./serialize";

/**
 * Resolve an RPC component via React.lazy() so it works with Suspense.
 * 
 * React docs recommend not abusing lazy like this because lazy is 
 * intended to be used at the top level to lazy load imports, but
 * it works fine for this use case. 
 * 
 * From my (uninformed) reading of the react source code, server components 
 * just end up being wrapped by a lazy component anyways under the hood: 
 * https://github.com/facebook/react/blob/main/packages/react-server/src/ReactFlightServer.js#L1514
  
 * @param entrypointFn React FC on RPC entrypoint
 * @returns 
 */
function resolveRpcComponent(
    // TODO: improve the typing here
    entrypointFn: any,
    boundProps?: Record<string, unknown>,
): React.FC {
    const id = useId()
    const componentRef = useRef<React.FC | null>(null)
    const [resolveMode, triggerResolve] = useReducer<{ mode: "refetch" | "ref", count: number }>((state, action) => {
        if (action === "ref") {
            return {
                mode: "ref",
                count: state.count + 1
            }
        } else {
            return {
                mode: "refetch",
                count: state.count
            }
        }
    }, { mode: "refetch", count: 0 })

    return lazy(async () => {
        // reresolve is a hook passed to the entrypointFn. 
        // It lets our RPC component trigger state updates for ANY COMPONENT IN OUR RPC COMPONENT TREE!
        const reresolve = (serializedComponent: any) => {
            console.log("reresolving", serializedComponent)
            const tree = unmakeSerializable(serializedComponent);
            const Component: React.FC = () => <>{tree}</>;
            componentRef.current = <Component />
            triggerResolve("ref")
        }

        console.log("reresolving lazy:", resolveMode)
        const desc = resolveMode.mode === "refetch" ? 
            await entrypointFn(id, reresolve, boundProps ?? {}) : 
            componentRef.current

        const tree = unmakeSerializable(desc);
        const Component: React.FC = () => <>{tree}</>;
        componentRef.current = Component
        return { default: componentRef.current }
    })
}

/**
 * Suspense boundary for RPC components
 * @param props.fallback Fallback to display while RPC components are loading
 * @param props.deferFallback TODO: If true, defer rendering fallback unless failed to load
 * @param props.children Children to render
 * @returns 
 */
export function RpcSuspense(props: {
    fallback: React.ReactNode,
    // TODO: implement
    deferFallback?: boolean,
    children: React.ReactNode
}) {
    // Resolve RPC children
    const resolvedChildren = Children.toArray(props.children).map((child, i) => {
        if (isValidElement(child)) {
            const t = child.type as unknown;

            // This is an RPC component, we need to resolve it
            if (typeof t === "function") {
                const key = (child as any).key;
                const rawChildProps = (child as any).props || {}

                const serializableProps = makeSerializable(rawChildProps)

                // without deferFallback, just lazily resolve the RPC component
                const LazyComp = resolveRpcComponent(t as any, serializableProps)
                const node = <LazyComp key={key} />
                return node
            }
        }
        return child;
    })

    return (
        <Suspense fallback={props.fallback}>
            {resolvedChildren}
        </Suspense>
    )
}