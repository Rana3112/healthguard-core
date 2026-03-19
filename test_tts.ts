import { GoogleGenAI } from "@google/genai";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

async function testTTS() {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    try {
        const response = await ai.models.generateContent({
            model: "gemini-2.0-flash", // Using standard flash instead of -exp
            contents: [{ parts: [{ text: "Hello, this is a test." }] }],
            config: {
                responseModalities: ["AUDIO"],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Kore' },
                    },
                },
            },
        });

        console.log("Response parts:", JSON.stringify(response.candidates?.[0]?.content?.parts, null, 2));
    } catch (e) {
        console.error("API Error:", e);
    }
}

testTTS();
