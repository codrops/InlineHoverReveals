// 11 Departures: the note comes up on a split-flap board, like an old
// station's departure board, that comes to the pointer and follows it along
// the trigger, as On Air's tag does: a row of tiles slides out, and each tile
// flips through its letters, the top half of a flap falling to show the next,
// until the note is spelled out. Opened from the keyboard or with a tap, it
// sits just under the trigger. Leaving, the tiles flip back to blank and the
// row slides away.
//
// The card's text is the note; setup() builds a tile for each of its letters
// (the board is hidden from screen readers, which read the card's text) and
// moves the card into a layer fixed to the screen. Following the pointer is
// js/follow.js, shared with 07 On Air.

import {isHidden} from '../hoverCards.js';
import {follow, layerOf} from '../follow.js';

const settings = {
    // one flap falling, in seconds, and how many flaps a tile flips through before its letter, at
    // least and at most
    flip: 0.09,
    flipsMin: 3,
    flipsMax: 9,
    // the row sliding out, left to right, and each tile starting this long after the one before
    slideDuration: 0.3,
    stagger: 0.025,
    // following the pointer, as On Air's tag: the board's place from it, in px, to its right and
    // below it; how long it takes to catch up, in seconds; how far it leans with the pointer's
    // speed, at most, in degrees
    offsetX: 18,
    offsetY: 22,
    follow: 0.45,
    lean: 6,
};

// The boards' layer, fixed to the screen outside the page's scrolling content
let layer;

// the letters on a tile's flaps, in the order they come round
const FLAPS = ' ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyzáéíóúñ0123456789:,.-°';

// each card's board: {board, tiles, text, stopFollowing}
const boards = new WeakMap();

const tileOf = () => {
    const tile = document.createElement('span');
    tile.className = 'flap';
    const half = (where, extra = '') => {
        const part = document.createElement('span');
        part.className = `flap__half flap__${where} ${extra}`.trim();
        const letter = document.createElement('span');
        letter.className = 'flap__letter';
        part.append(letter);
        tile.append(part);
        return letter;
    };
    // the tile's two halves, and the two flaps that turn over them: the top one falling, the
    // bottom one landing
    const top = half('top');
    const bottom = half('bottom');
    const fall = half('top', 'flap__fall');
    const land = half('bottom', 'flap__land');
    return {tile, top, bottom, fall, land, letter: ' '};
};

// One tile flipping through its flaps to a letter: each flip, the top flap (the old letter) falls
// to show the new letter's top half, and the new letter's bottom half lands over the old one's
const flipTo = (tile, letter, flips) => {
    // a letter that isn't on the flaps comes after the last of them
    const at = FLAPS.indexOf(letter);
    const end = at < 0 ? FLAPS.length - 1 : at;
    const letters = [...FLAPS.slice(Math.max(end - flips, 0), end + 1)];
    if (at < 0) letters.push(letter);
    if (letters[0] === tile.letter) letters.shift();
    const half = settings.flip / 2;
    const fall = tile.fall.parentElement;
    const land = tile.land.parentElement;
    const tl = gsap.timeline();
    letters.forEach(next => {
        tl.call(() => {
            const last = tile.letter;
            tile.top.textContent = next;
            tile.bottom.textContent = last;
            tile.fall.textContent = last;
            tile.land.textContent = next;
            tile.letter = next;
        })
            .fromTo(fall, {rotationX: 0}, {rotationX: -90, duration: half, ease: 'power1.in', immediateRender: false})
            .fromTo(land, {rotationX: 90}, {rotationX: 0, duration: half, ease: 'power1.out', immediateRender: false});
    });
    return tl.call(() => (tile.bottom.textContent = tile.letter));
};

// Sets a tile straight to a letter, without flipping
const setTile = (tile, letter) => {
    tile.letter = letter;
    [tile.top, tile.bottom, tile.fall, tile.land].forEach(part => (part.textContent = letter));
    gsap.set(tile.fall.parentElement, {rotationX: -90});
    gsap.set(tile.land.parentElement, {rotationX: 0});
};

export const departures = {
    place: 'cursor',
    setup(section) {
        layer ??= layerOf('departures-layer');
        section.querySelectorAll('.card').forEach(card => {
            // into the layer; its trigger still finds it by its id
            layer.append(card);
            const text = card.querySelector('.card__text').textContent.trim();
            const board = document.createElement('div');
            board.className = 'board';
            board.setAttribute('aria-hidden', 'true');
            const tiles = [...text].map(() => tileOf());
            board.append(...tiles.map(tile => tile.tile));
            tiles.forEach(tile => setTile(tile, ' '));
            card.prepend(board);
            boards.set(card, {board, tiles, text, stopFollowing: null});
        });
    },
    open(card, {term, pointer}) {
        const state = boards.get(card);
        const {board, tiles, text} = state;
        const letters = [...text];

        // at the pointer, following it, or just under the trigger when there's no pointer
        state.stopFollowing?.();
        const wasHidden = isHidden(card);
        state.stopFollowing = follow(card, {term, pointer, ...settings});

        // caught flipping back, it flips straight to the note again
        if (!wasHidden) {
            const tl = gsap.timeline();
            gsap.set(board, {clipPath: 'inset(0% 0% 0% 0%)'});
            tiles.forEach((tile, i) => tl.add(flipTo(tile, letters[i], 1), 0));
            return tl;
        }

        tiles.forEach(tile => setTile(tile, ' '));
        gsap.set(card, {autoAlpha: 1});
        const tl = gsap
            .timeline()
            .fromTo(
                board,
                {clipPath: 'inset(0% 100% 0% 0%)'},
                {clipPath: 'inset(0% 0% 0% 0%)', duration: settings.slideDuration, ease: 'power3.out'},
            );
        tiles.forEach((tile, i) => {
            const flips = gsap.utils.random(settings.flipsMin, settings.flipsMax, 1);
            tl.add(flipTo(tile, letters[i], flips), 0.1 + i * settings.stagger);
        });
        return tl;
    },
    close(card) {
        const state = boards.get(card);
        const {board, tiles} = state;
        state.stopFollowing?.();
        state.stopFollowing = null;
        const tl = gsap.timeline();
        [...tiles].reverse().forEach((tile, i) => {
            if (tile.letter !== ' ') tl.add(flipTo(tile, ' ', 0), i * settings.stagger * 0.4);
        });
        return tl
            .to(board, {clipPath: 'inset(0% 100% 0% 0%)', duration: settings.slideDuration * 0.8, ease: 'power2.in'})
            .set(card, {autoAlpha: 0});
    },
};
