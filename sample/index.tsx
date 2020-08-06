import { Component, Reactive, Children, reactive, reactiveArray, run } from "reactive-tsx/lib/mono"

const Item: Component<{ max: Reactive<number>, children?: Children }> = (props) => {
    const test = reactive(0)
    return <div>
        Item: {props.max.value + test.value}
        {props.children}
    </div>
}

const App: Component<{ max: Reactive<number> }> = props => {
    const count = reactive(0)
    const items = reactiveArray(['xyz', 'abc'])

    return <div className="foo">
        count: {count.value} (max: {props.max.value})
        <button onclick={() => count.value += 1}>+1</button>
        <button onclick={() => count.value -= 1}>-1</button>
        {<div>jsx in expression</div>}
        {count.value > props.max.value && 'over!'}
        {count.value > 0 && ('conditional reactive text: ' + (count.value + props.max.value))}
        {count.value < 0 && <em>under!</em>}
        {count.value > 0 && <Item max={props.max}>conditional child component</Item>}
        {count.value === 0 ? 'zero' : 'non zero'}
        {count.value === 0 ? 'zero' : <strong>non zero</strong>}
        <div><button onclick={() => items.push(items.length.value.toString())}>add</button></div>
        <ul>
            {items.map((item, index) => <li>
                {index.value}: <input value={item.value} oninput={(e: any) => item.value = e.currentTarget.value} /> → {item.value}
                <button onclick={() => items.splice(index.value, 1)}>×</button>
                <button onclick={() => items.splice(index.value + 1, 0, Math.random().toString())}>insert</button>
            </li>)}
        </ul>
        <Item max={props.max}>
            <span>child!</span>
        </Item>
    </div>
}

run(document.body, App, { max: reactive(5) })
