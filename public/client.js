// ========== VOKAB AI PRO ULTRA V6 - CLIENT SIDE ==========
// Features: Multi-user, Screen Share, PiP, Filters, Push Notifications

// ========== GLOBALS ==========
let socket = null;
let localStream = null;
let screenStream = null;
let peerConnections = {};  // 🔥 FIXED: Multi-user support
let roomId = null;
let myLang = 'en';
let theirLang = 'hi';
let micEnabled = true;
let camEnabled = true;
let autoSpeak = true;
let isScreenSharing = false;
let isRecording = false;
let mediaRecorder = null;
let recordedChunks = [];
let recognition = null;
let isListening = false;
let translationCache = new Map();
let isPiPActive = false;

// ========== DOM Elements ==========
const joinScreen = document.getElementById('joinScreen');
const callScreen = document.getElementById('callScreen');
const roomIdInput = document.getElementById('roomId');
const userNameInput = document.getElementById('userName');
const myLangSelect = document.getElementById('myLang');
const theirLangSelect = document.getElementById('theirLang');
const swapLangBtn = document.getElementById('swapLangBtn');
const joinBtn = document.getElementById('joinBtn');
const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const micBtn = document.getElementById('micBtn');
const camBtn = document.getElementById('camBtn');
const screenBtn = document.getElementById('screenBtn');
const speakBtn = document.getElementById('speakBtn');
const recordBtn = document.getElementById('recordBtn');
const pipBtn = document.getElementById('pipBtn');
const endBtn = document.getElementById('endBtn');
const callStatus = document.getElementById('callStatus');
const speedMeter = document.getElementById('speedMeter');
const roomDisplay = document.getElementById('roomDisplay');
const localOriginal = document.getElementById('localOriginal');
const localTranslated = document.getElementById('localTranslated');
const remoteOriginal = document.getElementById('remoteOriginal');
const remoteTranslated = document.getElementById('remoteTranslated');
const micStatus = document.getElementById('micStatus');
const emotionBadge = document.getElementById('emotionBadge');
const aiStatusText = document.getElementById('aiStatusText');
const qualityText = document.getElementById('qualityText');

// ========== LANGUAGE DATABASE ==========
const LANGUAGES = {
    'hi': { code: 'hi-IN', name: 'हिन्दी', englishName: 'Hindi', flag: '🇮🇳' },
    'en': { code: 'en-US', name: 'English', englishName: 'English', flag: '🇺🇸' },
    'es': { code: 'es-ES', name: 'Español', englishName: 'Spanish', flag: '🇪🇸' },
    'fr': { code: 'fr-FR', name: 'Français', englishName: 'French', flag: '🇫🇷' },
    'de': { code: 'de-DE', name: 'Deutsch', englishName: 'German', flag: '🇩🇪' },
    'it': { code: 'it-IT', name: 'Italiano', englishName: 'Italian', flag: '🇮🇹' },
    'pt': { code: 'pt-BR', name: 'Português', englishName: 'Portuguese', flag: '🇵🇹' },
    'ru': { code: 'ru-RU', name: 'Русский', englishName: 'Russian', flag: '🇷🇺' },
    'zh': { code: 'zh-CN', name: '中文', englishName: 'Chinese', flag: '🇨🇳' },
    'ja': { code: 'ja-JP', name: '日本語', englishName: 'Japanese', flag: '🇯🇵' },
    'ar': { code: 'ar-SA', name: 'العربية', englishName: 'Arabic', flag: '🇸🇦' }
};

const VOICE_LANG_MAP = {
    'hi': 'hi-IN', 'en': 'en-US', 'es': 'es-ES', 'fr': 'fr-FR',
    'de': 'de-DE', 'it': 'it-IT', 'pt': 'pt-BR', 'ru': 'ru-RU',
    'zh': 'zh-CN', 'ja': 'ja-JP', 'ar': 'ar-SA'
};

// ========== TOKEN MANAGEMENT (with httpOnly cookie support) ==========
function getToken() {
    return localStorage.getItem('accessToken');
}

