import { RpcStub, RpcTarget } from "capnweb"
import { AsyncLocalStorage } from "node:async_hooks"
import { makeSerializable, unmakeSerializable } from "./serialize"
import type { Hook } from "./hooks"

export const asl = new AsyncLocalStorage<{ this: RpcComponentServer, id: string }>()

export class RpcComponentServer extends RpcTarget {
    components: Record<string, {
        component: string | symbol,
        args: any[],
        reresolve: RpcStub<(serializableComponent: any) => void>,
        currentHookIndex: number,
        hooks: Array<Hook<any, any>>
    }> = {}

    constructor() {
        super()
    }

    useLifecycle() {
        const store = this.getStore()
        return {
            update: () => this.pushRerender(store.id),
        }
    }

    private getStore(): { this: RpcComponentServer, id: string } {
        const store = asl.getStore()
        if (!store) {
            throw new Error("No ID found")
        }
        return store
    }

    // Imperatively push a rerender for a component
    // You shouldn't use this. Instead use the included useState hook
    private async pushRerender(id: string) {
        console.log("pushing rerender for component", id)
        const component = this.components[id]
        console.log("pushing rerender for component", component)
        console.log(this.components)
        console.log(this)
        if (!component) throw new Error("Tried to rerender component that doesn't exist")
        
        // Reset hook index before re-rendering so hooks are read from the start
        component.currentHookIndex = 0
        
        const componentFunction = this[component.component as keyof this] as Function
        console.log("component function", componentFunction)
        try {
            const componentRes = await componentFunction.call(this, id, component.reresolve, ...component.args)
            console.log("component", componentRes)
            await component.reresolve(componentRes)
        } catch (e) {
            console.error("Failed to rerender component", id, e)
        }
    }
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

        descriptor.value = async function(
            id: string,
            reresolve: RpcStub<(serializableComponent: any) => void>,
            ...args: any[]
        ) {
            console.log({id, reresolve, args})
            // revive any serialized React props before calling the original method
            let revivedArgs = args.map((a) => unmakeSerializable(a))
            // @ts-ignore
            // Preserve existing hooks and state when updating component
            const existingComponent = this.components[id]
            this.components[id] = {
                component: propertyKey,
                args,
                reresolve: reresolve.dup(),
                // Preserve hooks state across re-renders
                hooks: existingComponent?.hooks || [],
                currentHookIndex: existingComponent?.currentHookIndex ?? 0
            }
            const result = await asl.run({ this: this as RpcComponentServer, id: id }, async () => {
                return await original.apply(this, revivedArgs)
            })
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