#version 300 es
precision highp float;

uniform sampler2D u_standard; 
uniform sampler2D u_inverse; 

in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec4 std = texture(u_standard, v_uv);
    vec2 stdSeed = std.xy;
    
    if (stdSeed.x < 0.0) {
        fragColor = vec4(-1.0);
        return;
    }

    float dist = distance(stdSeed, v_uv);
    
    // Check if Inside (Standard JFA Distance ~ 0)
    if (dist < 0.002) {
        // Inside
        vec4 inv = texture(u_inverse, v_uv);
        vec2 edgeSeed = inv.xy;
        
        if (edgeSeed.x > -0.5) {
            vec2 virtualTarget = 2.0 * v_uv - edgeSeed;
            virtualTarget = clamp(virtualTarget, 0.0, 1.0);
            
            // RG=Target, B=Distance(0), A=Inside(1)
            fragColor = vec4(virtualTarget, 0.0, 1.0);
        } else {
            fragColor = vec4(v_uv, 0.0, 1.0);
        }
    } else {
        // Outside
        // RG=Target, B=Distance, A=Outside(0)
        // User request: 1/2u equals 1 -> dist * 2.0
        fragColor = vec4(stdSeed, dist * 2.0, 0.0);
    }
}