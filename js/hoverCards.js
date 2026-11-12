// Hover cards. A word in the text (a .term) opens the card it points to with
// aria-describedby: on hover, on keyboard focus, or with a tap on touch
// screens. One card is open at a time on the page; Escape, or a tap anywhere
// else, closes it.
//
// A card is placed centred over its word, or below it when there isn't room
// above. How it looks, opens and closes is up to its section's variation, a look:
// - place (optional): 'beside' puts the card to the right of the paragraph,
//   centred on the word's line, where there's room for it (not on phones);
//   'around' centres the card on the word itself, for a card that surrounds it;
//   'over' centres it on the word too, but moves it back inside the page
//   margins, its section and the screen wherever it would run out; 'cursor'
//   leaves it to the look, which follows the pointer; 'self' leaves it to the
//   look too, which places it in open(); 'below' places it as usual, but tries
//   below the word first.
// - hold (optional): true for a card that holds itself open while the pointer
//   is over it, as well as over its word; a tap inside it doesn't close it.
// - setup(section) (optional): runs once, after the fonts are in.
// - prepare(card, {term, block}) (optional): runs before the card is placed, to size it.
// - open(card, context) and close(card, context): each returns the tween or
//   timeline it starts, so the next open or close can stop it. context is
//   {side, term, block, section, pointer}; side is where the card went, 'top',
//   'bottom', 'beside', 'around', 'over', 'cursor' or 'self', also set on the card as data-side;
//   pointer is where the pointer was when the card opened, {x, y} on the screen, or null when the
//   keyboard or a tap opened it.
//
// One set of listeners on the document serves every word on the page. The
// exports after GAP are what the looks share.

// between a word and its card, in px, on the page's 15-point scale
export const GAP = 15;
// between the paragraph and a card beside it
const BESIDE = 4 * GAP;
// how long the pointer can be off a word before its card closes, in seconds:
// time to cross to the next word without the cards flickering
const CLOSE_DELAY = 0.1;

// Visitors who prefer reduced motion get the cards without motion
export const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

// whether an element is hidden: never shown yet, or faded out
export const isHidden = el => getComputedStyle(el).visibility === 'hidden';

// A path the page gives (a picture's, in a data attribute) as a full URL, so it means the same
// wherever it's used: a url() in a custom property, for one, resolves against the stylesheet using it
export const urlOf = path => new URL(path, document.baseURI).href;

// The page's side margins, in px
export const pageMargin = () => parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--margin'));

// Where a card can be, up and down, in screen px: from roof to floor, GAP inside the screen (below
// the bar of numbers once it shows) and, given its section, inside the section too
export const bounds = section => {
    const pager = document.querySelector('.pager.is-visible');
    const roof = (pager ? pager.getBoundingClientRect().bottom : 0) + GAP;
    const floor = window.innerHeight - GAP;
    if (!section) return {roof, floor};
    const box = section.getBoundingClientRect();
    return {roof: Math.max(roof, box.top + GAP), floor: Math.min(floor, box.bottom - GAP)};
};

// Tweens of CSS custom properties, one at a time for each key (a trigger, a paragraph, a
// section): starting one stops the last, which GSAP's overwrite doesn't do for custom
// properties. make() starts the new tween and returns it; without it, the last one just stops.
export const oneTweenEach = () => {
    const tweens = new WeakMap();
    return (key, make) => {
        tweens.get(key)?.kill();
        const tween = make?.() ?? null;
        tweens.set(key, tween);
        return tween;
    };
};

// Text split into lines, each in a mask (SplitText), to rise into view: split again only when key
// changes (what its wrapping depends on, such as a width), the last split undone first. state keeps
// the split between calls. Its no-break spaces stay (SplitText would make them plain spaces), so
// 11.6 km never breaks. Returns the lines, in order.
export const linesFor = (state, elements, key) => {
    if (!state.split || state.key !== key) {
        state.split?.revert();
        state.split = SplitText.create(elements, {type: 'lines', mask: 'lines', reduceWhiteSpace: false});
        state.key = key;
    }
    return state.split.lines;
};

