// 12 Scrub: the trigger holds a roll's frames of one portrait, six shots of
// the same moment. A small picture opens above it, and as the pointer moves
// along the trigger, the picture slides along with it and goes through the
// frames, first to last, like flicking through a contact sheet. It swings as
// it goes, on a pivot below it: tilted left at the first frame, upright at the
// middle, tilted right at the last. Each frame it leaves drops away, as if
// under its own weight, drifting back against the pointer as it fades. Along
// the picture's bottom, a row of ticks shows which frame is showing, and the
// trigger's underline fills, grey to white, up to the pointer, as the tape does
// in 13 Rewind. Opened from the keyboard or with a tap, with no pointer to
// follow, the frames play by themselves, the underline filling with them.
//
// Each card names its frames in data-frames; its text is for screen readers.
// How far along the trigger the pointer is, the fades and the underline as a
// tape are js/follow.js, shared with 13 Rewind.

import {isHidden, pageMargin, reducedMotion, urlOf} from '../hoverCards.js';
import {along, alongTrigger, emptyTape, fadeIn, fadeOut, keepTape, tapeTo} from '../follow.js';

const settings = {
    // how long the picture takes to catch up with the pointer, in seconds
    follow: 0.25,
    // the swing: how far it tilts at the first and last frames, in degrees, and how far below the
    // picture's bottom it pivots, in px
    tilt: 7,
    pivot: 120,
    // a frame it leaves: how far it drops and drifts back, in px, how much it turns, in degrees, and
    // how long it takes to go
    drop: 18,
    drift: 14,
    turn: 4,
    leaveDuration: 0.45,
    // with no pointer, how long each frame shows
    frameDuration: 0.3,
    // opening and closing
    openDuration: 0.3,
    closeDuration: 0.2,
};

// each card's picture: {picture, frames, ticks, current, tape, stop}: the frame showing, and how
// far the trigger's underline is filled ({at}, 0 to 1)
const scrubs = new WeakMap();

// The swing for a place along the trigger, 0 to 1
const tiltAt = along => (along - 0.5) * 2 * settings.tilt;

// A frame left behind drops away and fades, drifting back against the way the pointer went
// (dir 1 when it went on to a later frame, -1 to an earlier one)
const leave = (frame, dir) => {
    frame.classList.remove('is-current');
    if (reducedMotion) return;
    frame.classList.add('is-leaving');
    const {drop, drift, turn, leaveDuration: duration} = settings;
    gsap.timeline({
        onComplete: () => {
            frame.classList.remove('is-leaving');
            gsap.set(frame, {clearProps: 'transform,opacity'});
        },
    })
        .to(frame, {y: drop, duration, ease: 'power2.in'}, 0)
        .to(frame, {x: -dir * drift, rotation: -dir * turn, duration, ease: 'power2.out'}, 0)
        .to(frame, {opacity: 0, duration, ease: 'power1.in'}, 0);
};

// Shows one frame, and marks its tick; the frame it was showing leaves
const show = (scrub, index) => {
    const last = scrub.current;
    if (last === index) return;
    const frame = scrub.frames[index];
    gsap.killTweensOf(frame);
    frame.classList.remove('is-leaving');
    gsap.set(frame, {clearProps: 'transform,opacity'});
    frame.classList.add('is-current');
    if (last >= 0) {
        leave(scrub.frames[last], index > last ? 1 : -1);
        scrub.ticks[last].classList.remove('is-current');
    }
    scrub.ticks[index].classList.add('is-current');
    scrub.current = index;
};

// Clears the picture, so it opens straight on its first frame, with nothing left behind to drop
const reset = scrub => {
    scrub.frames.forEach(frame => {
        gsap.killTweensOf(frame);
        frame.classList.remove('is-current', 'is-leaving');
        gsap.set(frame, {clearProps: 'transform,opacity'});
    });
    scrub.ticks.forEach(tick => tick.classList.remove('is-current'));
    scrub.current = -1;
};

