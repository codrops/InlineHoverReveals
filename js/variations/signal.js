// 06 Signal: a note opens right at its trigger, just under the trigger's line
// (above it when there's no room below; kept in view like any tooltip), in
// the page's colours inverted: dark on a block of the page's light, as many
// whole lines of the paragraph tall as it needs, starting where the trigger
// starts. It tunes in out of static like a station on the radio: a few dark
// specks appear, crowd into the shapes of its letters and resolve into the
// letters, from left to right, then hand over to the page's own text. Under
// the block, the paragraph clears its lines, fading them away behind soft side
// edges. Leaving, the note breaks back up into static, the block fades and the
// paragraph comes back. Going from one trigger to the next, one note breaks up
// as the next tunes in, like turning the dial, and the block moves straight
// over to the new one.
//
// The card's text is the note. The static is drawn in WebGL by
// js/gl/signalText.js, over the note; without WebGL the note simply fades in.
// The block and the clearing (a mask on the paragraph) are in
// css/variations/signal.css, placed by the custom properties set here.

import {bounds, isHidden, oneTweenEach, pageMargin} from '../hoverCards.js';
import {SignalText} from '../gl/signalText.js';

const settings = {
    // tuning in: how long the note takes to come out of the static, in seconds
    tuneDuration: 1.1,
    // leaving: breaking back up into static
    closeDuration: 0.45,
    // the block: its room round the note, across, in px, and at least this much above and below it
    // (it's whole lines of the paragraph tall, the note centred in it)
    padding: 20,
    room: 12,
    // the block and the clearing under it (its soft edges are in css/variations/signal.css): how
    // long they take to come and to go, and how long they take to move to the next note (quick, so
    // they're in place before the next note's letters form)
    clearDuration: 0.5,
    moveDuration: 0.2,
    // going straight to another trigger, how many times faster the last note breaks up
    handOver: 2.5,
};

// each card's note: {text, parts, width}
const notes = new WeakMap();
// each block's light block, for the note
const patches = new WeakMap();
// the card whose note is open in each block, if any, the last note breaking up in it, and the
// clearing's tween
const readers = new WeakMap();
const leaving = new WeakMap();
const clearings = oneTweenEach();

// Tweens the block and the paragraph's clearing (the same custom properties on both)
const clearTo = (block, vars) =>
    clearings(block, () => gsap.to([block.querySelector('.statement'), patches.get(block)], vars));

// Like any tooltip, kept in view: under the trigger's line if it fits there, else above it,
// else on whichever side has more room; down, between the bar of numbers (once it shows) or
// the section's top and the screen's or the section's bottom. The block is whole lines of the
// paragraph, so no line shows half under it, the note centred in it; across, it starts where the
// trigger starts, inside the paragraph and the screen's margins. Returns the block, in the
// paragraph's own coordinates.
const placeNote = (card, term, block, section) => {
    const root = document.documentElement;
    const margin = pageMargin();
    const statement = block.querySelector('.statement');
    const line = parseFloat(getComputedStyle(statement).lineHeight);
    const word = term.getBoundingClientRect();
    const box = block.getBoundingClientRect();
    const text = statement.getBoundingClientRect();
    const {roof, floor} = bounds(section);
    const {offsetWidth: width, offsetHeight: height} = card;
    const {padding, room} = settings;

    // the trigger's first and last lines (its box reaches a little past its lines), and the
    // block's height in whole lines
    const first = Math.floor((word.top - text.top) / line + 0.5);
    const last = Math.floor((word.bottom - text.top) / line - 0.5);
    const tall = Math.ceil((height + 2 * room) / line) * line;
    const below = floor - (text.top + (last + 1) * line);
    const above = text.top + first * line - roof;
    const side = below >= tall || (above < tall && below >= above) ? 'bottom' : 'top';
    const top = side === 'bottom' ? (last + 1) * line : first * line - tall;

    const wide = width + 2 * padding;
    const start = Math.max(text.left, margin);
    const end = Math.max(start, Math.min(text.right, root.clientWidth - margin) - wide);
    const left = gsap.utils.clamp(start, end, word.left) - text.left;

    gsap.set(card, {
        left: text.left - box.left + left + padding,
        top: text.top - box.top + top + (tall - height) / 2,
    });
    card.dataset.side = side;
    return {
        '--clear-l': `${left}px`,
        '--clear-r': `${left + wide}px`,
        '--clear-t': `${top}px`,
        '--clear-b': `${top + tall}px`,
    };
};

