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
        props.children && props.children(div1, unsubscribes);
    }
    return div1;
};
const outsideReactive = reactive(0);
const combinedOutsideReactive = combineReactive$(undefined, [outsideReactive], () => outsideReactive.value * 2);
const App = (unsubscribes, props) => {
    const count = reactive(0);
    const items = reactiveArray(['xyz', 'abc']);
    const doubled = combineReactive$(unsubscribes, [count], () => count.value * 2);
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
    const div4 = element$("div");
    div4["className"] = "foo";
    unsubscribes.push(count.subscribe(() => div4["className"] = "a" + " b" + (true ? " c" : "") + (count.value !== 0 ? " d" : "") + " e"));
    {
        div4.appendChild(text$("count: "));
        const text5 = text$("");
        unsubscribes.push(count.subscribe(() => text5.nodeValue = count.value));
        div4.appendChild(text5);
        div4.appendChild(text$(" (max: "));
        const text6 = text$("");
        unsubscribes.push(props.max.subscribe(() => text6.nodeValue = props.max.value));
        div4.appendChild(text6);
        div4.appendChild(text$(")"));
        const button7 = element$("button");
        button7["onclick"] = () => count.value += 1;
        {
            button7.appendChild(text$("+1"));
        }
        div4.appendChild(button7);
        const button8 = element$("button");
        button8["onclick"] = () => count.value -= 1;
        {
            button8.appendChild(text$("-1"));
        }
        div4.appendChild(button8);
        const button9 = element$("button");
        button9["onclick"] = () => count.value = 0;
        unsubscribes.push(count.subscribe(() => button9["disabled"] = count.value === 0));
        {
            button9.appendChild(text$("reset"));
        }
        div4.appendChild(button9);
        const div10 = element$("div");
        {
            div10.appendChild(text$("jsx in expression"));
        }
        div4.appendChild(div10);
        let currentNode11 = text$("");
        div4.appendChild(currentNode11);
        conditional$(unsubscribes, /*
            condition*/ [count, props.max], () => count.value > props.max.value, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('over!'), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode11 = replaceNode$(node, currentNode11, div4));
        let currentNode12 = text$("");
        div4.appendChild(currentNode12);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ [count, props.max], (unsubscribes, onUpdate) => onUpdate(('conditional reactive text: ' + (count.value + props.max.value)) || ""), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode12 = replaceNode$(node, currentNode12, div4));
        let currentNode13 = text$("");
        div4.appendChild(currentNode13);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value < 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => {
            const em14 = element$("em");
            {
                em14.appendChild(text$("under!"));
            }
            onUpdate(em14);
        }, /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode13 = replaceNode$(node, currentNode13, div4));
        let currentNode15 = text$("");
        div4.appendChild(currentNode15);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(text$("conditional child component"));
            }
        })), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode15 = replaceNode$(node, currentNode15, div4));
        let currentNode16 = text$("");
        div4.appendChild(currentNode16);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => onUpdate('non zero'), /*
            onUpdate */ node => currentNode16 = replaceNode$(node, currentNode16, div4));
        let currentNode17 = text$("");
        div4.appendChild(currentNode17);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => {
            const strong18 = element$("strong");
            {
                strong18.appendChild(text$("non zero"));
            }
            onUpdate(strong18);
        }, /*
            onUpdate */ node => currentNode17 = replaceNode$(node, currentNode17, div4));
        let currentNode19 = text$("");
        div4.appendChild(currentNode19);
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
            onUpdate */ node => currentNode19 = replaceNode$(node, currentNode19, div4));
        const div20 = element$("div");
        {
            const button21 = element$("button");
            button21["onclick"] = () => items.push(items.length.value.toString());
            {
                button21.appendChild(text$("add"));
            }
            div20.appendChild(button21);
        }
        div4.appendChild(div20);
        const ul22 = element$("ul");
        {
            mapArray$(ul22, items, (unsubscribes, item, index) => {
                const li23 = element$("li");
                {
                    const text24 = text$("");
                    unsubscribes.push(index.subscribe(() => text24.nodeValue = index.value));
                    li23.appendChild(text24);
                    li23.appendChild(text$(": "));
                    const input25 = element$("input");
                    unsubscribes.push(item.subscribe(() => input25["value"] = item.value));
                    input25["oninput"] = (e) => item.value = e.currentTarget.value;
                    li23.appendChild(input25);
                    li23.appendChild(text$(" \u2192 "));
                    const text26 = text$("");
                    unsubscribes.push(item.subscribe(() => text26.nodeValue = item.value));
                    li23.appendChild(text26);
                    const button27 = element$("button");
                    button27["onclick"] = () => items.splice(index.value, 1);
                    {
                        button27.appendChild(text$("\u00D7"));
                    }
                    li23.appendChild(button27);
                    const button28 = element$("button");
                    button28["onclick"] = () => items.splice(index.value + 1, 0, Math.random().toString());
                    {
                        button28.appendChild(text$("insert"));
                    }
                    li23.appendChild(button28);
                }
                return li23;
            });
        }
        div4.appendChild(ul22);
        div4.appendChild(Item(unsubscribes, {
            max: props.max,
            value: count.value,
            children: (parentNode, unsubscribes) => {
                const span29 = element$("span");
                {
                    span29.appendChild(text$("child!"));
                }
                parentNode.appendChild(span29);
            }
        }));
        div4.appendChild(Item(unsubscribes, Object.assign(Object.assign({}, itemProps), { children: (parentNode, unsubscribes) => {
                parentNode.appendChild(text$("spread!"));
            } })));
    }
    onCreate(div4);
    unsubscribes.push(() => onDestroy(div4));
    return div4;
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
