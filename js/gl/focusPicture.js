// A night picture coming into focus, drawn in WebGL, the way a lens finds it.
// Far out of focus, a picture taken in the dark is only its lights: every lamp
// and lit window a wide, even disc of its own colour, crisp at its rim, laid
// over the next. As the focus is pulled the discs draw in, each down to the
// point of light it was, and what's around them comes up out of the dark,
// brightest first; the picture is a little larger while it's out of focus, as
// it is in a lens, and settles to its size. In focus it's the picture itself.
//
// The lights are found in the picture (#findLights): its brightest points,
// where they stand out from what's around them, each with its own colour. They
// are drawn as discs, a square each; under them the rest of the picture, blurred
// by as much as it's out of focus and see-through wherever it's still too dark
// to have come up. The canvas is larger than the picture, so the lights can
// lie beyond its frame, over the page.
//
// focus is how far in focus it is, 0 to 1; from is where the picture starts,
// in px from where it ends; fit() sizes the canvas and render() draws it.
// It's drawn in WebGL 2, which keeps a picture of any size with its smaller copies,
// the ones that blur it. Without WebGL 2 the picture is an image that fades in.

import {programOf, textureOf} from './program.js';

const settings = {
    // out of focus, how much larger the picture is than in focus (a lens breathes as it focuses)
    breathe: 1.5,
    // the lights, out of focus: how many at most, each disc's radius as a part of the picture's
    // width, and how much smaller or larger than that they come, the nearer and further ones
    lights: 110,
    disc: 0.065,
    sizes: [0.5, 1.4],
    // out of focus the lights lie further out than the picture does, the larger their disc the
    // further: how much further, for a disc of the middle size
    depth: 0.3,
    // how bright the discs are when they open, at their largest
    glow: 0.55,
    // how much brighter they get as they draw in, by the time they've closed: the same light in a
    // smaller disc (1: no brighter)
    gather: 1.6,
    // how much brighter a disc is at its rim than in its middle, a ring as a lens draws it (0: even)
    rim: 0.35,
    // a coloured rim: the red a little wider than the disc, the blue a little narrower, by this
    // part of its radius (0: no colour at the rim)
    fringe: 0.035,
    // the discs away from the picture's middle cut into a cat's eye, as a lens's barrel cuts them,
    // by this much: the further out, the narrower (0: all round)
    catsEye: 0.1,
    // how solid a disc is: how much of what's under it it hides, at most
    solid: 0.65,
    // how much deeper a light's colour is in its disc than in the picture, where it's burnt out
    deepen: 1.3,
    // the lights come on one after another, the brightest first, over this much of the focus
    // pull, each taking this much of that; and they go as their discs close, over the last of it
    lightsOn: 0.3,
    lightOn: 0.3,
    lightsOff: 0.16,
    // the rest of the picture: its blur out of focus, as a part of its width; it comes up out of
    // the dark, brightest first, between these two points of the focus pull, this softly
    blur: 0.07,
    tone: [0.38, 0.88],
    soft: 0.25,
};

// how finely the picture is read to find its lights, across; and how far apart two lights are,
// at least, in those steps
const GRID = 180;
const APART = 4.5;
// the picture's taps when it's blurred, as in its shader
const TAPS = 28;

const PICTURE_VERTEX = /* glsl */ `
attribute vec2 aCorner;
uniform vec2 uCanvas;
uniform vec2 uCentre;
uniform vec2 uSize;
varying vec2 vUv;
void main() {
    vUv = 0.5 + aCorner * 0.5;
    vec2 at = (uCentre + aCorner * 0.5 * uSize) / uCanvas;
    gl_Position = vec4(at.x * 2.0 - 1.0, 1.0 - at.y * 2.0, 0.0, 1.0);
}
`;

const PICTURE_FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uPicture;
uniform vec2 uBlur;
uniform float uLod;
uniform float uTone;
uniform float uSoft;

varying vec2 vUv;