// Draws the note for the paragraph's width, unless it's drawn for it already
const draw = (card, block) => {
    const note = notes.get(card);
    const width = block.offsetWidth;
    if (note.width === width) return;
    note.width = width;
    card.style.maxWidth = `${width - 2 * settings.padding}px`;
    if (note.text.works) note.text.draw();
};

export const signal = {
    setup(section) {
        const block = section.querySelector('.block');
        const patch = document.createElement('div');
        patch.className = 'signal-patch';
        patch.setAttribute('aria-hidden', 'true');
        block.append(patch);
        patches.set(block, patch);
        section.querySelectorAll('.card').forEach(card => {
            const parts = [card.querySelector('.card__text')];
            notes.set(card, {text: new SignalText(card, parts), parts, width: 0});
            // drawn ahead, in the page's idle moments, so the first hover doesn't wait for it
            const idle = window.requestIdleCallback ?? (callback => setTimeout(callback, 200));
            idle(() => draw(card, block));
        });
    },
    // drawn again whenever the paragraph's width changes, as the note may wrap differently
    prepare(card, {block}) {
        draw(card, block);
    },
    open(card, {term, block, section}) {
        const {text, parts} = notes.get(card);
        const clearing = placeNote(card, term, block, section);

        // the block and the clearing: move over quickly from another note still open in the
        // paragraph, fully there, while that note breaks up faster; or come where they are
        const statement = block.querySelector('.statement');
        const patch = patches.get(block);
        gsap.set(patch, {left: statement.offsetLeft, top: statement.offsetTop});
        if (statement.classList.contains('has-note')) {
            clearTo(block, {...clearing, '--clear': 1, 'duration': settings.moveDuration, 'ease': 'power2.out'});
            leaving.get(block)?.timeScale(settings.handOver);
        } else {
            gsap.set([statement, patch], {...clearing, '--clear': 0});
            statement.classList.add('has-note');
            clearTo(block, {'--clear': 1, 'duration': settings.clearDuration, 'ease': 'power2.out'});
        }
        readers.set(block, card);

        if (!text.works) {
            gsap.set(card, {autoAlpha: 1});
            return gsap.to(parts, {opacity: 1, duration: 0.4});
        }

        // from nothing, or from where it was caught breaking up
        if (isHidden(card)) {
            gsap.set(card, {autoAlpha: 1});
            text.signal = 0;
        }
        gsap.set(parts, {opacity: 0});
        gsap.set(text.canvas, {opacity: 1});
        text.start();
        return (
            gsap
                .timeline()
                .to(text, {signal: 1, duration: settings.tuneDuration * (1 - text.signal), ease: 'power1.inOut'})
                // the page's text takes over from the drawing in the same frame: they match letter
                // for letter, so the swap doesn't show, and nothing overlaps to brighten or dim
                .set(parts, {opacity: 1})
                .set(text.canvas, {opacity: 0})
                .call(() => text.stop())
        );
    },
    close(card, {block}) {
        const {text, parts} = notes.get(card);

        // the block goes and the paragraph comes back, unless another trigger opens straight after
        // (in the same moment)
        if (readers.get(block) === card) readers.delete(block);
        queueMicrotask(() => {
            if (readers.has(block)) return;
            const statement = block.querySelector('.statement');
            clearTo(block, {
                '--clear': 0,
                'duration': settings.closeDuration,
                'ease': 'power1.in',
                'onComplete': () => statement.classList.remove('has-note'),
            });
        });

        if (!text.works) {
            return gsap.timeline().to(parts, {opacity: 0, duration: 0.3}).set(card, {autoAlpha: 0});
        }
        gsap.set(parts, {opacity: 0});
        gsap.set(text.canvas, {opacity: 1});
        text.start();
        const tl = gsap
            .timeline()
            .to(text, {signal: 0, duration: settings.closeDuration, ease: 'power1.out'})
            .call(() => text.stop())
            .set(card, {autoAlpha: 0});
        leaving.set(block, tl);
        return tl;
    },
};
