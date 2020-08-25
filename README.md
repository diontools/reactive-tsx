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

## Convertions
index.tsx

```tsx
import { Component, reactive, run } from 'reactive-tsx'

const App: Component = () => {
    const count = reactive(0)

    return <div>
        count: {count.value}
        <div>
            <button onclick={() => count.value++}>+1</button>
            <button onclick={() => count.value--}>-1</button>
            <button onclick={() => count.value = 0}>reset</button>
        </div>
    </div>
}

run(document.body, App, {})
```

This code transforms to the following JavaScript.

```js
import { reactive, element$, text$ } from 'reactive-tsx';
const App = (unsubscribes) => {
    const count = reactive(0);
    const div1 = element$("div");
    {
        div1.appendChild(text$("count: "));
        const text2 = text$("");
        unsubscribes.push(count.subscribe(() => text2.nodeValue = count.value));
        div1.appendChild(text2);
        const div3 = element$("div");
        {
            const button4 = element$("button");
            button4["onclick"] = () => count.value++;
            {
                button4.appendChild(text$("+1"));
            }
            div3.appendChild(button4);
            const button5 = element$("button");
            button5["onclick"] = () => count.value--;
            {
                button5.appendChild(text$("-1"));
            }
            div3.appendChild(button5);
            const button6 = element$("button");
            button6["onclick"] = () => count.value = 0;
            {
                button6.appendChild(text$("reset"));
            }
            div3.appendChild(button6);
        }
        div1.appendChild(div3);
    }
    return div1;
};
(() => {
    const node = document.body;
    const unsubscribes = [];
    const child = App(unsubscribes, {});
    node.appendChild(child);
    return () => {
        node.removeChild(child);
        unsubscribes.forEach(x => x());
    };
})();
```