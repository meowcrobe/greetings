#version 300 es
precision highp float;

uniform sampler2D u_text;
in vec2 v_uv;
out vec4 fragColor;

void main() {
    float alpha = texture(u_text, v_uv).a;
    // We assume white text on transparent or black background
    // If text, store UV.
    // If background, store -1.
    
    if (alpha > 0.5) {
        fragColor = vec4(v_uv, 1.0, 1.0); // Z=1 (Inside flag, useful for debugging)
    } else {
        fragColor = vec4(-1.0, -1.0, 0.0, 1.0);
    }
}
