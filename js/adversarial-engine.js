// =============================================================================
// ADVERSARIAL LAB — Execution Engine
// Core logic for running security testing tools with safety controls
// =============================================================================

const AdversarialEngine = {
    // Configuration
    config: {
        safeMode: true,       // Dry-run mode: only report potential issues without real payloads
        maxConcurrent: 3,     // Max concurrent payloads
        rateLimitMs: 500,     // Delay between payloads
        maxPayloadsPerTool: 50,
        logRetentionDays: 7,
        maxLogEntries: 500
    },

    // Session state
    session: {
        id: null,
        startedAt: null,
        currentTool: null,
        activePayloads: 0,
        findings: [],
        logs: [],
        targetUrl: '',
        isLocalTarget: false,
        approvedHosts: []
    },

    initSession: function (targetUrl) {
        this.session.id = 'ADV-' + Date.now().toString(36).toUpperCase() + '-' + Math.random().toString(36).slice(2, 6).toUpperCase();
        this.session.startedAt = new Date().toISOString();
        this.session.targetUrl = targetUrl;
        this.session.isLocalTarget = this._isLocalUrl(targetUrl);
        this.session.findings = [];
        this.session.logs = [];
        this.session.currentTool = null;
        this.session.activePayloads = 0;
        if (this.session.isLocalTarget) { this.session.approvedHosts = ['*']; }
        this.log('info', 'Session iniciada', { target: targetUrl, sessionId: this.session.id });
        return this.session.id;
    },

    setSafeMode: function (enabled) {
        this.config.safeMode = enabled;
        this.log('info', 'Safe Mode ' + (enabled ? 'activado' : 'desactivado'));
    },

    approveTarget: function (host) {
        if (!this.session.approvedHosts.includes(host)) { this.session.approvedHosts.push(host); }
        this.log('info', 'Host aprobado', { host: host });
    },

    isPayloadAllowed: function () {
        if (this.config.safeMode) return false;
        if (this.session.isLocalTarget) return true;
        try {
            const url = new URL(this.session.targetUrl);
            return this.session.approvedHosts.includes(url.hostname) || this.session.approvedHosts.includes('*');
        } catch (e) { return false; }
    },

    executeTool: async function (toolName, params = {}) {
        const toolKey = 'run_' + toolName;
        if (typeof this[toolKey] !== 'function') throw new Error('Herramienta no encontrada: ' + toolName);
        this.session.currentTool = toolName;
        this.log('info', 'Ejecutando herramienta: ' + toolName, params);
        await this._enforceRateLimit();
        try {
            const startTime = Date.now();
            const result = await this[toolKey](params);
            const duration = Date.now() - startTime;
            this.log('success', toolName + ' completado', { duration: duration + 'ms', findings: result.findings?.length || 0 });
            if (result.findings) {
                for (const f of result.findings) {
                    f.sessionId = this.session.id; f.tool = toolName; f.timestamp = new Date().toISOString();
                    this.session.findings.push(f);
                }
            }
            return result;
        } catch (e) { this.log('error', 'Error en ' + toolName, { error: e.message }); throw e; }
    },

    run_sqli: async function (params) {
        const findings = [];
        const uri = params.url || this.session.targetUrl;
        const payloads = params.payloads || AdversarialPayloads.sqli.generatePayloads(params.parameters || []);
        const limited = payloads.slice(0, this.config.maxPayloadsPerTool);
        for (const p of limited) {
            if (this.config.safeMode) {
                findings.push({ id: 'SQLI-SAFE-' + findings.length, title: 'SQLi potencial (Safe Mode)', type: p.type || 'errorBased', payload: p.payload, severity: 'info', description: 'Safe Mode: no se enviaron payloads.', remediation: 'Desactiva Safe Mode en localhost o targets autorizados.' });
                continue;
            }
            this.session.activePayloads++;
            let testUrl = uri;
            if (p.param) testUrl = uri.replace(new RegExp(p.param + '=[^&]*'), p.payload) || uri + (uri.includes('?') ? '&' : '?') + p.payload;
            else testUrl = uri + (uri.includes('?') ? '&' : '?') + 'test=' + encodeURIComponent(p.payload);
            try {
                const start = Date.now();
                const response = await this._httpProbe(testUrl);
                const elapsed = Date.now() - start;
                const body = (response.body || '').toLowerCase();
                const hasError = /sql|syntax|mysql|oracle|postgresql|driver|odbc|unclosed|quotation/.test(body);
                const hasTiming = elapsed >= 4500;
                if (hasError || hasTiming) {
                    findings.push({
                        id: 'SQLI-' + findings.length, title: hasError ? 'Posible SQLi (Error)' : 'Posible SQLi Time-Based', type: p.type || 'errorBased', payload: p.payload,
                        severity: hasError ? 'high' : 'medium', evidence: 'URL: ' + testUrl.substring(0, 150), responseTime: elapsed + 'ms',
                        description: 'Respuesta anómala.', remediation: 'Usa consultas parametrizadas.'
                    });
                }
            } catch (e) { this.log('warn', 'SQLi probe falló'); }
            this.session.activePayloads--;
            await this._enforceRateLimit();
        }
        if (findings.length === 0) findings.push({ id: 'SQLI-CLEAN', title: 'Sin indicios de SQLi', severity: 'info', type: 'summary', description: 'Sin detección.', evidence: limited.length + ' payloads probados.' });
        return { tool: 'SQL Injection', findings };
    },

    run_xss: async function (params) {
        const findings = [];
        const context = params.context || 'html';
        const payloads = AdversarialPayloads.xss.generatePayloads(context);
        const limited = payloads.slice(0, 5);
        for (const p of limited) {
            if (this.config.safeMode) {
                findings.push({ id: 'XSS-SAFE-' + findings.length, title: 'XSS Payload (Safe Mode)', type: p.type, payload: p.payload, severity: 'info', description: 'Payload no enviado.', remediation: 'CSP, textContent, sanitización.' });
                continue;
            }
            this.session.activePayloads++;
            try {
                const safePayload = p.payload.replace(/alert\s*\(/gi, 'console.log(').replace(/prompt\s*\(/gi, 'console.log(').replace(/confirm\s*\(/gi, 'console.log(');
                const result = await this._cdpEvaluateWithTimeout(`
                    (function() {
                        try {
                            var c = document.createElement('div'); c.id='adv-xss-test-'+Date.now();
                            c.style.cssText='all:initial;position:fixed;top:-9999px;left:-9999px;pointer-events:none;';
                            c.innerHTML = ${JSON.stringify(safePayload)};
                            document.documentElement.appendChild(c);
                            return {injected:true, context:'${p.type}'};
                        } catch(e) {return {error:e.message};}
                    })()
                `, 3000);
                if (result && !result.error) findings.push({ id: 'XSS-INJECTED-' + findings.length, title: 'XSS Payload inyectado (PoC)', type: p.type, payload: p.payload, severity: 'low', description: 'Payload insertado en DOM off-screen.', evidence: 'Contexto: ' + p.type, remediation: 'Implementa CSP, textContent.' });
            } catch (e) { this.log('warn', 'XSS injection falló'); }
            this.session.activePayloads--;
            await this._enforceRateLimit();
        }
        try {
            const surface = await this._cdpEvaluateWithTimeout(`
                (function(){return JSON.stringify({
                    forms:document.querySelectorAll('form').length,
                    inputs:document.querySelectorAll('input:not([type=hidden]):not([type=submit]):not([type=button]):not([type=password])').length,
                    innerHTML:(document.documentElement.innerHTML.match(/innerHTML/g)||[]).length,
                    urlParams:location.search?location.search.substring(1).split('&').length:0
                });})()
            `, 3000);
            if (surface) findings.push({ id: 'XSS-SURFACE', title: 'Superficie de ataque XSS', severity: surface.innerHTML + surface.inputs > 10 ? 'medium' : 'info', type: 'surface', description: 'Análisis de superficie.', evidence: 'Forms: ' + (surface.forms || 0) + ', Inputs: ' + (surface.inputs || 0) + ', innerHTML: ' + (surface.innerHTML || 0), remediation: 'Sanitiza input/output, CSP con nonce.' });
        } catch (e) { }
        if (findings.length === 0) findings.push({ id: 'XSS-CLEAN', title: 'Sin vectores XSS evidentes', severity: 'info', type: 'summary' });
        return { tool: 'XSS Arsenal', findings };
    },

    run_ssrf: async function (params) {
        const findings = [];
        const payloads = AdversarialPayloads.ssrf.cloudMetadata.concat(AdversarialPayloads.ssrf.internalPorts);
        const limited = payloads.slice(0, 15);
        for (const payload of limited) {
            if (this.config.safeMode) { findings.push({ id: 'SSRF-SAFE-' + findings.length, title: 'SSRF Payload (Safe Mode)', payload: payload, severity: 'info', type: 'cloudMetadata', description: 'Safe Mode.', remediation: 'Bloquea metadata endpoints.' }); continue; }
            this.session.activePayloads++;
            try {
                const result = await this._cdpEvaluate(`(async function(){try{var c=new AbortController();setTimeout(function(){c.abort();},5000);var r=await fetch(${JSON.stringify(payload)},{signal:c.signal,mode:'no-cors'});return {status:r.status,ok:r.ok};}catch(e){return {error:e.message};}})()`);
                if (result && result.status && result.status !== 0) findings.push({ id: 'SSRF-HIT-' + findings.length, title: 'Endpoint RESPONDE: ' + payload.substring(0, 50), severity: 'critical', type: 'cloudMetadata', payload: payload, evidence: 'Status: ' + result.status, description: 'SSRF potencial.', remediation: 'Bloquea IPs privadas.' });
            } catch (e) { }
            this.session.activePayloads--;
        }
        if (findings.length === 0) findings.push({ id: 'SSRF-CLEAN', title: 'Sin respuesta de endpoints', severity: 'info', type: 'summary', evidence: limited.length + ' endpoints probados.' });
        return { tool: 'SSRF Probe', findings };
    },

    // ── Execute JWT Attacker (3-level confidence) ──
    run_jwt: async function (params) {
        const findings = [];
        let detectionLevel = 0;
        let detectionEvidence = [];
        let detectedJwts = [];

        try {
            const result = await this._cdpEvaluate(`
                (function() {
                    var r = { cookies: document.cookie, sessionStorage: [], localStorage: [], hasLoginForm: false, htmlJwts: [], hasBearer: false, isApiOrAuth: false };
                    r.hasLoginForm = document.querySelector('input[type="password"]') !== null ||
                        (document.body.innerText || '').toLowerCase().indexOf('login') > -1 ||
                        (document.body.innerText || '').toLowerCase().indexOf('iniciar sesion') > -1;
                    try { for(var i=0;i<sessionStorage.length;i++){ r.sessionStorage.push({key:sessionStorage.key(i),val:(sessionStorage.getItem(sessionStorage.key(i))||'').substring(0,60)}); } } catch(e) {}
                    try { for(var i=0;i<localStorage.length;i++){ r.localStorage.push({key:localStorage.key(i),val:(localStorage.getItem(localStorage.key(i))||'').substring(0,60)}); } } catch(e) {}
                    r.htmlJwts = (document.documentElement.outerHTML.match(/eyJ[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+\\.[a-zA-Z0-9_-]+/g) || []).slice(0,5);
                    var allText = document.documentElement.innerText || '';
                    r.hasBearer = /bearer\\s+[a-zA-Z0-9_-]{20,}/i.test(allText);
                    r.isApiOrAuth = /\\/api\\/|\\/auth\\/|\\/login|\\/token|\\/oauth|\\/signin/i.test(location.href) || /\.(json|api)$/.test(location.pathname);
                    return JSON.stringify(r);
                })()
            `);

            if (result) {
                if (result.cookies) {
                    const parts = result.cookies.split(';').map(c => c.trim());
                    for (const p of parts) {
                        if (p.includes('.') && p.length > 30) { detectedJwts.push({ source: 'cookie', value: p.substring(0, 60) }); detectionEvidence.push('Cookie con estructura JWT'); }
                        if (/token|jwt|auth|session|bearer/i.test(p.split('=')[0] || '')) { detectionEvidence.push('Auth cookie: ' + p.split('=')[0]); if (detectionLevel < 2) detectionLevel = 2; }
                    }
                }
                ['sessionStorage', 'localStorage'].forEach(storage => {
                    const items = result[storage] || [];
                    for (const item of items) {
                        if (item.val && item.val.indexOf('.') > -1 && item.val.length > 30) { detectedJwts.push({ source: storage, value: item.key + '=' + item.val.substring(0, 50) }); if (detectionLevel < 2) detectionLevel = 2; detectionEvidence.push(storage + ' con posible JWT: ' + item.key); }
                        if (/token|jwt|auth/i.test(item.key)) { if (detectionLevel < 2) detectionLevel = 2; detectionEvidence.push(storage + ' auth key: ' + item.key); }
                    }
                });
                if (result.htmlJwts && result.htmlJwts.length > 0) { detectedJwts.push({ source: 'html', value: result.htmlJwts[0].substring(0, 60) }); detectionLevel = 3; detectionEvidence.push('JWT en HTML'); }
                if (result.hasBearer) { if (detectionLevel < 2) detectionLevel = 2; detectionEvidence.push('Bearer token pattern'); }
                if (result.hasLoginForm || result.isApiOrAuth) { if (detectionLevel < 1) detectionLevel = 1; if (result.hasLoginForm) detectionEvidence.push('Login form detectado'); if (result.isApiOrAuth) detectionEvidence.push('API/Auth page'); }
            }
        } catch (e) { }

        // Severity by level
        let severity, prefix;
        if (detectionLevel >= 3) { severity = 'high'; prefix = ''; }
        else if (detectionLevel >= 2) { severity = 'medium'; prefix = '[BEST PRACTICE] '; }
        else if (detectionLevel >= 1) { severity = 'info'; prefix = '[BEST PRACTICE] '; }
        else { severity = 'info'; prefix = '[ADVISORY] '; detectionEvidence = ['Sin login/JWT detectado. Payloads de referencia preventiva.']; }

        // Always show attack payloads
        const nonePayloads = AdversarialPayloads.jwt.noneAlg;
        const kidPayloads = AdversarialPayloads.jwt.kidInjection;

        for (const p of nonePayloads) {
            findings.push({
                id: 'JWT-NONE-' + findings.length, title: prefix + 'JWT none Algorithm Attack', severity: severity,
                type: 'noneAlg', payload: JSON.stringify(p),
                evidence: detectionEvidence.join(' | ') || 'Header manipulado para alg "none"',
                description: (detectionLevel >= 3 ? 'JWT confirmado. ' : '') + 'Si el servidor acepta "alg":"none", cualquier JWT será aceptado sin firma.',
                remediation: 'Rechaza alg "none". Usa jwt.verify(token, secret, { algorithms: ["HS256"] }).'
            });
        }
        for (const p of kidPayloads) {
            findings.push({
                id: 'JWT-KID-' + findings.length, title: prefix + 'JWT kid Path Traversal', severity: severity,
                type: 'kidInjection', payload: JSON.stringify(p),
                evidence: detectionEvidence.join(' | ') || 'Header modificado para path traversal en "kid"',
                description: (detectionLevel >= 3 ? 'JWT confirmado. ' : '') + 'kid se usa para obtener clave. Path traversal puede leer /dev/null y forzar firma vacía.',
                remediation: 'Valida kid contra whitelist. No construyas rutas desde kid.'
            });
        }

        return { tool: 'JWT Attacker', findings };
    },

    run_lfi: async function (params) {
        const findings = [];
        const payloads = AdversarialPayloads.lfi.basic.concat(AdversarialPayloads.lfi.wrappers.slice(0, 5));
        const limited = payloads.slice(0, 15);
        for (const p of limited) {
            if (this.config.safeMode) { findings.push({ id: 'LFI-SAFE-' + findings.length, title: 'LFI Payload (Safe Mode)', payload: p, severity: 'info', type: 'basic', description: 'Safe Mode.', remediation: 'Valida rutas.' }); continue; }
            this.session.activePayloads++;
            try {
                const testUrl = this.session.targetUrl + (this.session.targetUrl.includes('?') ? '&' : '?') + 'file=' + encodeURIComponent(p);
                const result = await this._cdpEvaluate(`(async function(){try{var r=await fetch(${JSON.stringify(testUrl)},{cache:'no-store'});var t=await r.text();return{status:r.status,length:t.length,preview:t.substring(0,100)};}catch(e){return{error:e.message};}})()`);
                if (result && result.length > 0 && !result.error && /root:.*:0:0|\\[(fonts|extensions|mail|mci)\\]|<\\?php/.test(result.preview)) findings.push({ id: 'LFI-HIT-' + findings.length, title: 'Posible LFI', severity: 'critical', type: 'basic', payload: p, evidence: 'Preview: ' + result.preview.substring(0, 80), description: 'Archivo local leído.', remediation: 'Bloquea path traversal.' });
            } catch (e) { }
            this.session.activePayloads--;
        }
        if (findings.length === 0) findings.push({ id: 'LFI-CLEAN', title: 'Sin LFI detectado', severity: 'info', type: 'summary', evidence: limited.length + ' payloads.' });
        return { tool: 'LFI/RFI Scanner', findings };
    },

    run_cmdi: async function (params) {
        const findings = [];
        const payloads = AdversarialPayloads.cmdInjection.basic.concat(AdversarialPayloads.cmdInjection.blind.slice(0, 5));
        const limited = payloads.slice(0, 15);
        for (const p of limited) {
            if (this.config.safeMode) { findings.push({ id: 'CMDI-SAFE-' + findings.length, title: 'CMDi Payload (Safe Mode)', payload: p, severity: 'info', type: 'basic', description: 'Safe Mode.', remediation: 'No concatenes input en comandos.' }); continue; }
            this.session.activePayloads++;
            try {
                const testUrl = this.session.targetUrl + (this.session.targetUrl.includes('?') ? '&' : '?') + 'cmd=' + encodeURIComponent(p);
                const start = Date.now();
                const result = await this._cdpEvaluate(`(async function(){try{var r=await fetch(${JSON.stringify(testUrl)},{cache:'no-store'});var t=await r.text();return{status:r.status,body:t.substring(0,200)};}catch(e){return{error:e.message};}})()`);
                const elapsed = Date.now() - start;
                if (/root|admin|user|nt authority/.test(result?.body || '') || elapsed >= 4500) findings.push({ id: 'CMDI-HIT-' + findings.length, title: 'Posible Command Injection', severity: 'critical', type: 'visible', payload: p, evidence: elapsed >= 4500 ? 'Tiempo: ' + elapsed + 'ms' : 'Respuesta: ' + (result.body || '').substring(0, 80), description: 'Comando parece ejecutado.', remediation: 'Usa exec() con array.' });
            } catch (e) { }
            this.session.activePayloads--;
        }
        if (findings.length === 0) findings.push({ id: 'CMDI-CLEAN', title: 'Sin Command Injection', severity: 'info', type: 'summary' });
        return { tool: 'Command Injection', findings };
    },

    run_xxe: async function (params) {
        const findings = [];
        const payloads = AdversarialPayloads.xxe.fileRead;
        for (const p of payloads) {
            findings.push({
                id: 'XXE-' + (this.config.safeMode ? 'SAFE-' : 'READY-') + findings.length,
                title: this.config.safeMode ? 'XXE Payload (Safe Mode)' : 'XXE Payload listo',
                severity: this.config.safeMode ? 'info' : 'high', type: 'fileRead',
                payload: this.config.safeMode ? null : p,
                description: this.config.safeMode ? 'Payload listado.' : 'Inyecta en endpoints XML.',
                evidence: p.substring(0, 100) + '...',
                remediation: 'Deshabilita DOCTYPE y entidades externas.'
            });
        }
        return { tool: 'XXE Injector', findings };
    },

    run_openRedirect: async function (params) {
        const findings = [];
        const payloads = AdversarialPayloads.openRedirect.basic;
        for (const p of payloads) {
            findings.push({ id: 'OR-' + (this.config.safeMode ? 'SAFE-' : 'POC-') + findings.length, title: 'Open Redirect Payload', payload: p, severity: this.config.safeMode ? 'info' : 'low', type: 'basic', description: this.config.safeMode ? 'Listado.' : 'Prueba manual.', evidence: 'URL: ' + p, remediation: 'Whitelist de URLs.' });
        }
        return { tool: 'Open Redirect', findings };
    },

    run_cors: async function (params) {
        const findings = [];
        try {
            const corsData = await this._cdpEvaluate(`(async function(){try{var r=await fetch(location.origin,{method:'HEAD',mode:'cors',cache:'no-store'});return JSON.stringify({acao:r.headers.get('access-control-allow-origin'),acac:r.headers.get('access-control-allow-credentials')});}catch(e){return JSON.stringify({error:e.message});}})()`);
            if (corsData && corsData.error) findings.push({ id: 'CORS-BLOCKED', title: 'CORS bloqueado', severity: 'info', type: 'analysis', description: 'CORS bloqueado (comportamiento normal).' });
            else if (corsData) {
                if (corsData.acao === '*') findings.push({ id: 'CORS-WILDCARD', title: 'CORS: ACAO: *', severity: 'high', type: 'wildcard', evidence: 'ACAO: *' + (corsData.acac === 'true' ? ' | Credentials: true' : ''), description: 'CORS permisivo.', remediation: 'Restringe ACAO.' });
                else if (corsData.acao) findings.push({ id: 'CORS-CONFIGURED', title: 'CORS configurado', severity: 'info', type: 'analysis', evidence: 'ACAO: ' + corsData.acao, description: 'CORS con origen específico.', remediation: 'No reflejes Origin sin validación.' });
            }
        } catch (e) { }
        if (findings.length === 0) findings.push({ id: 'CORS-CLEAN', title: 'Sin misconfiguración CORS', severity: 'info', type: 'summary' });
        return { tool: 'CORS Exploiter', findings };
    },

    getSessionSummary: function () {
        return {
            sessionId: this.session.id, startedAt: this.session.startedAt, targetUrl: this.session.targetUrl,
            isLocalTarget: this.session.isLocalTarget, activeMode: !this.config.safeMode,
            approvedHosts: this.session.approvedHosts, totalFindings: this.session.findings.length,
            findingsBySeverity: this._countBySeverity(), findingsByTool: this._countByTool(),
            logs: this.session.logs.slice(-50), rawFindings: this.session.findings
        };
    },

    clearSession: function () { this.session.findings = []; this.session.logs = []; this.log('info', 'Sesión limpiada'); },

    _isLocalUrl: function (url) {
        try { const u = new URL(url); return /localhost|127\.0\.0\.1|0\.0\.0\.0|::1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+|172\.(1[6-9]|2\d|3[01])\.\d+\.\d+/.test(u.hostname); } catch (e) { return false; }
    },

    _enforceRateLimit: async function () { if (this.config.rateLimitMs > 0) return new Promise(resolve => setTimeout(resolve, this.config.rateLimitMs)); },

    _httpProbe: async function (url, timeout = 8000) {
        return new Promise((resolve, reject) => {
            chrome.runtime.sendMessage({ type: 'adversarial-probe', url: url, timeout: timeout }, (resp) => {
                if (resp?.error) reject(new Error(resp.error)); else resolve(resp || {});
            });
        });
    },

    _cdpEvaluate: async function (code) {
        return new Promise((resolve) => {
            chrome.runtime.sendMessage({ type: 'adversarial-eval', expression: code }, (resp) => {
                resolve(resp?.result || (resp?.error ? { error: resp.error } : null));
            });
        });
    },

    _cdpEvaluateWithTimeout: async function (code, timeoutMs = 5000) {
        return new Promise((resolve) => {
            const timeout = setTimeout(() => resolve({ error: 'Timeout' }), timeoutMs);
            chrome.runtime.sendMessage({ type: 'adversarial-eval', expression: code }, (resp) => {
                clearTimeout(timeout);
                resolve(resp?.result || (resp?.error ? { error: resp.error } : null));
            });
        });
    },

    log: function (level, message, data) {
        const entry = { timestamp: new Date().toISOString(), level: level, message: message, data: data || null, sessionId: this.session.id };
        this.session.logs.push(entry);
        if (this.session.logs.length > this.config.maxLogEntries) this.session.logs = this.session.logs.slice(-this.config.maxLogEntries);
    },

    _countBySeverity: function () {
        const counts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
        for (const f of this.session.findings) { const s = f.severity || 'info'; if (counts[s] !== undefined) counts[s]++; }
        return counts;
    },

    _countByTool: function () {
        const counts = {};
        for (const f of this.session.findings) { const t = f.tool || 'unknown'; if (!counts[t]) counts[t] = 0; counts[t]++; }
        return counts;
    }
};

if (typeof module !== 'undefined' && module.exports) { module.exports = AdversarialEngine; }