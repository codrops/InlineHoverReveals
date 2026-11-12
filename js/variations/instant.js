// 09 Instant: the trigger takes a picture, like an instant camera. A flash
// goes off at it, and the trigger's underline is the camera's slot: the photo,
// exactly as wide as the line, is pushed out of it, downwards, in one steady
// push of the camera's motor (when there's no room below, upwards: out of the
// line, over the trigger, coming to rest above it). The line is the photo's
// leading edge, so it goes as the photo starts coming out. Out, the photo
// drops free, tilting a little, and develops on the page: a blank, milky
// blue-grey at first, the picture rising out of it highlights first, faint and
// cold, then coming into its colour. Leaving, the photo falls away and the
// line fills back in, left to right.
//
// Each card names its picture in data-picture; its text is for screen
// readers. The photo develops in WebGL (js/gl/instantPhoto.js); without
// WebGL the murk simply fades off the picture. The flash is a light of the
// paragraph's own, over its text (css/variations/instant.css).

import {isHidden, oneTweenEach, reducedMotion, urlOf} from '../hoverCards.js';
import {InstantPhoto} from '../gl/instantPhoto.js';

const settings = {
    // the flash: how bright it goes off, and how long it takes to fade
    flash: 0.9,
    flashDuration: 0.45,
    // the underline: where it is, as a part of the text's size, up from the trigger's foot (as in
    // css/variations/instant.css), and how long it takes to fill back in, left to right, as the
    // photo falls away, in seconds
    lineFoot: 0.12,
    lineThickness: 0.05,
    lineDuration: 0.3,
    // a photo going up: how far above the trigger it comes to rest, in px
    above: 6,
    // the print is exactly as wide as its trigger, the underline its edge; its border, at the sides
    // and at the foot, as a part of that width
    border: 0.05,
    foot: 0.2,
    // the photo coming out: how long the camera's motor takes to push it out, in seconds, at an
    // even speed; and as it drops free, how far it drops, in px, and how much it tilts, at most,
    // in degrees
    ejectDuration: 1,
    drop: 6,
    tilt: 3,
    // developing, from the moment it starts coming out
    developDuration: 4,
    // leaving: how far it falls, in px, and how long it takes
    fall: 60,
    closeDuration: 0.4,
};

// each card's photo: {print, photo, tilt, rest}: the print (the photo in its frame), its
// picture, its tilt this time and where it rests
const photos = new WeakMap();
// each trigger's underline tween
const lines = oneTweenEach();

// The trigger's underline (css/variations/instant.css): how much of it shows, 0 to 1 (--line)
const lineTo = (term, vars) => lines(term, () => gsap.to(term, vars));
// each paragraph's flash
const flashes = new WeakMap();

// The flash at the trigger: on its own tween, so it always fades out, whatever the card does
const flashAt = (term, block) => {
    if (reducedMotion || !settings.flash) return;
    const flash = flashes.get(block);
    const word = term.getBoundingClientRect();
    const box = block.getBoundingClientRect();
    gsap.killTweensOf(flash);
    gsap.set(flash, {
        left: word.left - box.left + word.width / 2,
        top: word.top - box.top + word.height / 2,
        scale: 0.4,
        opacity: 0,
    });
    gsap.timeline()
        .to(flash, {opacity: settings.flash, scale: 1, duration: 0.05, ease: 'power2.out'})
        .to(flash, {opacity: 0, scale: 1.15, duration: settings.flashDuration, ease: 'power2.in'}, '+=0.06');
};

// The print as wide as its trigger, so the underline it comes out of is exactly its edge
const fit = (print, term) => {
    const width = Math.round(term.getBoundingClientRect().width);
    const side = Math.max(4, Math.round(width * settings.border));
    gsap.set(print, {width, padding: `${side}px ${side}px ${Math.round(width * settings.foot)}px`});
};