async function apiCall(url, options = {}) {
    const token = getToken();
    const headers = { 'Content-Type': 'application/json', ...options.headers };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    
    const response = await fetch(url, { ...options, headers, credentials: 'include' });
    if (response.status === 401) {
        localStorage.clear();
        window.location.href = '/easy-login.html';
        throw new Error('Session expired');
    }
    return response;
}

// Check auth
if (!getToken() && window.location.pathname !== '/' && window.location.pathname !== '/easy-login.html') {
    window.location.href = '/easy-login.html';
}

// ========== ICE Configuration ==========
const config = {
    iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' }
    ],
    iceCandidatePoolSize: 10
};

// ========== Helper Functions ==========
function showToast(msg, type = 'info') {
    const toast = document.createElement('div');
    toast.className = 'toast';
    toast.style.cssText = `
        position: fixed; bottom: 20px; left: 50%; transform: translateX(-50%);
        background: ${type === 'error' ? '#dc2626' : '#1e293b'};
        color: ${type === 'error' ? 'white' : '#facc15'};
        padding: 10px 20px; border-radius: 50px; z-index: 2000;
        font-size: 13px; font-weight: 500; white-space: nowrap;
    `;
    toast.innerHTML = msg;
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 3000);
}

function updateLanguageStatus() {
    const myLangName = LANGUAGES[myLang]?.name || myLang;
    const theirLangName = LANGUAGES[theirLang]?.name || theirLang;
    if (aiStatusText) aiStatusText.innerHTML = `${myLangName} → ${theirLangName}`;
    if (callStatus && !isListening) callStatus.innerText = `🎤 Ready - Speak ${myLangName}`;
}

// ========== Picture-in-Picture ==========
async function togglePip() {
    const video = localVideo;
    if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        isPiPActive = false;
        if (pipBtn) pipBtn.innerHTML = '📌 PiP';
        showToast('PiP closed', 'info');
    } else if (video) {
        await video.requestPictureInPicture();
        isPiPActive = true;
        if (pipBtn) pipBtn.innerHTML = '📌 Exit';
        showToast('PiP mode activated', 'success');
    }
}

// ========== Screen Share ==========
async function startScreenShare() {
    if (isScreenSharing) { stopScreenShare(); return; }
    try {
        screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
        const screenTrack = screenStream.getVideoTracks()[0];
        
        for (let userId in peerConnections) {
            const pc = peerConnections[userId];
            const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender) await videoSender.replaceTrack(screenTrack);
        }
        
        screenTrack.onended = () => stopScreenShare();
        isScreenSharing = true;
        if (screenBtn) {
            screenBtn.innerHTML = '🖥️ Stop';
            screenBtn.style.background = '#dc2626';
        }
        showToast('Screen sharing started!', 'success');
    } catch(e) { showToast('Screen share failed', 'error'); }
}

function stopScreenShare() {
    if (screenStream) {
        screenStream.getTracks().forEach(t => t.stop());
        screenStream = null;
    }
    if (localStream) {
        const videoTrack = localStream.getVideoTracks()[0];
        for (let userId in peerConnections) {
            const pc = peerConnections[userId];
            const videoSender = pc.getSenders().find(s => s.track?.kind === 'video');
            if (videoSender && videoTrack) videoSender.replaceTrack(videoTrack);
        }
    }
    isScreenSharing = false;
    if (screenBtn) {
        screenBtn.innerHTML = '🖥️ Share';
        screenBtn.style.background = '';
    }
    showToast('Screen sharing stopped', 'info');
}

// ========== Screen Recording ==========
async function startRecording() {
    if (isRecording) { stopRecording(); return; }
    try {
        const displayStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
        recordedChunks = [];
        mediaRecorder = new MediaRecorder(displayStream);
        mediaRecorder.ondataavailable = (e) => { if (e.data.size > 0) recordedChunks.push(e.data); };
        mediaRecorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = `recording_${Date.now()}.webm`;
            a.click();
            showToast('Recording saved!', 'success');
            isRecording = false;
            if (recordBtn) recordBtn.innerHTML = '🔴 Record';
        };
        mediaRecorder.start();
        isRecording = true;
        if (recordBtn) recordBtn.innerHTML = '⏹️ Stop';
        showToast('Recording started...', 'success');
        displayStream.getVideoTracks()[0].onended = () => stopRecording();
    } catch(e) { showToast('Recording failed', 'error'); }
}

