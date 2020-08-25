import { Component, run, reactive } from 'reactive-tsx'

const App: Component = () => {
    const count = reactive(0)

    return <div>
        <h1>Hello world!</h1>
        <div>
            count: {count.value}
            <div>
                <button onclick={() => count.value++}>+1</button>
                <button onclick={() => count.value--}>-1</button>
                <button onclick={() => count.value = 0}>reset</button>
            </div>
        </div>
    </div>
}

run(document.body, App, {})
