import { describe, expect, inject, it } from "vitest"
import React from "react"
import { newWebSocketRpcSession } from "capnweb"
import type { TestTarget } from "./test-target"
import { deserializeComponent } from "../src/serialize-react"

describe('makeSerializable', () => {
    const stub = newWebSocketRpcSession<TestTarget>(`ws://${inject("testServerHost")}/rpc`)

    const firstElementChild = (children: any) => {
        const arr = Array.isArray(children) ? children : [children]
        return arr.find((x: any) => x && typeof x === 'object' && typeof x.type === 'string')
    }

    it("serializes a simple element", async () => {
        // @ts-ignore some weird type stuff...
        const res = await stub.test()
        expect(res).toStrictEqual({
            __reactSerialized: true,
            type: 'div',
            props: { children: 'Test' },
        })
    })

    it("serializes a nested element", async () => {
        const res: any = await stub.testNested()
        expect(res).toMatchObject({ __reactSerialized: true, type: 'div' })
        const inner = firstElementChild(res.props?.children)
        expect(inner).toMatchObject({ type: 'div', props: { children: 'Test' } })
    })

    it("serializes an element with props", async () => {
        const res: any = await stub.testProps()
        const inner = firstElementChild(res.props?.children)
        expect(inner).toMatchObject({ type: 'div', props: { className: 'test', children: 'Test' } })
        expect(inner.__reactSerialized).toBeUndefined()
    })

    it("serializes children from a different scope", async () => {
        const res: any = await stub.testChildrenDifferentScope()
        const inner = firstElementChild(res.props?.children)
        expect(inner.__reactSerialized).toBeUndefined()
    })

    it("serializes an element with an onClick handler", async () => {
        const res: any = await stub.testCallback()
        const inner = firstElementChild(res.props?.children)
        expect(inner).toMatchObject({ type: 'div', props: { children: 'Test' } })
        expect(inner.props.onClick).toBeTypeOf('function')
        expect(await inner.props.onClick()).toEqual('clicked')
    })
})

describe('deserializeComponent', () => {
    const stub = newWebSocketRpcSession<TestTarget>(`ws://${inject("testServerHost")}/rpc`)

    const firstElementChild = (children: any) => {
        const arr = React.Children.toArray(children)
        return arr.find((x: any) => React.isValidElement(x) && typeof x.type === 'string') as React.ReactElement | undefined
    }

    it("deserializes a simple element", async () => {
        const desc = await stub.test()
        const node: any = deserializeComponent(desc)
        expect(React.isValidElement(node)).toBe(true)
        expect(node.type).toBe('div')
        expect(node.props.children).toBe('Test')
    })

    it("deserializes a nested element", async () => {
        const desc: any = await stub.testNested()
        const node: any = deserializeComponent(desc)
        expect(React.isValidElement(node)).toBe(true)
        expect(node.type).toBe('div')
        const inner = firstElementChild(node.props?.children) as any
        expect(inner && inner.type).toBe('div')
        expect(inner.props.children).toBe('Test')
    })

    it("deserializes an element with props", async () => {
        const desc: any = await stub.testProps()
        const node: any = deserializeComponent(desc)
        const inner = firstElementChild(node.props?.children) as any
        expect(inner && inner.type).toBe('div')
        expect(inner.props.className).toBe('test')
        expect(inner.props.children).toBe('Test')
    })

    it("deserializes children from a different scope", async () => {
        const desc: any = await stub.testChildrenDifferentScope()
        const node: any = deserializeComponent(desc)
        const inner = firstElementChild(node.props?.children) as any
        expect(inner && inner.type).toBe('div')
        expect(inner.props.children).toBe('Test')
    })

    it("deserializes an element with an onClick handler", async () => {
        const desc: any = await stub.testCallback()
        const node: any = deserializeComponent(desc)
        const inner = firstElementChild(node.props?.children) as any
        expect(inner && inner.type).toBe('div')
        expect(inner.props.children).toBe('Test')
        expect(inner.props.onClick).toBeTypeOf('function')
        expect(await inner.props.onClick()).toEqual('clicked')
    })
})