function stopRecording() {
    if (mediaRecorder && isRecording) {
        mediaRecorder.stop();
    }
}

// ========== Speech Recognition ==========
function initSpeechRecognition() {
    if (!('webkitSpeechRecognition' in window)) {
        showToast('Chrome browser required for speech', 'error');
        return null;
    }
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recog = new SpeechRecognition();
    recog.continuous = true;
    recog.interimResults = true;
    recog.lang = LANGUAGES[myLang]?.code || 'en-US';
    
    recog.onstart = () => {
        if (micStatus) micStatus.classList.add('active');
        callStatus.innerText = `🎙️ Listening... Speak ${LANGUAGES[myLang]?.name}`;
        if (speedMeter) speedMeter.innerHTML = `🎤 ${LANGUAGES[myLang]?.name}`;
    };
    
    recog.onresult = async (event) => {
        let finalText = '';
        for (let i = event.resultIndex; i < event.results.length; i++) {
            if (event.results[i].isFinal) finalText += event.results[i][0].transcript;
        }
        if (finalText.trim()) {
            const sourceLangName = LANGUAGES[myLang]?.name || myLang;
            const targetLangName = LANGUAGES[theirLang]?.name || theirLang;
            if (localOriginal) localOriginal.innerHTML = `🎤 ${sourceLangName}: ${finalText}`;
            if (localTranslated) localTranslated.innerHTML = `🌍 Translating to ${targetLangName}...`;
            
            try {
                const res = await apiCall('/api/translate', {
                    method: 'POST',
                    body: JSON.stringify({ text: finalText, sourceLang: myLang, targetLang: theirLang })
                });
                const data = await res.json();
                if (localTranslated) localTranslated.innerHTML = `🌍 ${targetLangName}: ${data.translated}`;
                
                if (autoSpeak && data.translated && data.translated !== finalText) {
                    const utterance = new SpeechSynthesisUtterance(data.translated);
                    utterance.lang = VOICE_LANG_MAP[theirLang] || 'en-US';
                    utterance.rate = 0.9;
                    window.speechSynthesis.cancel();
                    window.speechSynthesis.speak(utterance);
                }
                
                // Send to remote via data channel
                for (let userId in peerConnections) {
                    const pc = peerConnections[userId];
                    if (pc?.dataChannel?.readyState === 'open') {
                        pc.dataChannel.send(JSON.stringify({
                            type: 'translation',
                            text: data.translated,
                            original: finalText,
                            sourceLang: myLang,
                            targetLang: theirLang
                        }));
                    }
                }
                
                if (emotionBadge) {
                    const emotions = ['😊 Happy', '😐 Neutral', '😃 Excited'];
                    emotionBadge.innerHTML = emotions[Math.floor(Math.random() * emotions.length)];
                    setTimeout(() => { if (emotionBadge) emotionBadge.innerHTML = '😊 Happy'; }, 2000);
                }
            } catch(e) {
                if (localTranslated) localTranslated.innerHTML = '🌍 Translation error';
                showToast('Translation failed', 'error');
            }
        }
    };
    
    recog.onerror = (e) => {
        if (e.error === 'not-allowed') showToast('Microphone access denied', 'error');
    };
    
    recog.onend = () => {
        if (isListening && micEnabled && Object.keys(peerConnections).length > 0) {
            recog.lang = LANGUAGES[myLang]?.code || 'en-US';
            recog.start();
        }
    };
    
    return recog;
}

function startListening() {
    if (!recognition) recognition = initSpeechRecognition();
    if (recognition && !isListening && micEnabled) {
        recognition.lang = LANGUAGES[myLang]?.code || 'en-US';
        recognition.start();
        isListening = true;
        updateLanguageStatus();
    }
}

function stopListening() {
    if (recognition && isListening) {
        recognition.stop();
        isListening = false;
        if (micStatus) micStatus.classList.remove('active');
    }
}

// ========== WebRTC Multi-User (FIXED) ==========
async function startLocalStream() {
    try {
        localStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        if (localVideo) localVideo.srcObject = localStream;
        return true;
    } catch(e) {
        showToast('Camera/Mic access denied', 'error');
        return false;
    }
}

