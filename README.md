# Object Detection using YOLO (Mini Project Demo)

Web demo using real Ultralytics YOLOv8 detection, with Firebase Firestore storage for results.

## What is Integrated

- Image and webcam object detection using YOLOv8n
- Node.js backend (`server.js`) + Python YOLO service (`yolo_service.py`)
- Firebase Admin SDK integration using your service account JSON
- Firestore collection: `objectDetections`
- REST endpoint: `POST /api/yolo-detect`
- REST endpoint: `POST /api/detections`

## Project Structure

```
Object Detection using YOLO/
├── index.html
├── styles.css
├── script.js
├── server.js
├── yolo_service.py
├── requirements.txt
├── firebase-config.js
├── package.json
├── object-detection-using-yolo-firebase-adminsdk-fbsvc-cbed1a7872.json
└── README.md
```

## Prerequisites

- Node.js 18+ (or latest LTS)
- Python 3.10+ (recommended)
- Internet connection (first run downloads YOLO model weights)
- Webcam (optional, only for live mode)

## Setup

1. Open terminal in the project folder:
   - `Object Detection using YOLO`
2. Install Node dependencies:
   - `npm install`
3. Install Python dependencies:
   - `pip install -r requirements.txt`
4. Make sure your Firebase service account file exists in the project root:
   - `object-detection-using-yolo-firebase-adminsdk-fbsvc-cbed1a7872.json`
5. Enable Firestore API for this Firebase project (one-time):
   - [https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=object-detection-using-yolo](https://console.developers.google.com/apis/api/firestore.googleapis.com/overview?project=object-detection-using-yolo)
6. Start the app:
   - `npm start`
7. Open in browser:
   - [http://localhost:3000](http://localhost:3000)

`npm start` automatically launches:
- Express app on `http://localhost:3000`
- YOLO Python service on `http://127.0.0.1:5001`

## Demo Flow (For Final Year Presentation)

1. Start app with `npm start`
2. Open `http://localhost:3000`
3. Show **Upload Image** mode:
   - Upload any sample image
   - Explain detected objects and confidence
4. Show **Use Webcam** mode:
   - Start webcam
   - Move objects in front of camera
   - Explain real-time detections
5. Mention database:
   - Every detection is stored to Firebase Firestore in `objectDetections`
6. Optional:
   - Download annotated image

## Firestore Data Format

Each detection document stores:

- `mode` (`upload` or `webcam`)
- `sourceType` (`image-upload` or `webcam`)
- `totalObjects`
- `highConfidenceCount`
- `detectedObjects` array:
  - `class`
  - `confidence`
  - `bbox`
- `createdAt` (server timestamp)

## API Endpoints

- `GET /api/health` -> server and Firebase status
- `POST /api/yolo-detect` -> YOLO detection from image data
- `POST /api/detections` -> save detection payload

## Troubleshooting

- If Firebase save fails:
  - Check service account JSON filename and location
  - Confirm Firestore is enabled in your Firebase project
- If webcam does not open:
  - Allow camera permission in browser
  - Use HTTPS or `localhost` (already supported)
- If first detection is slow:
  - YOLO model download/loading can take 20-60 seconds on first run
- If YOLO does not start:
  - Check `python --version`
  - Ensure `pip install -r requirements.txt` completed successfully

## Important Security Note

- Keep service account JSON private.
- Do not upload it to public GitHub.
- If credentials were exposed, rotate keys from Firebase console.
