# reactive-tsx
Convert TypeScript TSX to nice JavaScript.

[Playground](https://diontools.github.io/reactive-tsx-docs/)

## Features
* No Virtual DOM
* No special template language, by using TSX
* Readable output code

## Setup
Create using the template by [degit](https://github.com/Rich-Harris/degit).

```
npx degit diontools/reactive-tsx/template new-app-dir

cd new-app-dir
npm install
npm start -- --open
```

### Manual Setup
Install libraries.

```shell
npm i reactive-tsx@latest typescript@3
```

Add `getCustomTransformers` to ts-loader `options` of webpack.config.js.

```js
const ReactiveTsxTransformer = require('reactive-tsx/lib/transformer').default

rules: [
    {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
        options: {
            getCustomTransformers: program => ({
                before: [ReactiveTsxTransformer(program)]
            })
        }
    },
]
```

## Functions

### `Component` type
`Component` is a simple function type that returns a JSX element.

```tsx
const App: Component = props => {
    return <div />
}
```

`Component` has one parameter. Type of this one can be specified with type argument. Default type is below.

```tsx
Component<{ children?: JsxChildren }>
```

### `run` function
`run` is function to start the app.

```tsx
run(document.body, App, {})
```

This arguments specifies a destination node, component and props of component.

This function returns the function to remove a node that has been added.

```tsx
const destroy = run(...)

destroy() // remove appended nodes
```

### `reactive` function
`reactive` function creates a reactive object (`Reactive<T>`). This object has `value` property and `subscribe` method and calls the callback function registered by `subscribe` every time the value is changed.

```tsx
const count = reactive(0) // create Reactive<number> with initial 0
count.subscribe(() => console.log(count.value))
count.value = 1
count.value = 2
```

The above code will be logged as 0, 1, 2. This object is used to reflect value changes to the DOM.

example:

```tsx
// In a Component function
const count = reactive(0)
return <div>{count.value}</div>
```

This will be transformed to the following JavaScript.

```js
const count = reactive(0);
const div1 = element$("div");
{
    const text2 = text$("");
    unsubscribes.push(count.subscribe(() => text2.nodeValue = count.value));
    div1.appendChild(text2);
}
return div1;
```

At this point, `element$` = `document.createElement`, `text$` = `document.createTextNode`.

### `reactiveArray` function
`reactiveArray` function creates a reactive array object (`ReactiveArray<T>`). This object is a pseudo-array to monitor the changes of the array. In particular, `map` method is transformed to efficiently update the DOM.

```tsx
const items = reactiveArray(['a', 'b', 'c'])
return <div>
    {items.map((item, index) => <div>{index.value}: {item.value}</div>)}
</div>
```

The above code will be transformed into the following JavaScript.

```js
const items = reactiveArray(['a', 'b', 'c']);
const div1 = element$("div");
{
    mapArray$(div1, items, (unsubscribes, item, index) => {
        const div2 = element$("div");
        {
            const text3 = text$("");
            unsubscribes.push(index.subscribe(() => text3.nodeValue = index.value));
            div2.appendChild(text3);
            div2.appendChild(text$(": "));
            const text4 = text$("");
            unsubscribes.push(item.subscribe(() => text4.nodeValue = item.value));
            div2.appendChild(text4);
        }
        return div2;
    });
}
return div1;
```

`mapArray$` function `listen` to `items`, and reflect to the DOM.

### `combine` function
`combine` function creates a new `Reactive<T>` by combining multiple `Reactive<T>`.

example:
```tsx
const count = reactive(0)
const doubled = combine(count.value * 2)
const powered = combine(count.value * count.value)
```

This will be transformed to the following JavaScript.

```js
const count = reactive(0);
const doubled = combineReactive$(undefined, [count], () => count.value * 2);
const powered = combineReactive$(undefined, [count], () => count.value * count.value);
```

`combineReactive$` function `subscribe` from multiple `Reactive<T>` and update the newly created `Reactive<T>` to reflect the changes.

### Lifecycle events
`onCreate`, `onDestroy` event.

```tsx
return <div onCreate={e => {}} onDestroy={e => {}} />
```

```js
const div1 = element$("div");
(e => { })(div1);
unsubscribes.push(() => (e => { })(div1));
return div1;
```

### mono Mode
If you import `"reactive-tsx/mono"` instead of `"reactive-tsx"`, utility functions such as `reactive` and `element$` will be embedded.
