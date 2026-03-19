import Bytez from "bytez.js";
import fs from "fs";

async function test() {
    const key = "d6343b758979487687325863be79b371";
    const sdk = new Bytez(key);
    const model = sdk.model("stabilityai/stable-diffusion-xl-base-1.0");
    const { error, output } = await model.run("A cat in a wizard hat");
    console.log("Error:", error);
    console.log("Output type:", typeof output);
    if (Array.isArray(output)) console.log("Output is array");
    if (Buffer.isBuffer(output)) {
        console.log("Output is buffer, size:", output.length);
        fs.writeFileSync("test_cat.jpg", output);
        console.log("Saved to test_cat.jpg");
    } else if (typeof output === 'string') {
        console.log("Output string preview:", output.substring(0, 100));
    } else {
        console.log("Output structure:", JSON.stringify(output).substring(0, 200));
    }
}
test();
