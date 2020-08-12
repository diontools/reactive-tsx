const reactive = init => {
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
const reactiveArray = init => {
    let _v = init;
    const _actions = [];
    const _listeners = [];
    const _holders = init.map((_, i) => createHolder(i));
    const length = reactive(_v.length);
    function createHolder(indexValue) {
        const item = reactive(_v[indexValue]);
        const index = reactive(indexValue);
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
        }
    };
};
const subscribe$ = (unsubscribes, reactives, action) => {
    if (reactives) {
        for (let i = 0; i < reactives.length; i++) {
            unsubscribes.push(reactives[i].subscribe(action, true));
        }
    }
    action();
};
const combineReactive$ = (unsubscribes, reactives, func) => {
    const r = reactive(undefined);
    subscribe$(unsubscribes, reactives, () => r.value = func());
    return r;
};
const conditional$ = (unsubscribes, reactives, condition, tureReactives, trueCreate, falseReactives, falseCreate, onUpdate) => {
    if (!trueCreate || !falseCreate) {
        const dummy = document.createTextNode("");
        const dummyCreate = (unsubscribes, onUpdate) => { dummy.nodeValue = ""; onUpdate(dummy); };
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
    subscribe$(unsubscribes, reactives, () => {
        const next = condition();
        if (current !== next) {
            childUnsubscribes.forEach(x => x());
            childUnsubscribes.length = 0;
            const update = next ? trueUpdate : falseUpdate;
            const reactives = next ? tureReactives : falseReactives;
            reactives ? subscribe$(childUnsubscribes, reactives, update) : update();
            current = next;
        }
    });
};
const replaceNode$ = (node, currentNode, parentNode) => {
    if (typeof node === "string") {
        if (currentNode.nodeType === 3) {
            currentNode.nodeValue = node;
            return currentNode;
        }
        node = document.createTextNode(node);
    }
    parentNode.replaceChild(node, currentNode);
    return node;
};
const mapArray$ = (() => {
    const clear = unsubscribes => {
        for (let i = 0; i < unsubscribes.length; i++)
            unsubscribes[i]();
        unsubscribes.length = 0;
    };
    return ((node, items, create) => {
        const buffers = [];
        items.listen((type, index, item) => {
            switch (type) {
                case 0: {
                    const unsubscribes = [];
                    const buffer = [create(unsubscribes, item, index), unsubscribes];
                    const refBuffer = buffers[index.value];
                    node.insertBefore(buffer[0], refBuffer && refBuffer[0]);
                    buffers.splice(index.value, 0, buffer);
                    break;
                }
                case 1: {
                    const buffer = buffers[index.value];
                    clear(buffer[1]);
                    node.removeChild(buffer[0]);
                    buffers.splice(index.value, 1);
                    break;
                }
                case 2: {
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
const Item = (unsubscribes, props) => {
    const test = reactive(0);
    const div1 = document.createElement("div");
    {
        div1.appendChild(document.createTextNode("Item: "));
        const text2 = document.createTextNode("");
        subscribe$(unsubscribes, [props.max, test], () => text2.nodeValue = props.max.value + test.value);
        div1.appendChild(text2);
        props.children && props.children(div1, unsubscribes);
    }
    return div1;
};
const App = (unsubscribes, props) => {
    const count = reactive(0);
    const items = reactiveArray(['xyz', 'abc']);
    const doubled = combineReactive$(unsubscribes, [count], () => count.value * 2);
    const div3 = document.createElement("div");
    div3["className"] = "foo";
    {
        div3.appendChild(document.createTextNode("count: "));
        const text4 = document.createTextNode("");
        unsubscribes.push(count.subscribe(() => text4.nodeValue = count.value));
        div3.appendChild(text4);
        div3.appendChild(document.createTextNode(" (max: "));
        const text5 = document.createTextNode("");
        unsubscribes.push(props.max.subscribe(() => text5.nodeValue = props.max.value));
        div3.appendChild(text5);
        div3.appendChild(document.createTextNode(")"));
        const button6 = document.createElement("button");
        button6["onclick"] = () => count.value += 1;
        {
            button6.appendChild(document.createTextNode("+1"));
        }
        div3.appendChild(button6);
        const button7 = document.createElement("button");
        button7["onclick"] = () => count.value -= 1;
        {
            button7.appendChild(document.createTextNode("-1"));
        }
        div3.appendChild(button7);
        const button8 = document.createElement("button");
        button8["onclick"] = () => count.value = 0;
        unsubscribes.push(count.subscribe(() => button8["disabled"] = count.value === 0));
        {
            button8.appendChild(document.createTextNode("reset"));
        }
        div3.appendChild(button8);
        const div9 = document.createElement("div");
        {
            div9.appendChild(document.createTextNode("jsx in expression"));
        }
        div3.appendChild(div9);
        let currentNode10 = document.createTextNode("");
        div3.appendChild(currentNode10);
        conditional$(unsubscribes, /*
            condition*/ [count, props.max], () => count.value > props.max.value, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('over!'), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode10 = replaceNode$(node, currentNode10, div3));
        let currentNode11 = document.createTextNode("");
        div3.appendChild(currentNode11);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ [count, props.max], (unsubscribes, onUpdate) => onUpdate(('conditional reactive text: ' + (count.value + props.max.value)) || ""), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode11 = replaceNode$(node, currentNode11, div3));
        let currentNode12 = document.createTextNode("");
        div3.appendChild(currentNode12);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value < 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => {
            const em13 = document.createElement("em");
            {
                em13.appendChild(document.createTextNode("under!"));
            }
            onUpdate(em13);
        }, /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode12 = replaceNode$(node, currentNode12, div3));
        let currentNode14 = document.createTextNode("");
        div3.appendChild(currentNode14);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(document.createTextNode("conditional child component"));
            }
        })), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode14 = replaceNode$(node, currentNode14, div3));
        let currentNode15 = document.createTextNode("");
        div3.appendChild(currentNode15);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => onUpdate('non zero'), /*
            onUpdate */ node => currentNode15 = replaceNode$(node, currentNode15, div3));
        let currentNode16 = document.createTextNode("");
        div3.appendChild(currentNode16);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => {
            const strong17 = document.createElement("strong");
            {
                strong17.appendChild(document.createTextNode("non zero"));
            }
            onUpdate(strong17);
        }, /*
            onUpdate */ node => currentNode16 = replaceNode$(node, currentNode16, div3));
        let currentNode18 = document.createTextNode("");
        div3.appendChild(currentNode18);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => conditional$(unsubscribes, /*
                condition*/ [count], () => count.value === 1, /*
                whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('one'), /*
                whenFalse*/ undefined, (unsubscribes, onUpdate) => conditional$(unsubscribes, /*
                    condition*/ [count], () => count.value === 2, /*
                    whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('two'), /*
                    whenFalse*/ [count], (unsubscribes, onUpdate) => onUpdate('unknown:' + count.value || ""), /*
                    onUpdate */ onUpdate), /*
                onUpdate */ onUpdate), /*
            onUpdate */ node => currentNode18 = replaceNode$(node, currentNode18, div3));
        const div19 = document.createElement("div");
        {
            const button20 = document.createElement("button");
            button20["onclick"] = () => items.push(items.length.value.toString());
            {
                button20.appendChild(document.createTextNode("add"));
            }
            div19.appendChild(button20);
        }
        div3.appendChild(div19);
        const ul21 = document.createElement("ul");
        {
            mapArray$(ul21, items, (unsubscribes, item, index) => {
                const li22 = document.createElement("li");
                {
                    const text23 = document.createTextNode("");
                    unsubscribes.push(index.subscribe(() => text23.nodeValue = index.value));
                    li22.appendChild(text23);
                    li22.appendChild(document.createTextNode(": "));
                    const input24 = document.createElement("input");
                    unsubscribes.push(item.subscribe(() => input24["value"] = item.value));
                    input24["oninput"] = (e) => item.value = e.currentTarget.value;
                    li22.appendChild(input24);
                    li22.appendChild(document.createTextNode(" \u2192 "));
                    const text25 = document.createTextNode("");
                    unsubscribes.push(item.subscribe(() => text25.nodeValue = item.value));
                    li22.appendChild(text25);
                    const button26 = document.createElement("button");
                    button26["onclick"] = () => items.splice(index.value, 1);
                    {
                        button26.appendChild(document.createTextNode("\u00D7"));
                    }
                    li22.appendChild(button26);
                    const button27 = document.createElement("button");
                    button27["onclick"] = () => items.splice(index.value + 1, 0, Math.random().toString());
                    {
                        button27.appendChild(document.createTextNode("insert"));
                    }
                    li22.appendChild(button27);
                }
                return li22;
            });
        }
        div3.appendChild(ul21);
        div3.appendChild(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                const span28 = document.createElement("span");
                {
                    span28.appendChild(document.createTextNode("child!"));
                }
                parentNode.appendChild(span28);
            }
        }));
    }
    return div3;
};
(() => {
    const node = document.body, unsubscribes = [], child = App(unsubscribes, { max: reactive(5) });
    node.appendChild(child);
    return () => {
        node.removeChild(child);
        unsubscribes.forEach(x => x());
    };
})();
