import { reactive, reactiveArray, combineReactive$, mapArray$, conditional$, replaceNode$, subscribe$, element$, text$ } from "reactive-tsx";
const Item = (unsubscribes, props) => {
    const test = reactive(0);
    const div1 = element$("div");
    {
        div1.appendChild(text$("Item: "));
        const text2 = text$("");
        subscribe$(unsubscribes, [props.max, test], () => text2.nodeValue = props.max.value + test.value);
        div1.appendChild(text2);
        const div3 = element$("div");
        {
            div3.appendChild(text$("value: "));
            div3.appendChild(text$(props.value));
        }
        div1.appendChild(div3);
        props.children && props.children(div1, unsubscribes);
    }
    return div1;
};
const outsideReactive = reactive(0);
const combinedOutsideReactive = combineReactive$(undefined, [outsideReactive], () => outsideReactive.value * 2);
const App = (unsubscribes, props) => {
    const count = reactive(0);
    const items = reactiveArray(['xyz', 'abc']);
    const doubled = combineReactive$(unsubscribes, [count], () => count.value * 2);
    const itemProps = {
        max: props.max,
        value: 1,
    };
    const div4 = element$("div");
    div4["className"] = "foo";
    {
        div4.appendChild(text$("count: "));
        const text5 = text$("");
        unsubscribes.push(count.subscribe(() => text5.nodeValue = count.value));
        div4.appendChild(text5);
        div4.appendChild(text$(" (max: "));
        const text6 = text$("");
        unsubscribes.push(props.max.subscribe(() => text6.nodeValue = props.max.value));
        div4.appendChild(text6);
        div4.appendChild(text$(")"));
        const button7 = element$("button");
        button7["onclick"] = () => count.value += 1;
        {
            button7.appendChild(text$("+1"));
        }
        div4.appendChild(button7);
        const button8 = element$("button");
        button8["onclick"] = () => count.value -= 1;
        {
            button8.appendChild(text$("-1"));
        }
        div4.appendChild(button8);
        const button9 = element$("button");
        button9["onclick"] = () => count.value = 0;
        unsubscribes.push(count.subscribe(() => button9["disabled"] = count.value === 0));
        {
            button9.appendChild(text$("reset"));
        }
        div4.appendChild(button9);
        const div10 = element$("div");
        {
            div10.appendChild(text$("jsx in expression"));
        }
        div4.appendChild(div10);
        let currentNode11 = text$("");
        div4.appendChild(currentNode11);
        conditional$(unsubscribes, /*
            condition*/ [count, props.max], () => count.value > props.max.value, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('over!'), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode11 = replaceNode$(node, currentNode11, div4));
        let currentNode12 = text$("");
        div4.appendChild(currentNode12);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ [count, props.max], (unsubscribes, onUpdate) => onUpdate(('conditional reactive text: ' + (count.value + props.max.value)) || ""), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode12 = replaceNode$(node, currentNode12, div4));
        let currentNode13 = text$("");
        div4.appendChild(currentNode13);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value < 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => {
            const em14 = element$("em");
            {
                em14.appendChild(text$("under!"));
            }
            onUpdate(em14);
        }, /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode13 = replaceNode$(node, currentNode13, div4));
        let currentNode15 = text$("");
        div4.appendChild(currentNode15);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value > 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate(Item(unsubscribes, {
            max: props.max,
            children: (parentNode, unsubscribes) => {
                parentNode.appendChild(text$("conditional child component"));
            }
        })), /*
            whenFalse*/ undefined, undefined, /*
            onUpdate */ node => currentNode15 = replaceNode$(node, currentNode15, div4));
        let currentNode16 = text$("");
        div4.appendChild(currentNode16);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => onUpdate('non zero'), /*
            onUpdate */ node => currentNode16 = replaceNode$(node, currentNode16, div4));
        let currentNode17 = text$("");
        div4.appendChild(currentNode17);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => {
            const strong18 = element$("strong");
            {
                strong18.appendChild(text$("non zero"));
            }
            onUpdate(strong18);
        }, /*
            onUpdate */ node => currentNode17 = replaceNode$(node, currentNode17, div4));
        let currentNode19 = text$("");
        div4.appendChild(currentNode19);
        conditional$(unsubscribes, /*
            condition*/ [count], () => count.value === 0, /*
            whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('zero'), /*
            whenFalse*/ undefined, (unsubscribes, onUpdate) => conditional$(unsubscribes, /*
                condition*/ [count], () => count.value === 1, /*
                whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('one'), /*
                whenFalse*/ undefined, (unsubscribes, onUpdate) => conditional$(unsubscribes, /*
                    condition*/ [count], () => count.value === 2, /*
                    whenTrue */ undefined, (unsubscribes, onUpdate) => onUpdate('two'), /*
                    whenFalse*/ [count], (unsubscribes, onUpdate) => onUpdate('unknown:' + count.value || ""), /*
                    onUpdate */ onUpdate), /*
                onUpdate */ onUpdate), /*
            onUpdate */ node => currentNode19 = replaceNode$(node, currentNode19, div4));
        const div20 = element$("div");
        {
            const button21 = element$("button");
            button21["onclick"] = () => items.push(items.length.value.toString());
            {
                button21.appendChild(text$("add"));
            }
            div20.appendChild(button21);
        }
        div4.appendChild(div20);
        const ul22 = element$("ul");
        {
            mapArray$(ul22, items, (unsubscribes, item, index) => {
                const li23 = element$("li");
                {
                    const text24 = text$("");
                    unsubscribes.push(index.subscribe(() => text24.nodeValue = index.value));
                    li23.appendChild(text24);
                    li23.appendChild(text$(": "));
                    const input25 = element$("input");
                    unsubscribes.push(item.subscribe(() => input25["value"] = item.value));
                    input25["oninput"] = (e) => item.value = e.currentTarget.value;
                    li23.appendChild(input25);
                    li23.appendChild(text$(" \u2192 "));
                    const text26 = text$("");
                    unsubscribes.push(item.subscribe(() => text26.nodeValue = item.value));
                    li23.appendChild(text26);
                    const button27 = element$("button");
                    button27["onclick"] = () => items.splice(index.value, 1);
                    {
                        button27.appendChild(text$("\u00D7"));
                    }
                    li23.appendChild(button27);
                    const button28 = element$("button");
                    button28["onclick"] = () => items.splice(index.value + 1, 0, Math.random().toString());
                    {
                        button28.appendChild(text$("insert"));
                    }
                    li23.appendChild(button28);
                }
                return li23;
            });
        }
        div4.appendChild(ul22);
        div4.appendChild(Item(unsubscribes, {
            max: props.max,
            value: count.value,
            children: (parentNode, unsubscribes) => {
                const span29 = element$("span");
                {
                    span29.appendChild(text$("child!"));
                }
                parentNode.appendChild(span29);
            }
        }));
        div4.appendChild(Item(unsubscribes, Object.assign(Object.assign({}, itemProps), { children: (parentNode, unsubscribes) => {
                parentNode.appendChild(text$("spread!"));
            } })));
    }
    return div4;
};
(() => {
    const node = document.body;
    const unsubscribes = [];
    const child = App(unsubscribes, { max: reactive(5) });
    node.appendChild(child);
    return () => {
        node.removeChild(child);
        unsubscribes.forEach(x => x());
    };
})();
