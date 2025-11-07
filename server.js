import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import neo4j from "neo4j-driver";
import fs from "fs";
import path from "path";
import multer from "multer";
import { fileURLToPath } from "url";

dotenv.config();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json({ limit: "200mb" }));
app.use(express.urlencoded({ extended: true, limit: "200mb" }));
app.use(express.static("public"));

const upload = multer({ dest: "uploads/" });

const PORT = process.env.PORT || 5040;

// Utility to save full log and return public URL
function saveLogAndGetUrl(baseDir, content) {
  const logsDir = path.join(baseDir, "public", "logs");
  if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
  const name = `log-${Date.now()}.json`;
  const filePath = path.join(logsDir, name);
  fs.writeFileSync(filePath, JSON.stringify(content, null, 2), "utf-8");
  return `/logs/${name}`;
}

// Main streaming endpoint: accepts JSON body { queries, batchSize (logical), microSize, delayMs }
app.post("/run-live-fast", async (req, res) => {
  const { queries = [], batchSize = 50000, microSize = 100, delayMs = 500 } = req.body;

  // Prepare SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  if (!Array.isArray(queries) || queries.length === 0) {
    res.write(`data: ${JSON.stringify({ status: "error", message: "No queries provided" })}\n\n`);
    res.end();
    return;
  }

  const driver = neo4j.driver(
    process.env.NEO4J_URI,
    neo4j.auth.basic(process.env.NEO4J_USER, process.env.NEO4J_PASS)
  );
  const session = driver.session();

  const totalQueries = queries.length;
  const logicalBatches = Math.ceil(totalQueries / batchSize);
  const fullLog = []; // store full logs (for download)
  let globalIndex = 0;

  try {
    for (let lb = 0; lb < logicalBatches; lb++) {
      const startIdx = lb * batchSize;
      const endIdx = Math.min((lb + 1) * batchSize, totalQueries);
      const logicalSlice = queries.slice(startIdx, endIdx);
      const microBatches = Math.ceil(logicalSlice.length / microSize);

      for (let mb = 0; mb < microBatches; mb++) {
        const mStart = mb * microSize;
        const mEnd = Math.min((mb + 1) * microSize, logicalSlice.length);
        const microSlice = logicalSlice.slice(mStart, mEnd);

        // Begin transaction for micro-batch
        const tx = session.beginTransaction();
        const microResults = [];
        for (let q of microSlice) {
          globalIndex += 1;
          try {
            const result = await tx.run(q);
            const data = result.records.map(r => r.toObject());
            microResults.push({ index: globalIndex, query: q, status: "success", data });
            fullLog.push({ index: globalIndex, query: q, status: "success", data });
          } catch (err) {
            microResults.push({ index: globalIndex, query: q, status: "error", message: err.message });
            fullLog.push({ index: globalIndex, query: q, status: "error", message: err.message });
            // continue on error
          }
        }
        await tx.commit();

        // Send micro-batch progress update (compact)
        res.write(`data: ${JSON.stringify({
          type: "micro-batch",
          logicalBatch: lb + 1,
          logicalBatches,
          microBatch: mb + 1,
          microBatches,
          processed: globalIndex,
          total: totalQueries,
          microSummary: microResults.slice(0,5), // small preview
        })}\n\n`);

        // Keep only last N results for live UI to avoid browser lag
        const lastResults = fullLog.slice(-10);
        res.write(`data: ${JSON.stringify({ type: "latest", lastResults })}\n\n`);

        // Small adaptive delay between micro-batches to give DB breathing room
        await new Promise(r => setTimeout(r, delayMs));
      }
      // After completing logical batch, send logical-batch completion update
      res.write(`data: ${JSON.stringify({ type: "logical-complete", logicalBatch: lb + 1, logicalBatches, processed: globalIndex, total: totalQueries })}\n\n`);
    }

    // Save full log and return public URL
    const logUrl = saveLogAndGetUrl(__dirname, fullLog);

    res.write(`data: ${JSON.stringify({ type: "done", message: "All queries processed", total: totalQueries, logUrl })}\n\n`);
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: "error", message: err.message })}\n\n`);
  } finally {
    try { await session.close(); } catch(e){}
    try { await driver.close(); } catch(e){}
    res.end();
  }
});

// Upload endpoint to accept large .txt file with queries (one per line)
app.post("/upload-queries", upload.single("file"), (req, res) => {
  const file = req.file;
  if (!file) return res.status(400).json({ error: "No file uploaded" });
  const content = fs.readFileSync(file.path, "utf-8");
  // split by newline, or semicolon-newline
  const queries = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  fs.unlinkSync(file.path);
  res.json({ count: queries.length, queries });
});

app.listen(PORT, () => console.log(`🚀 Fast server running on http://localhost:${PORT}`));
