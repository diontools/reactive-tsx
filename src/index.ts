/// <reference path="../types/global.d.ts" />

import { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run, combine } from './mono'
export { Action, Unsubscribe, Reactive, ActionType, Listener, ReactiveArray, Children, Component, run, combine }

type LinkItem = {
    action: Action
    next?: LinkItem
    prev?: LinkItem
}

export const reactive = <T>(init: T): Reactive<T> => {
    let _v = init
    let _firstLink: LinkItem | undefined
    let _lastLink: LinkItem | undefined
    return {
        get value() { return _v },
        set value(v) {
            if (_v !== v) {
                _v = v
                for (let link = _firstLink; link; link = link.next) link.action()
            }
        },
        subscribe(action, skip) {
            const link: LinkItem = { action, prev: _lastLink }
            if (_lastLink) _lastLink = _lastLink.next = link
            else _firstLink = _lastLink = link

            !skip && action()

            return () => {
                link.next ? link.next.prev = link.prev : _lastLink = link.prev
                link.prev ? link.prev.next = link.next : _firstLink = link.next
                link.next = link.prev = undefined
            }
        }
    }
}

type Holder<T> = {
    item: Reactive<T>
    index: Reactive<number>
    unsubscribe: Unsubscribe
}

export const reactiveArray = <T>(init: T[]): ReactiveArray<T> => {
    let _v = init
    const _actions: Action[] = []
    const _listeners: Listener<T>[] = []
    const _holders: Holder<T>[] = init.map((_, i) => createHolder(i))
    const length = reactive(_v.length)

    function createHolder(indexValue: number): Holder<T> {
        const item = reactive(_v[indexValue])
        const index = reactive(indexValue)
        const unsubscribe = item.subscribe(() => _v[index.value] = item.value, true)
        return ({ item, index, unsubscribe })
    }

    const raise = (type: ActionType, holder: Holder<T>) => {
        for (let i = 0; i < _listeners.length; i++) {
            _listeners[i](type, holder.index, holder.item)
        }
    }

    return {
        get value() { return _v },
        set value(v) {
            if (_v !== v) {
                _v = v
                for (let i = 0; i < _actions.length; i++) _actions[i]()
            }
        },
        length,
        subscribe(action, skip) {
            _actions.push(action)
            !skip && action()
            return () => {
                const index = _actions.indexOf(action)
                if (index >= 0) _actions.splice(index, 1)
            }
        },
        listen(listener) {
            _listeners.push(listener)

            for (let i = 0; i < _holders.length; i++) {
                const holder = _holders[i]
                listener(0, holder.index, holder.item)
            }

            return () => {
                const index = _listeners.indexOf(listener)
                if (index >= 0) _listeners.splice(index, 1)
            }
        },
        map: undefined as any,
        push(...items) {
            for (let i = 0; i < items.length; i++) {
                const index = _v.length
                _v.push(items[i])
                const holder = createHolder(index)
                _holders.push(holder)
                raise(0, holder)
                length.value = _v.length
            }
            return _v.length
        },
        pop() {
            if (_v.length > 0) {
                const v = _v.pop()
                const holder = _holders.pop()
                if (holder) raise(1, holder), holder.unsubscribe()
                length.value = _v.length
                return v
            }
        },
        shift() {
            const v = _v.shift()
            const holder = _holders.shift()
            if (holder) raise(1, holder), holder.unsubscribe()
            for (let i = 0; i < _holders.length; i++) _holders[i].index.value = i
            length.value = _v.length
            return v
        },
        splice(start, deleteCount) {
            deleteCount = deleteCount ?? (_v.length - start)
            const newCount = Math.max(arguments.length - 2, 0)
            const replaceCount = Math.min(deleteCount, newCount)
            const addCount = newCount - replaceCount
            const removeCount = deleteCount - replaceCount

            for (let i = 0; i < replaceCount; i++) {
                const holder = _holders[start + i]
                holder.item.value = _v[start + i] = arguments[2 + i]
                raise(2, holder)
            }

            if (addCount > 0) {
                for (let i = 0; i < addCount; i++) {
                    const v: T = arguments[2 + replaceCount + i]
                    const index = start + replaceCount + i
                    _v.splice(index, 0, v)
                    const holder = createHolder(index)
                    _holders.splice(index, 0, holder)
                    raise(0, holder)
                }

                for (let i = start + replaceCount + addCount; i < _holders.length; i++) _holders[i].index.value = i
            } else if (removeCount > 0) {
                for (let i = removeCount - 1; i >= 0; i--) {
                    const index = start + replaceCount + i
                    const holder = _holders[index]
                    _holders.splice(index, 1)
                    raise(1, holder)
                    holder.unsubscribe()
                }

                for (let i = start + replaceCount; i < _holders.length; i++) _holders[i].index.value = i
            }

            length.value = _v.length
            return _v.splice(start + replaceCount, removeCount)
        },
    }
}

