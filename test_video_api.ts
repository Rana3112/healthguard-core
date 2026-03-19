import { generateVideo } from "./services/bytezVideoService.ts";

async function test() {
    try {
        console.log("Testing Bytez Video API...");
        const url = await generateVideo("a cat fighting");
        console.log("Success! URL:", url);
    } catch (e) {
        console.error("Error:", e);
    }
}
test();
