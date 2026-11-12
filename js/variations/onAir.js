// 07 On Air: a small tag comes to the pointer and follows it along the trigger,
// a little behind it, leaning with its speed, and reads its note out as if on
// air: the words come in one by one at the pace of speech, pausing at commas
// and full stops, while a level meter jumps with each word and an on-air light
// glows, dimming once it's said. Near the screen's edges the tag goes to the
// other side of the pointer. Opened from the keyboard or with a tap, it sits
// by the trigger instead.
//
// The card's text is the note; setup() adds the light and the meter, splits
// the note into words (SplitText), and moves the card into a layer fixed to
// the screen, outside the page's scrolling content, so its frosted glass can
// blur the text behind it. Following the pointer is js/follow.js, shared with
// 11 Departures.

import {isHidden} from '../hoverCards.js';
import {follow, layerOf} from '../follow.js';

const settings = {
    // the tag's place from the pointer, in px: to its right and below it
    offsetX: 18,
    offsetY: 22,
    // how long the tag takes to catch up with the pointer, in seconds
    follow: 0.45,
    // how far it leans with the pointer's speed, at most, in degrees
    lean: 6,
    // speaking: a word's time, plus this much for each of its letters, and the pauses after a
    // comma and after a full stop, in seconds
    word: 0.09,
    letter: 0.018,
    comma: 0.15,
    stop: 0.25,
    // a word coming in
    wordIn: 0.25,
    // the meter: how low its bars rest, as a part of their height
    rest: 0.15,
    // opening and closing the tag
    openDuration: 0.3,
    closeDuration: 0.2,
};

// each card's tag: {words, bars, light, stopFollowing}
const tags = new WeakMap();

// The tags' layer, fixed to the screen outside the page's scrolling content, like the bar of
// numbers: inside the smooth scroll, the browser won't blur what's behind them (backdrop-filter)
let layer;

// The note said word by word, the meter jumping with each and the light dimming at the end
const speak = (words, bars, light) => {
    const tl = gsap.timeline();
    let at = 0.1;
    words.forEach(word => {
        const text = word.textContent;
        const length = settings.word + settings.letter * text.replace(/\W/g, '').length;
        tl.to(word, {opacity: 1, y: 0, duration: settings.wordIn, ease: 'power2.out'}, at)
            .to(bars, {scaleY: () => gsap.utils.random(0.45, 1), duration: 0.06, ease: 'power1.out'}, at)
            .to(bars, {scaleY: settings.rest, duration: Math.max(0.05, length - 0.06), ease: 'power2.in'}, at + 0.06);
        at += length + (/[.!?]$/.test(text) ? settings.stop : /[,;:]$/.test(text) ? settings.comma : 0);
    });
    return tl.to(light, {opacity: 0.3, duration: 0.6}, at + 0.2);
};

export const onAir = {
    place: 'cursor',
    setup(section) {
        layer ??= layerOf('on-air-layer');
        section.querySelectorAll('.card').forEach(card => {
            // into the layer; its trigger still finds it by its id
            layer.append(card);
            const meter = document.createElement('span');
            meter.className = 'on-air';
            meter.setAttribute('aria-hidden', 'true');
            const light = document.createElement('span');
            light.className = 'on-air__light';
            const bars = Array.from({length: 5}, () => {
                const bar = document.createElement('span');
                bar.className = 'on-air__bar';
                return bar;
            });
            meter.append(light, ...bars);
            card.prepend(meter);
            const words = SplitText.create(card.querySelector('.card__text'), {type: 'words'}).words;
            tags.set(card, {words, bars, light, stopFollowing: null});
        });
    },
    open(card, {term, pointer}) {
        const tag = tags.get(card);
        const {words, bars, light} = tag;

        // at the pointer, following it, or just under the trigger when there's no pointer
        const wasHidden = isHidden(card);
        tag.stopFollowing?.();
        tag.stopFollowing = follow(card, {term, pointer, ...settings});

        // caught while closing, it comes straight back, said
        if (!wasHidden) {
            return gsap
                .timeline()
                .to(card, {autoAlpha: 1, scale: 1, duration: 0.2}, 0)
                .to(words, {opacity: 1, y: 0, duration: 0.2}, 0);
        }

        gsap.set(words, {opacity: 0, y: 4});
        gsap.set(bars, {scaleY: settings.rest});
        gsap.set(light, {opacity: 1});
        return gsap
            .timeline()
            .fromTo(
                card,
                {autoAlpha: 0, scale: 0.92},
                {autoAlpha: 1, scale: 1, duration: settings.openDuration, ease: 'power3.out'},
                0,
            )
            .add(speak(words, bars, light), 0);
    },
    close(card) {
        const tag = tags.get(card);
        tag.stopFollowing?.();
        return gsap
            .timeline()
            .to(card, {autoAlpha: 0, scale: 0.95, duration: settings.closeDuration, ease: 'power2.in'})
            .set(tag.bars, {scaleY: settings.rest});
    },
};
