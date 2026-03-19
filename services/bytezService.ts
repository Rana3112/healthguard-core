const key = "d6343b758979487687325863be79b371";

export async function generateImage(prompt: string): Promise<string> {
    try {
        const response = await fetch("https://api.bytez.com/models/v2/stabilityai/stable-diffusion-xl-base-1.0", {
            method: "POST",
            headers: {
                "Authorization": `Key ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ input: prompt })
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

        throw new Error("Unexpected output format from Image API");
    } catch (error: any) {
        console.error("Bytez API error:", error);
        throw new Error(error.message || "Failed to generate image");
    }
}
