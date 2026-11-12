// 13 Rewind: a few seconds of home video open above the trigger, in the
// rounded, slightly bulging shape of an old screen, and the trigger is the
// tape: moving the pointer along it, its underline fills in white up to the
// pointer and the video goes to that moment, forwards or backwards, so a
// blown-out candle lights again and a diver leaps back out of the pool.
// Opened from the keyboard or with a tap, with no pointer, the video plays
// forwards and back by itself, the underline filling and emptying with it.
//
// Each card names its video in data-tape: the clip's frames in one picture,
// in rows (data-columns across, data-rows down), drawn one at a time by
// moving the picture behind the screen. Its text is for screen readers. How
// far along the trigger the pointer is, and the fades, are js/follow.js,
// shared with 12 Scrub.

import {isHidden, reducedMotion, urlOf} from '../hoverCards.js';
import {along, alongTrigger, emptyTape, fadeIn, fadeOut, keepTape, tapeTo} from '../follow.js';

const settings = {
    // how long the video takes to catch up with the pointer, in seconds
    follow: 0.35,
    // with no pointer, how long the video takes to play through, each way
    playDuration: 3,
    // opening and closing
    openDuration: 0.3,
    closeDuration: 0.2,
};

// each card's video: {picture, term, columns, rows, tape, stop}
const tvs = new WeakMap();

// The screen's shape, an old screen's: rounded corners, the sides bulging a little; one for the page
const addShape = () => {
    if (document.getElementById('tv-screen')) return;
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('width', '0');
    svg.setAttribute('height', '0');
    svg.setAttribute('aria-hidden', 'true');
    svg.style.position = 'absolute';
    svg.innerHTML = `<clipPath id="tv-screen" clipPathUnits="objectBoundingBox"><path d="M0.1,0.03 Q0.5,0 0.9,0.03 Q0.985,0.04 0.99,0.14 Q1,0.5 0.99,0.86 Q0.985,0.96 0.9,0.97 Q0.5,1 0.1,0.97 Q0.015,0.96 0.01,0.86 Q0,0.5 0.01,0.14 Q0.015,0.04 0.1,0.03 Z"/></clipPath>`;
    document.body.append(svg);
};

// Draws the moment of the video the tape is at, 0 to 1, and fills the trigger's underline up to it
const render = tv => {
    const {picture, term, columns, rows, tape} = tv;
    const frame = Math.round(tape.at * (columns * rows - 1));
    const x = columns > 1 ? ((frame % columns) / (columns - 1)) * 100 : 0;
    const y = rows > 1 ? (Math.floor(frame / columns) / (rows - 1)) * 100 : 0;
    picture.style.backgroundPosition = `${x}% ${y}%`;
    tapeTo(term, tape.at);
};

// Starts the tape following the pointer along the trigger; returns a function that stops it
const follow = (tv, term, pointer) => {
    const to = gsap.quickTo(tv.tape, 'at', {
        duration: reducedMotion ? 0 : settings.follow,
        ease: 'power3',
        onUpdate: () => render(tv),
    });
    // the tape is as far along as the pointer is along the trigger
    tv.tape.at = along(term, pointer.x);
    render(tv);
    return alongTrigger(term, x => to(along(term, x)));
};

// With no pointer, the tape plays forwards and back by itself
const play = tv => {
    tv.tape.at = 0;
    render(tv);
    const playing = reducedMotion
        ? null
        : gsap.to(tv.tape, {
              at: 1,
              duration: settings.playDuration,
              ease: 'none',
              repeat: -1,
              yoyo: true,
              onUpdate: () => render(tv),
          });
    return () => playing?.kill();
};

export const rewind = {
    setup(section) {
        addShape();
        section.querySelectorAll('.card[data-tape]').forEach(card => {
            const tv = document.createElement('div');
            tv.className = 'tv';
            tv.setAttribute('aria-hidden', 'true');
            const screen = document.createElement('div');
            screen.className = 'tv__screen';
            const picture = document.createElement('div');
            picture.className = 'tv__picture';
            const columns = Number(card.dataset.columns);
            const rows = Number(card.dataset.rows);
            const src = urlOf(card.dataset.tape);
            picture.style.backgroundImage = `url(${src})`;
            picture.style.backgroundSize = `${columns * 100}% ${rows * 100}%`;
            // loaded ahead, so the video is there as soon as it opens
            new Image().src = src;
            screen.append(picture);
            tv.append(screen);
            card.prepend(tv);
            // the trigger, whose underline fills as the tape (css/variations/rewind.css)
            const term = section.querySelector(`[aria-describedby="${card.id}"]`);
            tvs.set(card, {picture, term, columns, rows, tape: {at: 0}, stop: null});
        });
    },
    open(card, {term, pointer}) {
        const tv = tvs.get(card);
        const wasHidden = isHidden(card);
        tv.stop?.();
        keepTape(term);
        gsap.killTweensOf(tv.tape);
        tv.stop = pointer ? follow(tv, term, pointer) : play(tv);
        return fadeIn(card, wasHidden, settings.openDuration);
    },
    close(card) {
        const tv = tvs.get(card);
        tv.stop?.();
        tv.stop = null;
        gsap.killTweensOf(tv.tape);
        emptyTape(tv.term);
        return fadeOut(card, settings.closeDuration);
    },
};
