import { serialize, type RpcTarget } from "capnweb";
import React, { Children, Fragment, isValidElement, lazy, Suspense, useRef } from "react";
import * as dom from "react-dom";
import { renderToReadableStream } from "react-dom/server";

export type SerializedElement = {
  t: string; // tag or registry key, e.g. 'div' or 'MyComponent'
  p?: Record<string, unknown>; // props
  c?: SerializedChild[]; // children
  r?: boolean; // if true, resolve component from registry; else intrinsic
};

export type SerializedChild = string | number | boolean | null | SerializedElement;

export type ComponentRegistry = Record<string, React.ComponentType<any>>;

function isSerializedElement(x: unknown): x is SerializedElement {
  return !!x && typeof x === "object" && typeof (x as any).t === "string";
}

export function inflate(
  node: SerializedChild,
  registry?: ComponentRegistry
): React.ReactNode {
  if (
    node === null ||
    typeof node === "string" ||
    typeof node === "number" ||
    typeof node === "boolean"
  ) {
    return node as any;
  }

  if (!registry) {
    registry = {};
  }

  if (!isSerializedElement(node)) return null;

  const { t, p = {}, c = [], r } = node;
  const type: any = r ? registry[t] : t; // registry component or intrinsic tag
  const children = c.map((child, i) => inflate(child, registry));
  return React.createElement(type, { ...p, key: (p as any)?.key }, ...children);
}

export function deflate(
  element: React.ReactElement,
  registryKeysByType?: WeakMap<any, string>
): SerializedElement {
  const type: any = element.type as any;
  const isIntrinsic = typeof type === "string";
  const props: Record<string, unknown> = { ...(element.props as any) };
  const childrenRaw = props.children;
  delete props.children;

  const children: SerializedChild[] = [];
  const pushChild = (ch: any) => {
    if (
      ch === null ||
      ch === undefined ||
      typeof ch === "string" ||
      typeof ch === "number" ||
      typeof ch === "boolean"
    ) {
      children.push(ch as any);
    } else if (React.isValidElement(ch)) {
      children.push(deflate(ch, registryKeysByType));
    } else if (Array.isArray(ch)) {
      ch.forEach(pushChild);
    }
  };
  pushChild(childrenRaw);

  if (isIntrinsic) {
    return { t: type as string, p: props, c: children };
  }
  const key = registryKeysByType?.get(type);
  if (!key) {
    // Fallback: serialize as a fragment with text if unknown component
    return { t: "div", p: {}, c: ["[unregistered component]"] };
  }
  return { t: key, p: props, c: children, r: true };
}

/**
 * 
 * @param entrypointFn React FC on RPC entrypoint
 * @returns 
 */
function resolveRpcComponent<T extends RpcTarget>(
  entrypointFn: any,
  boundProps?: Record<string, unknown>,
  onResolved?: (component: React.FC) => void
): React.FC {
  // let's abuse lazy() to load components via rpc, binding props into the call
  return lazy(async () => {
      const desc = (await entrypointFn(boundProps ?? {})) as SerializedElement;
      const tree = inflate(desc);
      const Component: React.FC = () => <>{tree}</>;
      onResolved?.(Component)
      return { default: Component };
  })
}
  
export function RpcSuspense(props: { deferFallback?: boolean, fallback: React.ReactNode, children: React.ReactNode }) {
  type CacheEntry = {
      node: React.ReactNode
      propsHash: string
      descHash?: string
      inflight: boolean
  }
  const cacheRef = useRef<Map<React.Key, CacheEntry>>(new Map())
  const ref = useRef<HTMLDivElement>(null)
  const [, triggerResolve] = React.useReducer(x => x + 1, 0);

  const resolvedChildren = Children.toArray(props.children).map((child, i) => {
      if (isValidElement(child)) {
          const t = child.type as unknown;
          if (typeof t === "function") {
              const key = (child as any).key ?? i;
              const childProps = (child as any).props || {}
              const propsHash = JSON.stringify(childProps)

              if (props.deferFallback) {
                  const entry = cacheRef.current.get(key)
                  if (entry) {
                      // Show cached node immediately and refresh in background when idle.
                      if (!entry.inflight) {
                          entry.inflight = true
                          ;(async () => {
                              try {
                                  const desc = (await (t as any)(childProps)) as SerializedElement
                                  const descHash = JSON.stringify(desc)
                                  if (entry.descHash !== descHash) {
                                      entry.descHash = descHash
                                      const tree = inflate(desc)
                                      const Fresh: React.FC = () => <>{tree}</>
                                      entry.node = <Fresh key={key} />
                                      triggerResolve()
                                  }
                                  entry.propsHash = propsHash
                              } catch (_) {
                                  // keep cached on error
                              } finally {
                                  entry.inflight = false
                              }
                          })()
                      }
                      return entry.node
                  }
              }

              // No cache yet or deferFallback is off: create a lazy component and store it.
              const LazyComp = resolveRpcComponent<any>(t as any, childProps)
              const node = <LazyComp key={key} />
              cacheRef.current.set(key, { node, propsHash, inflight: false })
              return node
          }
      }
      return child;
  })

  return (
      <Suspense fallback={props.fallback}>
        <Fragment ref={ref}>
          {resolvedChildren}
        </Fragment>
      </Suspense>
  )
}

export function RpcComponent(): MethodDecorator {
  return function (
      _target: Object,
      _propertyKey: string | symbol,
      descriptor: PropertyDescriptor
  ) {
      const original = descriptor.value;
      if (typeof original !== "function") {
          throw new Error("@RpcComponent can only be applied to methods")
      }
      descriptor.value = async function (...args: any[]) {
          const result = await original.apply(this, args);
          // If already a SerializedElement, pass-through
          if (result && typeof result === "object" && "t" in (result as any)) {
              return result as SerializedElement;
          }
          // Expect a valid React element; serialize it
          if (!isValidElement(result)) {
              throw new Error("@RpcComponent method must return a React element or SerializedElement")
          }
          return renderToReadableStream(result as any)
      }
      return descriptor;
  }
}