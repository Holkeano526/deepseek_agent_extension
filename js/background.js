chrome.action.onClicked.addListener(async (tab) => {
  await chrome.sidePanel.open({ tabId: tab.id });
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'getPageContent') {
    handleGetPageContent(sendResponse);
    return true;
  }
  if (request.type === 'scrapePage') {
    handleScrape(sendResponse);
    return true;
  }
  if (request.type === 'devtools-query') {
    handleDevToolsQuery(request.query, request.params, sendResponse);
    return true;
  }
  if (request.type === 'extract-m3u8') {
    handleExtractM3u8(sendResponse);
    return true;
  }
  if (request.type === 'pentest-scan') {
    handlePentestScan(request.modules, sendResponse);
    return true;
  }
  if (request.type === 'pentest-cdp-query') {
    handlePentestCDPQuery(request, sendResponse);
    return true;
  }
  if (request.type === 'adversarial-eval') {
    handleAdversarialEval(request, sendResponse);
    return true;
  }
  if (request.type === 'adversarial-probe') {
    handleAdversarialProbe(request, sendResponse);
    return true;
  }
  if (request.type === 'adversarial-get-tab-info') {
    handleGetTabInfo(sendResponse);
    return true;
  }
});

// =============================================================================
// PENTESTING ENGINE — Passive Security Analysis (Read-Only)
// =============================================================================

async function handlePentestScan(modules, sendResponse) {
  let errorMessages = [];
  const allFindings = [];

  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url || /^(chrome|edge|about|chrome-extension):/.test(tab.url)) {
      sendResponse({ error: 'Esta página no se puede analizar. Abre un sitio web normal.' });
      return;
    }

    // === DOM SCANNERS — always work, no CDP needed ===
    try {
      const domResults = await runDOMScanners(tab.id, modules);
      if (domResults.findings) allFindings.push(...domResults.findings);
      if (domResults.error) errorMessages.push(domResults.error);
    } catch (e) {
      errorMessages.push('DOM Scan: ' + e.message);
    }

    // === CDP SCANNERS — non-destructive, uses Runtime.evaluate ===
    try {
      const cdpResults = await runCDPScanners(tab.id, modules);
      if (cdpResults.findings) allFindings.push(...cdpResults.findings);
      if (cdpResults.error) errorMessages.push(cdpResults.error);
    } catch (e) {
      errorMessages.push('CDP Scan: ' + e.message);
    }

    // === If there are zero findings from all scanners, add a default info finding ===
    if (allFindings.length === 0) {
      allFindings.push({
        id: 'SCAN-OK-01',
        title: 'Escaneo completado sin hallazgos',
        severity: 'info',
        category: 'Resultado',
        description: 'No se detectaron problemas de seguridad evidentes en la página. Esto puede deberse a restricciones del navegador (CSP/CORS) para algunos escáneres CDP. Los escáneres DOM (secrets, CSRF, comentarios, fingerprinting) siempre se ejecutan completamente.',
        evidence: errorMessages.length > 0 ? 'Advertencias: ' + errorMessages.join('; ') : 'Sin errores'
      });
    }

    const severityCounts = { critical: 0, high: 0, medium: 0, low: 0, info: 0 };
    for (const f of allFindings) {
      severityCounts[f.severity] = (severityCounts[f.severity] || 0) + 1;
    }

    const score = computeSecurityScore(severityCounts, allFindings.length);

    sendResponse({
      findings: allFindings,
      severityCounts,
      score,
      scanDuration: 'instante'
    });
  } catch (e) {
    sendResponse({ error: e.message || 'Error durante el escaneo de seguridad' });
  }
}

// =============================================================================
// DOM SCANNERS — injected into page context via scripting.executeScript
// =============================================================================

async function runDOMScanners(tabId, modules) {
  const results = await chrome.scripting.executeScript({
    target: { tabId },
    func: pentestDOMFn,
    args: [modules || []]
  });

  if (!results || !results[0]) {
    return { findings: [], error: 'No se pudo ejecutar el script en la página' };
  }

  return { findings: results[0].result || [] };
}

