var subject = function (init) {
    var _v = init;
    var _actions = [];
    return {
        get value() { return _v; },
        set value(v) {
            if (_v !== v) {
                _v = v;
                for (var i = 0; i < _actions.length; i++)
                    _actions[i]();
            }
        },
        subscribe: function (action, skip) {
            _actions.push(action);
            !skip && action();
            return function () {
                var index = _actions.indexOf(action);
                if (index >= 0)
                    _actions.splice(index, 1);
            };
        },
    };
};
var arraySubject = function (init) {
    var _v = init;
    var _actions = [];
    var _listeners = [];
    var _holders = init.map(function (v, i) { return ({ item: subject(v), index: subject(i) }); });
    var length = subject(_v.length);
    var raise = function (type, holder) {
        for (var i = 0; i < _listeners.length; i++) {
            _listeners[i](type, holder.index, holder.item);
        }
    };
    return {
        get value() { return _v; },
        set value(v) {
            if (_v !== v) {
                _v = v;
                for (var i = 0; i < _actions.length; i++)
                    _actions[i]();
            }
        },
        length: length,
        subscribe: function (action, skip) {
            _actions.push(action);
            !skip && action();
            return function () {
                var index = _actions.indexOf(action);
                if (index >= 0)
                    _actions.splice(index, 1);
            };
        },
        listen: function (listener) {
            _listeners.push(listener);
            for (var i = 0; i < _holders.length; i++) {
                var holder = _holders[i];
                listener(0, holder.index, holder.item);
            }
            return function () {
                var index = _listeners.indexOf(listener);
                if (index >= 0)
                    _listeners.splice(index, 1);
            };
        },
        map: function (select) {
            return undefined;
        },
        push: function () {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            for (var i = 0; i < items.length; i++) {
                var index = _v.length;
                var holder = { item: subject(items[i]), index: subject(index) };
                _v.push(items[i]);
                _holders.push(holder);
                raise(0, holder);
                length.value = _v.length;
            }
            return _v.length;
        },
        pop: function () {
            if (_v.length > 0) {
                var v = _v.pop();
                var holder = _holders.pop();
                if (holder)
                    raise(1, holder);
                length.value = _v.length;
                return v;
            }
        },
        shift: function () {
            var v = _v.shift();
            var holder = _holders.shift();
            if (holder)
                raise(1, holder);
            for (var i = 0; i < _holders.length; i++)
                _holders[i].index.value = i;
            length.value = _v.length;
            return v;
        },
        splice: function (start, deleteCount) {
            deleteCount = deleteCount !== null && deleteCount !== void 0 ? deleteCount : (_v.length - start);
            var newCount = Math.max(arguments.length - 2, 0);
            var replaceCount = Math.min(deleteCount, newCount);
            var addCount = newCount - replaceCount;
            var removeCount = deleteCount - replaceCount;
            for (var i = 0; i < replaceCount; i++) {
                var holder = _holders[start + i];
                var v = _v[start + i] = arguments[2 + i];
                _holders[start + i] = { item: subject(v), index: subject(start + i) };
                raise(2, holder);
            }
            if (addCount > 0) {
                for (var i = 0; i < addCount; i++) {
                    var v = arguments[2 + replaceCount + i];
                    var index = start + replaceCount + i;
                    _v.splice(index, 0, v);
                    var holder = { item: subject(v), index: subject(index) };
                    _holders.splice(index, 0, holder);
                    raise(0, holder);
                }
                for (var i = start + replaceCount + addCount; i < _holders.length; i++)
                    _holders[i].index.value = i;
            }
            else if (removeCount > 0) {
                for (var i = removeCount - 1; i >= 0; i--) {
                    var index = start + replaceCount + i;
                    var holder = _holders[index];
                    _holders.splice(index, 1);
                    raise(1, holder);
                }
                for (var i = start + replaceCount; i < _holders.length; i++)
                    _holders[i].index.value = i;
            }
            length.value = _v.length;
            return _v.splice(start + replaceCount, removeCount);
        },
    };
};
var run = function (component, prop, node) {
    return function () { };
};
var subscribe = function (action, unsubscribes, subjects) {
    for (var i = 0; i < subjects.length; i++) {
        unsubscribes.push(subjects[i].subscribe(action, true));
    }
    action();
};
var conditional = function (condition, trueCreate, falseCreate, node, unsubscribes, subjects) {
    if (!trueCreate || !falseCreate) {
        var dummy_1 = document.createTextNode('');
        if (!trueCreate)
            trueCreate = function () { return dummy_1; };
        if (!falseCreate)
            falseCreate = function () { return dummy_1; };
    }
    var current = condition();
    var currentNode = current ? trueCreate() : falseCreate();
    node.appendChild(currentNode);
    subscribe(function () {
        var next = condition();
        if (current !== next) {
            if (next) {
                var nextNode = trueCreate();
                node.replaceChild(nextNode, currentNode);
                currentNode = nextNode;
            }
            else {
                var nextNode = falseCreate();
                node.replaceChild(nextNode, currentNode);
                currentNode = nextNode;
            }
            current = next;
        }
    }, unsubscribes, subjects);
};
var mapArray = function (items, create, node) {
    var buffers = [];
    items.listen(function (type, index, item) {
        switch (type) {
            case 0: // add
                {
                    var unsubscribes = [];
                    var buffer = [create(item, index, unsubscribes), unsubscribes];
                    var refBuffer = buffers[index.value]
                    node.insertBefore(buffer[0], refBuffer && refBuffer[0]);
                    buffers.splice(index.value, 0, buffer);
                    break;
                }
            case 1: // remove
                {
                    var buffer = buffers[index.value];
                    clear(buffer[1]);
                    node.removeChild(buffer[0]);
                    buffers.splice(index.value, 1);
                    break;
                }
            case 2: // replace
                {
                    var buffer = buffers[index.value];
                    var beforeNode = buffer[0];
                    clear(buffer[1]);
                    buffer[0] = create(item, index, buffer[1]);
                    node.replaceChild(buffer[0], beforeNode);
                    break;
                }
        }
    });
};
var clear = function (unsubscribes) {
    for (var i = 0; i < unsubscribes.length; i++)
        unsubscribes[i]();
    unsubscribes.length = 0;
};
var cE = document.createElement.bind(document);
var cT = document.createTextNode.bind(document);
var TT = {
    subscribe: subscribe,
    conditional: conditional,
    mapArray: mapArray,
    cE: cE,
    cT: cT,
};



