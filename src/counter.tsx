import { Agent } from "agents";
import { RpcStub, RpcTarget } from "capnweb";
import { RpcComponent } from "./rpc-components";

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
            this.onCounterChange.map((cb) => cb(this.state.counter))
        }
    }

    registerOnCounterChange(cb: RpcStub<(counter: number) => void>) {
        this.onCounterChange.push(cb.dup())
    }
}

/**
 * Server side code for the counter
 */
export class CounterEntrypoint extends RpcTarget {
    constructor(public env: Env) {
        super()
    }

    private get counter() {
        return this.env.COUNTER.getByName('counter')
    }

    registerOnCounterChange(cb: RpcStub<(counter: number) => void>) {
        this.counter.registerOnCounterChange(cb.dup())
    }

    async getCounter(): Promise<number> {
        return this.counter.getCounter()
    }
    async incrementCounter() {
        return this.counter.incrementCounter()
    }

    @RpcComponent()
    async Counter(): Promise<React.ReactNode> {
        const OtherComponent = () => <div>Test component!</div>
        return <p className="counter-value" aria-live="polite">
            {await this.counter.getCounter()}
            <OtherComponent />
        </p>
    }
}