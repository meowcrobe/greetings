#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform int u_mode; // 0 = texture (alpha), 1 = flow
uniform float u_opacity;

in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec4 data = texture(u_texture, v_uv);
    
    if (u_mode == 0) {
        // Render Original Text (Alpha)
        // Use text color (white) and modulate alpha
        fragColor = vec4(data.rgb, data.a * u_opacity);
    } else {
        // Render Flow Texture Raw Data
        // xy = Absolute Target Position (UV)
        // z  = Distance
        // w  = Inside Mask
        
        // Visualizing as: R=x, G=y, B=z
        fragColor = vec4(data.xy, data.z, 1.0);
    }
}