const App = (unsubscribes, props) => {
    const count = subject(0)
    const items = arraySubject(Array.from({ length: 10000 }, (v, i) => i.toString()))

    const root = document.createElement('div')
    {
        root.appendChild(document.createTextNode('max :'))

        const text1 = document.createTextNode('')
        unsubscribes.push(props.max.subscribe(() => text1.nodeValue = props.max.value))
        root.appendChild(text1)

        root.appendChild(document.createTextNode('count: '))

        const text2 = document.createTextNode('')
        unsubscribes.push(count.subscribe(() => text2.nodeValue = count.value))
        root.appendChild(text2)

        const button1 = document.createElement('button')
        button1.onclick = () => count.value += 1
        {
            button1.appendChild(document.createTextNode('+1'))
        }
        root.appendChild(button1)

        const button2 = document.createElement('button')
        button2.onclick = () => count.value -= 1
        {
            button2.appendChild(document.createTextNode('-1'))
        }
        root.appendChild(button2)

        conditional(
            () => count.value > props.max.value,
            (unsubscribes) => {
                const text1 = document.createTextNode('over!')
                return text1
            },
            undefined,
            root,
            unsubscribes,
            [count, props.max]
        )

        conditional(
            () => count.value > props.max.value,
            (unsubscribes) => {
                const text1 = document.createTextNode('')
                subscribe(() => text1.nodeValue = count.value + props.max.value, unsubscribes, [count, props.max]);
                return text1
            },
            undefined,
            root,
            unsubscribes,
            [count, props.max]
        )

        conditional(
            () => count.value < 0,
            (unsubscribes) => {
                const span1 = document.createElement('span')
                {
                    span1.appendChild(document.createTextNode('under!'))
                }
                return span1
            },
            undefined,
            root,
            unsubscribes,
            [count]
        )

        conditional(
            () => count.value > 0,
            (unsubscribes) => Item(unsubscribes, {}),
            undefined,
            root,
            unsubscribes,
            [count]
        )

        conditional(
            () => count.value === 0,
            () => document.createTextNode('zero'),
            () => document.createTextNode('non zero'),
            root,
            unsubscribes,
            [count]
        )

        const div1 = document.createElement('div')
        {
            const button1 = document.createElement('button')
            button1.onclick = () => items.push(...Array.from({ length: 5 }, () => Math.random().toString()))
            {
                button1.appendChild(document.createTextNode('add'))
            }
            div1.appendChild(button1)

            const text1 = document.createTextNode('')
            unsubscribes.push(items.length.subscribe(() => text1.nodeValue = items.length.value))
            div1.appendChild(text1)
        }
        root.appendChild(div1)

        const ul1 = document.createElement('ul')
        {
            mapArray(items, (item, index, unsubscribes) => {
                const root = document.createElement('li')
                {
                    const text1 = document.createTextNode('')
                    unsubscribes.push(index.subscribe(() => text1.nodeValue = index.value))
                    root.appendChild(text1)

                    root.appendChild(document.createTextNode(': '))

                    const input1 = document.createElement('input')
                    unsubscribes.push(item.subscribe(() => input1.value = item.value))
                    input1.oninput = (e) => item.value = e.currentTarget.value
                    root.appendChild(input1)

                    root.appendChild(document.createTextNode(' → '))

                    const text2 = document.createTextNode('')
                    unsubscribes.push(item.subscribe(() => text2.nodeValue = item.value))
                    root.appendChild(text2)

                    const button1 = document.createElement('button')
                    button1.onclick = () => items.splice(index.value, 1)
                    {
                        button1.appendChild(document.createTextNode('×'))
                    }
                    root.appendChild(button1)

                    const button2 = document.createElement('button')
                    button2.onclick = () => items.splice(index.value + 1, 0, Math.random().toString())
                    {
                        button2.appendChild(document.createTextNode('insert'))
                    }
                    root.appendChild(button2)
                }
                return root
            }, ul1)
        }
        root.appendChild(uroot, l1)

        root.appendChild(Item(unsubscribes, {
            max: props.max,
            children: (node, unsubscribes) => {
                const span1 = document.createElement('span')
                {
                    span1.appendChild(document.createTextNode('hoge!'))
                }
                node.appendChild(span1)
            }
        }))
    }

    return root
}

const Item = (unsubscribes, props) => {
    const unsubscribes = []
    const root = document.createElement('div')
    {
        root.appendChild(document.createTextNode('Item: '))

        const text1 = document.createTextNode('')
        unsubscribes.push(props.max.subscribe(() => text1.nodeValue = props.max.value))
        root.appendChild(text1)

        // {props.children}
        props.children && props.children(root, unsubscribes)
    }
    return root
}

(() => {
    const node = document.body
    const unsubscribes = []
    const child = App(unsubscribes, { max: subject(5) })
    node.appendChild(child)

    return () => {
        node.removeChild(child)
        unsubscribes.forEach(x => x())
    }
})()
