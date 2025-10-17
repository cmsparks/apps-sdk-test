import { type RpcTarget } from "capnweb";
import React, { Children, isValidElement, lazy, Suspense, useRef } from "react";
import { deserializeComponent, makeSerializable } from "./serialize-react";

/**
 * This file has vibe-code-smell, but the core functionality should be fine. I'll rework
 * it later to be a more understandable (and less messy).
 * 
 * The core idea is:
 * * <RpcSuspense> is a Suspense boundary for RPC components. It will attempt to resolve
 *   RPC components in the background. It also will (optionally) optimistically return cached RPC components
 *   if they are available and the deferFallback prop is true. This is necessary because we need to deserialize
 *   the RPC component on the client side, and we don't want to block the initial render. It will also serialize props
 *   that are React elements and functions, so that they can be deserialized on the server side.
 * 
 * * <RpcComponent> is a decorator for RPC entrypoints. It will turn the React.FC component into
 *   a serializable object. This is necessary, because normal React.FC components have certain internal unserializable
 *   properties.
 * 
 * If we had custom serializers in capnweb, we could avoid the need for RpcComponent (and some parts of RpcSuspense).
 * But we'd probably still need the custom suspense boundary.
 */

// Simple string hash (FNV-1a 32-bit), returns base36 string for compactness
function hashString(input: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    // h *= 16777619 with 32-bit overflow
    h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
  }
  return h.toString(36);
}

// --- Serialization helpers for props (uses makeSerializable/deserializeComponent) ---
function hasReactElement(v: any): boolean {
  if (v == null) return false
  if (React.isValidElement(v)) return true
  if (Array.isArray(v)) return v.some((x) => hasReactElement(x))
  return false
}
function serializeReactNodeToBrand(node: React.ReactNode, onRpcCallback?: () => void): any {
  return makeSerializable(node, onRpcCallback)
}
function serializePropsReactElements(props: Record<string, unknown>, onRpcCallback?: () => void): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props ?? {})) {
    if (k === "children") {
      if (hasReactElement(v)) {
        out[k] = serializeReactNodeToBrand(v as React.ReactNode, onRpcCallback)
      } else {
        out[k] = v
      }
    } else if (React.isValidElement(v) || hasReactElement(v)) {
      out[k] = serializeReactNodeToBrand(v as React.ReactNode, onRpcCallback)
    } else {
      out[k] = v
    }
  }
  return out
}
function reviveSerializableReact<T>(value: T): any {
  return deserializeComponent(value as any)
}

// Hoist function-valued props so they are sent as separate RPC args (capabilities)
function splitFunctionProps(props: Record<string, unknown> | undefined): { propsNoFns: Record<string, unknown>, fnKeys: string[], fnValues: Function[] } {
  const propsNoFns: Record<string, unknown> = {}
  const fnKeys: string[] = []
  const fnValues: Function[] = []
  for (const [k, v] of Object.entries(props ?? {})) {
    if (typeof v === 'function') {
      fnKeys.push(k)
      fnValues.push(v as any)
    } else {
      propsNoFns[k] = v as any
    }
  }
  return { propsNoFns, fnKeys, fnValues }
}

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
  onResolved?: (component: React.FC) => void
): React.FC {
return lazy(async () => {
    const { propsNoFns, fnKeys, fnValues } = splitFunctionProps(boundProps ?? {})
    const desc = await (entrypointFn as any)({ ...propsNoFns, __fnKeys: fnKeys }, ...fnValues)
    const tree = deserializeComponent(desc);
    const Component: React.FC = () => <>{tree}</>;
    onResolved?.(Component)
    return { default: Component };
  })
}

