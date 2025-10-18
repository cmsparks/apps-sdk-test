import type { ActionDispatch, AnyActionArg, useReducer as reactUseReducer } from "react"
import { asl } from "./server"

export interface Hook<S, A> {
    memoizedState: S
    reducer: (state: S, action: A) => S
    queue: A[]
}

export const useReducer = <S, A extends AnyActionArg>(
    ...args: Parameters<typeof reactUseReducer<S, A>>
): ReturnType<typeof reactUseReducer<S, A>> => {
    const [reducer, initialArg] = args

    const store = asl.getStore()
    if (!store) {
        throw new Error("No ID found. Was the hook run inside of a server component?")
    }

    const { id, this: componentServer } = store
    const { update } = componentServer.useLifecycle()
    const component = componentServer.components[id]

    // Initialize hooks array if it doesn't exist
    if (!component.hooks) {
        component.hooks = []
        component.currentHookIndex = 0
    }

    // Get current hook index and increment for next hook call
    const hookIndex = component.currentHookIndex!
    component.currentHookIndex!++

    // Get or create the hook at this index
    let hook: Hook<S, A> = component.hooks[hookIndex] as Hook<S, A>

    if (!hook) {
        // Mount phase: initialize the hook
        // Compute initial state using init function if provided, otherwise use initialArg directly
        let initialState: S
        initialState = initialArg as S

        hook = {
            memoizedState: initialState,
            reducer: reducer as (state: S, action: A) => S,
            queue: []
        }
        component.hooks[hookIndex] = hook
    } else {
        // Update phase: process any queued actions
        hook.reducer = reducer as (state: S, action: A) => S // Update reducer in case it changed

        if (hook.queue.length > 0) {
            // Process all queued actions through the reducer
            let newState = hook.memoizedState
            for (const action of hook.queue) {
                // @ts-ignore TODO fix types with hooks
                newState = reducer(newState, action)
            }
            hook.memoizedState = newState
            hook.queue = []
        }
    }

    // Create dispatch function bound to this hook
    const dispatch = (action: A) => {
        // Get fresh reference to the hook
        const currentHook = component.hooks![hookIndex] as Hook<S, A>
        // Apply reducer to get new state
        const newState = currentHook.reducer(currentHook.memoizedState, action)
        // Only update if state actually changed
        if (!Object.is(newState, currentHook.memoizedState)) {
            currentHook.memoizedState = newState
            // Trigger component re-render (hook index will be reset at start of next render)
            update()
        }
    }

    // @ts-ignore
    return [hook.memoizedState, dispatch]
}

function reducer<T>(state: T, action: T | ((state: T) => T)) {
    if (typeof action === 'function') {
        // @ts-ignore
        return action(state);
    }
    return action;
}

export function useState<T>(initialState: T): [T, ActionDispatch<[action: T | ((state: T) => T)]>] {
    const [state, dispatch] = useReducer(reducer<T>, initialState);
    return [state, dispatch];
}