/// <reference path="../types/global.d.ts" />
export declare type Action = () => void;
export declare type Unsubscribe = () => void;
export declare type Reactive<T> = {
    value: T;
    subscribe: (action: Action, skip?: boolean) => Unsubscribe;
};
export declare type ActionType = 0 | 1 | 2;
export declare type Listener<T> = (type: ActionType, index: Reactive<number>, item: Reactive<T>) => void;
export declare type ReactiveArray<T> = {
    value: T[];
    length: Reactive<number>;
    subscribe: (action: Action, skip?: boolean) => Unsubscribe;
    listen: (listener: Listener<T>) => Unsubscribe;
    map: (select: (item: Reactive<T>, index: Reactive<number>) => JSX.Element) => JSX.Element[];
    push: (...items: T[]) => number;
    pop: () => T | undefined;
    shift: () => T | undefined;
    splice: (start: number, deleteCount?: number, ...items: T[]) => T[];
};
export declare type Children = JSX.Element | JSX.Element[];
export declare type Component<Props = {
    children?: Children;
}> = (props: Props) => JSX.Element;
export declare const reactive: <T>(init: T) => Reactive<T>;
export declare const reactiveArray: <T>(init: T[]) => ReactiveArray<T>;
export declare function run<Props>(node: HTMLElement, component: Component<Props>, props: Props): Unsubscribe;
export declare const combine: <T>(value: T) => Reactive<T>;
