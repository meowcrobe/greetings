import QUAD_VERT from './shaders/quad.vert';
import SEED_FRAG from './shaders/jfa_seed.frag';
import STEP_FRAG from './shaders/jfa_step.frag';

export class TextManager {
    gl: WebGL2RenderingContext;
    canvas2d: HTMLCanvasElement;
    ctx2d: CanvasRenderingContext2D;
    
    // Textures
    textTexture: WebGLTexture;
    jfaTextures: WebGLTexture[] = [];
    jfaFbos: WebGLFramebuffer[] = [];
    
    // Programs
    seedProgram: WebGLProgram;
    stepProgram: WebGLProgram;
    
    quadVao: WebGLVertexArrayObject;
    
    width: number = 1024;
    height: number = 576; // 16:9 Aspect Ratio
    finalTexture: WebGLTexture | null = null;
    
    textureFilter: number;

    constructor(gl: WebGL2RenderingContext) {
        this.gl = gl;
        
        // JFA requires NEAREST filtering to propagate exact seeds.
        this.textureFilter = gl.NEAREST;
        
        // 1. Setup 2D Canvas
        this.canvas2d = document.createElement('canvas');
        this.canvas2d.width = this.width;
        this.canvas2d.height = this.height;
        this.ctx2d = this.canvas2d.getContext('2d')!;
        
        // 2. Setup GL Resources
        this.textTexture = this.createTexture(false); // standard RGBA8
        
        for(let i=0; i<2; i++) {
            this.jfaTextures[i] = this.createTexture(true); // float
            this.jfaFbos[i] = gl.createFramebuffer()!;
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.jfaFbos[i]);
            gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.jfaTextures[i], 0);
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        
        // 3. Compile Shaders
        this.seedProgram = this.createProgram(QUAD_VERT, SEED_FRAG);
        this.stepProgram = this.createProgram(QUAD_VERT, STEP_FRAG);
        
        // 4. Quad
        this.quadVao = this.createQuad();
        
        // 5. Initial Render
        this.renderText("CCB");
        this.computeJFA();
    }
    
    renderText(text: string) {
        const ctx = this.ctx2d;
        // Use clearRect to ensure transparent background (Alpha=0)
        ctx.clearRect(0, 0, this.width, this.height);
        
        ctx.fillStyle = 'white';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        
        // Dynamic Sizing
        // Use width as constraint mainly
        const maxWidth = this.width * 0.8;
        
        let fontSize = 300;
        ctx.font = `bold ${fontSize}px sans-serif`;
        const textMetrics = ctx.measureText(text);
        
        if (textMetrics.width > maxWidth) {
            const scale = maxWidth / textMetrics.width;
            fontSize = Math.floor(fontSize * scale);
            ctx.font = `bold ${fontSize}px sans-serif`;
        }
        
        ctx.fillText(text, this.width/2, this.height/2);
        
        // Upload to texture
        const gl = this.gl;
        gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, this.canvas2d);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); // Reset
    }
    
    computeJFA() {
        const gl = this.gl;
        gl.viewport(0, 0, this.width, this.height);
        gl.disable(gl.BLEND);
        
        // Pass 1: Seed
        gl.useProgram(this.seedProgram);
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.jfaFbos[0]);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.textTexture);
        gl.uniform1i(gl.getUniformLocation(this.seedProgram, "u_text"), 0);
        
        gl.bindVertexArray(this.quadVao);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        
        // Pass 2..N: Steps
        gl.useProgram(this.stepProgram);
        gl.uniform2f(gl.getUniformLocation(this.stepProgram, "u_texSize"), this.width, this.height);
        gl.uniform1i(gl.getUniformLocation(this.stepProgram, "u_input"), 0);
        
        let readIdx = 0;
        // Use max dimension for step
        let step = Math.max(this.width, this.height) / 2;
        
        while (step >= 1) {
            const writeIdx = 1 - readIdx;
            
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.jfaFbos[writeIdx]);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.jfaTextures[readIdx]);
            
            gl.uniform1f(gl.getUniformLocation(this.stepProgram, "u_step"), step);
            
            gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
            
            readIdx = writeIdx;
            step /= 2;
        }
        
        this.finalTexture = this.jfaTextures[readIdx];
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    }
    
    getFlowTexture(): WebGLTexture | null {
        return this.finalTexture;
    }
    
    createTexture(float: boolean): WebGLTexture {
        const gl = this.gl;
        const tex = gl.createTexture()!;
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        
        const filter = float ? this.textureFilter : gl.LINEAR;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
        
        if (float) {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, null);
        } else {
             gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, this.width, this.height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
        }
        return tex;
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
        return prog;
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
}
