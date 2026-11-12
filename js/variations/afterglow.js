// 08 Afterglow: a small screen comes on above the trigger, the way an old set
// did: a dot, a line, then the picture opening out of it, overexposed at first
// and settling. And it lights the room: its own colour spills onto the page
// around it, the ground glowing and the nearby words taking on its hue, flickering
// as it strikes and then holding. Leaving, the picture collapses back to a line
// and a dot, but its light stays on the page a moment longer and fades, an
// afterglow. Going from one trigger to the next, the light changes colour and
// moves over to the new screen.
//
// Each card names its picture in data-picture; its label and text are for
// screen readers. setup() reads each picture's colour, its most vivid light,
// from a small copy of it. The light is two gradients (css/variations/afterglow.css):
// one on a layer of its own, lighting the room (the whole screen by default,
// see settings.room), and one in the paragraph's own letters. Custom
// properties set here place and colour them; while the light is on, its centre
// follows the screen on every frame, so it stays with it as the page scrolls.

import {isHidden, loaded, oneTweenEach, reducedMotion, urlOf} from '../hoverCards.js';

const settings = {
    // switching on: the dot drawing out into a line, then the line opening into the picture, in seconds
    lineDuration: 0.16,
    openDuration: 0.45,
    // how overexposed the picture comes on, and how long it takes to settle
    flash: 3,
    settleDuration: 0.8,
    // switching off: the picture closing to a line, then to a dot
    closeDuration: 0.16,
    dotDuration: 0.14,
    // the light on the page: how long it takes to change colour and move to another screen, and
    // how long the afterglow takes to fade once the screen is off
    moveDuration: 0.4,
    afterglow: 1.4,
    // what the light lights: 'screen', the whole screen, behind the page's text; or a CSS
    // selector, such as 'body', to light that element instead (made positioned if it isn't)
    room: 'screen',
};

// each card's screen and colour
const screens = new WeakMap();
// each section's room: {layer, card, source, tick, x, y}: the layer the light is drawn on, the
// card whose light it is, the card it shines from, its centre following the screen, and where
// its centre is now; and each section's light tween
const rooms = new WeakMap();
const lights = oneTweenEach();

// The picture's light: the colour of its most vivid parts (saturation counts far more than
// brightness, so a small red lamp in a dark green street still gives red), as bright as it goes
const lightOf = image => {
    const size = 24;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const context = canvas.getContext('2d', {willReadFrequently: true});
    context.drawImage(image, 0, 0, size, size);
    const data = context.getImageData(0, 0, size, size).data;
    let r = 0;
    let g = 0;
    let b = 0;
    for (let i = 0; i < data.length; i += 4) {
        const max = Math.max(data[i], data[i + 1], data[i + 2]);
        const min = Math.min(data[i], data[i + 1], data[i + 2]);
        const weight = (max / 255) * ((max - min) / (max || 1)) ** 5;
        r += data[i] * weight;
        g += data[i + 1] * weight;
        b += data[i + 2] * weight;
    }
    const peak = Math.max(r, g, b) || 1;
    return {r: (r / peak) * 255, g: (g / peak) * 255, b: (b / peak) * 255};
};

// The layer the light is drawn on: fixed to the screen, before the page's content so it's
// under the text; or inside the element settings.room names
const layerFor = () => {
    const layer = document.createElement('div');
    layer.className = 'afterglow-light';
    layer.setAttribute('aria-hidden', 'true');
    if (settings.room === 'screen') {
        layer.classList.add('is-screen');
        document.querySelector('#smooth-wrapper').before(layer);
    } else {
        const room = document.querySelector(settings.room);
        if (getComputedStyle(room).position === 'static') room.style.position = 'relative';
        room.prepend(layer);
    }
    return layer;
};

// The light's strength and colour, on the layer (the room's light) and the section (the letters')
const lightTo = (room, section, vars) => lights(section, () => gsap.to([room.layer, section], vars));

// While the light is on, its centre follows the screen it shines from on every frame, easing
// over to a new screen; on the layer in the layer's coordinates, in the letters in the paragraph's
const followScreen = (room, section) => {
    if (room.tick) return;
    const statement = section.querySelector('.statement');
    room.tick = () => {
        const screen = room.source.getBoundingClientRect();
        const x = screen.left + screen.width / 2;
        const y = screen.top + screen.height / 2;
        const ease = reducedMotion ? 1 : 0.2;
        room.x = room.x === undefined ? x : room.x + (x - room.x) * ease;
        room.y = room.y === undefined ? y : room.y + (y - room.y) * ease;
        const area = room.layer.getBoundingClientRect();
        const text = statement.getBoundingClientRect();
        room.layer.style.setProperty('--glow-x', `${room.x - area.left}px`);
        room.layer.style.setProperty('--glow-y', `${room.y - area.top}px`);
        section.style.setProperty('--tint-x', `${room.x - text.left}px`);
        section.style.setProperty('--tint-y', `${room.y - text.top}px`);
    };
    room.tick();
    gsap.ticker.add(room.tick);
};

