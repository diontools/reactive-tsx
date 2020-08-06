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
    const _holders = init.map((v, i) => ({ item: reactive(v), index: reactive(i) }));
    const length = reactive(_v.length);
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
                const holder = { item: reactive(items[i]), index: reactive(index) };
                _v.push(items[i]);
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
                    raise(1, holder);
                length.value = _v.length;
                return v;
            }
        },
        shift() {
            const v = _v.shift();
            const holder = _holders.shift();
            if (holder)
                raise(1, holder);
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
                const v = _v[start + i] = arguments[2 + i];
                _holders[start + i] = { item: reactive(v), index: reactive(start + i) };
                raise(2, holder);
            }
            if (addCount > 0) {
                for (let i = 0; i < addCount; i++) {
                    const v = arguments[2 + replaceCount + i];
                    const index = start + replaceCount + i;
                    _v.splice(index, 0, v);
                    const holder = { item: reactive(v), index: reactive(index) };
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
        const text3 = document.createTextNode("");
        subscribe(() => text3.nodeValue = props.max.value + test.value, unsubscribes, [props.max, test]);
        div1.appendChild(text3);
        props.children && props.children(div1, unsubscribes);
    }
    return div1;
};
const App = (unsubscribes, props) => {
    const count = reactive(0);
    const items = reactiveArray(['xyz', 'abc']);
    const div1 = document.createElement("div");
    div1["className"] = "foo";
    {
        div1.appendChild(document.createTextNode("count: "));
        const text3 = document.createTextNode("");
        unsubscribes.push(count.subscribe(() => text3.nodeValue = count.value));
        div1.appendChild(text3);
        div1.appendChild(document.createTextNode(" (max: "));
        const text5 = document.createTextNode("");
        unsubscribes.push(props.max.subscribe(() => text5.nodeValue = props.max.value));
        div1.appendChild(text5);
        div1.appendChild(document.createTextNode(")"));
        const button7 = document.createElement("button");
        button7["onclick"] = () => count.value += 1;
        {
            button7.appendChild(document.createTextNode("+1"));
        }
        div1.appendChild(button7);
        const button9 = document.createElement("button");
        button9["onclick"] = () => count.value -= 1;
        {
            button9.appendChild(document.createTextNode("-1"));
        }
        div1.appendChild(button9);
        const div11 = document.createElement("div");
        {
            div11.appendChild(document.createTextNode("jsx in expression"));
        }
        div1.appendChild(div11);
        conditionalText(div1, unsubscribes, [count, props.max], () => count.value > props.max.value, 'over!', "");
        conditional(div1, unsubscribes, [count], () => count.value > 0, unsubscribes => {
            const text15 = document.createTextNode("");
            subscribe(() => text15.nodeValue = ('conditional reactive text: ' + (count.value + props.max.value)), unsubscribes, [count, props.max]);
            return text15;
        }, undefined);
        conditional(div1, unsubscribes, [count], () => count.value < 0, unsubscribes => {
            const em17 = document.createElement("em");
            {
                em17.appendChild(document.createTextNode("under!"));
            }
            return em17;
        }, undefined);
        conditional(div1, unsubscribes, [count], () => count.value > 0, unsubscribes => Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(document.createTextNode("conditional child component"));
            }
        }), undefined);
        conditionalText(div1, unsubscribes, [count], () => count.value === 0, 'zero', 'non zero');
        conditional(div1, unsubscribes, [count], () => count.value === 0, unsubscribes => document.createTextNode('zero' || ""), unsubscribes => {
            const strong23 = document.createElement("strong");
            {
                strong23.appendChild(document.createTextNode("non zero"));
            }
            return strong23;
        });
        const div25 = document.createElement("div");
        {
            const button26 = document.createElement("button");
            button26["onclick"] = () => items.push(items.length.value.toString());
            {
                button26.appendChild(document.createTextNode("add"));
            }
            div25.appendChild(button26);
        }
        div1.appendChild(div25);
        const ul27 = document.createElement("ul");
        {
            mapArray(ul27, items, (unsubscribes, item, index) => {
                const li29 = document.createElement("li");
                {
                    const text31 = document.createTextNode("");
                    unsubscribes.push(index.subscribe(() => text31.nodeValue = index.value));
                    li29.appendChild(text31);
                    li29.appendChild(document.createTextNode(": "));
                    const input33 = document.createElement("input");
                    input33["value"] = item.value;
                    input33["oninput"] = (e) => item.value = e.currentTarget.value;
                    li29.appendChild(input33);
                    li29.appendChild(document.createTextNode(" \u2192 "));
                    const text35 = document.createTextNode("");
                    unsubscribes.push(item.subscribe(() => text35.nodeValue = item.value));
                    li29.appendChild(text35);
                    const button37 = document.createElement("button");
                    button37["onclick"] = () => items.splice(index.value, 1);
                    {
                        button37.appendChild(document.createTextNode("\u00D7"));
                    }
                    li29.appendChild(button37);
                    const button39 = document.createElement("button");
                    button39["onclick"] = () => items.splice(index.value + 1, 0, Math.random().toString());
                    {
                        button39.appendChild(document.createTextNode("insert"));
                    }
                    li29.appendChild(button39);
                }
                return li29;
            });
        }
        div1.appendChild(ul27);
        div1.appendChild(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                const span31 = document.createElement("span");
                {
                    span31.appendChild(document.createTextNode("child!"));
                }
                parentNode.appendChild(span31);
            }
        }));
    }
    return div1;
};
(() => {
    const node = document.body, unsubscribes = [], child = App(unsubscribes, { max: reactive(5) });
    node.appendChild(child);
    return () => {
        node.removeChild(child);
        unsubscribes.forEach(x => x());
    };
})();
