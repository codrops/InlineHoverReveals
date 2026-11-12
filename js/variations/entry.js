// 05 Entry: the trigger itself lifts out of the paragraph. As the rest of the
// text fades and blurs, the trigger's words rise one after another out of
// their line and become the card's title, and a smaller description follows
// right under it, line by line, in the paragraph's own column, centred on the
// trigger's line and kept inside the page. Leaving, the description drops
// away, the words fall back into their places and the paragraph comes back
// into focus.
//
// The card's label is its title: the trigger's own words, in the trigger's
// grey. Its text is the description. SplitText splits the trigger and the
// title into words, and the description into lines at the card's width, each
// in a mask. As the card opens, each title word is moved onto its trigger
// word, which hides (opacity, so the pointer still finds it), so the word that
// rises is the one that was there. A word always leaves and lands looking like the paragraph
// at that moment: going straight from one trigger to another, the paragraph
// stays faded, so the old trigger's words fade and blur as they fall back in,
// and the new one's sharpen as they rise out.

import {isHidden, linesFor} from '../hoverCards.js';

const settings = {
    // (how faint and blurred the rest of the text gets is --fade and --blur in css/variations/entry.css)
    // the words rising, then the description's lines, one after another at the same pace:
    // how long each takes, and the time between them, in seconds
    riseDuration: 0.9,
    lineDuration: 0.8,
    stagger: 0.07,
    // leaving: the words falling back, the description dropping away and the paragraph coming back
    // into focus, all at once and in the same time (the paragraph's CSS transition takes it from here)
    fallDuration: 0.5,
};

// each card's title words, description lines and trigger words
const splits = new WeakMap();

// the card open in each block, if any
const readers = new WeakMap();

// From each title word's resting place to its trigger word's, in px, wherever the word is now
const offsets = (words, triggerWords) =>
    words.map((word, i) => {
        const from = triggerWords[i].getBoundingClientRect();
        const now = word.getBoundingClientRect();
        return {
            x: from.left - (now.left - gsap.getProperty(word, 'x')),
            y: from.top - (now.top - gsap.getProperty(word, 'y')),
        };
    });

// How the paragraph looks right now, faded or not, or part way: a title word
// leaving it or landing in it looks the same, so nothing jumps at the hand-over
const lookOf = statement => {
    const style = getComputedStyle(statement);
    return {opacity: parseFloat(style.opacity), filter: style.filter === 'none' ? 'blur(0px)' : style.filter};
};

// How the paragraph looks while a card is open
const fadedLook = section => {
    const style = getComputedStyle(section);
    return {
        opacity: parseFloat(style.getPropertyValue('--fade')),
        filter: `blur(${style.getPropertyValue('--blur').trim()})`,
    };
};

export const entry = {
    // centred on the trigger's line and kept inside the page, at the paragraph's left edge
    place: 'over',
    // open while the pointer is over the trigger or the card, the title and description
    hold: true,
    // the card is as wide as its title or its description, whichever is wider, never wider than the
    // paragraph; the description is split into lines again whenever the paragraph's width changes,
    // so every line rises on its own
    prepare(card, {term}) {
        const state = splits.get(card);
        const width = term.closest('.block').offsetWidth;
        card.style.maxWidth = `${width}px`;
        state.lines = linesFor(state, card.querySelector('.card__text'), width);
    },
    setup(section) {
        section.style.setProperty('--fall-duration', `${settings.fallDuration}s`);
        section.querySelectorAll('.term').forEach(term => {
            const card = document.getElementById(term.getAttribute('aria-describedby'));
            const label = card.querySelector('.card__label');
            // the title is the trigger's own words
            label.textContent = term.textContent.trim();
            // the description is split into lines in prepare(), once the card has its width
            splits.set(card, {
                triggerWords: SplitText.create(term, {type: 'words', aria: 'none'}).words,
                words: SplitText.create(label, {type: 'words'}).words,
                lines: [],
            });
        });
    },
    open(card, {term, block}) {
        const {triggerWords, words, lines} = splits.get(card);
        // in the paragraph's own column
        gsap.set(card, {left: 0});

        // the words leave the paragraph looking as it does now: still faded when coming
        // straight from another trigger, as the class that fades it hasn't come off yet
        const leaving = lookOf(block.querySelector('.statement'));

        // the rest of the text fades and blurs (css)
        readers.set(block, card);
        block.classList.add('is-reading');
        const tl = gsap.timeline();

        // caught while leaving, it comes straight back
        if (!isHidden(card)) {
            return tl
                .set(triggerWords, {opacity: 0}, 0)
                .to(words, {x: 0, y: 0, opacity: 1, filter: 'blur(0px)', duration: 0.3, ease: 'power2.out'}, 0)
                .to(lines, {yPercent: 0, duration: 0.3, ease: 'power2.out'}, 0);
        }

        // each title word starts on its trigger word, looking like it, which hides as it takes its place
        gsap.set(card, {autoAlpha: 1});
        gsap.set(words, {x: 0, y: 0});
        const from = offsets(words, triggerWords);
        gsap.set(words, {x: i => from[i].x, y: i => from[i].y, ...leaving});
        gsap.set(triggerWords, {opacity: 0});
        gsap.set(lines, {yPercent: 110});
        return tl
            .to(
                words,
                {
                    x: 0,
                    y: 0,
                    opacity: 1,
                    filter: 'blur(0px)',
                    duration: settings.riseDuration,
                    ease: 'expo.out',
                    stagger: settings.stagger,
                },
                0,
            )
            .to(
                lines,
                {yPercent: 0, duration: settings.lineDuration, ease: 'expo.out', stagger: settings.stagger},
                // the description's first line one step after the last word
                words.length * settings.stagger,
            );
    },
    close(card, {block, section}) {
        const {triggerWords, words, lines} = splits.get(card);
        const back = offsets(words, triggerWords);
        if (readers.get(block) === card) readers.delete(block);
        // the paragraph comes back into focus, unless another trigger opens straight after (in the same moment)
        queueMicrotask(() => {
            if (!readers.has(block)) block.classList.remove('is-reading');
        });
        // the words land looking like the paragraph will: faded if another trigger has opened by the
        // time they start (these values are read then), in focus if not
        const landing = () => (readers.has(block) ? fadedLook(section) : {opacity: 1, filter: 'blur(0px)'});
        return (
            gsap
                .timeline()
                .to(lines, {yPercent: 110, duration: settings.fallDuration, ease: 'power3.inOut'}, 0)
                .to(
                    words,
                    {
                        x: i => back[i].x,
                        y: i => back[i].y,
                        opacity: () => landing().opacity,
                        filter: () => landing().filter,
                        duration: settings.fallDuration,
                        ease: 'power3.inOut',
                    },
                    0,
                )
                // back in their places, the trigger's own words take over again
                .set(triggerWords, {opacity: 1}, settings.fallDuration)
                .set(card, {autoAlpha: 0})
        );
    },
};
