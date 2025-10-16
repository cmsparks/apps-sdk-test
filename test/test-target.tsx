import { RpcTarget } from "capnweb"
import { makeSerializable } from "../src/serialize-react"
import { RpcComponent } from "../src/rpc-components"

export class TestTarget extends RpcTarget {
    @RpcComponent()
    test() {
        return makeSerializable(<div>Test</div>)
    }

    @RpcComponent()
    testNested() {
        return makeSerializable(<div>
            <div>Test</div>
        </div>)
    }

    @RpcComponent()
    testProps() {
        return makeSerializable(<div>
            <div className="test">Test</div>
        </div>)
    }

    @RpcComponent()
    testCallback() {
        return makeSerializable(<div>
            <div onClick={() => {
                return "clicked"
            }}>Test</div>
        </div>)
    }

    @RpcComponent()
    testChildrenDifferentScope() {
        const Component = () => <div>Test</div>
        return makeSerializable(<div>
            <Component />
        </div>)
    }
}