export const instant = {
    place: 'below',
    // sized before it's placed, for its trigger's width now
    prepare(card, {term}) {
        gsap.set(card, {paddingBottom: 0});
        fit(photos.get(card).print, term);
    },
    setup(section) {
        const block = section.querySelector('.block');
        const flash = document.createElement('div');
        flash.className = 'instant-flash';
        flash.setAttribute('aria-hidden', 'true');
        block.append(flash);
        flashes.set(block, flash);

        section.querySelectorAll('.card[data-picture]').forEach(card => {
            const print = document.createElement('div');
            print.className = 'instant';
            print.setAttribute('aria-hidden', 'true');
            const picture = document.createElement('div');
            picture.className = 'instant__picture';
            print.append(picture);
            card.prepend(print);
            const photo = new InstantPhoto(picture, urlOf(card.dataset.picture));
            photos.set(card, {print, photo, tilt: 0, rest: 0});
        });
    },
    open(card, {term, block, side}) {
        const state = photos.get(card);
        const {print, photo} = state;
        const develop = () =>
            gsap.to(photo, {
                develop: 1,
                duration: settings.developDuration * (1 - photo.develop),
                ease: 'power1.out',
                onUpdate: () => photo.render(),
            });
        flashAt(term, block);

        // caught falling away, it comes straight back and goes on developing, and the line, filling
        // back in, goes again; caught still in the slot (it was left before it was all out), the
        // motor first pushes it the rest of the way, at its own speed, before it drops free
        if (!isHidden(card)) {
            lineTo(term, {'--line': 0, 'duration': 0.15});
            const tl = gsap.timeline().add(develop(), 0).to(print, {autoAlpha: 1, duration: 0.2}, 0);
            if (!card.classList.contains('is-ejecting')) {
                return tl.to(print, {y: state.rest, rotation: state.tilt, duration: 0.3, ease: 'power2.out'}, 0);
            }
            const travel = (settings.ejectDuration * Math.abs(gsap.getProperty(print, 'y'))) / print.offsetHeight;
            return tl
                .to(print, {rotation: 0, duration: 0.2}, 0)
                .to(print, {y: 0, duration: travel, ease: 'none'}, 0)
                .call(() => card.classList.remove('is-ejecting'), null, travel)
                .to(print, {y: state.rest, rotation: state.tilt, duration: 0.5, ease: 'back.out(2)'}, travel);
        }

        // out of the slot, pushed down, or, where there's no room below, up; the edge that leaves the
        // slot first develops first
        const up = side === 'top';
        photo.topFirst = up;
        photo.resize();
        photo.develop = 0;
        photo.render();
        state.tilt = gsap.utils.random(-settings.tilt, settings.tilt);
        state.rest = up ? 0 : settings.drop;
        // the slot: the underline, at the trigger's foot, the card lined up with it, so the line is
        // the photo's leading edge. Going down, the card's top is the line's top, so the photo's foot
        // comes out exactly where the line was. Going up, the card's bottom is the line's bottom: it
        // reaches from just above the trigger down to the line (padding under the print), so the
        // photo comes out of the line, rises over the trigger and comes to rest above it
        const fontSize = parseFloat(getComputedStyle(term).fontSize);
        const word = term.getBoundingClientRect();
        const box = block.getBoundingClientRect();
        const lineBottom = word.bottom - settings.lineFoot * fontSize;
        const slot = up ? lineBottom : lineBottom - settings.lineThickness * fontSize;
        const height = print.offsetHeight;
        const climb = up ? slot - (word.top - settings.above) : 0;
        lineTo(term, {'--line': 1, 'duration': 0});
        gsap.set(card, {
            left: word.left - box.left,
            top: (up ? word.top - settings.above - height : slot) - box.top,
            paddingBottom: climb,
            autoAlpha: 1,
        });
        gsap.set(print, {
            yPercent: 0,
            y: up ? height + climb : -height,
            rotation: 0,
            autoAlpha: 1,
            transformOrigin: up ? '50% 100%' : '50% 0%',
        });
        card.classList.add('is-ejecting');

        // the motor pushes the print out of the line in one steady push, at an even speed (going
        // up, on over the trigger at the same speed); the line hands over to the print's edge as it
        // starts, so the line seems to move with it, as its edge
        const {ejectDuration} = settings;
        const travel = ejectDuration * ((height + climb) / height);
        return gsap
            .timeline()
            .call(() => lineTo(term, {'--line': 0, 'duration': 0}), null, 0.05)
            .to(print, {y: 0, duration: travel, ease: 'none'}, 0.05)
            .call(() => card.classList.remove('is-ejecting'), null, 0.05 + travel)
            .to(print, {y: state.rest, rotation: state.tilt, duration: 0.5, ease: 'back.out(2)'}, 0.05 + travel)
            .add(develop(), 0.05);
    },
    close(card, {term}) {
        const state = photos.get(card);
        const {print, photo} = state;
        // the underline back at the trigger's foot, filling in left to right (unless it never went)
        const line = Number(getComputedStyle(term).getPropertyValue('--line'));
        if (line < 1) {
            gsap.set(term, {'--line': 0});
            lineTo(term, {'--line': 1, 'duration': reducedMotion ? 0 : settings.lineDuration, 'ease': 'power2.out'});
        }
        const fall = Math.sign(state.tilt || 1) * settings.tilt * 2;
        return (
            gsap
                .timeline()
                .to(print, {
                    y: `+=${settings.fall}`,
                    rotation: state.tilt + fall,
                    autoAlpha: 0,
                    duration: settings.closeDuration,
                    ease: 'power2.in',
                })
                .set(card, {autoAlpha: 0})
                // gone, out of the slot (left while still coming out, it stayed in the slot as it
                // went, so only what was out showed) and blank again
                .call(() => {
                    card.classList.remove('is-ejecting');
                    photo.develop = 0;
                    photo.render();
                })
        );
    },
};
