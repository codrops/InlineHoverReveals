// 04 Filmstrip: the trigger's pictures run as a strip of film across the
// whole width of the page, on the trigger's line, behind the paragraph, bent
// round a large drum like film round a projector's sprocket wheel. The strip
// opens from a line through its middle up and down to its full height, and
// its roll starts fast and slows to a steady pace that goes on without end,
// like a projector running up to speed. As it opens, the wear of old film runs
// over it (grain, scratches, dust, flicker) and settles to a trace while it
// rolls; leaving, the wear comes back as it closes to that line. The frames
// are dimmed, so the text over them stays readable. With reduced motion the
// strip doesn't roll and has no wear.
//
// Each card lists its frames in data-pictures, separated by spaces; its label
// and text are for screen readers only, and the card itself never shows.
// setup() builds a strip per card in a layer behind the section's text. The
// strip is drawn in WebGL by js/gl/filmStrip.js; without WebGL it's a flat
// row of the frames, repeated so its roll never shows an end. Either way, one
// view drives it: how far it has opened, how far the film has run and how
// much wear shows.

import {isHidden, reducedMotion, urlOf} from '../hoverCards.js';
import {FilmStrip} from '../gl/filmStrip.js';

const settings = {
    // the strip's steady roll, in px per second
    speed: 50,
    // opening from the line through its middle, in seconds
    openDuration: 1.4,
    // how many times faster the roll runs as the strip opens, slowing to its steady pace
    spinUp: 4,
    // closing back to that line
    closeDuration: 0.5,
    // the wear of old film: full as it opens and closes, then settling to this much while it
    // rolls (0 for none), over this long, in seconds
    settle: 0.2,
    settleDuration: 2,
    // without WebGL: how many times the frames repeat along the flat strip
    repeats: 4,
};

const wearFull = reducedMotion ? 0 : 1;
const wearSettled = reducedMotion ? 0 : settings.settle;

// each card's strip: {band, track, film, count, view, roll, draw}
const strips = new WeakMap();

// Draws the strip as its view says
const drawer = state => () => {
    const {band, track, film, view} = state;
    if (film.works) {
        film.render(view);
        return;
    }
    const hidden = `${((1 - view.reveal) * 50).toFixed(3)}%`;
    band.style.clipPath = `inset(${hidden} 0px ${hidden} 0px)`;
    gsap.set(track, {x: -view.offset});
};

export const filmstrip = {
    setup(section) {
        const layer = document.createElement('div');
        layer.className = 'filmstrip';
        layer.setAttribute('aria-hidden', 'true');
        section.prepend(layer);
        section.querySelectorAll('.card[data-pictures]').forEach(card => {
            const band = document.createElement('div');
            band.className = 'filmstrip__band';
            const sources = card.dataset.pictures.trim().split(/\s+/).map(urlOf);
            layer.append(band);

            // drawn in WebGL, or else a flat row of the frames
            const film = new FilmStrip(band, sources);
            const track = document.createElement('div');
            track.className = 'filmstrip__track';
            if (!film.works) {
                for (let i = 0; i < settings.repeats; i++) {
                    sources.forEach(src => {
                        const frame = document.createElement('div');
                        frame.className = 'filmstrip__frame';
                        frame.style.backgroundImage = `url(${src})`;
                        track.append(frame);
                    });
                }
                band.append(track);
            }

            const state = {band, track, film, count: sources.length, view: {reveal: 0, offset: 0, wear: 0}, roll: null};
            state.draw = drawer(state);
            strips.set(card, state);
        });
    },
    open(card, {term, section}) {
        const state = strips.get(card);
        const {band, film, view} = state;

        // the roll runs the film through one round of its frames, then starts again from where it began
        if (!state.roll) {
            if (film.works) film.resize();
            const loop = film.works
                ? film.loop
                : state.track.children[state.count].offsetLeft - state.track.children[0].offsetLeft;
            state.roll = gsap.fromTo(
                view,
                {offset: 0},
                {offset: loop, duration: loop / settings.speed, ease: 'none', repeat: -1},
            );
            // still, for visitors who prefer reduced motion
            if (reducedMotion) state.roll.pause();
            gsap.ticker.add(state.draw);
        }

        // caught while closing, it opens straight back out
        if (!isHidden(band)) {
            return gsap
                .timeline()
                .to(view, {reveal: 1, wear: wearSettled, duration: 0.5, ease: 'power2.out', overwrite: 'auto'}, 0)
                .to(state.roll, {timeScale: 1, duration: 0.5}, 0);
        }

        // centred on the trigger's line, shut to the line through its middle
        const word = term.getBoundingClientRect();
        const top = word.top + word.height / 2 - section.getBoundingClientRect().top - band.offsetHeight / 2;
        gsap.set(band, {top, autoAlpha: 1});
        view.reveal = 0;
        state.roll.timeScale(settings.spinUp);
        return gsap
            .timeline()
            .to(view, {reveal: 1, duration: settings.openDuration, ease: 'expo.out', overwrite: 'auto'}, 0)
            .to(state.roll, {timeScale: 1, duration: settings.openDuration, ease: 'power2.out'}, 0)
            .fromTo(
                view,
                {wear: wearFull},
                {wear: wearSettled, duration: settings.settleDuration, ease: 'power2.out', overwrite: 'auto'},
                0,
            );
    },
    close(card) {
        const state = strips.get(card);
        const {view} = state;
        return gsap
            .timeline()
            .to(view, {reveal: 0, duration: settings.closeDuration, ease: 'power3.in', overwrite: 'auto'}, 0)
            .to(view, {wear: wearFull, duration: settings.closeDuration, ease: 'power2.in', overwrite: 'auto'}, 0)
            .to(state.roll, {timeScale: settings.spinUp, duration: settings.closeDuration, ease: 'power2.in'}, 0)
            .set(state.band, {autoAlpha: 0})
            .call(() => {
                state.roll.kill();
                state.roll = null;
                view.offset = 0;
                state.draw();
                gsap.ticker.remove(state.draw);
            });
    },
};
