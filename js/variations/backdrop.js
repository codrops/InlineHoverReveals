// 01 Backdrop: the card's figure, set huge and faint, sweeps in from the right
// on the word's line and keeps drifting slowly to the left, while a small
// caption comes in beside the paragraph on the same line, its title and then
// each line of its text rising into view, one after another, as the rest of
// the paragraph dims back. Closing, the figure speeds off to the left and
// fades, the caption fades and the paragraph comes back.
//
// Each card names its figure in data-figure; setup() sets the figures in a
// layer behind the section's text. The caption is the card's label and text,
// split into lines (SplitText), each in a mask, as they wrap where the
// caption goes. Where there's no room beside the paragraph (phones), the
// caption goes over the word, on a dark backing. The paragraph dims by its
// colour (--paragraph, css/variations/backdrop.css), so its open trigger can
// stay at full (lit: --lit and --line on the trigger).

import {isHidden, linesFor, oneTweenEach, reducedMotion} from '../hoverCards.js';

const settings = {
    // where the figure enters from and where its drift ends, from its place at
    // the section's right, as fractions of the page's width
    from: 0.2,
    to: -0.04,
    // the whole sweep and drift, in seconds: fast at first, then slower and slower
    driftDuration: 3,
    fadeDuration: 0.5,
    // closing: how much further left it goes as it fades, also a fraction of the width
    leave: -0.1,
    closeDuration: 0.5,
    // the caption: how long after the figure it starts; its lines rising, each taking this long,
    // this long after the one before, in seconds; and how long it takes to fade on closing
    captionAt: 0.1,
    lineDuration: 0.7,
    stagger: 0.06,
    captionCloseDuration: 0.25,
    // the paragraph while a caption is open: how much of it shows (1 for all of it; the open
    // trigger always shows in full), and how long it takes to dim and to come back; and how long
    // a trigger takes to light up as it opens, or to dim with the rest going straight to another
    dim: 0.4,
    dimDuration: 0.5,
    lightDuration: 0.3,
};

// each card's figure, and its caption's lines
const figures = new WeakMap();
const captions = new WeakMap();
// the card open in each section, if any, each section's dimming and each trigger's light
const readers = new WeakMap();
const dims = oneTweenEach();
const lights = oneTweenEach();

// The paragraph dimming to how much of it shows, 0 to 1, after delay seconds
const dimTo = (section, value, delay = 0) =>
    dims(section, () =>
        gsap.to(section, {
            '--paragraph': value,
            'duration': reducedMotion ? 0 : settings.dimDuration,
            'delay': reducedMotion ? 0 : delay,
            'ease': 'power2.out',
        }),
    );

// A trigger lighting up as its card opens, from what it shows now (so it never dips as the
// paragraph dims), its underline coming up to its colour
const lightUp = (term, section) => {
    const lit = parseFloat(gsap.getProperty(term, '--lit')) || 0;
    const paragraph = parseFloat(gsap.getProperty(section, '--paragraph'));
    lights(term, () => {
        gsap.set(term, {'--lit': Math.max(lit, paragraph)});
        return gsap.to(term, {
            '--lit': 1,
            '--line': 1,
            'duration': reducedMotion ? 0 : settings.lightDuration,
            'ease': 'power2.out',
        });
    });
};

// And going out. Going straight to another trigger, it dims with the rest at once, its underline
// with it; else its underline goes back as the paragraph comes back, at the same time and pace,
// and its light stays on until the paragraph is back, so it never dips
const lightDown = (term, switching) =>
    lights(term, () => {
        const {captionCloseDuration: wait, dimDuration, lightDuration} = settings;
        if (reducedMotion) return gsap.set(term, {'--line': 0, '--lit': 0});
        if (switching) return gsap.to(term, {'--line': 0, '--lit': 0, 'duration': lightDuration, 'ease': 'power2.out'});
        return gsap
            .timeline()
            .to(term, {'--line': 0, 'duration': dimDuration, 'ease': 'power2.out'}, wait)
            .set(term, {'--lit': 0}, wait + dimDuration);
    });

export const backdrop = {
    setup(section) {
        const layer = document.createElement('div');
        layer.className = 'backdrop';
        layer.setAttribute('aria-hidden', 'true');
        section.prepend(layer);
        gsap.set(section, {'--paragraph': 1});
        gsap.set(section.querySelectorAll('.term'), {'--lit': 0, '--line': 0});
        section.querySelectorAll('.card[data-figure]').forEach(card => {
            const figure = document.createElement('span');
            figure.className = 'backdrop__figure';
            figure.textContent = card.dataset.figure;
            layer.append(figure);
            figures.set(card, figure);
            captions.set(card, {split: null, key: null});
        });
    },
    // the caption beside the paragraph, on the word's line
    place: 'beside',
    open(card, {term, section}) {
        const figure = figures.get(card);
        // centred on the word's line
        const word = term.getBoundingClientRect();
        const top = word.top + word.height / 2 - section.getBoundingClientRect().top - figure.offsetHeight / 2;
        const {captionAt, lineDuration, stagger} = settings;
        readers.set(section, card);
        dimTo(section, settings.dim);
        lightUp(term, section);

        if (isHidden(figure)) gsap.set(figure, {top, x: settings.from * window.innerWidth});
        const tl = gsap
            .timeline()
            .to(figure, {x: settings.to * window.innerWidth, duration: settings.driftDuration, ease: 'expo.out'}, 0)
            .to(figure, {autoAlpha: 1, duration: settings.fadeDuration, ease: 'expo.out'}, 0);

        // caught fading, the caption comes straight back
        if (!isHidden(card)) {
            const {lines} = captions.get(card).split;
            return tl.to(card, {autoAlpha: 1, duration: 0.2}, 0).to(lines, {yPercent: 0, duration: 0.3}, 0);
        }

        // split as it wraps where it goes now (beside the paragraph, or over the word on a phone), and
        // its lines rising out of their masks: the title, then the text, line by line
        const lines = linesFor(
            captions.get(card),
            card.querySelectorAll('.card__label, .card__text'),
            [window.innerWidth, card.dataset.side].join(),
        );
        gsap.set(lines, {yPercent: 110});
        return tl
            .to(card, {autoAlpha: 1, duration: 0.25, ease: 'expo.out'}, captionAt)
            .to(lines, {yPercent: 0, duration: lineDuration, ease: 'expo.out', stagger}, captionAt);
    },
    close(card, {term, section}) {
        const figure = figures.get(card);
        // the paragraph comes back once the caption has faded, the trigger staying lit until it's
        // back, unless another trigger opens straight after (in the same moment), or before then, on
        // the way to it; going straight to another, the trigger dims with the rest
        if (readers.get(section) === card) readers.delete(section);
        queueMicrotask(() => {
            if (readers.has(section)) {
                lightDown(term, true);
                return;
            }
            dimTo(section, 1, settings.captionCloseDuration);
            lightDown(term, false);
        });
        return gsap
            .timeline({defaults: {duration: settings.closeDuration, ease: 'expo.out'}})
            .to(figure, {x: `+=${settings.leave * window.innerWidth}`, autoAlpha: 0}, 0)
            .to(card, {autoAlpha: 0, duration: settings.captionCloseDuration}, 0);
    },
};
