const key = "d6343b758979487687325863be79b371";

async function testParam(name, body) {
    try {
        console.log(`[${name}] Sending...`, body);
        const response = await fetch("https://api.bytez.com/models/v2/Lightricks/LTX-Video-0.9.7-dev", {
            method: "POST",
            headers: { "Authorization": `Key ${key}`, "Content-Type": "application/json" },
            body: JSON.stringify(body)
        });
        const data = await response.json();
        console.log(`[${name}] Output URL:`, data?.output?.url || data?.output);
    } catch (e) {
        console.error(`[${name}] Error:`, e.message);
    }
}

async function run() {
    // 1. duration in seconds flat
    await testParam("duration_flat", { input: "A static red square", duration: 8, width: 1024, height: 1024 });
    // 2. nested
    await testParam("duration_nested", { input: "A static red square", parameters: { duration: 8, width: 1024, height: 1024 } });
    // 3. resolution string format
    await testParam("resolution_string", { input: "A static red square", resolution: "1024x1024", duration: 8 });
    // 4. params nested
    await testParam("params_nested", { input: "A static red square", params: { duration: 8, width: 1024, height: 1024 } });
}
run();
