/// <reference path="../types/global.d.ts" />
import { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run, combine } from './mono';
export { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run, combine };
export declare const reactive: <T>(init: T) => Reactive<T>;
export declare const reactiveArray: <T>(init: T[]) => ReactiveArray<T>;
