/// <reference path="../types/global.d.ts" />
import { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run } from './mono';
export { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run };
export declare const reactive: <T>(init: T) => Reactive<T>;
export declare const reactiveArray: <T>(init: T[]) => ReactiveArray<T>;
export declare const subscribe: (action: () => void, unsubscribes: Unsubscribe[], reactives?: Reactive<any>[] | undefined) => void;
declare type NodeCreator = (unsubscribes: Unsubscribe[]) => Node;
export declare const conditional: (node: Node, unsubscribes: Unsubscribe[], reactives: Reactive<any>[], condition: () => boolean, trueCreate?: NodeCreator | undefined, falseCreate?: NodeCreator | undefined) => void;
export declare const conditionalText: (node: Node, unsubscribes: Unsubscribe[], conditionReactives: Reactive<any>[], condition: () => boolean, trueString: string, falseString: string) => void;
export declare const mapArray: <T>(node: Node, items: ReactiveArray<T>, create: (unsubscribes: Unsubscribe[], item: Reactive<T>, index: Reactive<number>) => Node) => void;
export declare const element: typeof document.createElement;
export declare const text: typeof document.createTextNode;
