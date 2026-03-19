const fs = require('fs');

async function downloadAndCheckSize(url, label) {
    if (!url) { console.log(`[${label}] URL is null`); return; }
    try {
        const res = await fetch(url);
        const buffer = await res.arrayBuffer();
        console.log(`[${label}] File Size: ${buffer.byteLength} bytes`);
    } catch (e) {
        console.log(`[${label}] Error fetched ${url}: ${e}`);
    }
}

async function run() {
    await downloadAndCheckSize("https://cdn.bytez.com/model/output/Lightricks/LTX-Video-0.9.7-dev/dmUzLflmb79hJR6vBsZ6g.mp4", "Duration Flat");
    await downloadAndCheckSize("https://cdn.bytez.com/model/output/Lightricks/LTX-Video-0.9.7-dev/-oYfSJKjBxl4bJFFV1TXJ.mp4", "Duration Nested");
    await downloadAndCheckSize("https://cdn.bytez.com/model/output/Lightricks/LTX-Video-0.9.7-dev/icAZ9LCDhL3Dqdv-bUcG4.mp4", "Resolution String");
}

run();
