// 16 Focus Pull: the trigger's picture is found the way a lens finds it. It
// starts far out of focus, larger than it will be and centred on the trigger,
// so at first there are only its lights: wide, even discs in each lamp's own
// colour, coming on one after another over the paragraph. Then the focus is
// pulled: the discs draw in, each down to its point of light, the picture
// gathers up out of the dark around them, brightest first, and settles, sharp,
// above the trigger (under it when there's no room above). Leaving, it goes
// back out of focus, its lights opening over the text again as they go out.
//
// Each card names its picture in data-picture; its text is for screen readers.
// The picture is drawn in WebGL 2 (js/gl/focusPicture.js); without it, it
// fades in.

import {GAP, isHidden, urlOf} from '../hoverCards.js';
import {FocusPicture} from '../gl/focusPicture.js';

const settings = {
    // pulling focus, in seconds, a hand turning the lens: slowly off, slowly home
    duration: 1.4,
    ease: 'expo.out',
    // caught going out of focus, it's pulled straight back
    backEase: 'power2.out',
    // leaving
    closeDuration: 1.4,
    closeEase: 'expo.out',
    // the picture starts centred on its trigger, but no further off sideways than this, as a
    // part of its width
    reach: 0.25,
};

// each card's picture
const pictures = new WeakMap();

// How far off the picture can start, in px: sideways, and up or down to the trigger's line
const reachOf = (picture, block) => {
    const {clientWidth: width, clientHeight: height} = picture.holder;
    const lineHeight = parseFloat(getComputedStyle(block.querySelector('.statement')).lineHeight);
    return [Math.round(width * settings.reach), Math.round(height / 2 + GAP + lineHeight / 2)];
};

export const focusPull = {
    setup(section) {
        section.querySelectorAll('.card[data-picture]').forEach(card => {
            const box = document.createElement('div');
            box.className = 'focus-pull';
            box.setAttribute('aria-hidden', 'true');
            card.prepend(box);
            pictures.set(card, new FocusPicture(box, urlOf(card.dataset.picture)));
        });
    },
    prepare(card, {block}) {
        const picture = pictures.get(card);
        picture.fit(...reachOf(picture, block));
    },
    open(card, {term}) {
        const picture = pictures.get(card);
        const wasHidden = isHidden(card);
        if (wasHidden) {
            // from the trigger: centred on it, as far as the canvas reaches
            const box = picture.holder.getBoundingClientRect();
            const word = term.getBoundingClientRect();
            const [reachX, reachY] = [picture.reachX ?? 0, picture.reachY ?? 0];
            picture.from = {
                x: gsap.utils.clamp(-reachX, reachX, word.left + word.width / 2 - (box.left + box.width / 2)),
                y: gsap.utils.clamp(-reachY, reachY, word.top + word.height / 2 - (box.top + box.height / 2)),
            };
            picture.focus = 0;
            picture.render();
        }
        gsap.set(card, {autoAlpha: 1});
        return gsap.to(picture, {
            focus: 1,
            duration: settings.duration * (wasHidden ? 1 : 1 - picture.focus),
            ease: wasHidden ? settings.ease : settings.backEase,
            onUpdate: () => picture.render(),
        });
    },
    close(card) {
        const picture = pictures.get(card);
        return gsap
            .timeline()
            .to(picture, {
                focus: 0,
                duration: settings.closeDuration,
                ease: settings.closeEase,
                onUpdate: () => picture.render(),
            })
            .set(card, {autoAlpha: 0});
    },
};
