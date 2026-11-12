// 03 Orbit: the pictures come out of the trigger one after another and form a
// ring around it that turns without end, a 3D carousel seen from slightly
// above: the pictures behind pass above the word, smaller and darker, the
// ones in front pass below it, larger and lit. It whirls in fast and slows to
// a steady turn; leaving, it speeds up again as the pictures fly back into
// the word.
//
// Each card lists its pictures in data-pictures, separated by spaces; its
// label and text are for screen readers only. setup() builds the ring: a
// stage with perspective, a tilt, the ring that GSAP turns, and a slot per
// picture turned to its place round it, holding the picture, which flies out
// from the centre (z). Each picture shows the photo on both faces, so none
// goes blank as it turns away; fades are on the faces, so the 3D never
// flattens.

import {isHidden, reducedMotion, urlOf} from '../hoverCards.js';

const settings = {
    // how far the ring is tipped towards the viewer, in degrees: the more, the more it's seen from above
    tilt: 28,
    // the ring's radius: half the trigger's width plus this many picture widths, so the
    // pictures clear the word as they pass its ends, and never less than min, in px
    clearance: 0.2,
    min: 130,
    // one turn of the ring, in seconds, once it has settled
    turn: 14,
    // how many times faster it turns as it whirls in and out
    whirl: 4,
    // the pictures flying out: how long each takes, and the time between them, in seconds
    flyDuration: 0.8,
    stagger: 0.08,
    // how long the ring takes to slow to its steady turn
    settleDuration: 1.6,
    // how dark a picture gets as it turns its back to the viewer (0 for not at all)
    shade: 0.1,
    // leaving
    closeDuration: 0.4,
};

// each card's ring: {stage, ring, items, angles, radius, spin, shading}: the stage, the ring that
// turns, its pictures and their angles round it, its radius, its endless turn while it's open, and
// the shading of the pictures, run on every frame while it turns
const rings = new WeakMap();

// each picture's two faces, front and back
const facesOf = state => state.items.map(item => [...item.children]);

export const orbit = {
    // centred on the trigger, around it
    place: 'around',
    setup(section) {
        section.querySelectorAll('.card[data-pictures]').forEach(card => {
            const stage = document.createElement('div');
            stage.className = 'orbit';
            stage.setAttribute('aria-hidden', 'true');
            stage.style.setProperty('--tilt', `${settings.tilt}deg`);
            const tilt = document.createElement('div');
            tilt.className = 'orbit__tilt';
            const ring = document.createElement('div');
            ring.className = 'orbit__ring';

            const sources = card.dataset.pictures.trim().split(/\s+/);
            const angles = sources.map((src, i) => (360 * i) / sources.length);
            const items = sources.map((src, i) => {
                const slot = document.createElement('div');
                slot.className = 'orbit__slot';
                slot.style.transform = `rotateY(${angles[i]}deg)`;
                const item = document.createElement('div');
                item.className = 'orbit__item';
                // absolute, since a url() in a custom property resolves against the stylesheet using it
                item.style.setProperty('--picture', `url(${urlOf(src)})`);
                ['front', 'back'].forEach(side => {
                    const face = document.createElement('div');
                    face.className = `orbit__face orbit__face--${side}`;
                    item.append(face);
                });
                slot.append(item);
                ring.append(slot);
                return item;
            });

            tilt.append(ring);
            stage.append(tilt);
            card.prepend(stage);

            const state = {stage, ring, items, angles, radius: settings.min, spin: null, shading: null};
            // each picture darkens as it turns its back to the viewer
            state.shading = () => {
                const turned = gsap.getProperty(ring, 'rotationY');
                items.forEach((item, i) => {
                    const facing = Math.cos(((angles[i] + turned) * Math.PI) / 180);
                    item.style.setProperty('--shade', ((1 - facing) / 2) * settings.shade);
                });
            };
            rings.set(card, state);
        });
    },
    // the ring as wide as the trigger needs, and the stage sized to hold it
    prepare(card, {term}) {
        const state = rings.get(card);
        const width = state.items[0].offsetWidth;
        const height = state.items[0].offsetHeight;
        state.radius = Math.max(settings.min, term.offsetWidth / 2 + settings.clearance * width);
        const reach = state.radius * Math.sin((settings.tilt * Math.PI) / 180);
        state.stage.style.width = `${2 * state.radius + width * 1.4}px`;
        state.stage.style.height = `${2 * reach + height * 1.6}px`;
    },
    open(card) {
        const state = rings.get(card);
        const faces = facesOf(state);
        const tl = gsap.timeline();

        if (!state.spin) {
            state.spin = gsap.to(state.ring, {rotationY: '-=360', duration: settings.turn, ease: 'none', repeat: -1});
            if (reducedMotion) state.spin.pause();
            gsap.ticker.add(state.shading);
        }

        // caught while leaving, it comes straight back
        if (!isHidden(card)) {
            return tl
                .to(state.items, {z: state.radius, scale: 1, duration: 0.3, ease: 'power2.out'}, 0)
                .to(faces.flat(), {opacity: 1, duration: 0.2}, 0)
                .to(state.spin, {timeScale: 1, duration: 0.4}, 0);
        }

        gsap.set(card, {autoAlpha: 1});
        gsap.set(state.items, {z: 0, scale: 0.3});
        gsap.set(faces.flat(), {opacity: 0});
        state.spin.timeScale(settings.whirl);
        return (
            tl
                .to(
                    state.items,
                    {
                        z: state.radius,
                        scale: 1,
                        duration: settings.flyDuration,
                        ease: 'power3.out',
                        stagger: settings.stagger,
                    },
                    0,
                )
                // two faces a picture, both in at once
                .to(faces.flat(), {opacity: 1, duration: 0.25, stagger: i => Math.floor(i / 2) * settings.stagger}, 0)
                .to(state.spin, {timeScale: 1, duration: settings.settleDuration, ease: 'power2.out'}, 0)
        );
    },
    close(card) {
        const state = rings.get(card);
        return gsap
            .timeline()
            .to(state.spin, {timeScale: settings.whirl, duration: settings.closeDuration, ease: 'power2.in'}, 0)
            .to(
                state.items,
                {
                    z: 0,
                    scale: 0.3,
                    duration: settings.closeDuration,
                    ease: 'power2.in',
                    stagger: {each: settings.stagger / 3, from: 'end'},
                },
                0,
            )
            .to(facesOf(state).flat(), {opacity: 0, duration: 0.2}, settings.closeDuration * 0.6)
            .call(() => {
                state.spin.kill();
                state.spin = null;
                gsap.ticker.remove(state.shading);
                gsap.set(state.ring, {rotationY: 0});
            })
            .set(card, {autoAlpha: 0});
    },
};
