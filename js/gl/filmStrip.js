// A strip of film drawn in WebGL: the frames, rolling, bent round a large drum
// like film round a projector's sprocket wheel (flat and facing the viewer in
// the middle of the page, turning away into depth towards both edges, and
// darker as it turns), with the wear of old film over it: grain that changes
// 24 times a second, thin scratches that come and go, dust and flicker.
//
// render(view) draws it as view describes: reveal, how far it has opened from
// the line through its middle (0 to 1); offset, how far the film has run, in
// px; wear, how much wear shows (0 to 1). The canvas is the page's width and
// the strip's height, inside the strip, at its left edge.

import {loaded} from '../hoverCards.js';
import {positionsOf, programOf, textureOf} from './program.js';

const settings = {
    // the drum's radius and the camera's distance from the page, as parts of the page's width: the
    // smaller the radius, the stronger the bend; the further the camera, the flatter the perspective.
    // The strip reaches the page's edges while radius × distance / (radius + distance) is at least 0.5
    radius: 0.62,
    distance: 3,
    // how dark the film gets where it has turned furthest away (1 for not at all)
    shade: 0.35,
    // how bright the frames are, so the text over them stays readable
    brightness: 0.5,
    // the gap between frames, in px
    gap: 15,
    // the wear: film runs at 24 frames a second, and so does it
    fps: 24,
    grainSize: 1.5,
    grain: 0.16,
    scratch: 0.7,
    scratchWidth: 1.6,
    dust: 0.012,
    dustStrength: 0.8,
    flicker: 0.1,
    // columns of the strip's mesh, along the drum
    columns: 240,
};

const VERTEX = /* glsl */ `
attribute vec2 aPosition;

uniform vec2 uSize;
uniform float uLength;
uniform float uRadius;
uniform float uDistance;
uniform float uHeight;

varying float vAlong;
varying float vAcross;
varying float vLight;

void main() {
    // along the strip, in px from the middle of the page, and across it, 0 at the top
    float along = (aPosition.x - 0.5) * uLength;
    float across = aPosition.y;

    // round the drum: facing the viewer in the middle, turning away towards the ends
    float angle = along / uRadius;
    float x = uRadius * sin(angle);
    float z = uRadius * (cos(angle) - 1.0);
    float scale = uDistance / (uDistance - z);

    vec2 page = vec2(uSize.x * 0.5 + x * scale, uSize.y * 0.5 + (across - 0.5) * uHeight * scale);
    vAlong = along;
    vAcross = across;
    vLight = cos(angle);
    gl_Position = vec4(page.x / uSize.x * 2.0 - 1.0, 1.0 - page.y / uSize.y * 2.0, 0.0, 1.0);
}
`;

const FRAGMENT = /* glsl */ `
precision highp float;

uniform sampler2D uFrames;
uniform float uCount;
uniform float uFrameWidth;
uniform float uStride;
uniform float uHeight;
uniform float uOffset;
uniform float uReveal;
uniform float uShade;
uniform float uBrightness;
uniform float uWear;
uniform float uFrame;
uniform float uGrainSize;
uniform float uGrain;
uniform float uScratch;
uniform float uScratchWidth;
uniform float uDust;
uniform float uDustStrength;
uniform float uFlicker;

varying float vAlong;
varying float vAcross;
varying float vLight;

float hash(vec2 p) {
    p = fract(p * vec2(123.34, 456.21));
    p += dot(p, p + 45.32);
    return fract(p.x * p.y);
}

float hash1(float n) {
    return hash(vec2(n, n * 0.37 + 1.0));
}

void main() {
    // open from the line through its middle
    if (abs(vAcross - 0.5) * 2.0 > uReveal) discard;

    // which frame, and where in it; nothing in the gaps between frames
    float film = vAlong + uOffset;
    float index = floor(film / uStride);
    float inFrame = film - index * uStride;
    if (inFrame > uFrameWidth) discard;
    index = mod(index, uCount);
    float u = (index + clamp(inFrame / uFrameWidth, 0.002, 0.998)) / uCount;
    vec3 colour = texture2D(uFrames, vec2(u, 1.0 - vAcross)).rgb;
    colour *= uBrightness * mix(uShade, 1.0, max(vLight, 0.0));

    // the wear, in px on the strip, so it bends with it
    vec2 px = vec2(vAlong, vAcross * uHeight);
    float grain = (hash(floor(px / uGrainSize) + uFrame * 17.13) - 0.5) * 2.0 * uGrain;
    float scratch = 0.0;
    for (int i = 0; i < 4; i++) {
        float n = float(i);
        float seed = floor(uFrame / (2.0 + n)) + n * 13.1;
        float on = step(0.55, hash1(seed * 1.7));
        float x = (hash1(seed * 3.3) - 0.5) * 2000.0 + sin(vAcross * 9.0 + seed) * 2.0;
        float width = 0.5 + hash1(seed * 5.1) * uScratchWidth;
        float line = smoothstep(width, 0.0, abs(px.x - x));
        float whole = step(0.25, hash1(floor(vAcross * 5.0) + seed * 7.0));
        scratch += line * on * whole * (0.5 + 0.5 * hash1(seed * 9.7));
    }
    scratch *= uScratch;
    vec2 cell = floor(px / 40.0);
    float pick = hash(cell + uFrame * 3.7);
    vec2 centre = (cell + vec2(hash(cell + uFrame), hash(cell - uFrame))) * 40.0;
    float speck = step(1.0 - uDust, pick) * smoothstep(2.6, 0.6, length(px - centre)) * uDustStrength;
    float flicker = (hash1(uFrame * 1.31) - 0.5) * 2.0 * uFlicker;
    float shade = (grain + scratch + flicker - speck) * uWear;
    colour = shade > 0.0 ? mix(colour, vec3(1.0, 0.96, 0.88), min(shade, 1.0)) : colour * (1.0 + shade);

    gl_FragColor = vec4(colour, 1.0);
}
`;

