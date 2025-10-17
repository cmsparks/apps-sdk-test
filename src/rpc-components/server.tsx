import { RpcStub, RpcTarget } from "capnweb"
import { AsyncLocalStorage } from "node:async_hooks"
import { makeSerializable } from "./serialize"

export class RpcComponentState extends RpcTarget {
    components: Record<string, {
        component: string,
        args: any[],
        reresolve: RpcStub<(serializableComponent: any) => void>
    }> = {}
    asl = new AsyncLocalStorage<string>()

    constructor() {
        super()
        
        // Replace all methods (assumed to be components)
        Object.getOwnPropertyNames(Object.getPrototypeOf(this)).map((propertyKey: string) => {
            // skip constructor
            if (propertyKey === "constructor") return;

            const ogFunction = this[propertyKey as keyof this]

            // skip non function attributes
            if(typeof ogFunction !== "function") return;

            // replace all methods
            // @ts-ignore
            this[propertyKey as keyof this] = (
                id: string, 
                // TODO: this should be a Serializable type (but it's not exported in capnweb)
                reresolve: RpcStub<(serializableComponent: any) => void>, 
                ...args: any[]
            ) => {
                return this.asl.run(id, () => {
                    // save the reresolver and render args, so we can push component state updates back to the client.
                    this.components[id] = {
                        component: propertyKey,
                        args,
                        reresolve: reresolve.dup()
                    }

                    // Importantly, this is distinct from serializing the component directly via
                    // JSON.stringify(). capnweb handles the serialization for us and 
                    // transmits functions over the wire.
                    // 
                    // We're instead stripping out unserializable properties. We also DON'T strip the function props,
                    // because capnweb CAN transmit functions over the wire!
                    return makeSerializable(ogFunction(...args).bind(this))
                })
            }
        })
    }

    getId(): string {
        const id = this.asl.getStore()
        if (!id) throw new Error("No ID found")
        return id
    }

    pushRerender() {
        const component = this.components[this.getId()]
        if (!component) throw new Error("Tried to rerender component that doesn't exist")
        const componentFunction = this[component.component as keyof this] as Function
        component.reresolve(makeSerializable(componentFunction(...component.args)))
    }
}