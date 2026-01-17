#version 300 es
precision highp float;

uniform sampler2D u_text;
uniform bool u_inverse;
in vec2 v_uv;
out vec4 fragColor;

void main() {
    float alpha = texture(u_text, v_uv).a;
    
    // u_inverse = false: Seed = Text (alpha > 0.5)
    // u_inverse = true:  Seed = Background (alpha < 0.5)
    bool isSeed = u_inverse ? (alpha < 0.5) : (alpha > 0.5);
    
    if (isSeed) {
        fragColor = vec4(v_uv, 1.0, 1.0); 
    } else {
        fragColor = vec4(-1.0, -1.0, 0.0, 1.0);
    }
}
