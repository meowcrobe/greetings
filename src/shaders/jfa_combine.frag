#version 300 es
precision highp float;

uniform sampler2D u_standard; 
uniform sampler2D u_inverse; 

in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec4 std = texture(u_standard, v_uv);
    vec2 seed = std.xy;
    
    if (seed.x < 0.0) {
        fragColor = vec4(0.0);
        return;
    }

    float dist = distance(seed, v_uv);
    vec2 flow = seed - v_uv;
    
    float inside = (dist < 0.001) ? 1.0 : 0.0;
    
    // RG: Vector to Surface
    // B: Distance
    // A: Inside Mask
    fragColor = vec4(flow, dist, inside);
}