#version 300 es
precision highp float;

uniform sampler2D u_input;
uniform vec2 u_texSize;
uniform float u_step;

in vec2 v_uv;
out vec4 fragColor;

void main() {
    float bestDist = 9999.0;
    vec2 bestCoord = vec2(-1.0);
    // float bestInside = 0.0;
    
    // Check 3x3 neighbors
    for (int y = -1; y <= 1; y++) {
        for (int x = -1; x <= 1; x++) {
            vec2 offset = vec2(float(x), float(y)) * u_step;
            vec2 sampleUV = v_uv + offset / u_texSize;
            
            // Clamp sample to 0-1
            sampleUV = clamp(sampleUV, 0.0, 1.0);
            
            vec4 data = texture(u_input, sampleUV);
            vec2 seedCoord = data.xy;
            
            if (seedCoord.x != -1.0) { // If valid seed
                float dist = distance(v_uv, seedCoord);
                if (dist < bestDist) {
                    bestDist = dist;
                    bestCoord = seedCoord;
                    // bestInside = data.z; // Propagate the "inside" flag of the seed? 
                    // No, we want the Coordinate.
                }
            }
        }
    }
    
    // Pass along the best coordinate found
    fragColor = vec4(bestCoord, 0.0, 1.0);
}