const stopFollowing = room => {
    gsap.ticker.remove(room.tick);
    room.tick = null;
    room.x = room.y = undefined;
};

export const afterglow = {
    setup(section) {
        rooms.set(section, {layer: layerFor(), card: null, source: null, tick: null});
        section.querySelectorAll('.card[data-picture]').forEach(card => {
            const screen = document.createElement('div');
            screen.className = 'afterglow';
            screen.setAttribute('aria-hidden', 'true');
            const picture = document.createElement('div');
            picture.className = 'afterglow__picture';
            const src = urlOf(card.dataset.picture);
            picture.style.backgroundImage = `url(${src})`;
            screen.append(picture);
            card.prepend(screen);
            const state = {screen, picture, colour: {r: 255, g: 230, b: 200}};
            screens.set(card, state);
            const image = new Image();
            image.src = src;
            loaded(image).then(() => (state.colour = lightOf(image)));
        });
    },
    open(card, {section}) {
        const {screen, picture, colour} = screens.get(card);
        const room = rooms.get(section);
        const tint = {'--light-r': colour.r, '--light-g': colour.g, '--light-b': colour.b};
        const current = parseFloat(getComputedStyle(room.layer).getPropertyValue('--light')) || 0;
        room.card = card;
        room.source = card;
        followScreen(room, section);

        // the light: still on (from another screen, or fading after one), it moves over and
        // changes colour; off, it comes on here, flickering as the screen strikes
        if (reducedMotion) {
            lightTo(room, section, {...tint, '--light': 1, 'duration': 0});
        } else if (current > 0.05) {
            lightTo(room, section, {...tint, '--light': 1, 'duration': settings.moveDuration, 'ease': 'power2.out'});
        } else {
            const both = [room.layer, section];
            lights(section, () => {
                gsap.set(both, {...tint, '--light': 0});
                return gsap
                    .timeline()
                    .to(both, {'--light': 0.7, 'duration': 0.05})
                    .to(both, {'--light': 0.15, 'duration': 0.06})
                    .to(both, {'--light': 1.3, 'duration': 0.08})
                    .to(both, {'--light': 0.8, 'duration': 0.05})
                    .to(both, {'--light': 1, 'duration': settings.settleDuration, 'ease': 'power2.out'});
            });
        }

        // caught while switching off, it comes straight back on
        if (!isHidden(card)) {
            return gsap
                .timeline()
                .to(screen, {scaleX: 1, scaleY: 1, duration: 0.25, ease: 'power2.out'}, 0)
                .to(picture, {filter: 'brightness(1)', duration: 0.3}, 0);
        }

        gsap.set(card, {autoAlpha: 1});
        gsap.set(screen, {scaleX: 0.02, scaleY: 0.012});
        gsap.set(picture, {filter: `brightness(${settings.flash})`});
        return gsap
            .timeline()
            .to(screen, {scaleX: 1, duration: settings.lineDuration, ease: 'power2.out'}, 0)
            .to(screen, {scaleY: 1, duration: settings.openDuration, ease: 'expo.out'}, settings.lineDuration)
            .to(
                picture,
                {filter: 'brightness(1)', duration: settings.settleDuration, ease: 'power2.out'},
                settings.lineDuration,
            );
    },
    close(card, {section}) {
        const {screen, picture} = screens.get(card);
        const room = rooms.get(section);

        // the afterglow: the light stays a moment and fades, unless another screen has taken it
        // (it opens in the same moment, so this is checked just after)
        queueMicrotask(() => {
            if (room.card !== card) return;
            room.card = null;
            lightTo(room, section, {
                '--light': 0,
                'duration': reducedMotion ? 0 : settings.afterglow,
                'delay': reducedMotion ? 0 : settings.closeDuration + settings.dotDuration,
                'ease': 'power2.inOut',
                'onComplete': () => stopFollowing(room),
            });
        });

        return gsap
            .timeline()
            .to(
                picture,
                {filter: `brightness(${settings.flash})`, duration: settings.closeDuration, ease: 'power2.in'},
                0,
            )
            .to(screen, {scaleY: 0.012, duration: settings.closeDuration, ease: 'power2.in'}, 0)
            .to(screen, {scaleX: 0.02, duration: settings.dotDuration, ease: 'power2.in'})
            .set(card, {autoAlpha: 0});
    },
};