export const subscribe$ = (unsubscribes: Unsubscribe[], reactives: Reactive<any>[] | undefined, action: () => void) => {
    if (reactives) {
        for (let i = 0; i < reactives.length; i++) {
            unsubscribes.push(reactives[i].subscribe(action, true))
        }
    }
    action()
}

export const combineReactive$ = <T>(unsubscribes: Unsubscribe[], reactives: Reactive<any>[] | undefined, func: () => T) => {
    const r = reactive<T>(undefined as any)
    subscribe$(unsubscribes, reactives, () => r.value = func())
    return r
}

type NodeUpdater = (node: Node | string) => void
type NodeCreator = (unsubscribes: Unsubscribe[], onUpdate: NodeUpdater) => void

export const conditional$ = (unsubscribes: Unsubscribe[], reactives: Reactive<any>[], condition: () => boolean, tureReactives: Reactive<any>[] | undefined, trueCreate: NodeCreator | undefined, falseReactives: Reactive<any>[] | undefined, falseCreate: NodeCreator | undefined, onUpdate: NodeUpdater) => {
    if (!trueCreate || !falseCreate) {
        const dummy = document.createTextNode('')
        const dummyCreate: NodeCreator = (unsubscribes, onUpdate) => { dummy.nodeValue = ''; onUpdate(dummy)}
        if (!trueCreate) trueCreate = dummyCreate
        if (!falseCreate) falseCreate = dummyCreate
    }

    let current: boolean
    let childUnsubscribes: Unsubscribe[] = []
    const trueUpdate = () => trueCreate!(childUnsubscribes, onUpdate)
    const falseUpdate = () => falseCreate!(childUnsubscribes, onUpdate)

    unsubscribes.push(() => childUnsubscribes.forEach(x => x()))

    subscribe$(unsubscribes, reactives, () => {
        const next = condition()
        if (current !== next) {
            childUnsubscribes.forEach(x => x())
            childUnsubscribes.length = 0
            const update = next ? trueUpdate : falseUpdate
            const reactives = next ? tureReactives : falseReactives
            reactives ? subscribe$(childUnsubscribes, reactives, update) : update()
            current = next
        }
    })
}

export const replaceNode$ = (node: Node | string, currentNode: Node, parentNode: Node) => {
    if (typeof node === 'string') {
        if (currentNode.nodeType === 3) {
            currentNode.nodeValue = node
            return currentNode
        }
        node = document.createTextNode(node)
    }
    parentNode.replaceChild(node, currentNode)
    return node
}

export const mapArray$ = (() => {
    type Buffer = [Node, Unsubscribe[]]

    const clear = (unsubscribes: Unsubscribe[]) => {
        for (let i = 0; i < unsubscribes.length; i++) unsubscribes[i]()
        unsubscribes.length = 0
    }

    return (<T>(node: Node, items: ReactiveArray<T>, create: (unsubscribes: Unsubscribe[], item: Reactive<T>, index: Reactive<number>) => Node) => {
        const buffers: Buffer[] = []
        items.listen((type, index, item) => {
            switch (type) {
                case 0: // add
                    {
                        const unsubscribes: Unsubscribe[] = []
                        const buffer: Buffer = [create(unsubscribes, item, index), unsubscribes]
                        const refBuffer = buffers[index.value]
                        node.insertBefore(buffer[0], refBuffer && refBuffer[0])
                        buffers.splice(index.value, 0, buffer)
                        break
                    }
                case 1: // remove
                    {
                        const buffer = buffers[index.value]
                        clear(buffer[1])
                        node.removeChild(buffer[0])
                        buffers.splice(index.value, 1)
                        break
                    }
                case 2: // replace
                    {
                        const buffer = buffers[index.value]
                        const beforeNode = buffer[0]
                        clear(buffer[1])
                        buffer[0] = create(buffer[1], item, index)
                        node.replaceChild(buffer[0], beforeNode)
                        break
                    }
            }
        })
    })
})()

export const element: typeof document.createElement = document.createElement.bind(document)
export const text: typeof document.createTextNode = document.createTextNode.bind(document)