function pentestDOMFn(modules) {
  const findings = [];
  const allModules = !modules || modules.length === 0;

  const addFinding = (finding) => {
    // Deduplicate
    const exists = findings.some(f =>
      f.id === finding.id && f.evidence === finding.evidence
    );
    if (!exists) findings.push(finding);
  };

  // ── SECRET SCANNER ──
  if (allModules || modules.includes('secrets')) {
    try {
      const secretPatterns = [
        { regex: /(['\"])sk-[a-zA-Z0-9_-]{20,}\1/g, label: 'API Key (sk-)', severity: 'critical' },
        { regex: /(['\"])pk-[a-zA-Z0-9_-]{20,}\1/g, label: 'Stripe Key (pk-)', severity: 'high' },
        { regex: /eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.[a-zA-Z0-9_-]+/g, label: 'JWT Token', severity: 'critical' },
        { regex: /AKIA[0-9A-Z]{16}/g, label: 'AWS Access Key ID', severity: 'critical' },
        { regex: /gh[pousr]_[A-Za-z0-9_]{36,}/g, label: 'GitHub Token', severity: 'critical' },
        { regex: /(password|passwd|pwd)\s*[:=]\s*['\"][^'\"]{6,}['\"]/gi, label: 'Hardcoded password', severity: 'critical' },
        { regex: /AIza[0-9A-Za-z_-]{35}/g, label: 'Google API Key', severity: 'high' },
        { regex: /-----BEGIN (RSA |EC |DSA |OPENSSH )?PRIVATE KEY-----/g, label: 'Private Key', severity: 'critical' },
      ];

      const html = document.documentElement?.outerHTML || '';
      const inlineScripts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
      const target = html + '\n' + inlineScripts;

      for (const p of secretPatterns) {
        const matches = target.match(p.regex);
        if (matches) {
          const unique = [...new Set(matches)].slice(0, 5);
          addFinding({
            id: 'SECRET-' + (findings.length + 1),
            title: p.label,
            severity: p.severity,
            category: 'Secret Scanner',
            description: `${matches.length} instancia(s) detectadas en el código fuente.`,
            evidence: unique.map(m => m.substring(0, 60)).join(', '),
            remediation: 'Elimina secretos del código. Usa variables de entorno o un vault.'
          });
        }
      }
    } catch (e) {
      addFinding({ id: 'SECRET-ERR', title: 'Error en Secret Scanner', severity: 'info', category: 'Secret Scanner', description: e.message });
    }
  }

  // ── CSRF / FORM SECURITY ──
  if (allModules || modules.includes('csrf')) {
    try {
      const forms = document.querySelectorAll('form[method="POST"], form[method="post"]');
      if (forms.length === 0) {
        addFinding({
          id: 'CSRF-INFO',
          title: 'Sin formularios POST detectados',
          severity: 'info',
          category: 'CSRF / Form Security',
          description: 'No hay formularios con method POST. Riesgo de CSRF bajo.',
          evidence: '0 formularios POST encontrados'
        });
      } else {
        forms.forEach((form, i) => {
          const name = form.getAttribute('name') || form.getAttribute('id') || `form-${i}`;
          const hidden = form.querySelectorAll('input[type="hidden"]');
          const hasToken = Array.from(hidden).some(f =>
            /csrf|token|_token|authenticity_token|xsrf/i.test(f.name)
          );
          if (!hasToken) {
            addFinding({
              id: 'CSRF-FORM-' + i,
              title: 'POST sin token CSRF: ' + name,
              severity: 'high',
              category: 'CSRF / Form Security',
              description: 'Formulario POST sin campo CSRF visible.',
              evidence: 'Action: ' + (form.action || '(sin action)'),
              remediation: 'Agrega un token CSRF único por sesión.'
            });
          }
        });
      }
    } catch (e) {
      addFinding({ id: 'CSRF-ERR', title: 'Error en CSRF Scan', severity: 'info', category: 'CSRF / Form Security', description: e.message });
    }
  }

  // ── COMMENT INSPECTOR ──
  if (allModules || modules.includes('comments')) {
    try {
      const walker = document.createTreeWalker(document, 128, null, false);
      let count = 0;
      let suspicious = [];
      while (walker.nextNode()) {
        count++;
        const text = walker.currentNode.nodeValue || '';
        if (/TODO|FIXME|HACK|XXX|BUG|password|secret|api.?key|token|debug|hardcoded/i.test(text)) {
          suspicious.push(text.trim().substring(0, 100));
        }
      }
      if (count === 0) {
        addFinding({ id: 'COMMENT-INFO', title: 'Sin comentarios HTML', severity: 'info', category: 'Comment Inspector' });
      } else if (suspicious.length > 0) {
        addFinding({
          id: 'COMMENT-HIT',
          title: `${suspicious.length} comentario(s) sospechoso(s)`,
          severity: 'medium',
          category: 'Comment Inspector',
          description: 'Comentarios HTML con contenido que puede revelar información interna.',
          evidence: suspicious.slice(0, 3).join(' | '),
          remediation: 'Revisa y elimina comentarios con información sensible o notas de desarrollo.'
        });
      }
    } catch (e) {
      addFinding({ id: 'COMMENT-ERR', title: 'Error en Comment Inspector', severity: 'info', category: 'Comment Inspector', description: e.message });
    }
  }

  // ── VERSION FINGERPRINTING ──
  if (allModules || modules.includes('fingerprint')) {
    try {
      const checks = [
        { name: 'jQuery', version: typeof jQuery !== 'undefined' ? jQuery.fn.jquery : null },
        { name: 'React', version: typeof React !== 'undefined' ? React.version : null },
        { name: 'Vue', version: typeof Vue !== 'undefined' ? Vue.version : null },
        { name: 'Angular', version: typeof angular !== 'undefined' ? angular.version.full : null },
        { name: 'Bootstrap', version: document.querySelector('link[href*="bootstrap"]') ? 'detectado' : null },
        { name: 'Lodash', version: typeof _ !== 'undefined' && _.VERSION ? _.VERSION : null },
        { name: 'Moment.js', version: typeof moment !== 'undefined' ? moment.version : null },
        { name: 'Three.js', version: typeof THREE !== 'undefined' ? THREE.REVISION : null },
      ];
      const detected = checks.filter(c => c.version);
      if (detected.length > 0) {
        addFinding({
          id: 'FINGERPRINT',
          title: detected.length + ' librería(s) detectada(s)',
          severity: 'low',
          category: 'Version Fingerprint',
          description: detected.map(d => `${d.name} (${d.version})`).join(', ') + '. Versiones antiguas pueden tener CVE conocidos.',
          evidence: detected.map(d => d.name + ' v' + d.version).join('; '),
          remediation: 'Mantén las librerías actualizadas. Usa npm audit o Snyk.'
        });
      }
    } catch (e) {
      addFinding({ id: 'FINGERPRINT-ERR', title: 'Error en Fingerprinting', severity: 'info', category: 'Version Fingerprint', description: e.message });
    }
  }

  // ── INLINE EVENTS ──
  if (allModules || modules.includes('inlineEvents')) {
    try {
      const attrs = ['onclick', 'onerror', 'onload', 'onmouseover', 'onfocus', 'onblur', 'onsubmit', 'onchange'];
      let total = 0;
      attrs.forEach(a => {
        document.querySelectorAll('[' + a + ']').forEach(el => {
          const h = el.getAttribute(a);
          if (/\(/.test(h)) total++;
        });
      });
      if (total > 0) {
        addFinding({
          id: 'INLINE-EVENTS',
          title: total + ' evento(s) inline detectado(s)',
          severity: 'medium',
          category: 'Inline Events',
          description: 'Event handlers inline son potenciales vectores de XSS.',
          evidence: total + ' manejadores con parámetros',
          remediation: 'Migra a addEventListener() con sanitización de inputs.'
        });
      }
    } catch (e) {
      addFinding({ id: 'INLINE-ERR', title: 'Error en Inline Events', severity: 'info', category: 'Inline Events', description: e.message });
    }
  }

  // ── DOM XSS SOURCES ──
  if (allModules || modules.includes('domXss')) {
    try {
      const scripts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
      const patterns = [
        { re: /\.innerHTML\s*=/, label: 'innerHTML assignment' },
        { re: /\.outerHTML\s*=/, label: 'outerHTML assignment' },
        { re: /document\.write\s*\(/, label: 'document.write()' },
        { re: /eval\s*\(/, label: 'eval()' },
        { re: /setTimeout\s*\(\s*['"`]/, label: 'setTimeout(string)' },
        { re: /setInterval\s*\(\s*['"`]/, label: 'setInterval(string)' },
        { re: /new\s+Function\s*\(/, label: 'new Function()' },
        { re: /\.insertAdjacentHTML\s*\(/, label: 'insertAdjacentHTML()' },
      ];
      for (const p of patterns) {
        const m = scripts.match(p.re);
        if (m) {
          addFinding({
            id: 'DOMXSS-' + p.label.replace(/[^a-z]/gi, ''),
            title: p.label + ' detectado en scripts',
            severity: 'high',
            category: 'DOM-based XSS',
            description: 'API peligrosa detectada. Puede permitir XSS si se usa con datos no sanitizados.',
            evidence: 'Patrón: ' + p.label,
            remediation: 'Usa textContent en vez de innerHTML. Evita eval(). Sanitiza inputs.'
          });
          break;
        }
      }
    } catch (e) {
      addFinding({ id: 'DOMXSS-ERR', title: 'Error en DOM XSS', severity: 'info', category: 'DOM-based XSS', description: e.message });
    }
  }

  // ── CONSOLE LEAK ──
  if (allModules || modules.includes('consoleLeak')) {
    try {
      const scripts = Array.from(document.querySelectorAll('script:not([src])')).map(s => s.textContent).join('\n');
      if (/console\.\w+\(.*(?:token|key|password|secret|cookie|localStorage|sessionStorage)/i.test(scripts)) {
        addFinding({
          id: 'CONSOLE-LEAK',
          title: 'Posible fuga en console.log',
          severity: 'medium',
          category: 'Console Leak',
          description: 'console.log con datos sensibles detectado.',
          evidence: 'console.*() con parámetros potencialmente sensibles',
          remediation: 'Elimina console.log con datos sensibles en producción.'
        });
      }
    } catch (e) {
      addFinding({ id: 'CONSOLE-ERR', title: 'Error en Console Leak', severity: 'info', category: 'Console Leak', description: e.message });
    }
  }

  // ── EXPOSED SERVICES ──
  if (allModules || modules.includes('exposedServices')) {
    try {
      const refs = [];
      document.querySelectorAll('script[src]').forEach(s => {
        const src = s.getAttribute('src') || '';
        if (/http:\/\/(?:localhost|127\.0\.0\.1|10\.\d+\.\d+\.\d+|192\.168\.\d+\.\d+)/.test(src)) {
          refs.push(src.substring(0, 80));
        }
      });
      if (refs.length > 0) {
        addFinding({
          id: 'EXPOSED',
          title: refs.length + ' recurso(s) desde IP interna',
          severity: 'high',
          category: 'Exposed Services',
          description: 'Scripts cargados desde localhost o IP privada. Puede exponer servicios internos.',
          evidence: refs.slice(0, 3).join('; '),
          remediation: 'No uses localhost o IPs internas en producción.'
        });
      }
    } catch (e) {
      addFinding({ id: 'EXPOSED-ERR', title: 'Error en Exposed Services', severity: 'info', category: 'Exposed Services', description: e.message });
    }
  }

  return findings;
}

// =============================================================================
// CDP SCANNERS — non-destructive, attach/detach per module
// =============================================================================

async function runCDPScanners(tabId, modules) {
  const findings = [];
  const allModules = !modules || modules.length === 0;

  // Helper: evaluate JS in page context via CDP
  async function evalInPage(code, timeoutMs = 4000) {
    const target = { tabId };
    try {
      await chrome.debugger.attach(target, '1.3');
    } catch (e) {
      if (!e.message.includes('Already attached')) throw e;
    }
    try {
      const result = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
        expression: code,
        returnByValue: false,
        awaitPromise: true,
        timeout: timeoutMs
      });
      const raw = result?.result?.value;
      await chrome.debugger.detach(target);
      return raw && raw !== 'undefined' ? JSON.parse(raw) : null;
    } catch (e) {
      try { await chrome.debugger.detach(target); } catch (_) { }
      throw e;
    }
  }

  // ── SECURITY HEADERS ──
  if (allModules || modules.includes('headers')) {
    try {
      const headers = await evalInPage(`
        (async () => {
          try {
            const r = await fetch(location.origin, { method: 'HEAD', cache: 'no-store' });
            const h = {};
            r.headers.forEach((v, k) => { h[k] = v; });
            return JSON.stringify(h);
          } catch(e) {
            try {
              const r2 = await fetch(location.origin, { method: 'GET', cache: 'no-store', headers: {'Range': 'bytes=0-0'} });
              const h2 = {};
              r2.headers.forEach((v, k) => { h2[k] = v; });
              return JSON.stringify(h2);
            } catch(e2) { return JSON.stringify({error: e2.message}); }
          }
        })()
      `);

      if (headers && headers.error) {
        findings.push({
          id: 'HDR-INFO',
          title: 'Headers no accesibles por CORS/CSP',
          severity: 'info',
          category: 'Security Headers',
          description: 'No se pudieron leer los headers HTTP. Esto es normal en sitios con CORS restrictivo. Revisa manualmente en DevTools > Network.',
          evidence: headers.error
        });
      } else if (headers) {
        const checks = [
          { key: 'content-security-policy', name: 'CSP', sev: 'high' },
          { key: 'strict-transport-security', name: 'HSTS', sev: 'high' },
          { key: 'x-frame-options', name: 'X-Frame-Options', sev: 'medium' },
          { key: 'x-content-type-options', name: 'X-Content-Type-Options', sev: 'medium' },
          { key: 'referrer-policy', name: 'Referrer-Policy', sev: 'low' },
          { key: 'permissions-policy', name: 'Permissions-Policy', sev: 'low' },
          { key: 'feature-policy', name: 'Feature-Policy', sev: 'low' },
        ];
        for (const ck of checks) {
          if (!headers[ck.key]) {
            findings.push({
              id: 'HDR-MISS-' + ck.name.toUpperCase(),
              title: 'Falta header: ' + ck.name,
              severity: ck.sev,
              category: 'Security Headers',
              description: 'Cabecera de seguridad ausente en la respuesta HTTP.',
              evidence: 'Header ' + ck.name + ' no encontrado',
              remediation: 'Agrega: ' + ({
                'CSP': "Content-Security-Policy: default-src 'self'",
                'HSTS': 'Strict-Transport-Security: max-age=31536000; includeSubDomains',
                'X-Frame-Options': 'X-Frame-Options: DENY',
                'X-Content-Type-Options': 'X-Content-Type-Options: nosniff',
                'Referrer-Policy': 'Referrer-Policy: strict-origin-when-cross-origin',
                'Permissions-Policy': 'Permissions-Policy: camera=(), microphone=(), geolocation=()',
                'Feature-Policy': 'Feature-Policy: camera \'none\'; microphone \'none\''
              })[ck.name]
            });
          }
        }
        // If all present, report positive
        const missing = checks.filter(c => !headers[c.key]);
        if (missing.length === 0) {
          findings.push({
            id: 'HDR-OK',
            title: 'Headers de seguridad presentes',
            severity: 'info',
            category: 'Security Headers',
            description: 'CSP, HSTS, XFO, XCTO, Referrer-Policy y Permissions-Policy están configurados.',
            evidence: 'Todos los headers principales detectados'
          });
        }
      }
    } catch (e) {
      findings.push({
        id: 'HDR-ERR',
        title: 'Security Headers: ' + e.message.substring(0, 50),
        severity: 'info',
        category: 'Security Headers',
        description: 'Error al leer headers. Se omitió este módulo.'
      });
    }
  }

  // ── COOKIES ──
  if (allModules || modules.includes('cookies')) {
    try {
      const cookies = await evalInPage(`JSON.stringify(document.cookie.split(';').map(c=>c.trim()).filter(Boolean))`, 3000);
      if (!cookies || cookies.length === 0) {
        findings.push({
          id: 'COOK-INFO',
          title: 'Sin cookies accesibles vía JS',
          severity: 'info',
          category: 'Cookie Security',
          description: 'document.cookie está vacío. Las cookies tienen HttpOnly (buena práctica) o no hay cookies.',
          evidence: 'document.cookie vacío'
        });
      } else {
        for (const c of cookies) {
          const parts = c.split('=');
          const name = parts[0];
          findings.push({
            id: 'COOK-JS-' + name.replace(/[^a-z0-9]/gi, '_'),
            title: 'Cookie accesible vía JS: ' + name,
            severity: 'low',
            category: 'Cookie Security',
            description: 'Cookie sin HttpOnly. Puede ser robada en caso de XSS.',
            evidence: name + '=' + (parts[1] || '').substring(0, 20),
            remediation: 'Agrega HttpOnly, Secure y SameSite=Lax a cookies sensibles.'
          });
        }
      }
    } catch (e) {
      findings.push({
        id: 'COOK-ERR',
        title: 'Cookie Security: ' + e.message.substring(0, 50),
        severity: 'info',
        category: 'Cookie Security',
        description: 'Error al leer cookies. Se omitió este módulo.'
      });
    }
  }

  // ── MIXED CONTENT ──
  if (allModules || modules.includes('mixedContent')) {
    try {
      const data = await evalInPage(`(function(){
        const http = [];
        document.querySelectorAll('script[src],link[rel=stylesheet],img[src],iframe[src],video[src],source[src],object[data],embed[src]').forEach(el => {
          const u = el.src || el.href || el.data || '';
          if(u.startsWith('http:')) http.push(u);
        });
        return JSON.stringify({total: http.length, isHttps: location.protocol === 'https:', samples: http.slice(0,5)});
      })()`, 3000);

      if (data) {
        if (!data.isHttps) {
          findings.push({
            id: 'MIX-HTTP',
            title: 'Página en HTTP — migrar a HTTPS',
            severity: 'high',
            category: 'Mixed Content',
            description: 'La página usa HTTP. Todo viaja en texto plano.',
            evidence: 'Protocolo: HTTP',
            remediation: 'Implementa HTTPS con Let\'s Encrypt.'
          });
        } else if (data.total > 0) {
          findings.push({
            id: 'MIX-HIT',
            title: data.total + ' recurso(s) HTTP en HTTPS',
            severity: 'high',
            category: 'Mixed Content',
            description: 'Contenido mixto: recursos HTTP en página HTTPS. Pueden ser interceptados.',
            evidence: 'Ejemplos: ' + (data.samples || []).join(', '),
            remediation: 'Cambia a URLs HTTPS o protocolos relativos (//).'
          });
        } else {
          findings.push({
            id: 'MIX-OK',
            title: 'Sin contenido mixto',
            severity: 'info',
            category: 'Mixed Content',
            description: 'Todos los recursos se cargan sobre HTTPS.',
            evidence: '0 recursos HTTP detectados'
          });
        }
      }
    } catch (e) {
      findings.push({
        id: 'MIX-ERR',
        title: 'Mixed Content: ' + e.message.substring(0, 50),
        severity: 'info',
        category: 'Mixed Content',
        description: 'Error al verificar contenido mixto.'
      });
    }
  }

  // ── TLS ──
  if (allModules || modules.includes('tls')) {
    try {
      const info = await evalInPage(`JSON.stringify({isHttps: location.protocol === 'https:', hostname: location.hostname})`, 3000);
      if (info && !info.isHttps) {
        findings.push({
          id: 'TLS-HTTP',
          title: 'Conexión no segura (HTTP)',
          severity: 'high',
          category: 'TLS/SSL',
          description: 'La página se sirve sin cifrado.',
          evidence: 'Servidor: ' + (info.hostname || '?'),
          remediation: 'Implementa HTTPS con certificado TLS.'
        });
      } else if (info && info.isHttps) {
        findings.push({
          id: 'TLS-OK',
          title: 'Conexión HTTPS segura',
          severity: 'info',
          category: 'TLS/SSL',
          description: 'La página usa HTTPS. No se detectaron problemas de certificado.',
          evidence: 'Servidor: ' + info.hostname,
          remediation: 'Mantén certificados actualizados.'
        });
      }
    } catch (e) {
      findings.push({
        id: 'TLS-ERR',
        title: 'TLS: ' + e.message.substring(0, 50),
        severity: 'info',
        category: 'TLS/SSL',
        description: 'No se pudo verificar TLS.'
      });
    }
  }

  // ── CORS ──
  if (allModules || modules.includes('cors')) {
    try {
      const corsData = await evalInPage(`
        (async () => {
          try {
            const r = await fetch(location.origin, { method: 'HEAD', cache: 'no-store', mode: 'cors' });
            return JSON.stringify({ acao: r.headers.get('access-control-allow-origin'), acac: r.headers.get('access-control-allow-credentials'), status: r.status });
          } catch(e) { return JSON.stringify({error: e.message}); }
        })()
      `);
      if (corsData && corsData.error) {
        findings.push({
          id: 'CORS-INFO',
          title: 'CORS bloqueado (comportamiento normal)',
          severity: 'info',
          category: 'CORS',
          description: 'El sitio bloquea CORS — es el comportamiento esperado para la mayoría de sitios.',
          evidence: 'Error: ' + corsData.error.substring(0, 60)
        });
      } else if (corsData) {
        if (corsData.acao === '*') {
          findings.push({
            id: 'CORS-OPEN',
            title: 'CORS excesivamente permisivo (*)',
            severity: 'medium',
            category: 'CORS',
            description: 'Access-Control-Allow-Origin: * permite cualquier origen.',
            evidence: 'ACAO: *',
            remediation: 'Restringe a orígenes específicos.'
          });
        } else if (corsData.acao) {
          findings.push({
            id: 'CORS-OK',
            title: 'CORS configurado',
            severity: 'info',
            category: 'CORS',
            description: 'CORS configurado con origen específico.',
            evidence: 'ACAO: ' + corsData.acao
          });
        }
      }
    } catch (e) {
      findings.push({
        id: 'CORS-ERR',
        title: 'CORS: ' + e.message.substring(0, 50),
        severity: 'info',
        category: 'CORS',
        description: 'No se pudo verificar CORS.'
      });
    }
  }

  return { findings };
}

function computeSecurityScore(severityCounts, totalFindings) {
  let score = 100;
  score -= (severityCounts.critical || 0) * 25;
  score -= (severityCounts.high || 0) * 10;
  score -= (severityCounts.medium || 0) * 4;
  score -= (severityCounts.low || 0) * 1;
  const onlyInfo = totalFindings === (severityCounts.info || 0);
  if (onlyInfo && totalFindings > 0) score = 95;
  return Math.max(0, Math.min(100, score));
}

async function handlePentestCDPQuery(request, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { sendResponse({ error: 'No active tab' }); return; }
    const target = { tabId: tab.id };
    try { await chrome.debugger.attach(target, '1.3'); } catch (e) {
      if (!e.message.includes('Already attached')) throw e;
    }
    let result = null;
    try {
      if (request.queryType === 'getFullHTML') {
        await chrome.debugger.sendCommand(target, 'DOM.enable');
        const domResult = await chrome.debugger.sendCommand(target, 'DOM.getDocument', { depth: -1 });
        const htmlResult = await chrome.debugger.sendCommand(target, 'DOM.getOuterHTML', { nodeId: domResult.root.nodeId });
        result = htmlResult.outerHTML.slice(0, 100000);
      } else if (request.queryType === 'eval') {
        // White Hat Tools: evaluate arbitrary JS in page context
        const evalResult = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: request.expression || '',
          returnByValue: false,
          awaitPromise: true,
          timeout: 8000
        });
        result = evalResult?.result?.value || null;
      } else if (request.queryType === 'getNetworkRequests') {
        const evalResult = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
          expression: `JSON.stringify(performance.getEntriesByType('resource').map(e => ({ name: e.name, type: e.initiatorType, duration: e.duration.toFixed(2), size: e.transferSize })))`,
          returnByValue: false, timeout: 3000
        });
        const raw = evalResult?.result?.value;
        result = raw && raw !== 'undefined' ? JSON.parse(raw) : [];
      }
      await chrome.debugger.detach(target);
      sendResponse({ result });
    } catch (err) {
      try { await chrome.debugger.detach(target); } catch (_) { }
      throw err;
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

// =============================================================================
// EXISTING CODE — Unchanged
// =============================================================================

async function handleScrape(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url || /^(chrome|edge|about|chrome-extension):/.test(tab.url)) {
      sendResponse({ error: 'Esta página no se puede analizar. Abre un sitio web normal e inténtalo de nuevo.' });
      return;
    }
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: scrapeFn
    });
    const data = results?.[0]?.result;
    if (!data) {
      sendResponse({ error: 'No se encontraron datos en esta página.' });
      return;
    }
    sendResponse({ data });
  } catch (e) {
    sendResponse({ error: e.message || 'No se pudo analizar la página.' });
  }
}

function scrapeFn() {
  const abs = (u) => { try { return new URL(u, location.href).href; } catch (_) { return u; } };
  const clean = (s) => (s || '').replace(/\s+/g, ' ').trim();
  const meta = {
    title: document.title || '',
    url: location.href,
    description: document.querySelector('meta[name="description"]')?.content || document.querySelector('meta[property="og:description"]')?.content || '',
    scrapedAt: new Date().toISOString()
  };
  const headings = Array.from(document.querySelectorAll('h1, h2, h3')).map((h) => ({ level: h.tagName.toLowerCase(), text: clean(h.innerText) })).filter((h) => h.text).slice(0, 500);
  const seenLinks = new Set();
  const links = [];
  for (const a of document.querySelectorAll('a[href]')) {
    if (links.length >= 2000) break;
    const raw = a.getAttribute('href');
    if (!raw || raw.startsWith('#') || raw.startsWith('javascript:') || raw.startsWith('mailto:')) continue;
    const url = abs(raw);
    if (seenLinks.has(url)) continue;
    seenLinks.add(url);
    links.push({ text: clean(a.innerText) || clean(a.getAttribute('aria-label')) || clean(a.title), url });
  }
  const seenImg = new Set();
  const images = [];
  for (const img of document.querySelectorAll('img[src]')) {
    if (images.length >= 1000) break;
    const src = abs(img.getAttribute('src'));
    if (!src || seenImg.has(src)) continue;
    seenImg.add(src);
    images.push({ src, alt: clean(img.getAttribute('alt')) });
  }
  const tables = Array.from(document.querySelectorAll('table')).map((t) => Array.from(t.querySelectorAll('tr')).map((tr) => Array.from(tr.querySelectorAll('th, td')).map((c) => clean(c.innerText))).filter((row) => row.length)).filter((rows) => rows.length).slice(0, 50);
  const bodyText = clean(document.body?.innerText || '').slice(0, 80000);
  const emails = Array.from(new Set((document.body?.innerText || '').match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [])).slice(0, 500);
  return { meta, headings, links, images, tables, emails, text: bodyText };
}

async function handleGetPageContent(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id || !tab?.url) { sendResponse({ content: '', url: '', title: '' }); return; }
    const tabInfo = { url: tab.url, title: tab.title };
    try {
      const result = await chrome.tabs.sendMessage(tab.id, { type: 'getPageContent' });
      if (result?.content) { sendResponse({ ...result, ...tabInfo }); return; }
    } catch (_) { }
    try {
      const results = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: () => document.body?.innerText?.slice(0, 80000) || '' });
      sendResponse({ content: results[0]?.result || '', ...tabInfo });
    } catch (e) { sendResponse({ content: '', error: e.message, ...tabInfo }); }
  } catch (e) { sendResponse({ content: '', error: e.message }); }
}

async function handleExtractM3u8(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { sendResponse({ error: 'No active tab found' }); return; }
    
    const results = await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      func: () => {
        const sourceElement = document.querySelector('video source[src$=".m3u8"]') ||
                              document.querySelector('video source[type="application/x-mpegURL"]');
        if (sourceElement && sourceElement.src) {
          return sourceElement.src;
        }
        return null;
      }
    });
    
    const url = results[0]?.result;
    if (url) {
      const command = `ffmpeg -i "${url}" -c copy -bsf:a aac_adtstoasc video_descargado.mp4`;
      sendResponse({ result: command, url: url });
    } else {
      sendResponse({ error: 'No se encontró ningún enlace m3u8 en los elementos <video> de la página.' });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

async function handleDevToolsQuery(query, params, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { sendResponse({ error: 'No active tab found' }); return; }
    const target = { tabId: tab.id };
    try { await chrome.debugger.attach(target, '1.3'); } catch (e) { if (!e.message.includes('Already attached')) throw e; }
    let result = null;
    try {
      if (query === 'DOM.getOuterHTML') {
        await chrome.debugger.sendCommand(target, 'DOM.enable');
        const domResult = await chrome.debugger.sendCommand(target, 'DOM.getDocument', { depth: -1 });
        const htmlResult = await chrome.debugger.sendCommand(target, 'DOM.getOuterHTML', { nodeId: domResult.root.nodeId });
        result = htmlResult.outerHTML.slice(0, 80000);
      } else if (query === 'Page.getResourceTree') {
        await chrome.debugger.sendCommand(target, 'Page.enable');
        result = await chrome.debugger.sendCommand(target, 'Page.getResourceTree');
      } else if (query === 'Page.getResourceContent') {
        await chrome.debugger.sendCommand(target, 'Page.enable');
        const resContent = await chrome.debugger.sendCommand(target, 'Page.getResourceContent', { frameId: params.frameId, url: params.url });
        result = resContent.content ? resContent.content.slice(0, 20000) : null;
      } else throw new Error('Comando DevTools no soportado');
      await chrome.debugger.detach(target);
      sendResponse({ result });
    } catch (err) { try { await chrome.debugger.detach(target); } catch (_) { } throw err; }
  } catch (e) { sendResponse({ error: e.message }); }
}

// =============================================================================
// ADVERSARIAL LAB — Handlers
// =============================================================================

// Handle CDP evaluation for adversarial tools
async function handleAdversarialEval(request, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { sendResponse({ error: 'No active tab' }); return; }
    const target = { tabId: tab.id };
    try { await chrome.debugger.attach(target, '1.3'); } catch (e) {
      if (!e.message.includes('Already attached')) throw e;
    }
    try {
      const evalResult = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
        expression: request.expression || '',
        returnByValue: false,
        awaitPromise: true,
        timeout: 10000
      });
      const raw = evalResult?.result?.value;
      let result = null;
      if (raw && raw !== 'undefined') {
        try { result = JSON.parse(raw); } catch (e) { result = raw; }
      }
      await chrome.debugger.detach(target);
      sendResponse({ result });
    } catch (err) {
      try { await chrome.debugger.detach(target); } catch (_) { }
      sendResponse({ error: err.message });
    }
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

// Handle HTTP probe for adversarial tools (fetch via CDP)
async function handleAdversarialProbe(request, sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) { sendResponse({ error: 'No active tab' }); return; }

    const target = { tabId: tab.id };
    try { await chrome.debugger.attach(target, '1.3'); } catch (e) {
      if (!e.message.includes('Already attached')) throw e;
    }

    try {
      // Use CDP to make a fetch request from the page context
      const code = `
        (async () => {
          try {
            const controller = new AbortController();
            const timeout = setTimeout(() => controller.abort(), ${request.timeout || 8000});
            const response = await fetch(${JSON.stringify(request.url)}, {
              method: 'GET',
              signal: controller.signal,
              cache: 'no-store',
              mode: 'cors',
              headers: { 'Accept': 'text/html,application/json,*/*' }
            });
            clearTimeout(timeout);
            const text = await response.text();
            return JSON.stringify({
              status: response.status,
              ok: response.ok,
              body: text.substring(0, 5000)
            });
          } catch(e) {
            return JSON.stringify({ error: e.message, body: '' });
          }
        })()
      `;

      const evalResult = await chrome.debugger.sendCommand(target, 'Runtime.evaluate', {
        expression: code,
        returnByValue: false,
        awaitPromise: true,
        timeout: (request.timeout || 8000) + 2000
      });

      const raw = evalResult?.result?.value;
      let result = { body: '' };
      if (raw && raw !== 'undefined') {
        try { result = JSON.parse(raw); } catch (e) { result = { body: raw }; }
      }

      await chrome.debugger.detach(target);
      sendResponse(result);
    } catch (err) {
      try { await chrome.debugger.detach(target); } catch (_) { }
      sendResponse({ error: err.message, body: '' });
    }
  } catch (e) {
    sendResponse({ error: e.message, body: '' });
  }
}

// Get current tab info for adversarial session
async function handleGetTabInfo(sendResponse) {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) {
      sendResponse({ error: 'No active tab' });
      return;
    }
    sendResponse({
      url: tab.url || '',
      title: tab.title || '',
      id: tab.id
    });
  } catch (e) {
    sendResponse({ error: e.message });
  }
}
