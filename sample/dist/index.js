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
const subscribe = (action, unsubscribes, reactives) => {
    if (reactives) {
        for (let i = 0; i < reactives.length; i++) {
            unsubscribes.push(reactives[i].subscribe(action, true));
        }
    }
    action();
};
const combineReactive = (func, unsubscribes, reactives) => {
    const r = reactive(undefined);
    subscribe(() => r.value = func(), unsubscribes, reactives);
    return r;
};
const conditional = (node, unsubscribes, reactives, condition, trueCreate, falseCreate) => {
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
    subscribe(() => {
        const next = condition();
        if (current !== next) {
            const nextNode = (next ? trueCreate : falseCreate)(childUnsubscribes);
            node.replaceChild(nextNode, currentNode);
            currentNode = nextNode;
            current = next;
        }
    }, unsubscribes, reactives);
};
const conditionalText = (node, unsubscribes, conditionReactives, condition, trueString, falseString) => {
    let current;
    const text = document.createTextNode("");
    subscribe(() => {
        const next = condition();
        if (current !== next) {
            text.nodeValue = next ? trueString : falseString;
            current = next;
        }
    }, unsubscribes, conditionReactives);
    node.appendChild(text);
};
const mapArray = (() => {
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
        subscribe(() => text2.nodeValue = props.max.value + test.value, unsubscribes, [props.max, test]);
        div1.appendChild(text2);
        props.children && props.children(div1, unsubscribes);
    }
    return div1;
};
const App = (unsubscribes, props) => {
    const count = reactive(0);
    const items = reactiveArray(['xyz', 'abc']);
    const doubled = combineReactive(() => count.value * 2, unsubscribes, [count]);
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
        const div8 = document.createElement("div");
        {
            div8.appendChild(document.createTextNode("jsx in expression"));
        }
        div3.appendChild(div8);
        conditionalText(div3, unsubscribes, [count, props.max], () => count.value > props.max.value, 'over!', "");
        conditional(div3, unsubscribes, [count], () => count.value > 0, unsubscribes => {
            const text9 = document.createTextNode("");
            subscribe(() => text9.nodeValue = ('conditional reactive text: ' + (count.value + props.max.value)), unsubscribes, [count, props.max]);
            return text9;
        }, undefined);
        conditional(div3, unsubscribes, [count], () => count.value < 0, unsubscribes => {
            const em10 = document.createElement("em");
            {
                em10.appendChild(document.createTextNode("under!"));
            }
            return em10;
        }, undefined);
        conditional(div3, unsubscribes, [count], () => count.value > 0, unsubscribes => Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(document.createTextNode("conditional child component"));
            }
        }), undefined);
        conditionalText(div3, unsubscribes, [count], () => count.value === 0, 'zero', 'non zero');
        conditional(div3, unsubscribes, [count], () => count.value === 0, unsubscribes => document.createTextNode('zero' || ""), unsubscribes => {
            const strong11 = document.createElement("strong");
            {
                strong11.appendChild(document.createTextNode("non zero"));
            }
            return strong11;
        });
        const div12 = document.createElement("div");
        {
            const button13 = document.createElement("button");
            button13["onclick"] = () => items.push(items.length.value.toString());
            {
                button13.appendChild(document.createTextNode("add"));
            }
            div12.appendChild(button13);
        }
        div3.appendChild(div12);
        const ul14 = document.createElement("ul");
        {
            mapArray(ul14, items, (unsubscribes, item, index) => {
                const li15 = document.createElement("li");
                {
                    const text16 = document.createTextNode("");
                    unsubscribes.push(index.subscribe(() => text16.nodeValue = index.value));
                    li15.appendChild(text16);
                    li15.appendChild(document.createTextNode(": "));
                    const input17 = document.createElement("input");
                    input17["value"] = item.value;
                    input17["oninput"] = (e) => item.value = e.currentTarget.value;
                    li15.appendChild(input17);
                    li15.appendChild(document.createTextNode(" \u2192 "));
                    const text18 = document.createTextNode("");
                    unsubscribes.push(item.subscribe(() => text18.nodeValue = item.value));
                    li15.appendChild(text18);
                    const button19 = document.createElement("button");
                    button19["onclick"] = () => items.splice(index.value, 1);
                    {
                        button19.appendChild(document.createTextNode("\u00D7"));
                    }
                    li15.appendChild(button19);
                    const button20 = document.createElement("button");
                    button20["onclick"] = () => items.splice(index.value + 1, 0, Math.random().toString());
                    {
                        button20.appendChild(document.createTextNode("insert"));
                    }
                    li15.appendChild(button20);
                }
                return li15;
            });
        }
        div3.appendChild(ul14);
        div3.appendChild(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                const span21 = document.createElement("span");
                {
                    span21.appendChild(document.createTextNode("child!"));
                }
                parentNode.appendChild(span21);
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
