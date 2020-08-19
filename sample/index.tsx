import { Component, Reactive, reactive, reactiveArray, run, combine } from "reactive-tsx"

const Item: Component<{ max: Reactive<number>, value?: number, children?: JsxChildren }> = (props) => {
    const test = reactive(0)
    return <div>
        Item: {props.max.value + test.value}
        <div>value: {props.value}</div>
        {props.children}
    </div>
}

const outsideReactive = reactive(0)
const combinedOutsideReactive = combine(outsideReactive.value * 2)

const App: Component<{ max: Reactive<number> }> = props => {
    const count = reactive(0)
    const items = reactiveArray(['xyz', 'abc'])
    const doubled = combine(count.value * 2)

    const itemProps = {
        max: props.max,
        value: 1,
    }

    return <div className="foo">
        count: {count.value} (max: {props.max.value})
        <button onclick={() => count.value += 1}>+1</button>
        <button onclick={() => count.value -= 1}>-1</button>
        <button onclick={() => count.value = 0} disabled={count.value === 0}>reset</button>
        {<div>jsx in expression</div>}
        {count.value > props.max.value && 'over!'}
        {count.value > 0 && ('conditional reactive text: ' + (count.value + props.max.value))}
        {count.value < 0 && <em>under!</em>}
        {count.value > 0 && <Item max={props.max}>conditional child component</Item>}
        {count.value === 0 ? 'zero' : 'non zero'}
        {count.value === 0 ? 'zero' : <strong>non zero</strong>}
        {count.value === 0 ? 'zero' : count.value === 1 ? 'one' : count.value === 2 ? 'two' : 'unknown:' + count.value}
        <div><button onclick={() => items.push(items.length.value.toString())}>add</button></div>
        <ul>
            {items.map((item, index) => <li>
                {index.value}: <input value={item.value} oninput={(e: any) => item.value = e.currentTarget.value} /> → {item.value}
                <button onclick={() => items.splice(index.value, 1)}>×</button>
                <button onclick={() => items.splice(index.value + 1, 0, Math.random().toString())}>insert</button>
            </li>)}
        </ul>
        <Item max={props.max} value={count.value}>
            <span>child!</span>
        </Item>
        <Item {...itemProps}>spread!</Item>
    </div>
}

run(document.body, App, { max: reactive(5) })
