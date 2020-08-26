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
`reactive`はリアクティブなオブジェクト(`Reactive<T>`)を生成する関数です。
このオブジェクトは`value`プロパティと`subscribe`メソッドを持ち、`subscribe`で登録したコールバック関数を`value`を変更するたびに呼び出します。

```tsx
const count = reactive(0) // create Reactive<number> with initial 0
count.subscribe(() => console.log(count.value))
count.value = 1
count.value = 2
```

上記のコードは0,1,2とログ出力されます。このオブジェクトを使用して値の変更をDOMに反映します。

例：

```tsx
// In a Component function
const count = reactive(0)
return <div>{count.value}</div>
```

これ次のようなJavaScriptに変換されます。

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

ここで、`element$` = `document.createElement`、`text$` = `document.createTextNode`です。

### `reactiveArray` function
`reactiveArray`はリアクティブな配列オブジェクト(`ReactiveArray<T>`)を生成する関数です。このオブジェクトは配列の変更を監視するための疑似配列です。特に`map`メソッドは効率良くDOMを更新するために展開されます。

```tsx
const items = reactiveArray(['a', 'b', 'c'])
return <div>
    {items.map((item, index) => <div>{index.value}: {item.value}</div>)}
</div>
```

上記のコードは次のようなJavaScriptに変換されます。

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

`mapArray$`関数は`items`を`listen`してDOMに反映します。

### `combine` function
`combine`は複数の`Reactive<T>`を組み合わせて新たな`Reactive<T>`を作成する関数です。

例:
```tsx
const count = reactive(0)
const doubled = combine(count.value * 2)
const powered = combine(count.value * count.value)
```

これは次のようなJavaScriptに変換されます。

```js
const count = reactive(0);
const doubled = combineReactive$(undefined, [count], () => count.value * 2);
const powered = combineReactive$(undefined, [count], () => count.value * count.value);
```

`combineReactive$`関数は複数の`Reactive<T>`を`subscribe`し、新く作成した`Reactive<T>`に変更を反映します。

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
`"reactive-tsx"`の代わりに`"reactive-tsx/mono"`をインポートすると、`reactive`や`element$`などのユーティリティー関数が埋め込まれます。
