const express = require("express");
const path = require("path");
const admin = require("firebase-admin");
const { spawn } = require("child_process");

const app = express();
const PORT = process.env.PORT || 3000;
const SERVICE_ACCOUNT_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS || path.join(__dirname, "object-detection-using-yolo-firebase-adminsdk-fbsvc-cbed1a7872.json");
const YOLO_SERVICE_URL = process.env.YOLO_SERVICE_URL || "http://127.0.0.1:5001/detect";
const YOLO_HEALTH_URL = process.env.YOLO_HEALTH_URL || "http://127.0.0.1:5001/health";

let firestore = null;
let yoloProcess = null;
let yoloReady = false;

function startYoloService() {
    const pythonCmd = process.env.PYTHON_PATH || "python";
    const scriptPath = path.join(__dirname, "yolo_service.py");

    yoloProcess = spawn(pythonCmd, [scriptPath], {
        cwd: __dirname,
        stdio: ["ignore", "pipe", "pipe"]
    });

    yoloProcess.stdout.on("data", (chunk) => {
        const text = chunk.toString();
        if (text.includes("Running on")) {
            yoloReady = true;
        }
        process.stdout.write(`[YOLO] ${text}`);
    });

    yoloProcess.stderr.on("data", (chunk) => {
        process.stderr.write(`[YOLO] ${chunk.toString()}`);
    });

    yoloProcess.on("exit", (code) => {
        yoloReady = false;
        console.log(`[YOLO] process exited with code ${code}`);
    });
}

try {
    // Initialize Firebase Admin from service account file.
    admin.initializeApp({
        credential: admin.credential.cert(require(SERVICE_ACCOUNT_PATH))
    });
    firestore = admin.firestore();
    console.log("Firebase Admin initialized.");
} catch (error) {
    console.error("Firebase Admin initialization failed:", error.message);
}

app.use(express.json({ limit: "1mb" }));
app.use(express.static(__dirname));

app.post("/api/yolo-detect", async (req, res) => {
    try {
        const { imageData, confidence } = req.body || {};
        if (!imageData) {
            return res.status(400).json({ success: false, message: "imageData is required" });
        }

        const yoloResponse = await fetch(YOLO_SERVICE_URL, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                imageData,
                confidence: Number.isFinite(confidence) ? confidence : 0.25
            })
        });

        if (!yoloResponse.ok) {
            const body = await yoloResponse.text();
            return res.status(502).json({
                success: false,
                message: "YOLO service error",
                detail: body
            });
        }

        const payload = await yoloResponse.json();
        return res.json({ success: true, predictions: payload.predictions || [] });
    } catch (error) {
        return res.status(500).json({
            success: false,
            message: "Failed to detect objects with YOLO",
            detail: error?.message || "Unknown error"
        });
    }
});

app.post("/api/detections", async (req, res) => {
    try {
        if (!firestore) {
            return res.status(500).json({ success: false, message: "Firestore is not initialized." });
        }

        const { mode, sourceType, detectedObjects, totalObjects, highConfidenceCount } = req.body || {};
        if (!Array.isArray(detectedObjects)) {
            return res.status(400).json({ success: false, message: "detectedObjects must be an array." });
        }

        const payload = {
            mode: mode || "unknown",
            sourceType: sourceType || "unknown",
            totalObjects: Number.isFinite(totalObjects) ? totalObjects : detectedObjects.length,
            highConfidenceCount: Number.isFinite(highConfidenceCount)
                ? highConfidenceCount
                : detectedObjects.filter((obj) => Number(obj.confidence) >= 0.7).length,
            detectedObjects: detectedObjects.map((obj) => ({
                class: obj.class || "unknown",
                confidence: Number(obj.confidence) || 0,
                bbox: Array.isArray(obj.bbox) ? obj.bbox : []
            })),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        };

        const docRef = await firestore.collection("objectDetections").add(payload);
        return res.json({ success: true, id: docRef.id });
    } catch (error) {
        console.error("Error saving detection:", error);
        return res.status(500).json({
            success: false,
            message: "Failed to save detection.",
            detail: error?.details || error?.message || "Unknown Firestore error"
        });
    }
});

app.get("/api/health", async (_req, res) => {
    try {
        const response = await fetch(YOLO_HEALTH_URL);
        yoloReady = response.ok;
    } catch (_error) {
        yoloReady = false;
    }
    res.json({ ok: true, firebase: Boolean(firestore), yoloReady });
});

app.listen(PORT, () => {
    startYoloService();
    console.log(`Server running at http://localhost:${PORT}`);
});

const shutdown = () => {
    if (yoloProcess && !yoloProcess.killed) {
        yoloProcess.kill();
    }
    process.exit(0);
};

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
