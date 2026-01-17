import './style.css';
import SIM_VERT from './shaders/sim.vert';
import SIM_FRAG from './shaders/sim.frag';
import RENDER_VERT from './shaders/render.vert';
import RENDER_FRAG from './shaders/render.frag';
import QUAD_VERT from './shaders/quad.vert';
import DEBUG_FRAG from './shaders/debug.frag';
import { TextManager } from './text-manager';

const names = [
    "aBe", "action", "Gabor U", "Raphaël (no DMs)", "Stef Tervelde",
    "David", "tom", "Hannah Azok", "Marcel O.", "Diana Hidalgo",
    "Daksha", "Booker Sessoms", "Patrick François", "Emilia Wojnicka"
];

function hsv2rgb(h: number, s: number, v: number): [number, number, number] {
    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;
    
    let r=0, g=0, b=0;
    if (0 <= h && h < 60) { r=c; g=x; b=0; }
    else if (60 <= h && h < 120) { r=x; g=c; b=0; }
    else if (120 <= h && h < 180) { r=0; g=c; b=x; }
    else if (180 <= h && h < 240) { r=0; g=x; b=c; }
    else if (240 <= h && h < 300) { r=x; g=0; b=c; }
    else if (300 <= h && h < 360) { r=c; g=0; b=x; }
    
    return [r+m, g+m, b+m];
}

function stringToHue(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
        hash = str.charCodeAt(i) + ((hash << 5) - hash);
    }
    // Exclude Red (around 0/360). Valid range 60..300.
    const normalized = (Math.abs(hash) % 240) + 60;
    return normalized;
}

class ParticleSystem {
  canvas: HTMLCanvasElement;
  gl: WebGL2RenderingContext;
  
  textManager: TextManager;
  debugProgram: WebGLProgram;

  sqrtNumParticles: number = 128;
  numParticles: number;
  
  simProgram: WebGLProgram;
  renderProgram: WebGLProgram;
  
  posTextures: WebGLTexture[] = [];
  framebuffers: WebGLFramebuffer[] = [];
  currentIdx: number = 0;
  
  quadVao: WebGLVertexArrayObject;
  
  startTime: number;
  lastScrollY: number = 0;
  getScrollY: () => number;

  // Sequence State
  phaseDuration: number = 7.0;
  lastSwitchTime: number = 0;
  coupleIndex: number = 0;
  path: string[] = [];
  pathIndex: number = 0;
  pathDir: number = 1;
  
  // Colors
  currentColors: { a: [number, number, number], b: [number, number, number] } = { a:[0,0,0], b:[0,0,0] };
  targetColors: { a: [number, number, number], b: [number, number, number] } = { a:[0,0,0], b:[0,0,0] };

  constructor(canvas: HTMLCanvasElement, getScrollY: () => number) {
    this.canvas = canvas;
    this.getScrollY = getScrollY;
    const gl = canvas.getContext('webgl2');
    if (!gl) throw new Error('WebGL 2 not supported');
    this.gl = gl;
    
    if (!gl.getExtension('EXT_color_buffer_float')) {
        console.warn('Float textures not supported');
    }
    gl.getExtension('EXT_float_blend');

    this.numParticles = this.sqrtNumParticles * this.sqrtNumParticles;
    this.startTime = performance.now();

    this.simProgram = this.createProgram(SIM_VERT, SIM_FRAG);
    this.renderProgram = this.createProgram(RENDER_VERT, RENDER_FRAG);
    this.debugProgram = this.createProgram(QUAD_VERT, DEBUG_FRAG);
    
    this.textManager = new TextManager(gl);

    this.initTextures();
    this.quadVao = this.createQuad();
    
    // Initialize Sequence
    this.buildPath();
    this.updateText();
    // Initialize current color to target immediately
    this.currentColors.a = [...this.targetColors.a];
    this.currentColors.b = [...this.targetColors.b];
    
    this.animate = this.animate.bind(this);
    requestAnimationFrame(this.animate);
  }

  buildPath() {
    const name = names[this.coupleIndex];
    this.path = [name];
    
    // Reset index
    this.pathIndex = 0;
    this.pathDir = 1;
  }
  
