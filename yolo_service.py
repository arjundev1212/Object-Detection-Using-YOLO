import base64
from io import BytesIO

import numpy as np
from flask import Flask, jsonify, request
from PIL import Image, ImageFile
from ultralytics import YOLO

app = Flask(__name__)
model = YOLO("yolov8s.pt")
ImageFile.LOAD_TRUNCATED_IMAGES = True


def decode_base64_image(image_data):
    if not image_data:
        raise ValueError("imageData is required")
    if "," in image_data:
        image_data = image_data.split(",", 1)[1]
    binary = base64.b64decode(image_data)
    img = Image.open(BytesIO(binary)).convert("RGB")
    return np.array(img)


@app.route("/health", methods=["GET"])
def health():
    return jsonify({"ok": True, "model": "yolov8s"})


@app.route("/detect", methods=["POST"])
def detect():
    body = request.get_json(silent=True) or {}
    confidence = float(body.get("confidence", 0.45))
    iou = float(body.get("iou", 0.5))
    min_area_ratio = float(body.get("minAreaRatio", 0.0025))
    try:
        image_array = decode_base64_image(body.get("imageData"))
    except Exception as error:
        return jsonify({"success": False, "message": f"Invalid image data: {error}"}), 400

    height, width = image_array.shape[:2]
    frame_area = float(max(1, width * height))

    result = model.predict(
        source=image_array,
        conf=confidence,
        iou=iou,
        imgsz=768,
        verbose=False
    )[0]

    detections = []
    if result.boxes is not None:
        for box in result.boxes:
            xyxy = box.xyxy[0].tolist()
            x1, y1, x2, y2 = xyxy
            width = max(0.0, x2 - x1)
            height = max(0.0, y2 - y1)
            cls_id = int(box.cls[0].item())
            conf = float(box.conf[0].item())
            area_ratio = (width * height) / frame_area
            if area_ratio < min_area_ratio:
                continue

            detections.append(
                {
                    "class": result.names.get(cls_id, str(cls_id)),
                    "score": conf,
                    "bbox": [x1, y1, width, height],
                }
            )

    return jsonify({"predictions": detections})


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5001)
