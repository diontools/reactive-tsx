/// <reference path="../types/global.d.ts" />
import { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run, combine } from './mono';
export { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run, combine };
export declare const reactive: <T>(init: T) => Reactive<T>;
export declare const reactiveArray: <T>(init: T[]) => ReactiveArray<T>;
export declare const subscribe$: (unsubscribes: Unsubscribe[], reactives: Reactive<any>[] | undefined, action: () => void) => void;
export declare const combineReactive$: <T>(unsubscribes: Unsubscribe[], reactives: Reactive<any>[] | undefined, func: () => T) => Reactive<T>;
declare type NodeCreator = (unsubscribes: Unsubscribe[]) => Node;
export declare const conditional$: (unsubscribes: Unsubscribe[], reactives: Reactive<any>[], condition: () => boolean, tureReactives: Reactive<any>[] | undefined, trueCreate: NodeCreator | undefined, falseReactives: Reactive<any>[] | undefined, falseCreate: NodeCreator | undefined, onUpdate: (node: Node) => void) => void;
export declare const conditionalText$: (unsubscribes: Unsubscribe[], conditionReactives: Reactive<any>[], condition: () => boolean, trueString: string, falseString: string, onUpdate: (text: string) => void) => void;
export declare const mapArray$: <T>(node: Node, items: ReactiveArray<T>, create: (unsubscribes: Unsubscribe[], item: Reactive<T>, index: Reactive<number>) => Node) => void;
export declare const element: typeof document.createElement;
export declare const text: typeof document.createTextNode;
