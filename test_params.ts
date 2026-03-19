const key = "d6343b758979487687325863be79b371";

async function testApi(name: string, bodyObj: any) {
    try {
        const response = await fetch("https://api.bytez.com/models/v2/Lightricks/LTX-Video-0.9.7-dev", {
            method: "POST",
            headers: {
                "Authorization": `Key ${key}`,
                "Content-Type": "application/json"
            },
            body: JSON.stringify(bodyObj)
        });

        console.log(`[${name}] Status:`, response.status);
        const data = await response.json();
        console.log(`[${name}] URL:`, data?.output?.url || data?.output);
    } catch (e) {
        console.error(`[${name}] Error:`, e);
    }
}

async function run() {
    // Test 1: flat (what we did)
    // await testApi("Flat", { input: "A square red apple", num_frames: 121, width: 768, height: 768 });

    // Test 2: parameters nested
    await testApi("Params", { input: "A square blue apple", parameters: { num_frames: 121, width: 720, height: 1280 } });
}

run();