const int TAPS = ${TAPS};
const float GOLDEN = 2.39996323;

void main() {
    // the picture over a disc as wide as it's out of focus, in a spiral of taps, each from a
    // copy of the picture as coarse as the taps are apart; its frame stays sharp
    vec3 sum = vec3(0.0);
    for (int i = 0; i < TAPS; i++) {
        float n = float(i);
        float angle = n * GOLDEN;
        vec2 uv = vUv + vec2(cos(angle), sin(angle)) * sqrt((n + 0.5) / float(TAPS)) * uBlur;
        sum += texture2D(uPicture, uv, uLod).rgb;
    }
    vec3 picture = sum / float(TAPS);

    // up out of the dark, brightest first
    float lum = sqrt(dot(picture, vec3(0.299, 0.587, 0.114)));
    float up = smoothstep(uTone, uTone + uSoft, lum);

    gl_FragColor = vec4(picture, 1.0) * up;
}
`;

const LIGHT_VERTEX = /* glsl */ `
attribute vec2 aCorner;
attribute vec2 aAt;
attribute vec3 aColour;
attribute vec3 aLight;

uniform vec2 uCanvas;
uniform vec2 uCentre;
uniform vec2 uSize;
uniform float uRadius;
uniform float uDepth;
uniform float uOn;
uniform float uLightOn;
uniform float uFringe;

varying vec2 vPx;
varying vec2 vOut;
varying vec3 vColour;
varying float vRadius;

void main() {
    // aLight: how large the disc is, when the light comes on, how bright it is
    float radius = uRadius * aLight.x;
    vec2 out_ = aAt * (1.0 + aLight.x * uDepth);
    vec2 px = aCorner * (radius * (1.0 + uFringe) + 1.5);
    vec2 at = (uCentre + out_ * uSize + px) / uCanvas;

    float on = smoothstep(aLight.y * (1.0 - uLightOn), aLight.y * (1.0 - uLightOn) + uLightOn, uOn);
    vPx = px;
    vOut = aAt * 2.0;
    vColour = aColour * aLight.z * on;
    vRadius = radius;
    gl_Position = vec4(at.x * 2.0 - 1.0, 1.0 - at.y * 2.0, 0.0, 1.0);
}
`;

const LIGHT_FRAGMENT = /* glsl */ `
precision highp float;

uniform float uGlow;
uniform float uRim;
uniform float uFringe;
uniform float uCatsEye;
uniform float uSolid;
uniform float uPixel;

varying vec2 vPx;
varying vec2 vOut;
varying vec3 vColour;
varying float vRadius;

// how much of a disc of this radius there is, this far from its centre: all of it, up to a rim
// one pixel soft
float disc(float d, float radius) {
    return 1.0 - smoothstep(radius - uPixel, radius + uPixel, d);
}

