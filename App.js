import React, { useState, useEffect, useRef } from 'react';
import {
    View,
    Text,
    StyleSheet,
    TextInput,
    TouchableOpacity,
    ScrollView,
    SafeAreaView,
    Alert,
    ActivityIndicator,
    Platform
} from 'react-native';
import { io } from 'socket.io-client';
import {
    RTCPeerConnection,
    RTCSessionDescription,
    mediaDevices
} from 'react-native-webrtc';
import { Audio } from 'expo-av';
import * as Speech from 'expo-speech';

// ========== CONFIGURATION ==========
const SERVER_URL = Platform.OS === 'android' ? 'http://10.0.2.2:3000' : 'http://localhost:3000';
let socket = null;
let peerConnection = null;
let localStream = null;

export default function App() {
    // State
    const [screen, setScreen] = useState('join');
    const [roomId, setRoomId] = useState('');
    const [userName, setUserName] = useState('');
    const [myLang, setMyLang] = useState('hi');
    const [theirLang, setTheirLang] = useState('en');
    const [isConnected, setIsConnected] = useState(false);
    const [isMicEnabled, setIsMicEnabled] = useState(true);
    const [isCamEnabled, setIsCamEnabled] = useState(true);
    const [isAutoSpeak, setIsAutoSpeak] = useState(true);
    const [translatedText, setTranslatedText] = useState('');
    const [originalText, setOriginalText] = useState('');
    const [remoteText, setRemoteText] = useState('');
    const [callStatus, setCallStatus] = useState('Ready to connect');
    
    // Refs
    const localVideoRef = useRef(null);
    const recognitionRef = useRef(null);
    
    // Languages
    const languages = [
        { code: 'hi', name: '🇮🇳 हिन्दी' },
        { code: 'en', name: '🇺🇸 English' },
        { code: 'es', name: '🇪🇸 Español' },
        { code: 'fr', name: '🇫🇷 Français' },
        { code: 'de', name: '🇩🇪 Deutsch' },
        { code: 'it', name: '🇮🇹 Italiano' },
        { code: 'pt', name: '🇵🇹 Português' },
        { code: 'ru', name: '🇷🇺 Русский' },
        { code: 'zh', name: '🇨🇳 中文' },
        { code: 'ja', name: '🇯🇵 日本語' },
        { code: 'ar', name: '🇸🇦 العربية' },
        { code: 'ko', name: '🇰🇷 한국어' }
    ];
    
    // ========== SPEECH RECOGNITION ==========
    const initSpeechRecognition = () => {
        if (Platform.OS === 'web') {
            const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
            if (SpeechRecognition) {
                const recognition = new SpeechRecognition();
                recognition.continuous = true;
                recognition.interimResults = true;
                recognition.lang = 'hi-IN';
                
                recognition.onresult = async (event) => {
                    let finalText = '';
                    for (let i = event.resultIndex; i < event.results.length; i++) {
                        if (event.results[i].isFinal) {
                            finalText += event.results[i][0].transcript;
                        }
                    }
                    
                    if (finalText.trim()) {
                        setOriginalText(finalText);
                        await translateText(finalText);
                    }
                };
                
                recognition.onerror = (e) => {
                    console.log('Speech error:', e);
                };
                
                return recognition;
            }
        }
        return null;
    };
    
    const startListening = () => {
        if (!recognitionRef.current) {
            recognitionRef.current = initSpeechRecognition();
        }
        if (recognitionRef.current) {
            recognitionRef.current.start();
            setCallStatus('🎙️ Listening... Speak now');
        }
    };
    
    const stopListening = () => {
        if (recognitionRef.current) {
            recognitionRef.current.stop();
            setCallStatus('✅ Connected! Speak now');
        }
    };
    
    // ========== TRANSLATION ==========
    const translateText = async (text) => {
        try {
            const response = await fetch(`${SERVER_URL}/api/translate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    text: text,
                    sourceLang: myLang,
                    targetLang: theirLang
                })
            });
            const data = await response.json();
            setTranslatedText(data.translated);
            
            if (isAutoSpeak && data.translated) {
                await Speech.speak(data.translated, {
                    language: theirLang === 'es' ? 'es-ES' : 'en-US',
                    rate: 0.9
                });
            }
            
            if (peerConnection && peerConnection.dataChannel) {
                peerConnection.dataChannel.send(JSON.stringify({
                    type: 'translation',
                    text: data.translated,
                    original: text
                }));
            }
        } catch (error) {
            console.log('Translation error:', error);
        }
    };
    
    // ========== WEBRTC ==========
    const startLocalStream = async () => {
        try {
            const stream = await mediaDevices.getUserMedia({
                video: true,
                audio: true
            });
            localStream = stream;
            if (localVideoRef.current) {
                localVideoRef.current.srcObject = stream;
            }
            return true;
        } catch (error) {
            setCallStatus('❌ Camera/Mic access denied');
            return false;
        }
    };
    
    const createPeerConnection = async () => {
        const configuration = {
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' }
            ]
        };
        
        peerConnection = new RTCPeerConnection(configuration);
        
        if (localStream) {
            localStream.getTracks().forEach(track => {
                peerConnection.addTrack(track, localStream);
            });
        }
        
        peerConnection.ontrack = (event) => {
            if (event.streams && event.streams[0]) {
                // Remote stream received
                setCallStatus('✅ Connected! Speak now');
                startListening();
            }
        };
        
        const dc = peerConnection.createDataChannel('chat');
        dc.onopen = () => {
            peerConnection.dataChannel = dc;
        };
        dc.onmessage = (e) => {
            const data = JSON.parse(e.data);
            if (data.type === 'translation') {
                setRemoteText(`${data.original} → ${data.text}`);
            }
        };
        
        peerConnection.ondatachannel = (e) => {
            peerConnection.dataChannel = e.channel;
            peerConnection.dataChannel.onmessage = (ev) => {
                const data = JSON.parse(ev.data);
                if (data.type === 'translation') {
                    setRemoteText(`${data.original} → ${data.text}`);
                }
            };
        };
        
        peerConnection.onicecandidate = (e) => {
            if (e.candidate && socket) {
                socket.emit('ice-candidate', { roomId, candidate: e.candidate });
            }
        };
        
        return peerConnection;
    };
    
    // ========== JOIN CALL ==========
    const joinCall = async () => {
        if (!roomId.trim()) {
            Alert.alert('Error', 'Please enter Room ID');
            return;
        }
        
        setCallStatus('Starting camera...');
        const streamReady = await startLocalStream();
        if (!streamReady) return;
        
        socket = io(SERVER_URL);
        
        socket.on('connect', () => {
            socket.emit('join-room', roomId, { name: userName || 'User' });
            setCallStatus('Connecting...');
        });
        
        socket.on('room-joined', (data) => {
            setCallStatus(`Waiting for user... (${data.userCount}/2)`);
        });
        
        socket.on('user-connected', async () => {
            setCallStatus('User joined! Establishing call...');
            const pc = await createPeerConnection();
            const offer = await pc.createOffer();
            await pc.setLocalDescription(offer);
            socket.emit('offer', { roomId, offer });
        });
        
        socket.on('offer', async (offer) => {
            const pc = await createPeerConnection();
            await pc.setRemoteDescription(new RTCSessionDescription(offer));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            socket.emit('answer', { roomId, answer });
        });
        
        socket.on('answer', async (answer) => {
            if (peerConnection) {
                await peerConnection.setRemoteDescription(new RTCSessionDescription(answer));
            }
        });
        
        socket.on('ice-candidate', async (candidate) => {
            if (peerConnection) {
                await peerConnection.addIceCandidate(candidate);
            }
        });
        
        socket.on('user-left', () => {
            setCallStatus('User left');
            stopListening();
        });
        
        setScreen('call');
        setIsConnected(true);
    };
    
    // ========== CONTROLS ==========
    const toggleMic = () => {
        if (localStream) {
            const track = localStream.getAudioTracks()[0];
            if (track) {
                const newState = !isMicEnabled;
                track.enabled = newState;
                setIsMicEnabled(newState);
                if (!newState) stopListening();
                else startListening();
            }
        }
    };
    
    const toggleCam = () => {
        if (localStream) {
            const track = localStream.getVideoTracks()[0];
            if (track) {
                const newState = !isCamEnabled;
                track.enabled =newState;
                setIsCamEnabled(newState);
            }
        }
    };
    
    const toggleAutoSpeak = () => {
        setIsAutoSpeak(!isAutoSpeak);
    };
    
    const endCall = () => {
        stopListening();
        if (peerConnection) peerConnection.close();
        if (localStream) localStream.getTracks().forEach(t => t.stop());
        if (socket) socket.disconnect();
        
        setScreen('join');
        setIsConnected(false);
        setOriginalText('');
        setTranslatedText('');
        setRemoteText('');
        setCallStatus('Ready to connect');
    };
    
    // ========== UI RENDER ==========
    const renderJoinScreen = () => (
        <SafeAreaView style={styles.container}>
            <ScrollView contentContainerStyle={styles.scrollContent}>
                <View style={styles.header}>
                    <Text style={styles.logo}>🌐</Text>
                    <Text style={styles.title}>LangBridge <Text style={styles.proBadge}>PRO</Text></Text>
                    <Text style={styles.subtitle}>Real-time AI Video Translator</Text>
                </View>
                
                <View style={styles.card}>
                    <TextInput
                        style={styles.input}
                        placeholder="🔑 Room ID"
                        placeholderTextColor="#64748b"
                        value={roomId}
                        onChangeText={setRoomId}
                    />
                    <TextInput
                        style={styles.input}
                        placeholder="👤 Your Name"
                        placeholderTextColor="#64748b"
                        value={userName}
                        onChangeText={setUserName}
                    />
                    
                    <View style={styles.langRow}>
                        <View style={styles.langGroup}>
                            <Text style={styles.langLabel}>🗣️ I speak</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {languages.map(lang => (
                                    <TouchableOpacity
                                        key={lang.code}
                                        style={[styles.langOption, myLang === lang.code && styles.langOptionActive]}
                                        onPress={() => setMyLang(lang.code)}
                                    >
                                        <Text style={styles.langOptionText}>{lang.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                        
                        <TouchableOpacity style={styles.swapBtn} onPress={() => {
                            const temp = myLang;
                            setMyLang(theirLang);
                            setTheirLang(temp);
                        }}>
                            <Text style={styles.swapText}>⇄</Text>
                        </TouchableOpacity>
                        
                        <View style={styles.langGroup}>
                            <Text style={styles.langLabel}>🔊 Translate to</Text>
                            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                                {languages.map(lang => (
                                    <TouchableOpacity
                                        key={lang.code}
                                        style={[styles.langOption, theirLang === lang.code && styles.langOptionActive]}
                                        onPress={() => setTheirLang(lang.code)}
                                    >
                                        <Text style={styles.langOptionText}>{lang.name}</Text>
                                    </TouchableOpacity>
                                ))}
                            </ScrollView>
                        </View>
                    </View>
                    
                    <TouchableOpacity style={styles.joinBtn} onPress={joinCall}>
                        <Text style={styles.joinBtnText}>🎥 Start AI Call</Text>
                        <Text style={styles.joinBtnBadge}>PRO</Text>
                    </TouchableOpacity>
                    
                    <Text style={styles.infoText}>
                        💡 Share Room ID with your friend | 🎤 Works best on Chrome/Safari
                    </Text>
                </View>
            </ScrollView>
        </SafeAreaView>
    );
    
    const renderCallScreen = () => (
        <SafeAreaView style={styles.container}>
            <View style={styles.callHeader}>
                <Text style={styles.roomInfo}>🏠 Room: {roomId}</Text>
                <Text style={styles.aiStatus}>🤖 AI Active</Text>
                <Text style={styles.qualityText}>📹 4K Ultra</Text>
            </View>
            
            <View style={styles.videoContainer}>
                <View style={styles.videoBox}>
                    <Text style={styles.videoLabel}>📹 You</Text>
                    <View style={styles.videoPlaceholder}>
                        <ActivityIndicator size="large" color="#8b5cf6" />
                        <Text style={styles.videoPlaceholderText}>Camera Starting...</Text>
                    </View>
                    <View style={styles.subtitleBox}>
                        <Text style={styles.originalText}>🎤 {originalText || 'Listening...'}</Text>
                        <Text style={styles.translatedText}>🌍 {translatedText || 'Translation'}</Text>
                    </View>
                </View>
                
                <View style={styles.videoBox}>
                    <Text style={styles.videoLabel}>🌍 Remote User</Text>
                    <View style={styles.videoPlaceholder}>
                        <Text style={styles.waitingText}>Waiting for user...</Text>
                    </View>
                    <View style={styles.subtitleBox}>
                        <Text style={styles.remoteText}>🔊 {remoteText || 'Waiting...'}</Text>
                    </View>
                </View>
            </View>
            
            <View style={styles.controls}>
                <TouchableOpacity style={[styles.controlBtn, !isMicEnabled && styles.controlBtnOff]} onPress={toggleMic}>
                    <Text style={styles.controlBtnText}>{isMicEnabled ? '🎤 Mute' : '🎤 Unmute'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.controlBtn, !isCamEnabled && styles.controlBtnOff]} onPress={toggleCam}>
                    <Text style={styles.controlBtnText}>{isCamEnabled ? '📷 Cam' : '📷 Cam Off'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.controlBtn, isAutoSpeak && styles.controlBtnActive]} onPress={toggleAutoSpeak}>
                    <Text style={styles.controlBtnText}>{isAutoSpeak ? '🔊 Auto-Speak' : '🔇 Auto-Speak'}</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.controlBtn, styles.endBtn]} onPress={endCall}>
                    <Text style={styles.controlBtnText}>📞 End</Text>
                </TouchableOpacity>
            </View>
            
            <View style={styles.statusBar}>
                <Text style={styles.statusText}>{callStatus}</Text>
            </View>
        </SafeAreaView>
    );
    
    return (
        <View style={styles.container}>
            {screen === 'join' ? renderJoinScreen() : renderCallScreen()}
        </View>
    );
}

// ========== STYLES ==========
const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#0f172a',
    },
    scrollContent: {
        flexGrow: 1,
        padding: 20,
    },
    header: {
        alignItems: 'center',
        marginTop: 40,
        marginBottom: 30,
    },
    logo: {
        fontSize: 60,
        marginBottom: 10,
    },
    title: {
        fontSize: 32,
        fontWeight: 'bold',
        color: 'white',
    },
    proBadge: {
        fontSize: 14,
        color: '#8b5cf6',
    },
    subtitle: {
        fontSize: 14,
        color: '#94a3b8',
        marginTop: 5,
    },
    card: {
        backgroundColor: 'rgba(15, 23, 42, 0.95)',
        borderRadius: 24,
        padding: 24,
        borderWidth: 1,
        borderColor: '#334155',
    },
    input: {
        backgroundColor: '#1e293b',
        borderRadius: 12,
        padding: 15,
        color: 'white',
        fontSize: 16,
        marginBottom: 15,
        borderWidth: 1,
        borderColor: '#334155',
    },
    langRow: {
        flexDirection: 'row',
        alignItems: 'center',
        marginVertical: 15,
        flexWrap: 'wrap',
    },
    langGroup: {
        flex: 2,
    },
    langLabel: {
        color: '#94a3b8',
        fontSize: 12,
        marginBottom: 8,
    },
    langOption: {
        backgroundColor: '#1e293b',
        paddingHorizontal: 15,
        paddingVertical: 8,
        borderRadius: 20,
        marginRight: 8,
        marginBottom: 5,
    },
    langOptionActive: {
        backgroundColor: '#8b5cf6',
    },
    langOptionText: {
        color: 'white',
        fontSize: 12,
    },
    swapBtn: {
        backgroundColor: '#334155',
        width: 44,
        height: 44,
        borderRadius: 22,
        justifyContent: 'center',
        alignItems: 'center',
        marginHorizontal: 10,
    },
    swapText: {
        color: 'white',
        fontSize: 20,
    },
    joinBtn: {
        backgroundColor: '#3b82f6',
        borderRadius: 16,
        padding: 16,
        alignItems: 'center',
        marginTop: 20,
        flexDirection: 'row',
        justifyContent: 'center',
    },
    joinBtnText: {
        color: 'white',
        fontSize: 18,
        fontWeight: 'bold',
    },
    joinBtnBadge: {
        backgroundColor: 'rgba(255,255,255,0.2)',
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 12,
        fontSize: 10,
        marginLeft: 8,
        color: 'white',
    },
    infoText: {
        color: '#64748b',
        fontSize: 12,
        textAlign: 'center',
        marginTop: 20,
    },
    callHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        padding: 15,
        backgroundColor: '#1e293b',
    },
    roomInfo: {
        color: '#94a3b8',
        fontSize: 12,
    },
    aiStatus: {
        color: '#8b5cf6',
        fontSize: 12,
    },
    qualityText: {
        color: '#22c55e',
        fontSize: 12,
    },
    videoContainer: {
        flex: 1,
        padding: 15,
        gap: 15,
    },
    videoBox: {
        flex: 1,
        backgroundColor: '#000',
        borderRadius: 20,
        overflow: 'hidden',
        position: 'relative',
    },
    videoLabel: {
        position: 'absolute',
        top: 10,
        left: 10,
        backgroundColor: 'rgba(0,0,0,0.6)',
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: 15,
        color: 'white',
        fontSize: 10,
        zIndex: 1,
    },
    videoPlaceholder: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#111827',
    },
    videoPlaceholderText: {
        color: '#64748b',
        marginTop: 10,
    },
    waitingText: {
        color: '#64748b',
    },
    subtitleBox: {
        position: 'absolute',
        bottom: 0,
        left: 0,
        right: 0,
        backgroundColor: 'rgba(0,0,0,0.8)',
        padding: 12,
    },
    originalText: {
        color: '#94a3b8',
        fontSize: 11,
        marginBottom: 4,
    },
    translatedText: {
        color: '#facc15',
        fontSize: 14,
        fontWeight: 'bold',
    },
    remoteText: {
        color: '#facc15',
        fontSize: 12,
    },
    controls: {
        flexDirection: 'row',
        justifyContent: 'center',
        gap: 12,
        padding: 20,
        backgroundColor: '#1e293b',
    },
    controlBtn: {
        backgroundColor: '#334155',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 40,
    },
    controlBtnActive: {
        backgroundColor: '#8b5cf6',
    },
    controlBtnOff: {
        backgroundColor: '#dc2626',
    },
    endBtn: {
        backgroundColor: '#dc2626',
    },
    controlBtnText: {
        color: 'white',
        fontSize: 14,
    },
    statusBar: {
        padding: 12,
        backgroundColor: '#020617',
        alignItems: 'center',
    },
    statusText: {
        color: '#94a3b8',
        fontSize: 12,
    },
});