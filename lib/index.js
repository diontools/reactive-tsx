"use strict";
/// <reference path="../types/html.d.ts" />
Object.defineProperty(exports, "__esModule", { value: true });
exports.text = exports.element = exports.mapArray$ = exports.replaceNode$ = exports.conditional$ = exports.combineReactive$ = exports.subscribe$ = exports.reactiveArray = exports.reactive = void 0;
exports.reactive = (init) => {
    let _v = init;
    let _firstLink;
    let _lastLink;
    return {
        get value() { return _v; },
        set value(v) {
            if (_v !== v) {
                _v = v;
                for (let link = _firstLink; link; link = link.next)
                    link.action();
            }
        },
        subscribe(action, skip) {
            const link = { action, prev: _lastLink };
            if (_lastLink)
                _lastLink = _lastLink.next = link;
            else
                _firstLink = _lastLink = link;
            !skip && action();
            return () => {
                link.next ? link.next.prev = link.prev : _lastLink = link.prev;
                link.prev ? link.prev.next = link.next : _firstLink = link.next;
                link.next = link.prev = undefined;
            };
        }
    };
};
exports.reactiveArray = (init) => {
    let _v = init;
    const _actions = [];
    const _listeners = [];
    const _holders = init.map((_, i) => createHolder(i));
    const length = exports.reactive(_v.length);
    function createHolder(indexValue) {
        const item = exports.reactive(_v[indexValue]);
        const index = exports.reactive(indexValue);
        const unsubscribe = item.subscribe(() => _v[index.value] = item.value, true);
        return ({ item, index, unsubscribe });
    }
    const raise = (type, holder) => {
        for (let i = 0; i < _listeners.length; i++) {
            _listeners[i](type, holder.index, holder.item);
        }
    };
    return {
        get value() { return _v; },
        set value(v) {
            if (_v !== v) {
                _v = v;
                for (let i = 0; i < _actions.length; i++)
                    _actions[i]();
            }
        },
        length,
        subscribe(action, skip) {
            _actions.push(action);
            !skip && action();
            return () => {
                const index = _actions.indexOf(action);
                if (index >= 0)
                    _actions.splice(index, 1);
            };
        },
        listen(listener) {
            _listeners.push(listener);
            for (let i = 0; i < _holders.length; i++) {
                const holder = _holders[i];
                listener(0, holder.index, holder.item);
            }
            return () => {
                const index = _listeners.indexOf(listener);
                if (index >= 0)
                    _listeners.splice(index, 1);
            };
        },
        map: undefined,
        push(...items) {
            for (let i = 0; i < items.length; i++) {
                const index = _v.length;
                _v.push(items[i]);
                const holder = createHolder(index);
                _holders.push(holder);
                raise(0, holder);
                length.value = _v.length;
            }
            return _v.length;
        },
        pop() {
            if (_v.length > 0) {
                const v = _v.pop();
                const holder = _holders.pop();
                if (holder)
                    raise(1, holder), holder.unsubscribe();
                length.value = _v.length;
                return v;
            }
        },
        shift() {
            const v = _v.shift();
            const holder = _holders.shift();
            if (holder)
                raise(1, holder), holder.unsubscribe();
            for (let i = 0; i < _holders.length; i++)
                _holders[i].index.value = i;
            length.value = _v.length;
            return v;
        },
        splice(start, deleteCount) {
            deleteCount = deleteCount !== null && deleteCount !== void 0 ? deleteCount : (_v.length - start);
            const newCount = Math.max(arguments.length - 2, 0);
            const replaceCount = Math.min(deleteCount, newCount);
            const addCount = newCount - replaceCount;
            const removeCount = deleteCount - replaceCount;
            for (let i = 0; i < replaceCount; i++) {
                const holder = _holders[start + i];
                holder.item.value = _v[start + i] = arguments[2 + i];
                raise(2, holder);
            }
            if (addCount > 0) {
                for (let i = 0; i < addCount; i++) {
                    const v = arguments[2 + replaceCount + i];
                    const index = start + replaceCount + i;
                    _v.splice(index, 0, v);
                    const holder = createHolder(index);
                    _holders.splice(index, 0, holder);
                    raise(0, holder);
                }
                for (let i = start + replaceCount + addCount; i < _holders.length; i++)
                    _holders[i].index.value = i;
            }
            else if (removeCount > 0) {
                for (let i = removeCount - 1; i >= 0; i--) {
                    const index = start + replaceCount + i;
                    const holder = _holders[index];
                    _holders.splice(index, 1);
                    raise(1, holder);
                    holder.unsubscribe();
                }
                for (let i = start + replaceCount; i < _holders.length; i++)
                    _holders[i].index.value = i;
            }
            length.value = _v.length;
            return _v.splice(start + replaceCount, removeCount);
        },
    };
};
exports.subscribe$ = (unsubscribes, reactives, action) => {
    if (reactives) {
        for (let i = 0; i < reactives.length; i++) {
            unsubscribes.push(reactives[i].subscribe(action, true));
        }
    }
    action();
};
exports.combineReactive$ = (unsubscribes, reactives, func) => {
    const r = exports.reactive(undefined);
    exports.subscribe$(unsubscribes, reactives, () => r.value = func());
    return r;
};
exports.conditional$ = (unsubscribes, reactives, condition, tureReactives, trueCreate, falseReactives, falseCreate, onUpdate) => {
    if (!trueCreate || !falseCreate) {
        const dummy = document.createTextNode('');
        const dummyCreate = (unsubscribes, onUpdate) => { dummy.nodeValue = ''; onUpdate(dummy); };
        if (!trueCreate)
            trueCreate = dummyCreate;
        if (!falseCreate)
            falseCreate = dummyCreate;
    }
    let current;
    let childUnsubscribes = [];
    const trueUpdate = () => trueCreate(childUnsubscribes, onUpdate);
    const falseUpdate = () => falseCreate(childUnsubscribes, onUpdate);
    unsubscribes.push(() => childUnsubscribes.forEach(x => x()));
    exports.subscribe$(unsubscribes, reactives, () => {
        const next = condition();
        if (current !== next) {
            childUnsubscribes.forEach(x => x());
            childUnsubscribes.length = 0;
            const update = next ? trueUpdate : falseUpdate;
            const reactives = next ? tureReactives : falseReactives;
            reactives ? exports.subscribe$(childUnsubscribes, reactives, update) : update();
            current = next;
        }
    });
};
exports.replaceNode$ = (node, currentNode, parentNode) => {
    if (typeof node === 'string') {
        if (currentNode.nodeType === 3) {
            currentNode.nodeValue = node;
            return currentNode;
        }
        node = document.createTextNode(node);
    }
    parentNode.replaceChild(node, currentNode);
    return node;
};
exports.mapArray$ = (() => {
    const clear = (unsubscribes) => {
        for (let i = 0; i < unsubscribes.length; i++)
            unsubscribes[i]();
        unsubscribes.length = 0;
    };
    return ((node, items, create) => {
        const buffers = [];
        items.listen((type, index, item) => {
            switch (type) {
                case 0: // add
                    {
                        const unsubscribes = [];
                        const buffer = [create(unsubscribes, item, index), unsubscribes];
                        const refBuffer = buffers[index.value];
                        node.insertBefore(buffer[0], refBuffer && refBuffer[0]);
                        buffers.splice(index.value, 0, buffer);
                        break;
                    }
                case 1: // remove
                    {
                        const buffer = buffers[index.value];
                        clear(buffer[1]);
                        node.removeChild(buffer[0]);
                        buffers.splice(index.value, 1);
                        break;
                    }
                case 2: // replace
                    {
                        const buffer = buffers[index.value];
                        const beforeNode = buffer[0];
                        clear(buffer[1]);
                        buffer[0] = create(buffer[1], item, index);
                        node.replaceChild(buffer[0], beforeNode);
                        break;
                    }
            }
        });
    });
})();
exports.element = document.createElement.bind(document);
exports.text = document.createTextNode.bind(document);
