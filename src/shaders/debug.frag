#version 300 es
precision highp float;

uniform sampler2D u_texture;
uniform int u_mode; // 0 = texture (alpha), 1 = flow

in vec2 v_uv;
out vec4 fragColor;

void main() {
    vec4 data = texture(u_texture, v_uv);
    
    if (u_mode == 0) {
        // Render Original Text (Alpha)
        float a = data.a;
        fragColor = vec4(vec3(a), 1.0);
    } else {
        // Render Flow
        vec2 seed = data.xy;
        if (seed.x < 0.0) {
             fragColor = vec4(1.0, 0.0, 0.0, 1.0); // No seed found
        } else {
            vec2 flow = seed - v_uv; 
            // Normalize direction for visualization
            // Or just raw? User said *0.5 + 0.5
            // If flow is large, it clamps.
            // Let's normalize to show direction clearly.
            float d = length(flow);
            if (d > 0.001) {
                flow = normalize(flow);
            } else {
                flow = vec2(0.0); // Inside
            }
            fragColor = vec4(flow * 0.5 + 0.5, d, 1.0); // B channel = distance
        }
    }
}