export const setUpHoverCards = ({looks}) => {
    // the tween or timeline each card is running
    const running = new WeakMap();
    // the open card: {term, card, look, side, block, section}
    let open = null;
    let closeCall = null;
    // the kind of pointer that last pressed, and whether its word's card was open then
    let pressType = 'mouse';
    let wasOpenOnPress = false;

    const termOf = target => (target instanceof Element ? target.closest('.term') : null);
    const cardOf = term => document.getElementById(term.getAttribute('aria-describedby'));
    const contextOf = term => {
        const section = term.closest('[data-variation]');
        return {section, block: term.closest('.block'), look: looks[section.dataset.variation]};
    };

    document.querySelectorAll('[data-variation]').forEach(section => {
        looks[section.dataset.variation].setup?.(section);
    });

    // Positions the card against its block (the card's offset parent) and
    // returns the side it went to. Only left and top are set, so the looks
    // are free to animate the card's transforms; the transform origin is the
    // point of the card's edge nearest the word. A card stays on screen (below
    // the bar of numbers once it shows) and inside its section, never crossing
    // the lines between sections; where it can't do both, on screen.
    const place = (term, card, how, section) => {
        const root = document.documentElement;
        const margin = pageMargin();
        const block = card.offsetParent.getBoundingClientRect();
        const word = term.getBoundingClientRect();
        const wordCenter = word.left + word.width / 2;
        const screen = bounds();
        const {roof, floor} = bounds(section);
        // a card's top, as near as it can be to where it would like it: on screen and inside its
        // section; where it can't be both, on screen, as a tooltip has to be seen first
        const fitDown = (ideal, height) =>
            floor - height >= roof
                ? gsap.utils.clamp(roof, floor - height, ideal)
                : gsap.utils.clamp(screen.roof, Math.max(screen.roof, screen.floor - height), ideal);

        // over the word, centred on it, moved back inside the page where it runs out
        if (how === 'over') {
            card.dataset.side = 'over';
            const {offsetWidth: width, offsetHeight: height} = card;
            const left = gsap.utils.clamp(margin, root.clientWidth - margin - width, wordCenter - width / 2);
            const top = fitDown(word.top + word.height / 2 - height / 2, height);
            gsap.set(card, {left: left - block.left, top: top - block.top, transformOrigin: '50% 50%'});
            return 'over';
        }

        // at the pointer, or wherever the look wants it: the look places it
        if (how === 'cursor' || how === 'self') {
            card.dataset.side = how;
            return how;
        }

        // around the word, centred on it both ways; kept inside the page margins
        // only if it fits there, else it would slide off its word
        if (how === 'around') {
            card.dataset.side = 'around';
            const {offsetWidth: width, offsetHeight: height} = card;
            const centred = wordCenter - width / 2;
            const fits = width <= root.clientWidth - 2 * margin;
            const left = fits ? gsap.utils.clamp(margin, root.clientWidth - margin - width, centred) : centred;
            const top = word.top + word.height / 2 - height / 2;
            gsap.set(card, {left: left - block.left, top: top - block.top, transformOrigin: '50% 50%'});
            return 'around';
        }

        // beside the paragraph, measured as it looks there, if it fits
        if (how === 'beside') {
            card.dataset.side = 'beside';
            const {offsetWidth: width, offsetHeight: height} = card;
            if (root.clientWidth - margin - block.right - BESIDE >= width) {
                const top = fitDown(word.top + word.height / 2 - height / 2, height);
                gsap.set(card, {left: block.width + BESIDE, top: top - block.top, transformOrigin: '0% 50%'});
                return 'beside';
            }
        }

        card.dataset.side = '';
        const {offsetWidth: width, offsetHeight: height} = card;
        // above if it fits, else below if it fits, else wherever there's more room; or, for
        // 'below', the other way round
        const above = word.top - GAP - roof;
        const below = floor - word.bottom - GAP;
        const side =
            how === 'below'
                ? below >= height || (above < height && below >= above)
                    ? 'bottom'
                    : 'top'
                : above >= height || (below < height && above >= below)
                  ? 'top'
                  : 'bottom';

        const left = gsap.utils.clamp(margin, root.clientWidth - margin - width, wordCenter - width / 2);
        const top = side === 'top' ? word.top - GAP - height : word.bottom + GAP;

        gsap.set(card, {
            left: left - block.left,
            top: top - block.top,
            transformOrigin: `${wordCenter - left}px ${side === 'top' ? '100%' : '0%'}`,
        });
        card.dataset.side = side;
        return side;
    };

    // with reduced motion every open and close jumps straight to its end
    const run = (card, animation) => {
        running.get(card)?.kill();
        running.set(card, animation);
        if (reducedMotion) animation?.progress(1);
    };

    // where the pointer was last, on the screen, if a mouse or pen moved it
    let pointer = null;
    document.addEventListener(
        'pointermove',
        ev => (pointer = ev.pointerType === 'touch' ? null : {x: ev.clientX, y: ev.clientY}),
        {passive: true},
    );

    const show = (term, byPointer = false) => {
        closeCall?.kill();
        closeCall = null;
        if (open?.term === term) return;
        if (open) hide();

        const card = cardOf(term);
        const {section, block, look} = contextOf(term);
        look.prepare?.(card, {term, block});
        const side = place(term, card, look.place, section);
        term.classList.add('is-open');
        // a card that holds itself open takes the pointer while it's open
        if (look.hold) card.style.pointerEvents = 'auto';
        open = {term, card, look, side, block, section, pointer: byPointer ? pointer : null};
        run(card, look.open(card, open));
    };

    const hide = () => {
        closeCall?.kill();
        closeCall = null;
        if (!open) return;

        const context = open;
        open = null;
        context.term.classList.remove('is-open');
        context.card.style.pointerEvents = '';
        run(context.card, context.look.close(context.card, context));
    };

    // whether an element is the open card's word, or its card if the card holds itself open
    const isOpenArea = el =>
        el instanceof Node && Boolean(open) && (open.term.contains(el) || (open.look.hold && open.card.contains(el)));

    document.addEventListener('pointerover', ev => {
        if (ev.pointerType === 'touch') return;
        const term = termOf(ev.target);
        pointer = {x: ev.clientX, y: ev.clientY};
        if (term) show(term, true);
        // back over a card that holds itself open
        else if (isOpenArea(ev.target)) {
            closeCall?.kill();
            closeCall = null;
        }
    });
    document.addEventListener('pointerout', ev => {
        if (ev.pointerType === 'touch' || !isOpenArea(ev.target) || isOpenArea(ev.relatedTarget)) return;
        closeCall?.kill();
        closeCall = gsap.delayedCall(CLOSE_DELAY, hide);
    });
    document.addEventListener('pointerdown', ev => {
        const term = termOf(ev.target);
        pressType = ev.pointerType;
        wasOpenOnPress = Boolean(term) && open?.term === term;
        if (!term && !isOpenArea(ev.target)) hide();
    });
    document.addEventListener('focusin', ev => {
        const term = termOf(ev.target);
        if (term) show(term);
    });
    document.addEventListener('focusout', ev => {
        const term = termOf(ev.target);
        if (term && open?.term === term) hide();
    });
    // the word's link only stands in for its card: a tap opens the card and a
    // second tap closes it; a click or Enter leaves it open
    document.addEventListener('click', ev => {
        const term = termOf(ev.target);
        if (!term) return;
        ev.preventDefault();
        if (pressType === 'touch' && wasOpenOnPress) hide();
        else show(term);
        pressType = 'mouse';
    });
    document.addEventListener('keydown', ev => {
        if (ev.key === 'Escape') hide();
    });

    // a new width can re-flow the text under an open card, so it closes
    let lastWidth = window.innerWidth;
    window.addEventListener('resize', () => {
        if (window.innerWidth === lastWidth) return;
        lastWidth = window.innerWidth;
        hide();
    });
};
