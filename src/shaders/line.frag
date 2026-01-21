#version 300 es
precision highp float;

uniform vec3 colorA;
uniform vec3 colorB;
uniform float intensity;

in float vMix;
flat in float vDistAlpha;

out vec4 fragColor;

void main() {
    // Mix colors similar to particles
    vec3 col = mix(colorA, colorB, vMix);
    
    // Very subtle lines
    fragColor = vec4(col, vDistAlpha * intensity);
}