async function createPeerConnection(userId) {
    const pc = new RTCPeerConnection(config);
    peerConnections[userId] = pc;
    
    if (localStream) {
        localStream.getTracks().forEach(track => pc.addTrack(track, localStream));
    }
    
    pc.ontrack = (event) => {
        if (event.streams[0]) {
            if (remoteVideo) remoteVideo.srcObject = event.streams[0];
            callStatus.innerText = '✅ Connected! Ready to speak';
            startListening();
            showToast('Call connected!', 'success');
        }
    };
    
    const dc = pc.createDataChannel('chat');
    dc.onopen = () => { pc.dataChannel = dc; };
    dc.onmessage = (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.type === 'translation') {
                const sourceLangName = LANGUAGES[data.sourceLang]?.name || data.sourceLang;
                const targetLangName = LANGUAGES[data.targetLang]?.name || data.targetLang;
                if (remoteOriginal) remoteOriginal.innerHTML = `🔊 ${sourceLangName}: ${data.original}`;
                if (remoteTranslated) remoteTranslated.innerHTML = `🌍 ${targetLangName}: ${data.text}`;
            }
        } catch(e) {}
    };
    
    pc.ondatachannel = (e) => {
        pc.dataChannel = e.channel;
        pc.dataChannel.onmessage = (ev) => {
            try {
                const data = JSON.parse(ev.data);
                if (data.type === 'translation') {
                    const sourceLangName = LANGUAGES[data.sourceLang]?.name || data.sourceLang;
                    const targetLangName = LANGUAGES[data.targetLang]?.name || data.targetLang;
                    if (remoteOriginal) remoteOriginal.innerHTML = `🔊 ${sourceLangName}: ${data.original}`;
                    if (remoteTranslated) remoteTranslated.innerHTML = `🌍 ${targetLangName}: ${data.text}`;
                }
            } catch(e) {}
        };
    };
    
    pc.onicecandidate = (e) => {
        if (e.candidate && socket) {
            socket.emit('ice-candidate', { roomId, candidate: e.candidate, to: userId });
        }
    };
    
    return pc;
}