  updateText() {
    const text = this.path[this.pathIndex];
    this.textManager.renderText(text);
    this.textManager.computeJFA();
    
    // Update Target Colors
    if (text === "CCB") {
        this.targetColors.a = [1, 1, 1]; // White
        this.targetColors.b = [0, 0.2, 1.0]; // Blue
    } else if (text === "❤" || text === "<3" || text === "♥") {
        // Center on Red (0) -> -20 to +20
        this.targetColors.a = hsv2rgb(340, 1, 1); 
        this.targetColors.b = hsv2rgb(20, 1, 1); 
    } else {
        // Center on Random
        const hue = stringToHue(text);
        this.targetColors.a = hsv2rgb((hue - 20 + 360) % 360, 1, 1);
        this.targetColors.b = hsv2rgb((hue + 20) % 360, 1, 1);
    }
  }
  
  stepSequence() {
    this.pathIndex++;
    if (this.pathIndex >= this.path.length) {
        this.coupleIndex = (this.coupleIndex + 1) % names.length;
        this.buildPath();
    }
    this.updateText();
  }

  createProgram(vsSource: string, fsSource: string) {
    const gl = this.gl;
    const vs = gl.createShader(gl.VERTEX_SHADER)!;
    gl.shaderSource(vs, vsSource);
    gl.compileShader(vs);
    if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(vs));
    }

    const fs = gl.createShader(gl.FRAGMENT_SHADER)!;
    gl.shaderSource(fs, fsSource);
    gl.compileShader(fs);
    if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(fs));
    }

    const prog = gl.createProgram()!;
    gl.attachShader(prog, vs);
    gl.attachShader(prog, fs);
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(prog));
    }
    return prog;
  }

  initTextures() {
    const gl = this.gl;
    const size = this.sqrtNumParticles;
    const data = new Float32Array(size * size * 4);
    
    for(let i=0; i<this.numParticles; i++) {
        data[i*4 + 0] = (Math.random() * 2 - 1) * 2.0; 
        data[i*4 + 1] = (Math.random() * 2 - 1) * 2.0; 
        data[i*4 + 2] = Math.random() * 2.0;     
        data[i*4 + 3] = 1.0;
    }

    for(let i=0; i<2; i++) {
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, size, size, 0, gl.RGBA, gl.FLOAT, data);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        this.posTextures.push(tex);

        const fb = gl.createFramebuffer()!;
        gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        this.framebuffers.push(fb);
    }
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  createQuad() {
    const gl = this.gl;
    const vao = gl.createVertexArray()!;
    gl.bindVertexArray(vao);
    
    const buf = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1, -1,  1, -1,  -1, 1,  1, 1
    ]), gl.STATIC_DRAW);
    
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    
    return vao;
  }

  resize(width: number, height: number) {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  animate() {
    const gl = this.gl;
    const time = (performance.now() - this.startTime) / 1000;
    
    // Sequence Logic
    if (time - this.lastSwitchTime > this.phaseDuration) {
        this.lastSwitchTime = time;
        this.stepSequence();
    }
    
    // Color Lerp
    const lerp = (a: number[], b: number[], t: number) => a.map((v, i) => v + (b[i] - v) * t) as [number, number, number];
    const dt = 0.01; 
    this.currentColors.a = lerp(this.currentColors.a, this.targetColors.a, dt);
    this.currentColors.b = lerp(this.currentColors.b, this.targetColors.b, dt);
    
    const readIdx = this.currentIdx;
    const writeIdx = (this.currentIdx + 1) % 2;

    gl.disable(gl.BLEND);
    gl.useProgram(this.simProgram);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.framebuffers[writeIdx]);
    gl.viewport(0, 0, this.sqrtNumParticles, this.sqrtNumParticles);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTextures[readIdx]);
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "inPosTex"), 0);
    
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, this.textManager.getFlowTexture());
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "flowMap"), 1);
    
    // No inverse map binding needed if using combined map in flowMap?
    // Wait, sim.frag uses flowMap. Combined map IS flowMap.
    
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "sqrtNumParticles"), this.sqrtNumParticles);
    gl.uniform1i(gl.getUniformLocation(this.simProgram, "numParticles"), this.numParticles);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "invSqrtNumParticles"), 1.0/this.sqrtNumParticles);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "invNumParticles"), 1.0/this.numParticles);
    
    const currentScrollY = this.getScrollY();
    const deltaY = (currentScrollY - this.lastScrollY) / this.canvas.height;
    this.lastScrollY = currentScrollY;
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "scrollDelta"), deltaY);

    // Flow Strength Modulation
    const elapsed = time - this.lastSwitchTime;
    const phase = Math.min(elapsed / this.phaseDuration, 1.0);
    const rawFlow = 1.0 - Math.cos(phase * Math.PI * 2.0);
    console.log(rawFlow); 
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "flowStrength"), rawFlow * 2.);

    gl.uniform1f(gl.getUniformLocation(this.simProgram, "time"), time * 0.2);
    
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "driftAmount"), 0.4); 
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "noiseAmount"), 0.5);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "yWind"), 0.0); // Reset wind to 0
    
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "speed"), 0.03); // * (3.0 - rawFlow));
    
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "zCenter"), 1.8);
    gl.uniform1f(gl.getUniformLocation(this.simProgram, "zGravity"), 0.1);
    
    const aspectX = Math.sqrt(this.canvas.width / this.canvas.height);
    gl.uniform2f(gl.getUniformLocation(this.simProgram, "aspect"), aspectX, 1.0/aspectX);

    gl.bindVertexArray(this.quadVao);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE); 

    gl.useProgram(this.renderProgram);
    
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.posTextures[writeIdx]); 
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, "positionsTex"), 0);
    
    gl.uniform1i(gl.getUniformLocation(this.renderProgram, "sqrtNumParticles"), this.sqrtNumParticles);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "invSqrtNumParticles"), 1.0/this.sqrtNumParticles);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "invNumParticles"), 1.0/this.numParticles);
    
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "intensityFactor"), 1.0);
    
    // Focus Distance Animation (4.0 -> 1.5 -> 4.0)
    // Peak (1.5) at phase 0.5
    const focusCos = Math.cos((phase - 0.5) * Math.PI * 2.0);
    const focusDistance = 2.75 - 1.25 * focusCos;
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "focusDistance"), focusDistance);

    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "invMaxDistance"), 0.1);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "maxDistanceSlope"), 1.0);
    
    // Use dynamic colors
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, "colorA"), this.currentColors.a); 
    gl.uniform3fv(gl.getUniformLocation(this.renderProgram, "colorB"), this.currentColors.b); 
    gl.uniform3f(gl.getUniformLocation(this.renderProgram, "intensityColor"), 1.0, 0.7, 0.2);  
    
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "dofAmount"), 2);
    gl.uniform2f(gl.getUniformLocation(this.renderProgram, "aspect"), aspectX, 1.0/aspectX);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "particleSize"), 0.008);
    
    // Sync blink to phase for consistent timing
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "blinkPhase"), phase);
    
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "blinkAmount"), 3.0);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "blinkSlope"), 15.0);
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "relativeFeather"), 0.5); 
    gl.uniform1f(gl.getUniformLocation(this.renderProgram, "maxFd"), 3.0); 

    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.numParticles);

    this.renderDebug();

    this.currentIdx = writeIdx;
    requestAnimationFrame(this.animate);
  }

  renderDebug() {
    const gl = this.gl;
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);
    gl.useProgram(this.debugProgram);
    gl.bindVertexArray(this.quadVao);
    
    // Top Left: 16:9 small (320x180)
    const debugW = 320;
    const debugH = 180;
    
    gl.viewport(0, this.canvas.height - debugH, debugW, debugH);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, this.textManager.textTexture);
    gl.uniform1i(gl.getUniformLocation(this.debugProgram, "u_texture"), 0);
    gl.uniform1i(gl.getUniformLocation(this.debugProgram, "u_mode"), 0);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    
    gl.viewport(this.canvas.width - debugW, this.canvas.height - debugH, debugW, debugH);
    gl.bindTexture(gl.TEXTURE_2D, this.textManager.getFlowTexture());
    gl.uniform1i(gl.getUniformLocation(this.debugProgram, "u_mode"), 1);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }
}

const canvas = document.getElementById('canvas') as HTMLCanvasElement;
const system = new ParticleSystem(canvas, () => 0);

window.addEventListener('resize', () => {
    system.resize(window.innerWidth, window.innerHeight);
});
system.resize(window.innerWidth, window.innerHeight);