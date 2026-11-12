// 15 Register: the trigger's picture comes the way the first colour photographs
// did, as three plates, one each for its red, its green and its blue, that only
// make the picture in colour once they lie exactly over each other. The three
// rise out of the trigger, each from a slightly different side, and glide into
// register over it (under it when there's no room above), coloured fringes at
// their edges until they lock together; as they lock, the paragraph's own
// letters fringe red and blue for a moment and settle too. The plates follow
// the pointer along the trigger, sliding with it. Leaving, the plates drift
// apart and fade.
//
// Each card names its picture in data-picture; its text is for screen readers.
// setup() separates the picture into its three channels, each drawn on a canvas
// of its own; laid over each other with mix-blend-mode: screen, they add back
// up to the picture.

import {isHidden, oneTweenEach, pageMargin, reducedMotion, urlOf} from '../hoverCards.js';
import {alongTrigger} from '../follow.js';

const settings = {
    // where the plates start: how far apart, in px, how far back towards the trigger, how much they
    // turn, at most, in degrees, and how small
    spread: 46,
    rise: 50,
    turn: 5,
    scale: 0.9,
    // gliding into register, each this long after the one before, in seconds
    duration: 1.1,
    stagger: 0.1,
    // the paragraph's letters fringing as the plates lock: how far, in px, and how long they take
    // to settle, starting this far into the plates' glide
    fringe: 3,
    fringeDuration: 0.8,
    fringeAt: 0.35,
    // leaving: how far the plates drift apart, in px, and how long they take
    apart: 18,
    closeDuration: 0.4,
    // following the pointer along the trigger: how long the plates take to catch up, in seconds
    follow: 0.3,
};

// the three plates' tints, as the channel each keeps, and which way each comes from (-1 left,
// 0 middle, 1 right)
const CHANNELS = [
    {keep: 0, from: -1},
    {keep: 1, from: 0},
    {keep: 2, from: 1},
];

// each card's plates, and the function that stops them following the pointer
const plates = new WeakMap();
const following = new WeakMap();
// each section's fringe tween
const fringes = oneTweenEach();

// The picture separated into its three channels, a canvas for each
const separate = (image, canvases) => {
    const width = image.naturalWidth;
    const height = image.naturalHeight;
    const source = document.createElement('canvas');
    source.width = width;
    source.height = height;
    const context = source.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0);
    const pixels = context.getImageData(0, 0, width, height);
    CHANNELS.forEach(({keep}, i) => {
        const canvas = canvases[i];
        canvas.width = width;
        canvas.height = height;
        const channel = new ImageData(new Uint8ClampedArray(pixels.data), width, height);
        for (let p = 0; p < channel.data.length; p += 4) {
            for (let c = 0; c < 3; c++) if (c !== keep) channel.data[p + c] = 0;
        }
        canvas.getContext('2d').putImageData(channel, 0, 0);
    });
};

// The paragraph's letters fringing and settling
const fringe = section => {
    if (reducedMotion) return;
    fringes(section, () => {
        gsap.set(section, {'--fringe': settings.fringe});
        return gsap.to(section, {
            '--fringe': 0,
            'duration': settings.fringeDuration,
            'delay': settings.fringeAt,
            'ease': 'power2.out',
        });
    });
};

// Starts the plates following the pointer along the trigger, centred on it and inside the screen's
// margins, straight at it as they open; returns a function that stops them
const slide = (card, term, pointer) => {
    const root = document.documentElement;
    const margin = pageMargin();
    // where the card was placed, without the slide
    const base = card.getBoundingClientRect().left - gsap.getProperty(card, 'x');
    const width = card.offsetWidth;
    const xAt = x => gsap.utils.clamp(margin - base, root.clientWidth - margin - width - base, x - width / 2 - base);
    if (isHidden(card)) gsap.set(card, {x: xAt(pointer.x)});
    const xTo = gsap.quickTo(card, 'x', {duration: reducedMotion ? 0 : settings.follow, ease: 'power3'});
    return alongTrigger(term, x => xTo(xAt(x)));
};

export const register = {
    setup(section) {
        section.querySelectorAll('.card[data-picture]').forEach(card => {
            const box = document.createElement('div');
            box.className = 'register';
            box.setAttribute('aria-hidden', 'true');
            const canvases = CHANNELS.map(() => {
                const canvas = document.createElement('canvas');
                canvas.className = 'register__plate';
                return canvas;
            });
            box.append(...canvases);
            card.prepend(box);
            const image = new Image();
            image.src = urlOf(card.dataset.picture);
            image
                .decode()
                .then(() => separate(image, canvases))
                .catch(() => {});
            plates.set(card, canvases);
        });
    },
    open(card, {side, section, term, pointer}) {
        const canvases = plates.get(card);

        // at the pointer, following it along the trigger; with no pointer, centred over the trigger
        following.get(card)?.();
        if (isHidden(card)) gsap.set(card, {x: 0});
        following.set(card, pointer ? slide(card, term, pointer) : null);

        // caught drifting apart, they come straight back into register
        if (!isHidden(card)) {
            return gsap.to(canvases, {
                x: 0,
                y: 0,
                rotation: 0,
                scale: 1,
                opacity: 1,
                duration: 0.4,
                ease: 'power3.out',
            });
        }

        const {spread, rise, turn, scale, duration, stagger} = settings;
        // out of the trigger: from below the picture when it's above the trigger, from above when it's below
        const back = side === 'bottom' ? -rise : rise;
        gsap.set(card, {autoAlpha: 1});
        CHANNELS.forEach(({from}, i) => {
            gsap.set(canvases[i], {
                x: from * spread,
                y: back * (from ? 0.7 : 1),
                rotation: from * turn,
                scale,
                opacity: 0,
            });
        });
        fringe(section);
        return gsap
            .timeline()
            .to(canvases, {opacity: 1, duration: 0.25, stagger, ease: 'power1.out'}, 0)
            .to(canvases, {x: 0, y: 0, rotation: 0, scale: 1, duration, stagger, ease: 'expo.out'}, 0);
    },
    close(card) {
        const canvases = plates.get(card);
        following.get(card)?.();
        following.delete(card);
        const {apart, closeDuration: duration} = settings;
        const tl = gsap.timeline();
        CHANNELS.forEach(({from}, i) => {
            tl.to(
                canvases[i],
                {x: from * apart, y: from ? 0 : -apart * 0.5, opacity: 0, duration, ease: 'power2.in'},
                0,
            );
        });
        return tl.set(card, {autoAlpha: 0});
    },
};
