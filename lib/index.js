/// <reference path="../types/global.d.ts" />
export var reactive = function (init) {
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
export var reactiveArray = function (init) {
    var _v = init;
    var _actions = [];
    var _listeners = [];
    var _holders = init.map(function (v, i) { return ({ item: reactive(v), index: reactive(i) }); });
    var length = reactive(_v.length);
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
        map: undefined,
        push: function () {
            var items = [];
            for (var _i = 0; _i < arguments.length; _i++) {
                items[_i] = arguments[_i];
            }
            for (var i = 0; i < items.length; i++) {
                var index = _v.length;
                var holder = { item: reactive(items[i]), index: reactive(index) };
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
                _holders[start + i] = { item: reactive(v), index: reactive(start + i) };
                raise(2, holder);
            }
            if (addCount > 0) {
                for (var i = 0; i < addCount; i++) {
                    var v = arguments[2 + replaceCount + i];
                    var index = start + replaceCount + i;
                    _v.splice(index, 0, v);
                    var holder = { item: reactive(v), index: reactive(index) };
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
export var subscribe = function (action, unsubscribes, reactives) {
    if (reactives) {
        for (var i = 0; i < reactives.length; i++) {
            unsubscribes.push(reactives[i].subscribe(action, true));
        }
    }
    action();
};
export var conditional = function (node, unsubscribes, reactives, condition, trueCreate, falseCreate) {
    if (!trueCreate || !falseCreate) {
        var dummy_1 = document.createTextNode('');
        if (!trueCreate)
            trueCreate = function () { return dummy_1; };
        if (!falseCreate)
            falseCreate = function () { return dummy_1; };
    }
    var childUnsubscribes = [];
    var current = condition();
    var currentNode = (current ? trueCreate : falseCreate)(childUnsubscribes);
    node.appendChild(currentNode);
    subscribe(function () {
        var next = condition();
        if (current !== next) {
            var nextNode = (next ? trueCreate : falseCreate)(childUnsubscribes);
            node.replaceChild(nextNode, currentNode);
            currentNode = nextNode;
            current = next;
        }
    }, unsubscribes, reactives);
};
export var conditionalText = function (node, unsubscribes, conditionReactives, condition, trueString, falseString) {
    var current;
    var text = document.createTextNode('');
    subscribe(function () {
        var next = condition();
        if (current !== next) {
            text.nodeValue = next ? trueString : falseString;
            current = next;
        }
    }, unsubscribes, conditionReactives);
    node.appendChild(text);
};
export var mapArray = (function () {
    var clear = function (unsubscribes) {
        for (var i = 0; i < unsubscribes.length; i++)
            unsubscribes[i]();
        unsubscribes.length = 0;
    };
    return (function (node, items, create) {
        var buffers = [];
        items.listen(function (type, index, item) {
            switch (type) {
                case 0: // add
                    {
                        var unsubscribes = [];
                        var buffer = [create(unsubscribes, item, index), unsubscribes];
                        var refBuffer = buffers[index.value];
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
                        buffer[0] = create(buffer[1], item, index);
                        node.replaceChild(buffer[0], beforeNode);
                        break;
                    }
            }
        });
    });
})();
export var element = document.createElement.bind(document);
export var text = document.createTextNode.bind(document);
