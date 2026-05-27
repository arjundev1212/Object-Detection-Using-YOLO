const firebaseConfig = {
    apiKey: "AIzaSyAw07W020c_Nm99JTOiWv3geyOfonUV1cM",
    authDomain: "object-detection-using-yolo.firebaseapp.com",
    projectId: "object-detection-using-yolo",
    storageBucket: "object-detection-using-yolo.firebasestorage.app",
    messagingSenderId: "149163997688",
    appId: "1:149163997688:web:73d5a8eb2406a15cbd7e0d",
    measurementId: "G-HGT1G5TKJ6"
};

if (window.firebase && !firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
