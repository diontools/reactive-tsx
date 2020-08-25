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
            const un = reactives[i].subscribe(action, true);
            unsubscribes && unsubscribes.push(un);
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
const element$ = document.createElement.bind(document);
const text$ = document.createTextNode.bind(document);
const Item = (unsubscribes, props) => {
    const test = reactive(0);
    const div1 = element$("div");
    {
        div1.appendChild(text$("Item: "));
        const text2 = text$("");
        subscribe$(unsubscribes, [props.max, test], () => text2.nodeValue = props.max.value + test.value);
        div1.appendChild(text2);
        const div3 = element$("div");
        {
            div3.appendChild(text$("value: "));
            div3.appendChild(text$(props.value));
        }
        div1.appendChild(div3);
        props.children(div1, unsubscribes);
    }
    return div1;
};
const outsideReactive = reactive(0);
const combinedOutsideReactive = combineReactive$(undefined, [outsideReactive], () => outsideReactive.value * 2);
const outsidePartialJsx = (parentNode, unsubscribes) => {
    const div4 = element$("div");
    {
        const span5 = element$("span");
        {
            span5.appendChild(text$("outside"));
        }
        div4.appendChild(span5);
    }
    parentNode.appendChild(div4);
};
const App = (unsubscribes, props) => {
    const count = reactive(0);
    const items = reactiveArray(['xyz', 'abc']);
    const doubled = combineReactive$(unsubscribes, [count], () => count.value * 2);
    const partialJsx = (parentNode, unsubscribes) => {
        const div6 = element$("div");
        {
            const span7 = element$("span");
            {
                span7.appendChild(text$("foo"));
            }
            div6.appendChild(span7);
        }
        parentNode.appendChild(div6);
    };
    const itemProps = {
        max: props.max,
        value: 1,
    };
    const onCreate = (element) => {
        console.log('created', element);
    };
    const onDestroy = (element) => {
        console.log('destroy', element);
    };
    const div8 = element$("div");
    div8["className"] = "foo";
    unsubscribes.push(count.subscribe(() => div8["className"] = "a" + " b" + (true ? " c" : "") + (count.value !== 0 ? " d" : "") + " e"));
    unsubscribes.push(count.subscribe(() => div8.style["backgroundColor"] = count.value ? 'skyblue' : 'azure'));
    {
        div8.appendChild(text$("count: "));
        const text9 = text$("");
        unsubscribes.push(count.subscribe(() => text9.nodeValue = count.value));
        div8.appendChild(text9);
        div8.appendChild(text$(" (max: "));
        const text10 = text$("");
        unsubscribes.push(props.max.subscribe(() => text10.nodeValue = props.max.value));
        div8.appendChild(text10);
        div8.appendChild(text$(")"));
        const button11 = element$("button");
        button11["onclick"] = () => count.value += 1;
        {
            button11.appendChild(text$("+1"));
        }
        div8.appendChild(button11);
        const button12 = element$("button");
        button12["onclick"] = () => count.value -= 1;
        {
            button12.appendChild(text$("-1"));
        }
        div8.appendChild(button12);
        const button13 = element$("button");
        button13["onclick"] = () => count.value = 0;
        unsubscribes.push(count.subscribe(() => button13["disabled"] = count.value === 0));
        {
            button13.appendChild(text$("reset"));
        }
        div8.appendChild(button13);
        const div14 = element$("div");
        {
            div14.appendChild(text$("jsx in expression"));
        }
        div8.appendChild(div14);
        let currentNode15 = text$("");
        div8.appendChild(currentNode15);
        conditional$(unsubscribes, /*
            condition*/ [count, props.max], () => count.value > props.max.value, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('over!'), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode15 = replaceNode$(node, currentNode15, div8));
        let currentNode16 = text$("");
        div8.appendChild(currentNode16);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ [count, props.max], (unsubscribes, onUpdate) => onUpdate(('conditional reactive text: ' + (count.value + props.max.value)) || ""), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode16 = replaceNode$(node, currentNode16, div8));
        let currentNode17 = text$("");
        div8.appendChild(currentNode17);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value < 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => {
            const em18 = element$("em");
            {
                em18.appendChild(text$("under!"));
            }
            onUpdate(em18);
        }, /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode17 = replaceNode$(node, currentNode17, div8));
        let currentNode19 = text$("");
        div8.appendChild(currentNode19);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(text$("conditional child component"));
            }
        })), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode19 = replaceNode$(node, currentNode19, div8));
        let currentNode20 = text$("");
        div8.appendChild(currentNode20);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => onUpdate('non zero'), /*
            onUpdate */ node => currentNode20 = replaceNode$(node, currentNode20, div8));
        let currentNode21 = text$("");
        div8.appendChild(currentNode21);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => {
            const strong22 = element$("strong");
            {
                strong22.appendChild(text$("non zero"));
            }
            onUpdate(strong22);
        }, /*
            onUpdate */ node => currentNode21 = replaceNode$(node, currentNode21, div8));
        let currentNode23 = text$("");
        div8.appendChild(currentNode23);
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
            onUpdate */ node => currentNode23 = replaceNode$(node, currentNode23, div8));
        const div24 = element$("div");
        {
            const button25 = element$("button");
            button25["onclick"] = () => items.push(items.length.value.toString());
            {
                button25.appendChild(text$("add"));
            }
            div24.appendChild(button25);
        }
        div8.appendChild(div24);
        const ul26 = element$("ul");
        ul26.setAttribute("data-value", "foo");
        {
            mapArray$(ul26, items, (unsubscribes, item, index) => {
                const li27 = element$("li");
                {
                    const text28 = text$("");
                    unsubscribes.push(index.subscribe(() => text28.nodeValue = index.value));
                    li27.appendChild(text28);
                    li27.appendChild(text$(": "));
                    const input29 = element$("input");
                    unsubscribes.push(item.subscribe(() => input29["value"] = item.value));
                    input29["oninput"] = (e) => item.value = e.currentTarget.value;
                    li27.appendChild(input29);
                    li27.appendChild(text$(" \u2192 "));
                    const text30 = text$("");
                    unsubscribes.push(item.subscribe(() => text30.nodeValue = item.value));
                    li27.appendChild(text30);
                    const button31 = element$("button");
                    button31["onclick"] = () => items.splice(index.value, 1);
                    {
                        button31.appendChild(text$("\u00D7"));
                    }
                    li27.appendChild(button31);
                    const button32 = element$("button");
                    button32["onclick"] = () => items.splice(index.value + 1, 0, Math.random().toString());
                    {
                        button32.appendChild(text$("insert"));
                    }
                    li27.appendChild(button32);
                }
                return li27;
            });
        }
        div8.appendChild(ul26);
        div8.appendChild(Item(unsubscribes, {
            max: props.max,
            value: count.value,
            children: (parentNode, unsubscribes) => {
                const span33 = element$("span");
                {
                    span33.appendChild(text$("child!"));
                }
                parentNode.appendChild(span33);
            }
        }));
        div8.appendChild(Item(unsubscribes, Object.assign(Object.assign({}, itemProps), { children: (parentNode, unsubscribes) => {
                parentNode.appendChild(text$("spread!"));
            } })));
        partialJsx(div8, unsubscribes);
        outsidePartialJsx(div8, unsubscribes);
    }
    onCreate(div8);
    unsubscribes.push(() => onDestroy(div8));
    return div8;
};
(() => {
    const node = document.body;
    const unsubscribes = [];
    const child = App(unsubscribes, { max: reactive(5) });
    node.appendChild(child);
    return () => {
        node.removeChild(child);
        unsubscribes.forEach(x => x());
    };
})();
