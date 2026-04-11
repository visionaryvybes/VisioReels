import { NextResponse } from "next/server";
import fs from "fs";

const LOG_FILE = "/tmp/visio-install.log";

export async function GET() {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      // Send existing log content immediately
      let lastSize = 0;

      const send = (data: string) => {
        const lines = data.split("\n").filter(Boolean);
        for (const line of lines) {
          const msg = `data: ${JSON.stringify({ line, ts: new Date().toISOString() })}\n\n`;
          controller.enqueue(encoder.encode(msg));
        }
      };

      // Read whatever exists so far
      if (fs.existsSync(LOG_FILE)) {
        const content = fs.readFileSync(LOG_FILE, "utf-8");
        send(content);
        lastSize = content.length;
      }

      // Poll for new content every 300ms
      const interval = setInterval(() => {
        try {
          if (!fs.existsSync(LOG_FILE)) return;
          const stat = fs.statSync(LOG_FILE);
          if (stat.size > lastSize) {
            const fd = fs.openSync(LOG_FILE, "r");
            const buf = Buffer.alloc(stat.size - lastSize);
            fs.readSync(fd, buf, 0, buf.length, lastSize);
            fs.closeSync(fd);
            lastSize = stat.size;
            send(buf.toString("utf-8"));
          }
        } catch {
          // file might be in use
        }
      }, 300);

      // Heartbeat every 5s
      const hb = setInterval(() => {
        controller.enqueue(encoder.encode(`: heartbeat\n\n`));
      }, 5000);

      // Cleanup after 30 min
      setTimeout(() => {
        clearInterval(interval);
        clearInterval(hb);
        controller.close();
      }, 30 * 60 * 1000);
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
