const fs = require('fs');

async function downloadAndCheckSize(url, label) {
    const res = await fetch(url);
    const buffer = await res.arrayBuffer();
    console.log(`[${label}] File Size: ${buffer.byteLength} bytes`);
}

async function run() {
    // Both URLs generated from our previous tests
    const url1 = "https://cdn.bytez.com/model/output/Lightricks/LTX-Video-0.9.7-dev/6YIZx5LOtRJFHxpYKt1Lr.mp4"; // The one with num_frames Flat
    const url2 = "https://cdn.bytez.com/model/output/Lightricks/LTX-Video-0.9.7-dev/9nm_YJcFenETmvs3cjMQk.mp4"; // The one with parameters nested

    await downloadAndCheckSize(url1, "Flat Payload");
    await downloadAndCheckSize(url2, "Nested Payload");
}

run();
