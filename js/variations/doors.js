// 10 Doors: the trigger opens two little doors in the paragraph itself, like
// an advent calendar's. They're cut into the page in the lines just above the
// trigger, the ones already read (below it when there aren't enough lines
// above, or no room on screen), printed with the paragraph's own text, and
// they swing open inwards, into the page, like doors into a room; behind
// them, set back in the dark, is the picture, lit as they open. Swinging
// inwards, they stay inside their opening, so they never cover the text
// around it. Leaving, the doors swing shut.
//
// Each card names its picture in data-picture; its text is for screen
// readers. The doors carry a copy of the paragraph and its label, placed so
// its letters lie exactly over the page's own; the card, with the picture at
// the back, covers the page's text where the doors are cut, so once they open
// there's only the picture there. Where they're cut, the copy and the
// hand-over between overlapping cards are js/cuts.js, shared with 14 Slats.

import {isHidden, urlOf} from '../hoverCards.js';
import {closing, copyOf, cutFor, handOver} from '../cuts.js';

const settings = {
    // the doors' size: at least this tall, in px, rounded up to whole lines of the paragraph,
    // and as wide as this many times their height (where they're cut: js/cuts.js)
    height: 140,
    aspect: 1.5,
    // how far they swing open, inwards, in degrees, how long they take, and how far apart they
    // start
    angle: 70,
    openDuration: 1.1,
    stagger: 0.06,
    closeDuration: 0.45,
    // going straight to another trigger whose card overlaps this one, how many times faster this one
    // closes
    handOver: 2.5,
    // how much a door darkens as it turns, at most; and the picture in the dark behind the
    // closed doors, as a brightness, lit as they open
    shade: 0.5,
    dark: 0.3,
};

// each card's doors: {doors, picture, left, right, texts}
const cards = new WeakMap();

// A door darkens as it turns away from the light
const shade = doors => {
    doors.forEach(door => {
        const turn = Math.abs(gsap.getProperty(door, 'rotationY'));
        door.style.setProperty('--shade', Math.sin((turn * Math.PI) / 180) * settings.shade);
    });
};

export const doors = {
    place: 'self',
    setup(section) {
        const block = section.querySelector('.block');
        section.querySelectorAll('.card[data-picture]').forEach(card => {
            const frame = document.createElement('div');
            frame.className = 'doors';
            frame.setAttribute('aria-hidden', 'true');
            const picture = document.createElement('div');
            picture.className = 'doors__picture';
            picture.style.backgroundImage = `url(${urlOf(card.dataset.picture)})`;
            const [left, right] = ['left', 'right'].map(side => {
                const door = document.createElement('div');
                door.className = `door door--${side}`;
                const face = document.createElement('div');
                face.className = 'door__face';
                face.append(copyOf(block, 'door'));
                door.append(face);
                return door;
            });
            frame.append(picture, left, right);
            card.prepend(frame);
            cards.set(card, {
                frame,
                picture,
                left,
                right,
                texts: [left, right].map(door => door.querySelector('.door__text')),
            });
        });
    },
    open(card, {term, block}) {
        const {frame, picture, left, right, texts} = cards.get(card);
        handOver(card, block, settings.handOver);

        // cut where the trigger is now, unless caught swinging shut, when they swing open again
        if (isHidden(card)) {
            const box = block.getBoundingClientRect();
            const {height, aspect} = settings;
            const spot = cutFor(term, block.querySelector('.statement'), {
                height,
                aspect,
                even: true,
                fallback: 'screen',
            });
            const cardLeft = spot.left - box.left;
            const cardTop = spot.top - box.top;
            card.dataset.side = spot.side;
            gsap.set(card, {left: cardLeft, top: cardTop});
            gsap.set(frame, {width: spot.width, height: spot.height});
            // each door's copy of the block's text, letter for letter over the page's own
            texts.forEach((text, i) => {
                gsap.set(text, {left: -cardLeft - (i * spot.width) / 2, top: -cardTop, width: block.offsetWidth});
            });
            gsap.set([left, right], {rotationY: 0});
            gsap.set(picture, {filter: `brightness(${settings.dark})`});
            shade([left, right]);
            gsap.set(card, {autoAlpha: 1});
        }

        const {angle, openDuration, stagger} = settings;
        return gsap
            .timeline({onUpdate: () => shade([left, right])})
            .to(left, {rotationY: angle, duration: openDuration, ease: 'power3.out'}, 0)
            .to(right, {rotationY: -angle, duration: openDuration, ease: 'power3.out'}, stagger)
            .to(picture, {filter: 'brightness(1)', duration: openDuration * 0.8, ease: 'power2.out'}, 0);
    },
    close(card) {
        const {picture, left, right} = cards.get(card);
        return closing(
            card,
            gsap
                .timeline({onUpdate: () => shade([left, right])})
                .to([left, right], {rotationY: 0, duration: settings.closeDuration, ease: 'power2.in'}, 0)
                .to(
                    picture,
                    {filter: `brightness(${settings.dark})`, duration: settings.closeDuration, ease: 'power2.in'},
                    0,
                )
                .set(card, {autoAlpha: 0}),
        );
    },
};
