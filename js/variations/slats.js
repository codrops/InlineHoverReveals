// 14 Slats: the lines of the paragraph just above the trigger, the ones
// already read, turn over like the slats of a blind, one after another from
// the trigger's line outwards; the back of each line is a strip of the
// trigger's picture, so the turned lines put the picture together out of the
// paragraph. Leaving, they turn back to text. Where there aren't enough lines
// above the trigger on screen, the lines below it turn instead.
//
// Each card names its picture in data-picture; its text is for screen
// readers. Each slat carries a copy of the block's text on its front, placed
// so its letters lie exactly over the page's own, and its strip of the
// picture on its back; the card, behind the slats, covers the page's text
// where they turn. Where they go, the copy and the hand-over between
// overlapping cards are js/cuts.js, shared with 10 Doors.

import {isHidden, reducedMotion, urlOf} from '../hoverCards.js';
import {closing, copyOf, cutFor, handOver} from '../cuts.js';

const settings = {
    // the picture: at least this tall, in px, rounded up to whole lines of the paragraph, and as
    // wide as this many times its height (never wider than the paragraph; where it goes:
    // js/cuts.js)
    height: 150,
    aspect: 2.4,
    // a slat turning, in seconds, each starting this long after the one before; and turning back
    turnDuration: 0.7,
    stagger: 0.08,
    closeDuration: 0.5,
    // going straight to another trigger whose card overlaps this one, how many times faster this one
    // closes
    handOver: 2.5,
    // how much a slat darkens as it turns side-on, at most
    shade: 0.6,
};

// each card's blind: {slats, image, spot}
const blinds = new WeakMap();

// The slats darken as they turn side-on
const shade = slats => {
    slats.forEach(slat => {
        const turn = gsap.getProperty(slat, 'rotationX');
        slat.style.setProperty('--shade', Math.abs(Math.sin((turn * Math.PI) / 180)) * settings.shade);
    });
};

// Builds the slats for where the card is now: one for each line, its front the block's text,
// its back its strip of the picture (the picture covering the whole blind, as background-size:
// cover would)
const build = (card, block, spot, cardLeft, cardTop) => {
    const blind = blinds.get(card);
    const {image} = blind;
    const {width, height, count, lineHeight} = spot;
    const ratio = image.naturalWidth / image.naturalHeight || 16 / 9;
    const cover = width / height > ratio ? {w: width, h: width / ratio} : {w: height * ratio, h: height};
    const x = (width - cover.w) / 2;
    const y = (height - cover.h) / 2;
    const holder = card.querySelector('.slats');
    holder.replaceChildren();
    holder.style.width = `${width}px`;
    holder.style.height = `${height}px`;
    blind.slats = Array.from({length: count}, (_, i) => {
        const slat = document.createElement('div');
        slat.className = 'slat';
        slat.style.top = `${i * lineHeight}px`;
        slat.style.height = `${lineHeight}px`;
        const front = document.createElement('div');
        front.className = 'slat__front';
        const copy = copyOf(block, 'slat');
        copy.style.left = `${-cardLeft}px`;
        copy.style.top = `${-(cardTop + i * lineHeight)}px`;
        copy.style.width = `${block.offsetWidth}px`;
        front.append(copy);
        const back = document.createElement('div');
        back.className = 'slat__back';
        back.style.backgroundImage = `url(${image.src})`;
        back.style.backgroundSize = `${cover.w}px ${cover.h}px`;
        back.style.backgroundPosition = `${x}px ${y - i * lineHeight}px`;
        slat.append(front, back);
        holder.append(slat);
        return slat;
    });
    // nearest the trigger first
    if (spot.side === 'top') blind.slats.reverse();
};

export const slats = {
    place: 'self',
    setup(section) {
        section.querySelectorAll('.card[data-picture]').forEach(card => {
            const holder = document.createElement('div');
            holder.className = 'slats';
            holder.setAttribute('aria-hidden', 'true');
            card.prepend(holder);
            const image = new Image();
            image.src = urlOf(card.dataset.picture);
            image.decode().catch(() => {});
            blinds.set(card, {slats: [], image});
        });
    },
    open(card, {term, block}) {
        const blind = blinds.get(card);
        handOver(card, block, settings.handOver);

        // placed and built where the trigger is now, unless caught turning back
        if (isHidden(card)) {
            const {height, aspect} = settings;
            const spot = cutFor(term, block.querySelector('.statement'), {height, aspect, fallback: 'lines'});
            const box = block.getBoundingClientRect();
            const cardLeft = spot.left - box.left;
            const cardTop = spot.top - box.top;
            card.dataset.side = spot.side;
            gsap.set(card, {left: cardLeft, top: cardTop});
            build(card, block, spot, cardLeft, cardTop);
            gsap.set(blind.slats, {rotationX: 0});
            shade(blind.slats);
            gsap.set(card, {autoAlpha: 1});
        }

        // turning over, one after another; towards the trigger, so the picture's top comes first
        return gsap.to(blind.slats, {
            rotationX: card.dataset.side === 'top' ? 180 : -180,
            duration: reducedMotion ? 0 : settings.turnDuration,
            stagger: reducedMotion ? 0 : settings.stagger,
            ease: 'power2.inOut',
            onUpdate: () => shade(blind.slats),
        });
    },
    close(card) {
        const blind = blinds.get(card);
        return closing(
            card,
            gsap
                .timeline({onUpdate: () => shade(blind.slats)})
                .to(blind.slats, {
                    rotationX: 0,
                    duration: reducedMotion ? 0 : settings.closeDuration,
                    stagger: reducedMotion ? 0 : settings.stagger * 0.5,
                    ease: 'power2.inOut',
                })
                .set(card, {autoAlpha: 0}),
        );
    },
};