void main() {
    float d = length(vPx);

    // the red a little wider than the green, the blue a little narrower: a coloured rim
    vec3 shape = vec3(
        disc(d, vRadius * (1.0 + uFringe)),
        disc(d, vRadius),
        disc(d, vRadius * (1.0 - uFringe))
    );
    // off-centre, the far side of the disc is cut by a second one: a cat's eye
    shape *= disc(length(vPx + vOut * vRadius * uCatsEye), vRadius * (1.0 + uFringe));
    // even inside, brighter towards the rim
    float rim = 1.0 + uRim * smoothstep(0.55, 1.0, d / max(vRadius, 0.001));

    vec3 light = vColour * shape * rim * uGlow;
    gl_FragColor = vec4(light, shape.g * uSolid * max(vColour.r, max(vColour.g, vColour.b)));
}
`;

// one corner of a square for each of a disc's six points, two triangles
const CORNERS = [-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1];
// numbers for each point of a disc: its corner, where its light is, its colour, and its light
const STRIDE = 10;

// A number from 0 to 1 that's always the same for the same n: the discs' sizes, the same on
// every visit
const steady = n => {
    const x = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return x - Math.floor(x);
};

export class FocusPicture {
    focus = 0;
    from = {x: 0, y: 0};

    constructor(holder, src) {
        this.holder = holder;
        this.image = new Image();
        this.image.src = src;
        this.image.alt = '';
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl2', {premultipliedAlpha: true, antialias: false});
        if (gl) this.#setUpGl(canvas, gl);
        else this.#setUpFallback();
        this.ready = this.image
            .decode()
            .then(() => this.#upload())
            .catch(() => {});
    }

    get works() {
        return Boolean(this.gl);
    }

    #setUpGl(canvas, gl) {
        this.gl = gl;
        this.canvas = canvas;
        canvas.className = 'focus-pull__canvas';
        this.holder.append(canvas);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.clearColor(0, 0, 0, 0);

        this.picture = this.#programOf(PICTURE_VERTEX, PICTURE_FRAGMENT, [
            'uCanvas',
            'uCentre',
            'uSize',
            'uBlur',
            'uLod',
            'uTone',
            'uSoft',
        ]);
        gl.uniform1f(this.picture.uSoft, settings.soft);
        this.picture.corners = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.picture.corners);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(CORNERS), gl.STATIC_DRAW);

        this.lights = this.#programOf(LIGHT_VERTEX, LIGHT_FRAGMENT, [
            'uCanvas',
            'uCentre',
            'uSize',
            'uRadius',
            'uDepth',
            'uOn',
            'uLightOn',
            'uFringe',
            'uGlow',
            'uRim',
            'uCatsEye',
            'uSolid',
            'uPixel',
        ]);
        gl.uniform1f(this.lights.uLightOn, settings.lightOn);
        gl.uniform1f(this.lights.uFringe, settings.fringe);
        gl.uniform1f(this.lights.uRim, settings.rim);
        gl.uniform1f(this.lights.uCatsEye, settings.catsEye);
        gl.uniform1f(this.lights.uSolid, settings.solid);
        this.lights.points = gl.createBuffer();
        this.lights.count = 0;

        // a picture's smaller copies are what blur it, so the texture keeps them
        textureOf(gl);
    }

    // A program and where its uniforms and attributes are
    #programOf(vertex, fragment, uniforms) {
        const {gl} = this;
        const program = programOf(gl, vertex, fragment);
        const at = {program};
        uniforms.forEach(name => (at[name] = gl.getUniformLocation(program, name)));
        ['aCorner', 'aAt', 'aColour', 'aLight'].forEach(name => (at[name] = gl.getAttribLocation(program, name)));
        return at;
    }

    #setUpFallback() {
        this.image.className = 'focus-pull__image';
        this.holder.append(this.image);
    }

    // The picture's lights: its brightest points, where they stand out from what's around them,
    // no two closer than APART; for each, where it is (from the picture's centre, in parts of its
    // size), its colour, how large its disc comes, when it comes on (the brightest first) and how
    // bright it is. As the numbers its discs are drawn from, six points each.
    #findLights() {
        const {image} = this;
        const across = GRID;
        const down = Math.round((GRID * image.naturalHeight) / image.naturalWidth);
        const small = document.createElement('canvas');
        small.width = across;
        small.height = down;
        const context = small.getContext('2d', {willReadFrequently: true});
        context.drawImage(image, 0, 0, across, down);
        const {data} = context.getImageData(0, 0, across, down);

        const lum = new Float32Array(across * down);
        for (let i = 0; i < lum.length; i++) {
            lum[i] = (0.299 * data[i * 4] + 0.587 * data[i * 4 + 1] + 0.114 * data[i * 4 + 2]) / 255;
        }
        const at = (x, y) => lum[gsap.utils.clamp(0, down - 1, y) * across + gsap.utils.clamp(0, across - 1, x)];
        // a point against what's around it, a ring of eight points a few steps off: how far it
        // stands above their mean, and how many of them are clearly darker (a light is a point,
        // dark all around; a bright edge or a strip of sky isn't)
        const around = (x, y, here) => {
            let sum = 0;
            let darker = 0;
            for (let i = 0; i < 8; i++) {
                const angle = (i / 8) * Math.PI * 2;
                const there = at(x + Math.round(Math.cos(angle) * 5), y + Math.round(Math.sin(angle) * 5));
                sum += there;
                if (there < here - 0.1) darker++;
            }
            return [here - sum / 8, darker];
        };

        const found = [];
        for (let y = 0; y < down; y++) {
            for (let x = 0; x < across; x++) {
                const here = at(x, y);
                if (here < 0.4) continue;
                // the brightest of its neighbours
                let isPeak = true;
                for (let dy = -1; dy <= 1 && isPeak; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if ((dx || dy) && at(x + dx, y + dy) > here) isPeak = false;
                    }
                }
                if (!isPeak) continue;
                const [stands, darker] = around(x, y, here);
                if (stands > 0.14 && darker >= 6) found.push({x, y, stands});
            }
        }
        found.sort((a, b) => b.stands - a.stands);
        const lights = [];
        for (const light of found) {
            if (lights.length === settings.lights) break;
            if (lights.every(other => Math.hypot(other.x - light.x, other.y - light.y) >= APART)) lights.push(light);
        }

        const [smallest, largest] = settings.sizes;
        const points = new Float32Array(lights.length * 6 * STRIDE);
        lights.forEach(({x, y, stands}, n) => {
            // its colour: the light's own, at full strength and a little deeper
            const i = (y * across + x) * 4;
            const strongest = Math.max(data[i], data[i + 1], data[i + 2], 1);
            const colour = [0, 1, 2].map(channel => (data[i + channel] / strongest) ** settings.deepen);
            const size = smallest + (largest - smallest) * steady(n);
            const order = lights.length > 1 ? n / (lights.length - 1) : 0;
            const bright = gsap.utils.clamp(0.6, 1, 0.5 + stands);
            for (let corner = 0; corner < 6; corner++) {
                points.set(
                    [
                        CORNERS[corner * 2],
                        CORNERS[corner * 2 + 1],
                        (x + 0.5) / across - 0.5,
                        (y + 0.5) / down - 0.5,
                        ...colour,
                        size,
                        order,
                        bright,
                    ],
                    (n * 6 + corner) * STRIDE,
                );
            }
        });
        return {points, count: lights.length * 6};
    }

    // The picture into the GPU with its smaller copies, and its lights; then one unseen drawing,
    // sent to the GPU now, so it's ready before the first hover
    #upload() {
        if (!this.gl) return;
        const {gl} = this;
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, this.image);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);

        const {points, count} = this.#findLights();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.lights.points);
        gl.bufferData(gl.ARRAY_BUFFER, points, gl.STATIC_DRAW);
        this.lights.count = count;

        this.fit();
        const {focus} = this;
        this.focus = 0.5;
        this.render();
        gl.flush();
        this.focus = focus;
        this.render();
    }

    // The canvas sized around the picture's holder: room for the picture at its largest, for its
    // largest discs past its edges, and for it to start as far off as reachX and reachY, in px
    fit(reachX = this.reachX ?? 0, reachY = this.reachY ?? 0) {
        if (!this.gl) return;
        const {clientWidth: width, clientHeight: height} = this.holder;
        if (!width) return;
        if (width === this.width && reachX === this.reachX && reachY === this.reachY) return;
        this.width = width;
        this.height = height;
        this.reachX = reachX;
        this.reachY = reachY;

        const {breathe, disc, sizes, depth} = settings;
        const grown = ((breathe * (1 + sizes[1] * depth) - 1) / 2) * 1.02;
        const discs = disc * width * breathe * sizes[1] * (1 + settings.fringe) + 2;
        const marginX = Math.ceil(grown * width + discs + reachX);
        const marginY = Math.ceil(grown * height + discs + reachY);
        this.across = width + 2 * marginX;
        this.down = height + 2 * marginY;

        const ratio = Math.min(window.devicePixelRatio, 2);
        this.ratio = ratio;
        const {canvas, gl} = this;
        canvas.width = Math.round(this.across * ratio);
        canvas.height = Math.round(this.down * ratio);
        canvas.style.width = `${this.across}px`;
        canvas.style.height = `${this.down}px`;
        canvas.style.left = `${-marginX}px`;
        canvas.style.top = `${-marginY}px`;
        gl.viewport(0, 0, canvas.width, canvas.height);
        this.render();
    }

    render() {
        if (!this.gl) {
            this.image.style.opacity = this.focus;
            return;
        }
        const {gl, picture, lights, focus, width, height, across, down, ratio} = this;
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (focus <= 0 || !width) return;

        // how far out of focus it is, and so how much larger and how far from where it ends
        const out = 1 - focus;
        const scale = 1 + (settings.breathe - 1) * out;
        const centre = [across / 2 + this.from.x * out, down / 2 + this.from.y * out];
        const size = [width * scale, height * scale];

        // the picture, blurred by as much as it's out of focus; its taps come from a copy of it
        // as coarse as they are apart on screen
        const blur = settings.blur * size[0] * out;
        const [toneFrom, toneTo] = settings.tone;
        const up = gsap.utils.clamp(0, 1, (focus - toneFrom) / (toneTo - toneFrom));
        gl.useProgram(picture.program);
        this.#point(picture.aCorner, picture.corners, 2, 2, 0);
        gl.uniform2f(picture.uCanvas, across, down);
        gl.uniform2f(picture.uCentre, ...centre);
        gl.uniform2f(picture.uSize, ...size);
        gl.uniform2f(picture.uBlur, blur / size[0], blur / size[1]);
        gl.uniform1f(picture.uLod, Math.log2(Math.max(1, blur * ratio * Math.sqrt(Math.PI / TAPS))));
        gl.uniform1f(picture.uTone, 1 - up * (1 + settings.soft));
        gl.drawArrays(gl.TRIANGLES, 0, 6);

        // its lights over it, until they've closed
        const closing = gsap.utils.clamp(0, 1, out / settings.lightsOff);
        if (!lights.count || !closing) return;
        gl.useProgram(lights.program);
        this.#point(lights.aCorner, lights.points, 2, STRIDE, 0);
        this.#point(lights.aAt, lights.points, 2, STRIDE, 2);
        this.#point(lights.aColour, lights.points, 3, STRIDE, 4);
        this.#point(lights.aLight, lights.points, 3, STRIDE, 7);
        gl.uniform2f(lights.uCanvas, across, down);
        gl.uniform2f(lights.uCentre, ...centre);
        gl.uniform2f(lights.uSize, ...size);
        gl.uniform1f(lights.uRadius, settings.disc * size[0] * out);
        gl.uniform1f(lights.uDepth, settings.depth * out);
        gl.uniform1f(lights.uOn, gsap.utils.clamp(0, 1, focus / settings.lightsOn));
        gl.uniform1f(
            lights.uGlow,
            settings.glow * (1 + (settings.gather - 1) * focus) * closing * closing * (3 - 2 * closing),
        );
        gl.uniform1f(lights.uPixel, 0.75 / ratio);
        gl.drawArrays(gl.TRIANGLES, 0, lights.count);
        [lights.aAt, lights.aColour, lights.aLight].forEach(index => gl.disableVertexAttribArray(index));
    }

    // An attribute read from a buffer: size numbers of every stride, from offset
    #point(index, buffer, size, stride, offset) {
        const {gl} = this;
        gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
        gl.enableVertexAttribArray(index);
        gl.vertexAttribPointer(index, size, gl.FLOAT, false, stride * 4, offset * 4);
    }
}
