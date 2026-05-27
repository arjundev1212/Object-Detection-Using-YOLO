class ObjectDetectionApp {
    constructor() {
        this.currentMode = 'upload';
        this.webcamStream = null;
        this.isDetecting = false;
        this.currentImage = null;
        this.detectedObjects = [];
        this.activeFilter = 'all';
        this.webcamDetectionTimer = null;
        this.lastStoreTime = 0;
        this.storeCooldownMs = 3000;
        this.imageDetectionConfig = { confidence: 0.45, iou: 0.5, minAreaRatio: 0.0025 };
        this.webcamDetectionConfig = { confidence: 0.5, iou: 0.5, minAreaRatio: 0.0035 };
        this.previousWebcamDetections = [];
        this.webcamScoreSmoothAlpha = 0.35;
        this.webcamBoxSmoothAlpha = 0.45;
        
        this.initializeElements();
        this.bindEvents();
        this.loadModel();
    }

    initializeElements() {
        // Buttons
        this.uploadBtn = document.getElementById('uploadBtn');
        this.webcamBtn = document.getElementById('webcamBtn');
        this.fileInput = document.getElementById('fileInput');
        this.startWebcamBtn = document.getElementById('startWebcamBtn');
        this.stopWebcamBtn = document.getElementById('stopWebcamBtn');
        this.captureBtn = document.getElementById('captureBtn');
        this.clearBtn = document.getElementById('clearBtn');
        this.downloadBtn = document.getElementById('downloadBtn');
        
        // Sections
        this.uploadSection = document.getElementById('uploadSection');
        this.webcamSection = document.getElementById('webcamSection');
        
        // Canvas and Video
        this.canvas = document.getElementById('canvas');
        this.ctx = this.canvas.getContext('2d');
        this.webcam = document.getElementById('webcam');
        
        // UI Elements
        this.loadingSpinner = document.getElementById('loadingSpinner');
        this.resultsList = document.getElementById('resultsList');
        this.totalCount = document.getElementById('totalCount');
        this.highConfCount = document.getElementById('highConfCount');
        this.errorMessage = document.getElementById('errorMessage');
        this.errorText = document.getElementById('errorText');
        this.closeError = document.getElementById('closeError');
        this.filterTags = document.getElementById('filterTags');
    }

    bindEvents() {
        // Mode selection
        this.uploadBtn.addEventListener('click', () => this.switchMode('upload'));
        this.webcamBtn.addEventListener('click', () => this.switchMode('webcam'));
        
        // File upload
        this.fileInput.addEventListener('change', (e) => this.handleFileUpload(e));
        
        // Drag and drop
        const uploadArea = document.querySelector('.upload-area');
        uploadArea.addEventListener('dragover', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = '#00ff88';
            uploadArea.style.background = 'rgba(0, 255, 136, 0.1)';
        });
        
        uploadArea.addEventListener('dragleave', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            uploadArea.style.background = 'rgba(255, 255, 255, 0.02)';
        });
        
        uploadArea.addEventListener('drop', (e) => {
            e.preventDefault();
            uploadArea.style.borderColor = 'rgba(255, 255, 255, 0.3)';
            uploadArea.style.background = 'rgba(255, 255, 255, 0.02)';
            
            const files = e.dataTransfer.files;
            if (files.length > 0 && files[0].type.startsWith('image/')) {
                this.processImage(files[0]);
            }
        });
        
        // Webcam controls
        this.startWebcamBtn.addEventListener('click', () => this.startWebcam());
        this.stopWebcamBtn.addEventListener('click', () => this.stopWebcam());
        this.captureBtn.addEventListener('click', () => this.captureFrame());
        
        // Action buttons
        this.clearBtn.addEventListener('click', () => this.clearResults());
        this.downloadBtn.addEventListener('click', () => this.downloadImage());
        
        // Error handling
        this.closeError.addEventListener('click', () => this.hideError());
    }

    async loadModel() {
        try {
            this.showLoading(true);
            const response = await fetch('/api/health');
            const health = await response.json();
            if (!health.ok) throw new Error('Backend health check failed');
            this.showLoading(false);
        } catch (error) {
            console.error('Error loading YOLO backend:', error);
            this.showError('Failed to connect to YOLO backend. Please restart the server.');
            this.showLoading(false);
        }
    }

    switchMode(mode) {
        this.currentMode = mode;
        
        // Update button states
        if (mode === 'upload') {
            this.uploadBtn.classList.add('active');
            this.webcamBtn.classList.remove('active');
            this.uploadSection.classList.remove('hidden');
            this.webcamSection.classList.add('hidden');
            this.webcam.classList.add('hidden');
            this.canvas.classList.remove('hidden');
            this.stopWebcam();
        } else {
            this.webcamBtn.classList.add('active');
            this.uploadBtn.classList.remove('active');
            this.webcamSection.classList.remove('hidden');
            this.uploadSection.classList.add('hidden');
        }
        
        this.clearResults();
    }

    handleFileUpload(event) {
        const file = event.target.files[0];
        if (file && file.type.startsWith('image/')) {
            this.processImage(file);
        } else {
            this.showError('Please select a valid image file.');
        }
    }

    async processImage(file) {
        try {
            this.showLoading(true);
            const img = new Image();
            
            img.onload = async () => {
                this.currentImage = img;
                this.displayImage(img);
                await this.detectObjects('image-upload');
                this.showLoading(false);
                this.downloadBtn.classList.remove('hidden');
            };
            
            img.onerror = () => {
                this.showError('Failed to load the image. Please try another file.');
                this.showLoading(false);
            };
            
            img.src = URL.createObjectURL(file);
        } catch (error) {
            console.error('Error processing image:', error);
            this.showError('Error processing the image.');
            this.showLoading(false);
        }
    }

    displayImage(img) {
        // Set canvas dimensions
        const maxWidth = 800;
        const maxHeight = 500;
        let width = img.width;
        let height = img.height;
        
        if (width > maxWidth) {
            height = (maxWidth / width) * height;
            width = maxWidth;
        }
        
        if (height > maxHeight) {
            width = (maxHeight / height) * width;
            height = maxHeight;
        }
        
        this.canvas.width = width;
        this.canvas.height = height;
        this.ctx.drawImage(img, 0, 0, width, height);
    }

    async detectObjects(sourceType = 'image-upload') {
        try {
            const imageData = this.canvas.toDataURL('image/jpeg', 0.9);
            const config = sourceType === 'webcam' ? this.webcamDetectionConfig : this.imageDetectionConfig;
            const response = await fetch('/api/yolo-detect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    imageData,
                    confidence: config.confidence,
                    iou: config.iou,
                    minAreaRatio: config.minAreaRatio
                })
            });

            if (!response.ok) {
                const detail = await response.text();
                throw new Error(detail || `Detection failed (${response.status})`);
            }

            const payload = await response.json();
            const predictions = payload.predictions || [];
            
            this.detectedObjects = predictions;
            this.drawBoundingBoxes(predictions);
            this.displayResults(predictions);
            this.updateFilterTags(predictions);
            
            this.storeDetectionResults(predictions, sourceType);
            
        } catch (error) {
            console.error('Error detecting objects:', error);
            this.showError('Error during YOLO detection.');
        }
    }

    drawBoundingBoxes(predictions) {
        if (!this.currentImage && this.currentMode !== 'webcam') return;
        
        // Redraw the image
        if (this.currentImage) {
            this.displayImage(this.currentImage);
        }
        
        // Draw bounding boxes
        predictions.forEach(prediction => {
            const [x, y, width, height] = prediction.bbox;
            
            // Set box style based on confidence
            const confidence = prediction.score || 0;
            let color = '#00ff88'; // High confidence - green
            if (confidence < 0.5) {
                color = '#ff6b6b'; // Low confidence - red
            } else if (confidence < 0.7) {
                color = '#ffaa00'; // Medium confidence - orange
            }
            
            // Draw bounding box
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x, y, width, height);
            
            // Draw label background
            const label = `${prediction.class} ${Math.round(confidence * 100)}%`;
            this.ctx.font = '16px Arial';
            const textWidth = this.ctx.measureText(label).width;
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, y - 25, textWidth + 10, 25);
            
            // Draw label text
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(label, x + 5, y - 7);
        });
    }

    displayResults(predictions) {
        if (predictions.length === 0) {
            this.resultsList.innerHTML = '<p class="no-results">No objects detected</p>';
            this.totalCount.textContent = '0';
            this.highConfCount.textContent = '0';
            return;
        }
        
        let html = '';
        let highConfCount = 0;
        
        // Filter predictions based on active filter
        const filteredPredictions = this.activeFilter === 'all' 
            ? predictions 
            : predictions.filter(p => p.class === this.activeFilter);
        
        filteredPredictions.forEach(prediction => {
            const confidence = Math.round((prediction.score || 0) * 100);
            if (confidence >= 70) highConfCount++;
            
            html += `
                <div class="result-item">
                    <span class="object-name">${prediction.class}</span>
                    <span class="confidence-score">${confidence}%</span>
                </div>
            `;
        });
        
        this.resultsList.innerHTML = html;
        this.totalCount.textContent = filteredPredictions.length;
        this.highConfCount.textContent = highConfCount;
    }

    updateFilterTags(predictions) {
        const classes = [...new Set(predictions.map(p => p.class))];
        
        let html = '<button class="filter-tag active" data-filter="all">All</button>';
        
        classes.forEach(className => {
            html += `<button class="filter-tag" data-filter="${className}">${className}</button>`;
        });
        
        this.filterTags.innerHTML = html;
        
        // Bind filter events
        this.filterTags.querySelectorAll('.filter-tag').forEach(tag => {
            tag.addEventListener('click', (e) => {
                this.filterTags.querySelectorAll('.filter-tag').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                this.activeFilter = e.target.dataset.filter;
                this.displayResults(this.detectedObjects);
            });
        });
    }

    async startWebcam() {
        try {
            this.showLoading(true);
            const stream = await navigator.mediaDevices.getUserMedia({ 
                video: { 
                    width: { ideal: 640 },
                    height: { ideal: 480 }
                } 
            });
            
            this.webcamStream = stream;
            this.webcam.srcObject = stream;
            await this.waitForWebcamReady();
            this.webcam.classList.add('hidden');
            this.canvas.classList.remove('hidden');
            
            this.startWebcamBtn.classList.add('hidden');
            this.stopWebcamBtn.classList.remove('hidden');
            this.captureBtn.classList.remove('hidden');
            
            this.showLoading(false);
            this.startRealTimeDetection();
            
        } catch (error) {
            console.error('Error accessing webcam:', error);
            this.showError('Unable to access webcam. Please check permissions.');
            this.showLoading(false);
        }
    }

    async waitForWebcamReady() {
        if (this.webcam.readyState >= 2 && this.webcam.videoWidth > 0) return;

        await new Promise((resolve, reject) => {
            const timeoutId = setTimeout(() => {
                reject(new Error('Webcam initialization timeout.'));
            }, 6000);

            this.webcam.onloadedmetadata = async () => {
                try {
                    await this.webcam.play();
                } catch (_error) {
                    // Some browsers auto-play once stream is attached.
                }
                clearTimeout(timeoutId);
                resolve();
            };
        });
    }

    stopWebcam() {
        if (this.webcamStream) {
            this.webcamStream.getTracks().forEach(track => track.stop());
            this.webcamStream = null;
        }
        
        this.isDetecting = false;
        if (this.webcamDetectionTimer) {
            clearTimeout(this.webcamDetectionTimer);
            this.webcamDetectionTimer = null;
        }
        this.previousWebcamDetections = [];
        
        this.webcam.classList.add('hidden');
        this.canvas.classList.remove('hidden');
        this.startWebcamBtn.classList.remove('hidden');
        this.stopWebcamBtn.classList.add('hidden');
        this.captureBtn.classList.add('hidden');
    }

    async startRealTimeDetection() {
        if (!this.webcamStream) return;
        
        this.isDetecting = true;
        
        const detect = async () => {
            if (!this.isDetecting) return;
            
            try {
                if (!this.webcam.videoWidth || !this.webcam.videoHeight) {
                    this.webcamDetectionTimer = setTimeout(detect, 200);
                    return;
                }

                this.canvas.width = this.webcam.videoWidth;
                this.canvas.height = this.webcam.videoHeight;
                this.ctx.drawImage(this.webcam, 0, 0);

                const response = await fetch('/api/yolo-detect', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        imageData: this.canvas.toDataURL('image/jpeg', 0.95),
                        confidence: this.webcamDetectionConfig.confidence,
                        iou: this.webcamDetectionConfig.iou,
                        minAreaRatio: this.webcamDetectionConfig.minAreaRatio
                    })
                });

                if (!response.ok) throw new Error(`Webcam detection failed (${response.status})`);
                const payload = await response.json();
                const predictions = this.stabilizeWebcamPredictions(payload.predictions || []);

                this.detectedObjects = predictions;
                this.displayResults(predictions);
                this.updateFilterTags(predictions);
                this.drawWebcamBoundingBoxes(predictions);
                this.storeDetectionResults(predictions, 'webcam');
                
            } catch (error) {
                console.error('Error in real-time detection:', error);
            }
            
            this.webcamDetectionTimer = setTimeout(detect, 450);
        };
        
        detect();
    }

    stabilizeWebcamPredictions(predictions) {
        const smoothed = predictions.map((prediction) => {
            const previous = this.findBestPreviousMatch(prediction, this.previousWebcamDetections);
            if (!previous) return prediction;

            return {
                ...prediction,
                score: this.smoothValue(previous.score, prediction.score, this.webcamScoreSmoothAlpha),
                bbox: prediction.bbox.map((value, idx) =>
                    this.smoothValue(previous.bbox[idx], value, this.webcamBoxSmoothAlpha)
                )
            };
        });

        this.previousWebcamDetections = smoothed.map((item) => ({ ...item }));
        return smoothed;
    }

    findBestPreviousMatch(current, previousDetections) {
        let bestMatch = null;
        let bestIou = 0;

        previousDetections.forEach((candidate) => {
            if (candidate.class !== current.class) return;
            const iou = this.calculateIou(current.bbox, candidate.bbox);
            if (iou > bestIou) {
                bestIou = iou;
                bestMatch = candidate;
            }
        });

        return bestIou >= 0.3 ? bestMatch : null;
    }

    calculateIou(boxA, boxB) {
        const [ax, ay, aw, ah] = boxA;
        const [bx, by, bw, bh] = boxB;

        const ax2 = ax + aw;
        const ay2 = ay + ah;
        const bx2 = bx + bw;
        const by2 = by + bh;

        const interX1 = Math.max(ax, bx);
        const interY1 = Math.max(ay, by);
        const interX2 = Math.min(ax2, bx2);
        const interY2 = Math.min(ay2, by2);

        const interW = Math.max(0, interX2 - interX1);
        const interH = Math.max(0, interY2 - interY1);
        const interArea = interW * interH;
        if (!interArea) return 0;

        const areaA = aw * ah;
        const areaB = bw * bh;
        const union = areaA + areaB - interArea;
        return union > 0 ? interArea / union : 0;
    }

    smoothValue(previous, current, alpha) {
        if (!Number.isFinite(previous)) return current;
        return (1 - alpha) * previous + alpha * current;
    }

    drawWebcamBoundingBoxes(predictions) {
        // Set canvas to match video dimensions
        this.canvas.width = this.webcam.videoWidth;
        this.canvas.height = this.webcam.videoHeight;
        
        // Draw video frame
        this.ctx.drawImage(this.webcam, 0, 0);
        
        // Draw bounding boxes
        predictions.forEach(prediction => {
            const [x, y, width, height] = prediction.bbox;
            
            const confidence = prediction.score || 0;
            let color = '#00ff88';
            if (confidence < 0.5) {
                color = '#ff6b6b';
            } else if (confidence < 0.7) {
                color = '#ffaa00';
            }
            
            this.ctx.strokeStyle = color;
            this.ctx.lineWidth = 3;
            this.ctx.strokeRect(x, y, width, height);
            
            const label = `${prediction.class} ${Math.round(confidence * 100)}%`;
            this.ctx.font = '16px Arial';
            const textWidth = this.ctx.measureText(label).width;
            
            this.ctx.fillStyle = color;
            this.ctx.fillRect(x, y - 25, textWidth + 10, 25);
            
            this.ctx.fillStyle = '#000';
            this.ctx.fillText(label, x + 5, y - 7);
        });
        
        // Show only single annotated canvas view.
        this.canvas.classList.remove('hidden');
        this.webcam.classList.add('hidden');
    }

    captureFrame() {
        if (!this.webcamStream) return;
        
        // Create a temporary canvas for capture
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = this.webcam.videoWidth;
        tempCanvas.height = this.webcam.videoHeight;
        const tempCtx = tempCanvas.getContext('2d');
        
        // Draw current frame with bounding boxes
        tempCtx.drawImage(this.canvas, 0, 0);
        
        // Convert to blob and download
        tempCanvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `detection-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    clearResults() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        this.resultsList.innerHTML = '<p class="no-results">No objects detected yet</p>';
        this.totalCount.textContent = '0';
        this.highConfCount.textContent = '0';
        this.detectedObjects = [];
        this.filterTags.innerHTML = '<button class="filter-tag active" data-filter="all">All</button>';
        this.downloadBtn.classList.add('hidden');
        this.currentImage = null;
    }

    downloadImage() {
        if (!this.currentImage) return;
        
        this.canvas.toBlob((blob) => {
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `detection-${Date.now()}.png`;
            a.click();
            URL.revokeObjectURL(url);
        });
    }

    async storeDetectionResults(predictions, sourceType) {
        if (!Array.isArray(predictions)) return;
        if (sourceType === 'webcam' && Date.now() - this.lastStoreTime < this.storeCooldownMs) return;

        try {
            const highConfidenceCount = predictions.filter(p => p.score >= 0.7).length;
            const detectionData = {
                mode: this.currentMode,
                sourceType,
                totalObjects: predictions.length,
                highConfidenceCount,
                detectedObjects: predictions.map(p => ({
                    class: p.class,
                    confidence: Number(p.score.toFixed(4)),
                    bbox: p.bbox
                }))
            };

            const response = await fetch('/api/detections', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify(detectionData)
            });

            if (!response.ok) {
                throw new Error(`Backend returned ${response.status}`);
            }

            this.lastStoreTime = Date.now();
        } catch (error) {
            console.error('Error storing in backend/Firebase:', error);
        }
    }

    showLoading(show) {
        if (show) {
            this.loadingSpinner.classList.remove('hidden');
        } else {
            this.loadingSpinner.classList.add('hidden');
        }
    }

    showError(message) {
        this.errorText.textContent = message;
        this.errorMessage.classList.remove('hidden');
        
        // Auto-hide after 5 seconds
        setTimeout(() => {
            this.hideError();
        }, 5000);
    }

    hideError() {
        this.errorMessage.classList.add('hidden');
    }
}

// Initialize the app when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new ObjectDetectionApp();
});