export function RpcSuspense(props: { 
  deferFallback?: boolean, 
  refreshOnRpcCallback?: boolean,
  fallback: React.ReactNode, 
  children: React.ReactNode
}) {
  type CacheEntry = {
    node: React.ReactNode
    propsHash: string
    descHash?: string
    inflight: boolean
  }
  const cacheRef = useRef<Map<React.Key, CacheEntry>>(new Map())
  const [, triggerResolve] = React.useReducer(x => x + 1, 0);

  // Resolve RPC children
  const resolvedChildren = Children.toArray(props.children).map((child, i) => {
    if (isValidElement(child)) {
      const t = child.type as unknown;

      // This is an RPC component, we need to resolve it
      if (typeof t === "function") {
        const key = (child as any).key ?? i;
        const rawChildProps = (child as any).props || {}

        // We need to serialize props, because they are potentially React elements or functions
        const serializedProps = serializePropsReactElements(rawChildProps, () => {
          if (props.refreshOnRpcCallback) {
            triggerResolve()
          }
        })

        // if deferFallback, let's attempt to fetch element from cache upon state updates instead
        // of showing the fallback value immediately
        if (props.deferFallback) {
          const cacheEntry = cacheRef.current.get(key)
          if (cacheEntry) {
            // optimistically return the cached RPC component so we don't display the fallback
            const existing = cacheRef.current.get(key)
            if (!existing?.inflight) {
              const { propsNoFns, fnKeys, fnValues } = splitFunctionProps(serializedProps)
              cacheRef.current.set(key, { ...(existing ?? { node: cacheEntry.node, propsHash: JSON.stringify(propsNoFns) }), inflight: true })
              
              // in the background, let's:
              // * resolve the RPC component
              // * update the cache
              // * trigger a state refresh
              ;(async () => {
                try {
                  const desc = await (t as any)({ ...propsNoFns, __fnKeys: fnKeys }, ...fnValues)
                  const tree = deserializeComponent(desc)
                  const descHash = typeof desc === "string" ? hashString(desc) : hashString(JSON.stringify(desc))
                  const prev = cacheRef.current.get(key)
                  // only update cache and re-render if content actually changed
                  if (!prev || prev.descHash !== descHash || prev.propsHash !== JSON.stringify(propsNoFns)) {
                    const Component: React.FC = () => <>{tree}</>;
                    cacheRef.current.set(key, {
                      node: <Component key={`${key}:${descHash}`} />,
                      propsHash: JSON.stringify(propsNoFns),
                      descHash,
                      inflight: false
                    })
                    triggerResolve()
                  } else {
                    cacheRef.current.set(key, { ...prev, inflight: false })
                  }
                } catch (e) {
                  const prev = cacheRef.current.get(key)
                  if (prev) cacheRef.current.set(key, { ...prev, inflight: false })
                  console.error("Failed to resolve RPC component", e)
                }
              })()
            }

            return cacheEntry.node
          }
        }

        // without deferFallback, just lazily resolve the RPC component
        const LazyComp = resolveRpcComponent(t as any, serializedProps)
        const node = <LazyComp key={key} />
        if (props.deferFallback) {
          const { propsNoFns } = splitFunctionProps(serializedProps)
          cacheRef.current.set(key, { node, propsHash: JSON.stringify(propsNoFns), inflight: false })
        }

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

export function RpcComponent(): MethodDecorator {
  return function (
    target: Object,
    propertyKey: string | symbol,
    descriptor: PropertyDescriptor
  ) {
    const original = descriptor.value;
    if (typeof original !== "function") {
      throw new Error("@RpcComponent can only be applied to methods")
    }

    descriptor.value = async function (...args: any[]) {
      // revive any serialized React props before calling the original method
      let revivedArgs = args.map((a) => reviveSerializableReact(a))
      // Merge back any function props hoisted to top-level args
      if (revivedArgs.length > 0 && revivedArgs[0] && typeof revivedArgs[0] === 'object') {
        const first: any = revivedArgs[0]
        const fnKeys: string[] | undefined = Array.isArray((first as any).__fnKeys) ? (first as any).__fnKeys as string[] : undefined
        if (fnKeys && fnKeys.length > 0) {
          delete first.__fnKeys
          const rest = revivedArgs.slice(1)
          const fns = rest.slice(0, fnKeys.length)
          fnKeys.forEach((k, i) => {
            (first as any)[k] = fns[i]
          })
          revivedArgs = [first, ...rest.slice(fnKeys.length)]
        }
      }
      const result = await original.apply(this, revivedArgs)
      // If already serialized via makeSerializable, pass through
      if (result && typeof result === "object" && (result as any).__reactSerialized === true) {
        return result
      }
      // Otherwise, serialize any returned React node
      return makeSerializable(result as any)
    }

    return descriptor;
  }
}