// The strip's mesh: columns along it, one row across, x and y from 0 to 1
const mesh = columns => {
    const positions = [];
    for (let i = 0; i <= columns; i++) positions.push(i / columns, 0, i / columns, 1);
    const indices = [];
    for (let i = 0; i < columns; i++) {
        const a = i * 2;
        indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    }
    return {positions: new Float32Array(positions), indices: new Uint16Array(indices)};
};

export class FilmStrip {
    // the length of film one round of its frames takes, in px, once sized
    loop = 0;

    constructor(strip, sources) {
        this.strip = strip;
        this.canvas = document.createElement('canvas');
        this.canvas.className = 'film-strip';
        const gl = this.canvas.getContext('webgl', {antialias: true});
        if (!gl) return;
        this.gl = gl;
        this.count = sources.length;

        const program = programOf(gl, VERTEX, FRAGMENT);

        const {positions, indices} = mesh(settings.columns);
        this.elements = indices.length;
        positionsOf(gl, program, positions);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, indices, gl.STATIC_DRAW);

        this.uniforms = {};
        const names = [
            'uSize',
            'uLength',
            'uRadius',
            'uDistance',
            'uHeight',
            'uFrameWidth',
            'uStride',
            'uOffset',
            'uReveal',
            'uWear',
            'uFrame',
        ];
        names.forEach(name => (this.uniforms[name] = gl.getUniformLocation(program, name)));
        const set = (name, value) => gl.uniform1f(gl.getUniformLocation(program, name), value);
        set('uCount', this.count);
        set('uShade', settings.shade);
        set('uBrightness', settings.brightness);
        set('uGrainSize', settings.grainSize);
        set('uGrain', settings.grain);
        set('uScratch', settings.scratch);
        set('uScratchWidth', settings.scratchWidth);
        set('uDust', settings.dust);
        set('uDustStrength', settings.dustStrength);
        set('uFlicker', settings.flicker);
        gl.clearColor(0, 0, 0, 0);

        // the frames side by side in one picture, a power of two wide and high so it can be mipmapped
        this.ready = Promise.all(
            sources.map(src => {
                const image = new Image();
                image.src = src;
                return loaded(image).then(() => image);
            }),
        ).then(images => {
            const max = gl.getParameter(gl.MAX_TEXTURE_SIZE);
            const atlas = document.createElement('canvas');
            atlas.width = Math.min(4096, max);
            atlas.height = atlas.width / 8;
            const context = atlas.getContext('2d');
            const slot = atlas.width / images.length;
            images.forEach((image, i) => context.drawImage(image, i * slot, 0, slot, atlas.height));
            textureOf(gl);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
            gl.generateMipmap(gl.TEXTURE_2D);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
            this.isReady = true;
        });

        strip.append(this.canvas);
    }

    get works() {
        return Boolean(this.gl);
    }

    // the page's width and the strip's height; the frames 3:2 at that height
    resize() {
        const {gl, canvas, uniforms} = this;
        const width = document.documentElement.clientWidth;
        const height = this.strip.offsetHeight;
        const ratio = Math.min(window.devicePixelRatio, 2);
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
        canvas.width = Math.round(width * ratio);
        canvas.height = Math.round(height * ratio);
        gl.viewport(0, 0, canvas.width, canvas.height);

        const radius = settings.radius * width;
        const frameWidth = height * 1.5;
        const stride = frameWidth + settings.gap;
        this.loop = stride * this.count;
        gl.uniform2f(uniforms.uSize, width, height);
        // half round the drum each way, more than the page ever shows
        gl.uniform1f(uniforms.uLength, Math.PI * radius);
        gl.uniform1f(uniforms.uRadius, radius);
        gl.uniform1f(uniforms.uDistance, settings.distance * width);
        gl.uniform1f(uniforms.uHeight, height);
        gl.uniform1f(uniforms.uFrameWidth, frameWidth);
        gl.uniform1f(uniforms.uStride, stride);
    }

    render({reveal, offset, wear}) {
        const {gl, uniforms} = this;
        gl.clear(gl.COLOR_BUFFER_BIT);
        if (!this.isReady || reveal <= 0) return;
        gl.uniform1f(uniforms.uReveal, reveal);
        gl.uniform1f(uniforms.uOffset, offset);
        gl.uniform1f(uniforms.uWear, wear);
        // kept small, so the noise stays exact
        gl.uniform1f(uniforms.uFrame, Math.floor(gsap.ticker.time * settings.fps) % 1000);
        gl.drawElements(gl.TRIANGLES, this.elements, gl.UNSIGNED_SHORT, 0);
    }
}
