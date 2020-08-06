/// <reference path="../types/global.d.ts" />

export type Action = () => void
export type Unsubscribe = () => void

export type Reactive<T> = {
    value: T
    subscribe: (action: Action, skip?: boolean) => Unsubscribe
}

export type ActionType =
    0 // add
    | 1 // remove
    | 2 // replace

export type Listener<T> = (type: ActionType, index: Reactive<number>, item: Reactive<T>) => void

export type ReactiveArray<T> = {
    value: T[]
    length: Reactive<number>
    subscribe: (action: Action, skip?: boolean) => Unsubscribe
    listen: (listener: Listener<T>) => Unsubscribe

    map: (select: (item: Reactive<T>, index: Reactive<number>) => JSX.Element) => JSX.Element[]
    push: (...items: T[]) => number
    pop: () => T | undefined
    shift: () => T | undefined
    splice: (start: number, deleteCount?: number, ...items: T[]) => T[]
}

export type Children = JSX.Element | JSX.Element[]

export type Component<Props = { children?: Children }> = (props: Props) => JSX.Element

export declare const reactive: <T>(init: T) => Reactive<T>

export declare const reactiveArray: <T>(init: T[]) => ReactiveArray<T>

export declare function run<Props>(node: HTMLElement, component: Component<Props>, props: Props): Unsubscribe
