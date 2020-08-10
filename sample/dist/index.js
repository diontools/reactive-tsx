const reactive = init => {
    let _v = init;
    const _actions = [];
    return {
        get value() { return _v; },
        set value(v) {
            if (_v !== v) {
                _v = v;
                for (let i = 0; i < _actions.length; i++)
                    _actions[i]();
            }
        },
        subscribe(action, skip) {
            _actions.push(action);
            !skip && action();
            return () => {
                const index = _actions.indexOf(action);
                if (index >= 0)
                    _actions.splice(index, 1);
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
const conditional$ = (node, unsubscribes, reactives, condition, trueCreate, falseCreate) => {
    if (!trueCreate || !falseCreate) {
        const dummy = document.createTextNode("");
        if (!trueCreate)
            trueCreate = () => dummy;
        if (!falseCreate)
            falseCreate = () => dummy;
    }
    const childUnsubscribes = [];
    let current = condition();
    let currentNode = (current ? trueCreate : falseCreate)(childUnsubscribes);
    node.appendChild(currentNode);
    subscribe$(unsubscribes, reactives, () => {
        const next = condition();
        if (current !== next) {
            const nextNode = (next ? trueCreate : falseCreate)(childUnsubscribes);
            node.replaceChild(nextNode, currentNode);
            currentNode = nextNode;
            current = next;
        }
    });
};
const conditionalText$ = (node, unsubscribes, conditionReactives, condition, trueString, falseString) => {
    let current;
    const text = document.createTextNode("");
    subscribe$(unsubscribes, conditionReactives, () => {
        const next = condition();
        if (current !== next) {
            text.nodeValue = next ? trueString : falseString;
            current = next;
        }
    });
    node.appendChild(text);
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
        conditionalText$(div3, unsubscribes, [count, props.max], () => count.value > props.max.value, 'over!', "");
        conditional$(div3, unsubscribes, [count], () => count.value > 0, unsubscribes => {
            const text10 = document.createTextNode("");
            subscribe$(unsubscribes, [count, props.max], () => text10.nodeValue = ('conditional reactive text: ' + (count.value + props.max.value)));
            return text10;
        }, undefined);
        conditional$(div3, unsubscribes, [count], () => count.value < 0, unsubscribes => {
            const em11 = document.createElement("em");
            {
                em11.appendChild(document.createTextNode("under!"));
            }
            return em11;
        }, undefined);
        conditional$(div3, unsubscribes, [count], () => count.value > 0, unsubscribes => Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(document.createTextNode("conditional child component"));
            }
        }), undefined);
        conditionalText$(div3, unsubscribes, [count], () => count.value === 0, 'zero', 'non zero');
        conditional$(div3, unsubscribes, [count], () => count.value === 0, unsubscribes => document.createTextNode('zero' || ""), unsubscribes => {
            const strong12 = document.createElement("strong");
            {
                strong12.appendChild(document.createTextNode("non zero"));
            }
            return strong12;
        });
        const div13 = document.createElement("div");
        {
            const button14 = document.createElement("button");
            button14["onclick"] = () => items.push(items.length.value.toString());
            {
                button14.appendChild(document.createTextNode("add"));
            }
            div13.appendChild(button14);
        }
        div3.appendChild(div13);
        const ul15 = document.createElement("ul");
        {
            mapArray$(ul15, items, (unsubscribes, item, index) => {
                const li16 = document.createElement("li");
                {
                    const text17 = document.createTextNode("");
                    unsubscribes.push(index.subscribe(() => text17.nodeValue = index.value));
                    li16.appendChild(text17);
                    li16.appendChild(document.createTextNode(": "));
                    const input18 = document.createElement("input");
                    unsubscribes.push(item.subscribe(() => input18["value"] = item.value));
                    input18["oninput"] = (e) => item.value = e.currentTarget.value;
                    li16.appendChild(input18);
                    li16.appendChild(document.createTextNode(" \u2192 "));
                    const text19 = document.createTextNode("");
                    unsubscribes.push(item.subscribe(() => text19.nodeValue = item.value));
                    li16.appendChild(text19);
                    const button20 = document.createElement("button");
                    button20["onclick"] = () => items.splice(index.value, 1);
                    {
                        button20.appendChild(document.createTextNode("\u00D7"));
                    }
                    li16.appendChild(button20);
                    const button21 = document.createElement("button");
                    button21["onclick"] = () => items.splice(index.value + 1, 0, Math.random().toString());
                    {
                        button21.appendChild(document.createTextNode("insert"));
                    }
                    li16.appendChild(button21);
                }
                return li16;
            });
        }
        div3.appendChild(ul15);
        div3.appendChild(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                const span22 = document.createElement("span");
                {
                    span22.appendChild(document.createTextNode("child!"));
                }
                parentNode.appendChild(span22);
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
