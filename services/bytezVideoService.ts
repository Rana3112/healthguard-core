const key = "d6343b758979487687325863be79b371";

export async function generateVideo(prompt: string, durationStr: string = 'medium', resolutionStr: string = 'landscape'): Promise<string> {

    // Map duration to frames (8N+1 rule)
    let num_frames = 161; // Default medium (~5.3s)
    if (durationStr === 'short') num_frames = 81; // (~2.7s)
    if (durationStr === 'long') num_frames = 257; // (~8.5s)

    // Map resolution
    let width = 1280;
    let height = 720;
    if (resolutionStr === 'portrait') {
        width = 720;
        height = 1280;
    } else if (resolutionStr === 'square') {
        width = 1024;
        height = 1024;
    }

    try {
        const response = await fetch("https://api.bytez.com/models/v2/Lightricks/LTX-Video-0.9.7-dev", {
            method: "POST",
            headers: {
                "Authorization": `Key ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                input: prompt,
                num_frames: num_frames,
                width: width,
                height: height,
                guidance_scale: 3.5,
                num_inference_steps: 30
            })
        });

        if (!response.ok) {
            let errorMsg = response.statusText;
            try {
                const errorData = await response.json();
                if (errorData.error) errorMsg = errorData.error;
            } catch (e) {
                // ignore
            }
            throw new Error(errorMsg);
        }

        const data = await response.json();
        const output = data.output;

        if (typeof output === 'string') {
            return output;
        }

        if (output && typeof output === 'object') {
            if ('url' in output) return output.url as string;
            if (Array.isArray(output) && typeof output[0] === 'string') return output[0];
        }

        throw new Error("Unexpected output format from Video API");
    } catch (error: any) {
        console.error("Bytez Video API error:", error);
        throw new Error(error.message || "Failed to generate video");
    }
}