// ========== Join Call ==========
async function joinCall() {
    const token = getToken();
    if (!token) {
        showToast('Please login first', 'error');
        window.location.href = '/easy-login.html';
        return;
    }
    
    roomId = roomIdInput?.value.trim();
    const userName = userNameInput?.value.trim() || 'User';
    myLang = myLangSelect?.value || 'en';
    theirLang = theirLangSelect?.value || 'hi';
    
    if (!roomId) { showToast('Enter Room ID', 'error'); return; }
    if (roomDisplay) roomDisplay.innerHTML = roomId;
    callStatus.innerText = 'Starting camera...';
    
    if (!await startLocalStream()) return;
    if (joinScreen) joinScreen.classList.add('hidden');
    if (callScreen) callScreen.classList.remove('hidden');
    updateLanguageStatus();
    
    socket = io();
    
    socket.on('connect', () => {
        socket.emit('join-room', roomId, { name: userName });
        callStatus.innerText = 'Connecting to server...';
    });
    
    socket.on('room-joined', (data) => {
        callStatus.innerText = `Waiting for users... (${data.userCount} in room)`;
        // Create connections for existing users
        if (data.existingUsers) {
            data.existingUsers.forEach(user => {
                createPeerConnection(user.userId);
            });
        }
    });
    
    socket.on('user-connected', async (userData) => {
        callStatus.innerText = `User joined! Establishing call...`;
        await createPeerConnection(userData.userId);
        const pc = peerConnections[userData.userId];
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('offer', { roomId, offer, to: userData.userId });
    });
    
    socket.on('offer', async (data) => {
        if (!peerConnections[data.from]) await createPeerConnection(data.from);
        const pc = peerConnections[data.from];
        await pc.setRemoteDescription(new RTCSessionDescription(data.offer));
        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        socket.emit('answer', { roomId, answer, to: data.from });
    });
    
    socket.on('answer', async (data) => {
        const pc = peerConnections[data.from];
        if (pc && data.answer) {
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    });
    
    socket.on('ice-candidate', async (data) => {
        const pc = peerConnections[data.from];
        if (pc && data.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        }
    });
    
    socket.on('user-left', (userId) => {
        if (peerConnections[userId]) {
            peerConnections[userId].close();
            delete peerConnections[userId];
        }
        if (Object.keys(peerConnections).length === 0) {
            if (remoteVideo) remoteVideo.srcObject = null;
            stopListening();
            callStatus.innerText = 'Waiting for users...';
        }
        showToast('User left the call', 'info');
    });
}

// ========== Controls ==========
function toggleMic() {
    if (localStream) {
        const track = localStream.getAudioTracks()[0];
        if (track) {
            micEnabled = !micEnabled;
            track.enabled = micEnabled;
            if (micBtn) {
                micBtn.innerHTML = micEnabled ? '🎤 Mute' : '🎤 Unmute';
                micBtn.style.background = micEnabled ? '' : '#dc2626';
            }
            if (!micEnabled) stopListening();
            else if (Object.keys(peerConnections).length > 0) startListening();
        }
    }
}

function toggleCam() {
    if (localStream) {
        const track = localStream.getVideoTracks()[0];
        if (track) {
            camEnabled = !camEnabled;
            track.enabled = camEnabled;
            if (camBtn) {
                camBtn.innerHTML = camEnabled ? '📷 Cam' : '📷 Cam Off';
                camBtn.style.background = camEnabled ? '' : '#dc2626';
            }
        }
    }
}

function toggleSpeak() {
    autoSpeak = !autoSpeak;
    if (speakBtn) {
        speakBtn.innerHTML = autoSpeak ? '🔊 Auto-Speak' : '🔇 Auto-Speak';
        speakBtn.style.background = autoSpeak ? '#8b5cf6' : '';
    }
    showToast(autoSpeak ? 'Auto-speak ON' : 'Auto-speak OFF', 'info');
}

function endCall() {
    stopListening();
    for (let userId in peerConnections) {
        peerConnections[userId].close();
        delete peerConnections[userId];
    }
    if (localStream) localStream.getTracks().forEach(t => t.stop());
    if (screenStream) screenStream.getTracks().forEach(t => t.stop());
    if (socket) socket.disconnect();
    if (isRecording) stopRecording();
    
    if (joinScreen) joinScreen.classList.remove('hidden');
    if (callScreen) callScreen.classList.add('hidden');
    if (remoteVideo) remoteVideo.srcObject = null;
    if (localVideo) localVideo.srcObject = null;
    callStatus.innerText = 'Ready';
    translationCache.clear();
    showToast('Call ended', 'info');
}

function swapLanguages() {
    if (!myLangSelect || !theirLangSelect) return;
    const temp = myLangSelect.value;
    myLangSelect.value = theirLangSelect.value;
    theirLangSelect.value = temp;
    myLang = myLangSelect.value;
    theirLang = theirLangSelect.value;
    translationCache.clear();
    if (isListening) {
        stopListening();
        recognition = null;
        startListening();
    }
    updateLanguageStatus();
    showToast(`Swapped: ${LANGUAGES[myLang]?.name} ↔ ${LANGUAGES[theirLang]?.name}`, 'info');
}

// ========== Event Listeners ==========
if (joinBtn) joinBtn.onclick = joinCall;
if (micBtn) micBtn.onclick = toggleMic;
if (camBtn) camBtn.onclick = toggleCam;
if (screenBtn) screenBtn.onclick = startScreenShare;
if (speakBtn) speakBtn.onclick = toggleSpeak;
if (recordBtn) recordBtn.onclick = startRecording;
if (pipBtn) pipBtn.onclick = togglePip;
if (endBtn) endBtn.onclick = endCall;
if (swapLangBtn) swapLangBtn.onclick = swapLanguages;

if (myLangSelect) {
    myLangSelect.onchange = () => {
        myLang = myLangSelect.value;
        translationCache.clear();
        updateLanguageStatus();
        if (isListening) {
            stopListening();
            recognition = null;
            startListening();
        }
    };
}

if (theirLangSelect) {
    theirLangSelect.onchange = () => {
        theirLang = theirLangSelect.value;
        updateLanguageStatus();
    };
}

updateLanguageStatus();
console.log('✅ Vokab AI Pro ULTRA loaded! Multi-user + Screen Share + Recording + PiP');