// Starts the picture following the pointer along the trigger, its frame and its swing set by how
// far along the trigger the pointer is; and returns a function that stops it
const follow = (card, scrub, term, pointer) => {
    const root = document.documentElement;
    const margin = pageMargin();
    gsap.set(card, {x: 0});
    const base = card.getBoundingClientRect().left;
    const width = card.offsetWidth;
    const reach = scrub.picture.offsetHeight + settings.pivot;
    // where the picture goes for a pointer at x, inside the screen's margins (its swing included),
    // its swing, and the frame it shows
    const at = x => {
        const where = Math.min(along(term, x), 0.999);
        show(scrub, Math.floor(where * scrub.frames.length));
        const rotation = reducedMotion ? 0 : tiltAt(where);
        const lean = Math.sin((rotation * Math.PI) / 180) * reach;
        const left = gsap.utils.clamp(
            margin - Math.min(0, lean) - base,
            root.clientWidth - margin - width - Math.max(0, lean) - base,
            x - width / 2 - base,
        );
        return {left, rotation};
    };
    // straight at the pointer as it opens, then following it
    const start = at(pointer.x);
    gsap.set(card, {x: start.left});
    gsap.set(scrub.picture, {rotation: start.rotation});
    const duration = reducedMotion ? 0 : settings.follow;
    const xTo = gsap.quickTo(card, 'x', {duration, ease: 'power3'});
    const rotateTo = gsap.quickTo(scrub.picture, 'rotation', {duration, ease: 'power3'});
    // the underline filled up to the pointer, following it at the picture's pace
    scrub.tape.at = along(term, pointer.x);
    tapeTo(term, scrub.tape.at);
    const fillTo = gsap.quickTo(scrub.tape, 'at', {
        duration,
        ease: 'power3',
        onUpdate: () => tapeTo(term, scrub.tape.at),
    });
    return alongTrigger(term, x => {
        const spot = at(x);
        xTo(spot.left);
        rotateTo(spot.rotation);
        fillTo(along(term, x));
    });
};

// With no pointer, the frames play by themselves, over and over, the picture swinging with them
// and the underline filling with them, a frame's share at a time
const play = (card, scrub, term) => {
    gsap.set(card, {x: 0});
    const fill = index => {
        scrub.tape.at = (index + 1) / scrub.frames.length;
        tapeTo(term, scrub.tape.at);
    };
    const swing = index => {
        if (reducedMotion) return;
        gsap.to(scrub.picture, {
            rotation: tiltAt(index / (scrub.frames.length - 1)),
            duration: settings.frameDuration,
            ease: 'power2.out',
        });
    };
    show(scrub, 0);
    fill(0);
    gsap.set(scrub.picture, {rotation: reducedMotion ? 0 : tiltAt(0)});
    if (reducedMotion) return () => {};
    const next = gsap.delayedCall(settings.frameDuration, () => {
        show(scrub, (scrub.current + 1) % scrub.frames.length);
        swing(scrub.current);
        fill(scrub.current);
        next.restart(true);
    });
    return () => next.kill();
};

export const scrub = {
    setup(section) {
        section.querySelectorAll('.card[data-frames]').forEach(card => {
            const picture = document.createElement('div');
            picture.className = 'scrub';
            picture.setAttribute('aria-hidden', 'true');
            const sources = card.dataset.frames.trim().split(/\s+/);
            const frames = sources.map(src => {
                const frame = document.createElement('div');
                frame.className = 'scrub__frame';
                frame.style.backgroundImage = `url(${urlOf(src)})`;
                // loaded ahead, so each frame shows as soon as it's reached
                new Image().src = urlOf(src);
                return frame;
            });
            const track = document.createElement('div');
            track.className = 'scrub__ticks';
            const ticks = sources.map(() => {
                const tick = document.createElement('span');
                tick.className = 'scrub__tick';
                return tick;
            });
            track.append(...ticks);
            picture.append(...frames, track);
            card.prepend(picture);
            gsap.set(picture, {transformOrigin: `50% calc(100% + ${settings.pivot}px)`});
            scrubs.set(card, {picture, frames, ticks, current: -1, tape: {at: 0}, stop: null});
        });
    },
    open(card, {term, pointer}) {
        const state = scrubs.get(card);
        const wasHidden = isHidden(card);
        state.stop?.();
        // opening, it shows the frame for where the pointer came in, without dropping the last
        // one it showed (caught closing, it carries on as it was)
        if (wasHidden) reset(state);
        keepTape(term);
        gsap.killTweensOf(state.tape);
        state.stop = pointer ? follow(card, state, term, pointer) : play(card, state, term);
        return fadeIn(card, wasHidden, settings.openDuration);
    },
    close(card, {term}) {
        const state = scrubs.get(card);
        state.stop?.();
        state.stop = null;
        gsap.killTweensOf(state.tape);
        emptyTape(term);
        return fadeOut(card, settings.closeDuration);
    },
};
