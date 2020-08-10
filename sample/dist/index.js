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
const conditional$ = (unsubscribes, reactives, condition, tureReactives, trueCreate, falseReactives, falseCreate, onUpdate) => {
    if (!trueCreate || !falseCreate) {
        const dummyCreate = () => document.createTextNode("");
        if (!trueCreate)
            trueCreate = dummyCreate;
        if (!falseCreate)
            falseCreate = dummyCreate;
    }
    let current;
    let unsubs = [];
    const trueUpdate = () => onUpdate(trueCreate(unsubs));
    const falseUpdate = () => onUpdate(falseCreate(unsubs));
    subscribe$(unsubscribes, reactives, () => {
        const next = condition();
        if (current !== next) {
            unsubs.forEach(x => x());
            unsubs.length = 0;
            const update = next ? trueUpdate : falseUpdate;
            const reactives = next ? tureReactives : falseReactives;
            reactives ? subscribe$(unsubs, reactives, update) : update();
            current = next;
        }
    });
};
const conditionalText$ = (unsubscribes, conditionReactives, condition, trueString, falseString, onUpdate) => {
    let current;
    subscribe$(unsubscribes, conditionReactives, () => {
        const next = condition();
        if (current !== next) {
            onUpdate(next ? trueString : falseString);
            current = next;
        }
    });
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
        const text10 = document.createTextNode("");
        div3.appendChild(text10);
        conditionalText$(unsubscribes, [count, props.max], () => count.value > props.max.value, 'over!', "", text => text10.nodeValue = text);
        let currentNode12 = document.createTextNode("");
        div3.appendChild(currentNode12);
        conditional$(unsubscribes, [count], () => count.value > 0, [count, props.max], unsubscribes => {
            const text11 = document.createTextNode("");
            subscribe$(unsubscribes, [count, props.max], () => text11.nodeValue = ('conditional reactive text: ' + (count.value + props.max.value)));
            return text11;
        }, undefined, undefined, node => {
            div3.replaceChild(node, currentNode12);
            currentNode12 = node;
        });
        let currentNode14 = document.createTextNode("");
        div3.appendChild(currentNode14);
        conditional$(unsubscribes, [count], () => count.value < 0, undefined, unsubscribes => {
            const em13 = document.createElement("em");
            {
                em13.appendChild(document.createTextNode("under!"));
            }
            return em13;
        }, undefined, undefined, node => {
            div3.replaceChild(node, currentNode14);
            currentNode14 = node;
        });
        let currentNode15 = document.createTextNode("");
        div3.appendChild(currentNode15);
        conditional$(unsubscribes, [count], () => count.value > 0, undefined, unsubscribes => Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(document.createTextNode("conditional child component"));
            }
        }), undefined, undefined, node => {
            div3.replaceChild(node, currentNode15);
            currentNode15 = node;
        });
        const text16 = document.createTextNode("");
        div3.appendChild(text16);
        conditionalText$(unsubscribes, [count], () => count.value === 0, 'zero', 'non zero', text => text16.nodeValue = text);
        let currentNode18 = document.createTextNode("");
        div3.appendChild(currentNode18);
        conditional$(unsubscribes, [count], () => count.value === 0, undefined, unsubscribes => document.createTextNode('zero' || ""), undefined, unsubscribes => {
            const strong17 = document.createElement("strong");
            {
                strong17.appendChild(document.createTextNode("non zero"));
            }
            return strong17;
        }, node => {
            div3.replaceChild(node, currentNode18);
            currentNode18 = node;
        });
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
