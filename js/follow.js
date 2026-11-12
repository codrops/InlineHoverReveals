// Following the pointer. Cards that come to the pointer and follow it along
// their trigger (07 On Air, 11 Departures): a little to the pointer's right and
// below it, a little behind it, leaning with its speed; near the screen's edges
// they go to the other side of the pointer, and they always stay inside the
// screen's margins. Opened from the keyboard or with a tap, with no pointer, a
// card sits just under its trigger instead, staying with it as the page
// scrolls. Such cards live in a layer fixed to the screen, outside the page's
// scrolling content (layerOf), so they're placed in screen coordinates and the
// browser will blur what's behind them (backdrop-filter); their triggers still
// find them by their ids.
//
// And the pictures that play along their trigger as the pointer moves along it
// (12 Scrub, 13 Rewind): how far along it the pointer is, their fades, and the
// trigger's underline as a tape, filling up to where they are.

import {GAP, isHidden, oneTweenEach, pageMargin, reducedMotion} from './hoverCards.js';

// A layer fixed to the screen, at the end of the body
export const layerOf = className => {
    const layer = document.createElement('div');
    layer.className = className;
    document.body.append(layer);
    return layer;
};

// Where the card goes for a point on the screen: offset to the point's right and below it, or to
// its left or above it where it would run off the screen, and always inside the screen's margins
// (on a phone it can be nearly as wide as the screen)
const spotFor = (card, point, {offsetX, offsetY}) => {
    const root = document.documentElement;
    const margin = pageMargin();
    const {offsetWidth: width, offsetHeight: height} = card;
    const right = point.x + offsetX + width <= root.clientWidth - margin;
    const below = point.y + offsetY + height <= window.innerHeight - GAP;
    const x = right ? point.x + offsetX : point.x - offsetX - width;
    const y = below ? point.y + offsetY : point.y - offsetY - height;
    return {
        x: gsap.utils.clamp(margin, Math.max(margin, root.clientWidth - margin - width), x),
        y: gsap.utils.clamp(GAP, Math.max(GAP, window.innerHeight - GAP - height), y),
    };
};

// Starts the card following the pointer (or its trigger), and returns a function that stops it.
// options: {term, pointer, offsetX, offsetY, follow, lean}: the pointer where the card opened
// ({x, y} on the screen, or null), the card's offset from it in px, how long it takes to catch up,
// in seconds, and how far it leans with the pointer's speed, at most, in degrees.
export const follow = (card, {term, pointer, offsetX, offsetY, follow: catchUp, lean}) => {
    let point = pointer;
    const byTrigger = () => {
        const word = term.getBoundingClientRect();
        return {x: word.left - offsetX, y: word.bottom - offsetY + GAP / 3};
    };
    const offsets = {offsetX, offsetY};
    const start = spotFor(card, point ?? byTrigger(), offsets);
    if (isHidden(card)) gsap.set(card, {x: start.x, y: start.y, rotation: 0});

    const following = point && !reducedMotion;
    const xTo = gsap.quickTo(card, 'x', {duration: following ? catchUp : 0.3, ease: 'power3'});
    const yTo = gsap.quickTo(card, 'y', {duration: following ? catchUp : 0.3, ease: 'power3'});
    const leanTo = gsap.quickTo(card, 'rotation', {duration: 0.6, ease: 'power3'});
    const move = ev => (point = {x: ev.clientX, y: ev.clientY});
    let last = start;
    const tick = () => {
        const spot = spotFor(card, following ? point : byTrigger(), offsets);
        if (reducedMotion) {
            gsap.set(card, {x: spot.x, y: spot.y});
            return;
        }
        xTo(spot.x);
        yTo(spot.y);
        if (following) leanTo(gsap.utils.clamp(-lean, lean, (spot.x - last.x) * 0.5));
        last = spot;
    };
    if (following) document.addEventListener('pointermove', move, {passive: true});
    gsap.ticker.add(tick);
    return () => {
        document.removeEventListener('pointermove', move);
        gsap.ticker.remove(tick);
    };
};

// How far along its trigger a point on the screen is, 0 to 1
export const along = (term, x) => {
    const word = term.getBoundingClientRect();
    return gsap.utils.clamp(0, 1, (x - word.left) / word.width);
};

// Calls onMove with the pointer's x as it moves over the trigger; returns a function that stops it
export const alongTrigger = (term, onMove) => {
    const move = ev => {
        if (term.contains(ev.target)) onMove(ev.clientX);
    };
    document.addEventListener('pointermove', move, {passive: true});
    return () => document.removeEventListener('pointermove', move);
};

// The picture fading in, rising a little away from its trigger, in duration seconds; caught
// fading out (it wasn't hidden yet), straight back
export const fadeIn = (card, wasHidden, duration) =>
    wasHidden
        ? gsap.fromTo(
              card,
              {autoAlpha: 0, y: card.dataset.side === 'bottom' ? -6 : 6},
              {autoAlpha: 1, y: 0, duration, ease: 'power2.out'},
          )
        : gsap.to(card, {autoAlpha: 1, y: 0, duration: 0.2});

// The picture fading out
export const fadeOut = (card, duration) => gsap.to(card, {autoAlpha: 0, duration, ease: 'power1.in'});

// The trigger's underline as a tape (drawn in css/variations/rewind.css): filled up to at, 0 to 1
export const tapeTo = (term, at) => term.style.setProperty('--tape', at);

// each trigger's tape emptying
const empties = oneTweenEach();

// The tape emptying as its card closes, and kept from emptying as it opens again
export const emptyTape = term =>
    empties(term, () => gsap.to(term, {'--tape': 0, 'duration': reducedMotion ? 0 : 0.3, 'ease': 'power2.out'}));
export const keepTape = term => empties(term);
