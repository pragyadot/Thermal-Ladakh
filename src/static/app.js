/**
 * THERMAL//LADAKH — Client Engine (wired to real backend API)
 * All physics now comes from /api/* endpoints, which run the validated
 * RK4 direct-gain thermal model against real NASA POWER weather data and
 * the real materials CSV. Nothing in this file invents temperature or
 * solar numbers anymore.
 */
document.addEventListener('DOMContentLoaded', () => {
    const API = ''; // same-origin, Flask serves both API and static files

    const state = {
        theme: localStorage.getItem('thermal-theme') || 'dark',
        materials: [],                 // populated from /api/materials
        materialsByName: {},
        env: null,                     // populated from /api/environment
        geometry: { length: 4.0, width: 4.0, height: 2.5, windowArea: 2.0, orientation: "South" },
        layer1: { material: null, thickness: 300 },
        layer2: { material: null, thickness: 100, enabled: true },
        sim: { duration: 3, isRunning: false, startDate: null },
        timeIndex: 0, timePlayInterval: null,
        lastResult: null,              // last /api/simulate response for active design
        savedConfigs: [],              // [{name, layers:[{material,thickness_mm},...]}]
    };
    const charts = {};

    const DOM = {
        root: document.documentElement, themeBtn: document.getElementById('theme-toggle'),
        navBtns: document.querySelectorAll('.nav-btn'), sections: document.querySelectorAll('.page-section'),
        ovInterior: document.getElementById('ov-interior'), ovAmbient: document.getElementById('ov-ambient'),
        ovDelta: document.getElementById('ov-delta'), ovSolar: document.getElementById('ov-solar'), ovLoss: document.getElementById('ov-loss'),
        ovPeakSolar: document.getElementById('ov-peak-solar'), ovNightAdv: document.getElementById('ov-night-adv'),
        ovArea: document.getElementById('ov-area'), ovVol: document.getElementById('ov-vol'), ovGlazing: document.getElementById('ov-glazing'),
        ovOrientation: document.getElementById('ov-orientation'), ovLayerPreview: document.getElementById('ov-layer-preview'),
        ovDimLen: document.getElementById('ov-dim-len'), ovDimWid: document.getElementById('ov-dim-wid'), ovDimHgt: document.getElementById('ov-dim-hgt'),
        geoL: document.getElementById('geo-l'), geoW: document.getElementById('geo-w'), geoH: document.getElementById('geo-h'), geoWin: document.getElementById('geo-win'), geoOri: document.getElementById('geo-ori'),
        l1Mat: document.getElementById('l1-mat'), l1Thick: document.getElementById('l1-thick'), l1ThickVal: document.getElementById('l1-thick-val'), l1PropsInfo: document.getElementById('l1-props-info'), l1Swatch: document.getElementById('l1-swatch'),
        l2Mat: document.getElementById('l2-mat'), l2Thick: document.getElementById('l2-thick'), l2ThickVal: document.getElementById('l2-thick-val'), l2PropsInfo: document.getElementById('l2-props-info'), l2Swatch: document.getElementById('l2-swatch'),
        visBlockL1: document.getElementById('vis-block-l1'), visBlockL2: document.getElementById('vis-block-l2'), visNameL1: document.getElementById('vis-name-l1'), visNameL2: document.getElementById('vis-name-l2'),
        visThickL1: document.getElementById('vis-thick-l1'), visThickL2: document.getElementById('vis-thick-l2'), visExtTemp: document.getElementById('vis-ext-temp'), visIntTemp: document.getElementById('vis-int-temp'),
        propThick: document.getElementById('prop-thick'), propR: document.getElementById('prop-r'), propU: document.getElementById('prop-u'), propMC: document.getElementById('prop-mc'), btnApplyConfig: document.getElementById('btn-apply-config'),
        btnSaveComparison: document.getElementById('btn-save-comparison'), compSavedList: document.getElementById('comp-saved-list'), btnRunComparison: document.getElementById('btn-run-comparison'),
        simDuration: document.getElementById('sim-duration'), simDt: document.getElementById('sim-dt'), simStartDate: document.getElementById('sim-start-date'), btnRunSim: document.getElementById('btn-run-sim'), btnResetSim: document.getElementById('btn-reset-sim'), simProgressFill: document.getElementById('sim-progress-fill'),
        compTableBody: document.getElementById('comp-table-body'), compEvalTitle: document.getElementById('comp-eval-title'), compEvalBody: document.getElementById('comp-eval-body'),
        takeaway1: document.getElementById('takeaway-1'), takeaway2: document.getElementById('takeaway-2'),
        envMinTemp: document.getElementById('env-min-temp'), envMaxTemp: document.getElementById('env-max-temp'), envPeakSolar: document.getElementById('env-peak-solar'), envAvgTemp: document.getElementById('env-avg-temp'),
        shelter3dDesign: document.getElementById('shelter-3d-design'), shelter3dOverview: document.getElementById('shelter-3d-overview'), shelterCompass: document.getElementById('shelter-compass'), shelterLegend: document.getElementById('shelter-legend'),
        physTime: document.getElementById('phys-time'), physSolar: document.getElementById('phys-solar'), physLoss: document.getElementById('phys-loss'), physInterior: document.getElementById('phys-interior'), physAmbient: document.getElementById('phys-ambient'), physSlider: document.getElementById('phys-time-slider'), physPlayBtn: document.getElementById('phys-play-btn'),
    };

    // -----------------------------------------------------------------
    // PARAMETRIC 3D SHELTER VISUALIZATION (Three.js, rotatable/zoomable)
    // Pure client-side geometry render — does NOT compute any physics;
    // physics still comes only from /api/*. Two independent viewports
    // (Overview + Design) are driven from the same state so they always agree.
    // -----------------------------------------------------------------
    const MATERIAL_PALETTE = [
        '#b5793d', '#c9a86a', '#8a8f96', '#7f9a7a', '#a9744f',
        '#d1b26f', '#6fa3b0', '#9c8063', '#7c8ba1', '#b08968',
    ];
    function colorForMaterial(name) {
        if (!name) return '#888888';
        let h = 0;
        for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
        return MATERIAL_PALETTE[h % MATERIAL_PALETTE.length];
    }

    // -----------------------------------------------------------------
    // PROCEDURAL MATERIAL TEXTURES — generated entirely in-canvas (no external
    // image files, so nothing to fail-to-load offline at a demo). Each texture
    // is drawn once, cached by category, and reused as both a 3D wall texture
    // and the 2D layer-preview swatch, so the two always match exactly.
    // -----------------------------------------------------------------
    function categorizeMaterial(name) {
        const n = (name || '').toLowerCase();
        if (n.includes('rammed earth') || n.includes('mud')) return 'rammedEarth';
        if (n.includes('adobe')) return 'adobe';
        if (n.includes('granite') || n.includes('stone')) return 'granite';
        if (n.includes('straw-clay') || n.includes('straw clay')) return 'strawClay';
        if (n.includes('wood')) return 'wood';
        if (n.includes('thatch')) return 'thatch';
        if (n.includes('glass wool')) return 'glassWool';
        if (n.includes('eps') || n.includes('polystyrene')) return 'eps';
        if (n.includes('double') && (n.includes('glaz') || n.includes('window'))) return 'glass';
        return 'generic';
    }

    function seededRandom(seed) {
        let s = seed >>> 0;
        return function () { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
    }

    const MATERIAL_CANVAS_CACHE = {};
    function getMaterialCanvas(name) {
        const cat = categorizeMaterial(name);
        if (MATERIAL_CANVAS_CACHE[cat]) return MATERIAL_CANVAS_CACHE[cat];
        const size = 256;
        const c = document.createElement('canvas');
        c.width = size; c.height = size;
        const ctx = c.getContext('2d');
        const rand = seededRandom(cat.length * 97 + 13);

        function fill(color) { ctx.fillStyle = color; ctx.fillRect(0, 0, size, size); }

        if (cat === 'wood') {
            fill('#8a5a34');
            for (let i = 0; i < 26; i++) {
                const y0 = (i / 26) * size + (rand() - 0.5) * 8;
                ctx.strokeStyle = `rgba(${60 + rand() * 30},${34 + rand() * 20},${14 + rand() * 12},${0.35 + rand() * 0.3})`;
                ctx.lineWidth = 1.5 + rand() * 2.5;
                ctx.beginPath();
                ctx.moveTo(0, y0);
                for (let x = 0; x <= size; x += 16) ctx.lineTo(x, y0 + Math.sin(x * 0.04 + i) * 5 + (rand() - 0.5) * 4);
                ctx.stroke();
            }
            for (let k = 0; k < 3; k++) {
                const kx = rand() * size, ky = rand() * size, kr = 8 + rand() * 10;
                const g = ctx.createRadialGradient(kx, ky, 0, kx, ky, kr);
                g.addColorStop(0, 'rgba(40,24,12,0.55)'); g.addColorStop(1, 'rgba(40,24,12,0)');
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(kx, ky, kr, 0, Math.PI * 2); ctx.fill();
            }
        } else if (cat === 'rammedEarth') {
            fill('#a9835a');
            const bands = 14;
            for (let i = 0; i < bands; i++) {
                const y = (i / bands) * size;
                const h = size / bands;
                const shade = 0.85 + rand() * 0.3;
                ctx.fillStyle = `rgba(${140 * shade},${105 * shade},${70 * shade},0.55)`;
                ctx.fillRect(0, y, size, h * 0.92);
            }
            for (let i = 0; i < 900; i++) {
                ctx.fillStyle = `rgba(60,40,25,${rand() * 0.15})`;
                ctx.fillRect(rand() * size, rand() * size, 1.5, 1.5);
            }
        } else if (cat === 'adobe') {
            fill('#c08a52');
            for (let i = 0; i < 700; i++) {
                ctx.fillStyle = `rgba(${90 + rand() * 60},${60 + rand() * 40},${30 + rand() * 20},${rand() * 0.25})`;
                ctx.fillRect(rand() * size, rand() * size, 2 + rand() * 2, 2 + rand() * 2);
            }
            ctx.strokeStyle = 'rgba(70,45,25,0.25)'; ctx.lineWidth = 2;
            for (let i = 0; i < 4; i++) { const y = (i + 1) * size / 4; ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(size, y); ctx.stroke(); }
        } else if (cat === 'granite') {
            fill('#7d8288');
            for (let i = 0; i < 2200; i++) {
                const v = rand();
                const g = 90 + v * 110;
                ctx.fillStyle = `rgba(${g},${g},${g + 4},${0.25 + rand() * 0.35})`;
                ctx.fillRect(rand() * size, rand() * size, 1 + rand() * 1.5, 1 + rand() * 1.5);
            }
        } else if (cat === 'strawClay') {
            fill('#c7a35f');
            for (let i = 0; i < 260; i++) {
                const x = rand() * size, y = rand() * size, len = 10 + rand() * 22, ang = rand() * Math.PI;
                ctx.strokeStyle = `rgba(${190 + rand() * 40},${160 + rand() * 40},${90 + rand() * 30},${0.35 + rand() * 0.35})`;
                ctx.lineWidth = 1 + rand();
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + Math.cos(ang) * len, y + Math.sin(ang) * len); ctx.stroke();
            }
        } else if (cat === 'thatch') {
            fill('#a9822f');
            for (let i = 0; i < 420; i++) {
                const x = rand() * size, y = rand() * size, len = 16 + rand() * 26;
                ctx.strokeStyle = `rgba(${120 + rand() * 60},${90 + rand() * 50},${20 + rand() * 20},${0.4 + rand() * 0.35})`;
                ctx.lineWidth = 1.2 + rand() * 1.3;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + (rand() - 0.5) * 6, y + len); ctx.stroke();
            }
        } else if (cat === 'glassWool') {
            fill('#e8c9c0');
            for (let i = 0; i < 500; i++) {
                const x = rand() * size, y = rand() * size, len = 6 + rand() * 14;
                ctx.strokeStyle = `rgba(${230},${190 + rand() * 30},${180 + rand() * 30},${0.25 + rand() * 0.3})`;
                ctx.lineWidth = 0.8;
                ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x + len * 0.5, y + (rand() - 0.5) * len, x + len, y + (rand() - 0.5) * 4); ctx.stroke();
            }
        } else if (cat === 'eps') {
            fill('#f2f2ee');
            for (let i = 0; i < 300; i++) {
                const x = rand() * size, y = rand() * size, r = 3 + rand() * 4;
                ctx.strokeStyle = `rgba(200,200,195,${0.3 + rand() * 0.3})`;
                ctx.lineWidth = 1;
                ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.stroke();
            }
        } else if (cat === 'glass') {
            const g = ctx.createLinearGradient(0, 0, size, size);
            g.addColorStop(0, '#9fd3e8'); g.addColorStop(0.5, '#cdeaf2'); g.addColorStop(1, '#7fb8d4');
            ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
            ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 6;
            ctx.beginPath(); ctx.moveTo(-20, size * 0.3); ctx.lineTo(size * 0.5, -20); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(size * 0.3, size + 20); ctx.lineTo(size + 20, size * 0.4); ctx.stroke();
        } else {
            fill(colorForMaterial(name) || '#8a8f96');
            for (let i = 0; i < 500; i++) {
                ctx.fillStyle = `rgba(0,0,0,${rand() * 0.08})`;
                ctx.fillRect(rand() * size, rand() * size, 2, 2);
            }
        }

        MATERIAL_CANVAS_CACHE[cat] = c;
        return c;
    }

    const MATERIAL_TEXTURE_CACHE = {};
    function getMaterialTexture(name, repeatX, repeatY) {
        const cat = categorizeMaterial(name);
        const key = cat;
        if (!MATERIAL_TEXTURE_CACHE[key]) {
            const tex = new THREE.CanvasTexture(getMaterialCanvas(name));
            tex.wrapS = THREE.RepeatWrapping;
            tex.wrapT = THREE.RepeatWrapping;
            MATERIAL_TEXTURE_CACHE[key] = tex;
        }
        const tex = MATERIAL_TEXTURE_CACHE[key];
        tex.repeat.set(repeatX || 2, repeatY || 2);
        return tex;
    }

    function materialRoughness(name) {
        const cat = categorizeMaterial(name);
        return {
            wood: 0.5, rammedEarth: 0.92, adobe: 0.88, granite: 0.65,
            strawClay: 0.95, thatch: 0.97, glassWool: 0.9, eps: 0.8,
            glass: 0.08, generic: 0.8,
        }[cat] ?? 0.8;
    }

    const ORIENTATION_ANGLE_DEG = { South: 0, East: -90, West: 90, North: 180 };
    const ORIENTATION_MULT = { South: 1.0, East: 0.7, West: 0.7, North: 0.3 };

    const shelterViewports = {}; // name -> {scene,camera,renderer,controls,group,containerEl}
    const HAS_THREE = typeof THREE !== 'undefined';

    function makeTextSprite(text, color) {
        const canvas = document.createElement('canvas');
        canvas.width = 64; canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = '600 30px "JetBrains Mono", monospace';
        ctx.fillStyle = color || '#9fb3c8';
        ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillText(text, 32, 34);
        const tex = new THREE.CanvasTexture(canvas);
        const mat = new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true });
        const sprite = new THREE.Sprite(mat);
        sprite.scale.set(0.7, 0.7, 0.7);
        return sprite;
    }

    function initShelterViewport(name, containerEl) {
        if (!HAS_THREE || !containerEl) return;
        const width = containerEl.clientWidth || 400;
        const height = containerEl.clientHeight || 380;

        const scene = new THREE.Scene();
        scene.fog = new THREE.Fog(0x0b1522, 14, 34);

        const camera = new THREE.PerspectiveCamera(34, width / height, 0.1, 100);
        camera.position.set(6.4, 5.1, 7.8);

        const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        renderer.setSize(width, height);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        if (renderer.shadowMap) { renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap; }
        if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;
        if ('toneMapping' in renderer && THREE.ACESFilmicToneMapping) { renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.05; }
        containerEl.innerHTML = '';
        containerEl.appendChild(renderer.domElement);

        const hemi = new THREE.HemisphereLight(0x9fc4e8, 0x120c18, 0.65);
        scene.add(hemi);
        const sun = new THREE.DirectionalLight(0xffe1a8, 1.0);
        sun.position.set(5, 8, 3.5);
        if (sun.castShadow !== undefined) {
            sun.castShadow = true;
            sun.shadow.mapSize.set(1024, 1024);
            sun.shadow.camera.left = -10; sun.shadow.camera.right = 10;
            sun.shadow.camera.top = 10; sun.shadow.camera.bottom = -10;
            sun.shadow.bias = -0.0015;
        }
        scene.add(sun);
        const rim = new THREE.DirectionalLight(0x4d7fae, 0.35);
        rim.position.set(-6, 3.5, -5);
        scene.add(rim);

        // snow-covered ground (shadow catcher) + a faint reference grid above it
        const ground = new THREE.Mesh(
            new THREE.CircleGeometry(16, 48),
            new THREE.MeshStandardMaterial({ map: makeSnowTexture(10, 10), color: 0xffffff, roughness: 0.75, metalness: 0 })
        );
        ground.rotation.x = -Math.PI / 2;
        if (ground.receiveShadow !== undefined) ground.receiveShadow = true;
        scene.add(ground);
        const grid = new THREE.GridHelper(20, 20, 0x5a7a99, 0x3d5570);
        grid.position.y = 0.006;
        if (grid.material) { grid.material.transparent = true; grid.material.opacity = 0.22; }
        scene.add(grid);

        // distant Himalayan ridge backdrop (single large billboard behind the shelter —
        // camera orbit is angle-limited so a front backdrop reads correctly)
        const backdrop = new THREE.Mesh(
            new THREE.PlaneGeometry(60, 26),
            new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(makeMountainBackdropTexture()), fog: false })
        );
        backdrop.position.set(0, 8, -22);
        scene.add(backdrop);

        // gentle falling snow — persists across geometry rebuilds (added to scene, not group)
        const snowCount = 240;
        const snowPositions = new Float32Array(snowCount * 3);
        const snowVel = [];
        for (let i = 0; i < snowCount; i++) {
            snowPositions[i * 3] = (Math.random() - 0.5) * 18;
            snowPositions[i * 3 + 1] = Math.random() * 10;
            snowPositions[i * 3 + 2] = (Math.random() - 0.5) * 18;
            snowVel.push({ fall: 0.008 + Math.random() * 0.016, drift: (Math.random() - 0.5) * 0.006 });
        }
        const snowGeo = new THREE.BufferGeometry();
        snowGeo.setAttribute('position', new THREE.BufferAttribute(snowPositions, 3));
        if (!SNOW_DOT_TEXTURE) SNOW_DOT_TEXTURE = makeDotTexture('255,255,255');
        const snowMat = new THREE.PointsMaterial({ map: SNOW_DOT_TEXTURE, size: 0.09, transparent: true, opacity: 0.85, depthWrite: false, color: 0xffffff });
        const snow = new THREE.Points(snowGeo, snowMat);
        scene.add(snow);

        const controls = new THREE.OrbitControls(camera, renderer.domElement);
        controls.enableDamping = true;
        controls.dampingFactor = 0.08;
        controls.minDistance = 4;
        controls.maxDistance = 24;
        controls.maxPolarAngle = Math.PI * 0.49;
        controls.target.set(0, 1, 0);
        controls.autoRotate = true;
        controls.autoRotateSpeed = 0.6;
        controls.addEventListener('start', () => { controls.autoRotate = false; });
        controls.update();

        const group = new THREE.Group();
        scene.add(group);

        const vp = {
            scene, camera, renderer, controls, group, containerEl, sun, hemi, ground,
            particles: [], solarParticles: [], windowMesh: null, dims: { L: 4, W: 4, H: 2.5 },
            dayFactor: 0.7, lossNorm: 0,
            snow, snowGeo, snowVel,
        };
        shelterViewports[name] = vp;

        (function animate() {
            vp._raf = requestAnimationFrame(animate);
            updateSnowfall(vp);
            controls.update();
            updateShelterParticles(vp);
            renderer.render(scene, camera);
        })();

        return vp;
    }

    function updateSnowfall(vp) {
        if (!vp.snow || !vp.snowVel) return;
        const pos = vp.snowGeo.attributes.position.array;
        for (let i = 0; i < vp.snowVel.length; i++) {
            const idx = i * 3;
            pos[idx] += vp.snowVel[i].drift;
            pos[idx + 1] -= vp.snowVel[i].fall;
            if (pos[idx + 1] < 0) { pos[idx + 1] = 10; pos[idx] = (Math.random() - 0.5) * 18; pos[idx + 2] = (Math.random() - 0.5) * 18; }
        }
        vp.snowGeo.attributes.position.needsUpdate = true;
    }

    function resizeShelterViewport(name) {
        const vp = shelterViewports[name];
        if (!vp) return;
        const w = vp.containerEl.clientWidth || 400;
        const h = vp.containerEl.clientHeight || 380;
        vp.camera.aspect = w / h;
        vp.camera.updateProjectionMatrix();
        vp.renderer.setSize(w, h);
    }

    function makeSnowTexture(repeatX, repeatY) {
        if (!MATERIAL_CANVAS_CACHE.snow) {
            const size = 256;
            const c = document.createElement('canvas');
            c.width = size; c.height = size;
            const ctx = c.getContext('2d');
            const rand = seededRandom(4242);
            const g = ctx.createLinearGradient(0, 0, size, size);
            g.addColorStop(0, '#eef4fb'); g.addColorStop(1, '#d7e4f0');
            ctx.fillStyle = g; ctx.fillRect(0, 0, size, size);
            for (let i = 0; i < 1400; i++) {
                const v = rand();
                ctx.fillStyle = `rgba(${170 + v * 60},${190 + v * 50},${210 + v * 40},${0.12 + rand() * 0.22})`;
                ctx.beginPath(); ctx.arc(rand() * size, rand() * size, 1 + rand() * 2.4, 0, Math.PI * 2); ctx.fill();
            }
            for (let i = 0; i < 90; i++) {
                ctx.fillStyle = `rgba(255,255,255,${0.5 + rand() * 0.4})`;
                ctx.beginPath(); ctx.arc(rand() * size, rand() * size, 0.6 + rand() * 0.8, 0, Math.PI * 2); ctx.fill();
            }
            MATERIAL_CANVAS_CACHE.snow = c;
        }
        if (!MATERIAL_TEXTURE_CACHE.snow) {
            const tex = new THREE.CanvasTexture(MATERIAL_CANVAS_CACHE.snow);
            tex.wrapS = THREE.RepeatWrapping; tex.wrapT = THREE.RepeatWrapping;
            MATERIAL_TEXTURE_CACHE.snow = tex;
        }
        MATERIAL_TEXTURE_CACHE.snow.repeat.set(repeatX || 8, repeatY || 8);
        return MATERIAL_TEXTURE_CACHE.snow;
    }

    function makeMountainBackdropTexture() {
        if (MATERIAL_CANVAS_CACHE.mountains) return MATERIAL_CANVAS_CACHE.mountains;
        const w = 1024, h = 512;
        const c = document.createElement('canvas');
        c.width = w; c.height = h;
        const ctx = c.getContext('2d');
        const sky = ctx.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#0a1626'); sky.addColorStop(0.55, '#16283f'); sky.addColorStop(1, '#2c3f56');
        ctx.fillStyle = sky; ctx.fillRect(0, 0, w, h);
        const rand = seededRandom(777);
        function ridge(baseY, amp, color, alpha) {
            ctx.beginPath();
            ctx.moveTo(0, h);
            ctx.lineTo(0, baseY);
            let x = 0;
            while (x <= w) {
                x += 40 + rand() * 60;
                ctx.lineTo(x, baseY - rand() * amp);
            }
            ctx.lineTo(w, h);
            ctx.closePath();
            ctx.fillStyle = `rgba(${color},${alpha})`;
            ctx.fill();
        }
        ridge(h * 0.55, h * 0.16, '18,32,48', 0.9);
        ridge(h * 0.68, h * 0.22, '13,24,38', 0.95);
        ridge(h * 0.8, h * 0.26, '8,15,26', 1);
        // faint snow caps on the nearest ridge
        ctx.fillStyle = 'rgba(230,240,250,0.35)';
        for (let i = 0; i < 14; i++) {
            const x = rand() * w, y = h * 0.62 + rand() * 40;
            ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30, y - 22 - rand() * 20); ctx.lineTo(x + 60, y); ctx.closePath(); ctx.fill();
        }
        MATERIAL_CANVAS_CACHE.mountains = c;
        return c;
    }

    function makeDotTexture(colorRGB) {
        const rgb = colorRGB || '255,183,3';
        const c = document.createElement('canvas');
        c.width = 32; c.height = 32;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
        g.addColorStop(0, `rgba(${rgb},0.95)`);
        g.addColorStop(1, `rgba(${rgb},0)`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 32, 32);
        return new THREE.CanvasTexture(c);
    }
    let SNOW_DOT_TEXTURE = null;

    function rebuildShelterGroup(name) {
        const vp = shelterViewports[name];
        if (!vp) return;
        while (vp.group.children.length) {
            const child = vp.group.children.pop();
            vp.group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) child.material.dispose();
        }

        const L = Math.max(state.geometry.length, 1);
        const W = Math.max(state.geometry.width, 1);
        const H = Math.max(state.geometry.height, 1.5);
        const winArea = Math.max(state.geometry.windowArea, 0.1);
        const orientation = state.geometry.orientation;
        const mult = ORIENTATION_MULT[orientation] ?? 1.0;
        const layer1Color = new THREE.Color(colorForMaterial(state.layer1.material));
        const layer2Color = state.layer2.enabled ? new THREE.Color(colorForMaterial(state.layer2.material)) : null;
        vp.dims = { L, W, H };

        const repeatX = Math.max(2, Math.round((L + W) / 2));
        const repeatY = Math.max(1, Math.round(H / 1.2));

        // primary wall mass — real procedural texture (wood grain, rammed-earth banding,
        // stone speckle, etc.) instead of a flat color fill
        const wallTexture = getMaterialTexture(state.layer1.material, repeatX, repeatY);
        const wallMesh = new THREE.Mesh(
            new THREE.BoxGeometry(L, H, W),
            new THREE.MeshStandardMaterial({ map: wallTexture, color: 0xffffff, roughness: materialRoughness(state.layer1.material), metalness: 0.02 })
        );
        wallMesh.position.y = H / 2;
        if (wallMesh.castShadow !== undefined) { wallMesh.castShadow = true; wallMesh.receiveShadow = true; }
        vp.group.add(wallMesh);

        // insulation shell (translucent outer layer) if layer 2 is enabled — its own real texture
        if (layer2Color) {
            const shellTexture = getMaterialTexture(state.layer2.material, repeatX, repeatY);
            const shell = new THREE.Mesh(
                new THREE.BoxGeometry(L + 0.1, H + 0.05, W + 0.1),
                new THREE.MeshStandardMaterial({ map: shellTexture, color: 0xffffff, roughness: materialRoughness(state.layer2.material), transparent: true, opacity: 0.4, side: THREE.BackSide })
            );
            shell.position.y = H / 2;
            vp.group.add(shell);
        }

        // flat roof / parapet — Ladakhi vernacular flat-roof style, snow-capped in winter
        const roof = new THREE.Mesh(
            new THREE.BoxGeometry(L + 0.25, 0.14, W + 0.25),
            new THREE.MeshStandardMaterial({ map: makeSnowTexture(3, 3), color: 0xffffff, roughness: 0.8 })
        );
        roof.position.y = H + 0.07;
        if (roof.castShadow !== undefined) { roof.castShadow = true; roof.receiveShadow = true; }
        vp.group.add(roof);

        // window frame (thin dark border) + glazing — intensity/color set live by applyPhysicsToViewport
        const winSide = Math.min(Math.sqrt(winArea), L * 0.7, H * 0.7);
        const frame = new THREE.Mesh(
            new THREE.PlaneGeometry(winSide + 0.12, winSide + 0.12),
            new THREE.MeshStandardMaterial({ color: 0x141b24, roughness: 0.6 })
        );
        frame.position.set(0, H * 0.5, W / 2 + 0.005);
        vp.group.add(frame);
        const winMesh = new THREE.Mesh(
            new THREE.PlaneGeometry(winSide, winSide),
            new THREE.MeshStandardMaterial({
                map: getMaterialTexture('double glazed window glass', 1, 1),
                emissive: new THREE.Color(0xffb703), emissiveIntensity: 0.4 + mult * 1.4,
                roughness: 0.12, metalness: 0.15, side: THREE.DoubleSide,
            })
        );
        winMesh.position.set(0, H * 0.5, W / 2 + 0.02);
        vp.group.add(winMesh);
        vp.windowMesh = winMesh;

        // ground-plane compass ring + orientation arrow (decoupled from the fixed window face,
        // purely indicates which way the design is set to face)
        const compassGroup = new THREE.Group();
        const ringGeo = new THREE.RingGeometry(Math.max(L, W) * 0.58, Math.max(L, W) * 0.6, 48);
        const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color: 0x3d4f63, side: THREE.DoubleSide, transparent: true, opacity: 0.45 }));
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = 0.01;
        compassGroup.add(ring);
        const labelR = Math.max(L, W) * 0.68;
        const labelDefs = [['N', 0], ['E', -90], ['S', 180], ['W', 90]];
        labelDefs.forEach(([txt, deg]) => {
            const rad = THREE.MathUtils.degToRad(deg);
            const sprite = makeTextSprite(txt, txt === orientation[0] ? '#ffb703' : '#7f91a3');
            sprite.position.set(Math.sin(rad) * labelR, 0.06, Math.cos(rad) * labelR);
            compassGroup.add(sprite);
        });
        const arrowLen = Math.max(L, W) * 0.5;
        const arrow = new THREE.ArrowHelper(
            new THREE.Vector3(Math.sin(THREE.MathUtils.degToRad(ORIENTATION_ANGLE_DEG[orientation] ?? 0)), 0,
                               Math.cos(THREE.MathUtils.degToRad(ORIENTATION_ANGLE_DEG[orientation] ?? 0))),
            new THREE.Vector3(0, 0.04, 0), arrowLen, 0xffb703, arrowLen * 0.28, arrowLen * 0.16
        );
        compassGroup.add(arrow);
        vp.group.add(compassGroup);

        // heat-FLOW visualization: two independent sets of small 3D arrows, colored
        // and oriented by physical direction — deep red arrows drifting INWARD
        // through the window (real solar gain), deep blue arrows drifting OUTWARD
        // through the walls (real heat loss). Both driven live (per simulated hour)
        // by applyPhysicsToViewport. Arrows (not round particles) so the direction
        // of flow is unambiguous at a glance, matching the technical/scientific
        // look of the rest of the app.
        vp.particles = [];
        const faces = [
            { normal: new THREE.Vector3(0, 0, 1), span: [L, H], axis: ['x', 'y'], base: [0, H / 2, W / 2] },
            { normal: new THREE.Vector3(0, 0, -1), span: [L, H], axis: ['x', 'y'], base: [0, H / 2, -W / 2] },
            { normal: new THREE.Vector3(1, 0, 0), span: [W, H], axis: ['z', 'y'], base: [L / 2, H / 2, 0] },
            { normal: new THREE.Vector3(-1, 0, 0), span: [W, H], axis: ['z', 'y'], base: [-L / 2, H / 2, 0] },
        ];
        faces.forEach(face => {
            for (let k = 0; k < 7; k++) {
                const u = (Math.random() - 0.5) * face.span[0] * 0.8;
                const v = (Math.random() - 0.5) * face.span[1] * 0.7;
                const origin = new THREE.Vector3(face.base[0], face.base[1], face.base[2]);
                if (face.axis[0] === 'x') origin.x += u; else origin.z += u;
                origin.y += v;
                const arrow = makeFlowArrow(face.normal.clone(), origin, 0x1446be);
                vp.group.add(arrow);
                vp.particles.push({ mesh: arrow, origin, normal: face.normal.clone(), t: Math.random() });
            }
        });

        // solar-gain arrows: spawn just outside the window, drift inward through it
        vp.solarParticles = [];
        for (let k = 0; k < 10; k++) {
            const u = (Math.random() - 0.5) * winSide * 0.8;
            const v = (Math.random() - 0.5) * winSide * 0.8;
            const origin = new THREE.Vector3(u, H * 0.5 + v, W / 2 + 0.9);
            const normal = new THREE.Vector3(0, 0, -1);
            const arrow = makeFlowArrow(normal.clone(), origin, 0xd22314);
            vp.group.add(arrow);
            vp.solarParticles.push({ mesh: arrow, origin, normal, t: Math.random() });
        }

        resizeShelterViewport(name);
        applyPhysicsToViewport(name);
    }

    // Small 3D arrow (cylinder shaft + cone head) pointing along `dir`, used for the
    // heat-loss / solar-gain flow visualization instead of round particle sprites so
    // the direction of real physical flow is unambiguous from any camera angle.
    function makeFlowArrow(dir, origin, colorHex) {
        const group = new THREE.Group();
        const shaftLen = 0.16, headLen = 0.1, headWidth = 0.055, shaftWidth = 0.02;
        const shaftGeo = new THREE.CylinderGeometry(shaftWidth, shaftWidth, shaftLen, 6);
        const headGeo = new THREE.ConeGeometry(headWidth, headLen, 8);
        const mat = new THREE.MeshBasicMaterial({ color: colorHex, transparent: true, opacity: 0 });
        const shaft = new THREE.Mesh(shaftGeo, mat);
        shaft.position.y = shaftLen / 2;
        const head = new THREE.Mesh(headGeo, mat);
        head.position.y = shaftLen + headLen / 2;
        group.add(shaft, head);
        group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
        group.position.copy(origin);
        group._flowMat = mat;
        return group;
    }

    // Drives the 3D scene's day/night lighting, window glow, and heat-loss particles
    // from the REAL /api/simulate output at the currently scrubbed hour — no new
    // physics invented here, purely a visualization of state.lastResult.
    function applyPhysicsToViewport(name) {
        const vp = shelterViewports[name];
        if (!vp) return;

        let dayFactor = ORIENTATION_MULT[state.geometry.orientation] ?? 0.7; // fallback pre-simulation
        let lossNorm = 0.3;
        let solarKw = null, lossKw = null, interiorC = null, ambientC = null, timestamp = null;

        const r = state.lastResult;
        if (r && r.interior_temp && r.interior_temp.length) {
            const i = Math.min(state.timeIndex || 0, r.interior_temp.length - 1);
            const maxSolar = Math.max(...r.solar_flux_kw, 0.001);
            const maxLoss = Math.max(...r.loss_flux_kw.map(x => Math.abs(x)), 0.001);
            solarKw = r.solar_flux_kw[i];
            lossKw = r.loss_flux_kw[i];
            interiorC = r.interior_temp[i];
            ambientC = r.ambient_temp[i];
            timestamp = r.timestamps[i];
            dayFactor = Math.max(0, Math.min(1, solarKw / maxSolar));
            lossNorm = Math.max(0, Math.min(1, Math.abs(lossKw) / maxLoss));
        }
        vp.dayFactor = dayFactor;
        vp.lossNorm = lossNorm;

        // day/night lighting
        vp.sun.intensity = 0.12 + dayFactor * 1.15;
        vp.sun.color.setRGB(1.0, 0.78 + dayFactor * 0.1, 0.55 + dayFactor * 0.25);
        vp.hemi.intensity = 0.3 + dayFactor * 0.55;
        if (vp.scene.fog) {
            const night = new THREE.Color(0x0a121c), day = new THREE.Color(0x1c4066);
            vp.scene.fog.color.copy(night).lerp(day, dayFactor * 0.6);
        }
        if (vp.ground && vp.ground.material) {
            const nightG = new THREE.Color(0x0a1219), dayG = new THREE.Color(0x16222c);
            vp.ground.material.color.copy(nightG).lerp(dayG, dayFactor);
        }

        // window glow driven by real solar gain at this hour
        if (vp.windowMesh) {
            vp.windowMesh.material.emissiveIntensity = 0.15 + dayFactor * 2.0;
        }

        // physics readout (design tab only — element only exists there)
        if (name === 'design' && DOM.physTime) {
            if (timestamp) {
                DOM.physTime.innerText = timestamp;
                DOM.physSolar.innerText = `${solarKw.toFixed(2)} kW`;
                DOM.physLoss.innerText = `${Math.abs(lossKw).toFixed(2)} kW`;
                DOM.physInterior.innerText = `${interiorC.toFixed(1)}°C`;
                DOM.physAmbient.innerText = `${ambientC.toFixed(1)}°C`;
            } else {
                DOM.physTime.innerText = 'RUN A SIMULATION TO SCRUB TIME →';
                DOM.physSolar.innerText = '--';
                DOM.physLoss.innerText = '--';
                DOM.physInterior.innerText = '--';
                DOM.physAmbient.innerText = '--';
            }
        }
    }

    function updateShelterParticles(vp) {
        // heat loss — drifts outward through the walls (deep blue arrows, always at
        // least faintly visible whenever there's any loss at all, so night-time loss reads clearly)
        if (vp.particles && vp.particles.length) {
            const active = vp.lossNorm > 0.02;
            const speed = 0.003 + vp.lossNorm * 0.012;
            const maxDist = 0.6;
            vp.particles.forEach(p => {
                if (!active) { p.mesh._flowMat.opacity = 0; return; }
                p.t += speed;
                if (p.t > 1) p.t = 0;
                const dist = p.t * maxDist;
                p.mesh.position.set(
                    p.origin.x + p.normal.x * dist,
                    p.origin.y + p.normal.y * dist,
                    p.origin.z + p.normal.z * dist
                );
                p.mesh._flowMat.opacity = (1 - p.t) * (0.5 + vp.lossNorm * 0.5);
            });
        }
        // solar gain — drifts inward through the window (deep red arrows, strongest at
        // peak sun, fades to near-zero at night since real solar_flux_kw is ~0 then)
        if (vp.solarParticles && vp.solarParticles.length) {
            const active = vp.dayFactor > 0.03;
            const speed = 0.006 + vp.dayFactor * 0.02;
            const maxDist = 0.85;
            vp.solarParticles.forEach(p => {
                if (!active) { p.mesh._flowMat.opacity = 0; return; }
                p.t += speed;
                if (p.t > 1) p.t = 0;
                const dist = p.t * maxDist;
                p.mesh.position.set(
                    p.origin.x + p.normal.x * dist,
                    p.origin.y + p.normal.y * dist,
                    p.origin.z + p.normal.z * dist
                );
                p.mesh._flowMat.opacity = (1 - p.t * 0.6) * (0.45 + vp.dayFactor * 0.55);
            });
        }
    }

    function renderShelterScene() {
        if (!HAS_THREE) return;
        ['overview', 'design'].forEach(name => {
            if (shelterViewports[name]) {
                try {
                    rebuildShelterGroup(name);
                } catch (e) {
                    // Never let a 3D rendering failure block the real simulation results
                    // (charts, summary panel, physics slider) from updating.
                    console.error(`3D shelter rebuild failed for '${name}':`, e);
                }
            }
        });
        const orientation = state.geometry.orientation;
        const mult = ORIENTATION_MULT[orientation] ?? 1.0;
        if (DOM.shelterCompass) renderCompass(orientation);
        if (DOM.shelterLegend) {
            const layer1Color = colorForMaterial(state.layer1.material);
            const layer2Color = state.layer2.enabled ? colorForMaterial(state.layer2.material) : null;
            const legendItems = [
                `<div class="legend-item"><span class="legend-swatch" style="background:${layer1Color}"></span><span>L1 ${state.layer1.material} — ${state.layer1.thickness}mm</span></div>`,
            ];
            if (layer2Color) {
                legendItems.push(`<div class="legend-item"><span class="legend-swatch" style="background:${layer2Color}"></span><span>L2 ${state.layer2.material} — ${state.layer2.thickness}mm</span></div>`);
            }
            legendItems.push(`<div class="legend-item"><span class="legend-swatch" style="background:#ffb703"></span><span>SOLAR GAIN FACTOR: ${mult.toFixed(2)}× (${orientation})</span></div>`);
            DOM.shelterLegend.innerHTML = legendItems.join('');
        }
    }

    function renderCompass(orientation) {
        const angle = { South: 180, North: 0, East: 90, West: 270 }[orientation] ?? 180;
        DOM.shelterCompass.innerHTML = `
        <svg viewBox="0 0 46 46" width="46" height="46">
            <circle cx="23" cy="23" r="20" fill="none" stroke="currentColor" opacity=".35"/>
            <text x="23" y="9" text-anchor="middle" font-size="7" fill="currentColor" opacity=".7" class="mono">N</text>
            <text x="23" y="41" text-anchor="middle" font-size="7" fill="currentColor" opacity=".7" class="mono">S</text>
            <text x="4" y="26" text-anchor="middle" font-size="7" fill="currentColor" opacity=".7" class="mono">W</text>
            <text x="42" y="26" text-anchor="middle" font-size="7" fill="currentColor" opacity=".7" class="mono">E</text>
            <g transform="rotate(${angle} 23 23)">
                <path d="M23 8 L27 24 L23 20 L19 24 Z" fill="#ffb703"/>
            </g>
        </svg>`;
    }

    async function init() {
        applyTheme(state.theme);
        attachEventListeners();
        if (HAS_THREE) {
            try {
                initShelterViewport('overview', DOM.shelter3dOverview);
                initShelterViewport('design', DOM.shelter3dDesign);
                window.addEventListener('resize', () => {
                    resizeShelterViewport('overview');
                    resizeShelterViewport('design');
                });
            } catch (e) {
                // 3D visualization is a bonus feature — never let it take down materials/
                // environment loading or the actual thermal simulation with it.
                console.error('3D shelter viewport failed to initialize:', e);
            }
        }
        try {
            await Promise.all([loadMaterials(), loadEnvironment()]);
        } catch (e) {
            console.error(e);
            alert('Could not reach the backend API. Make sure server.py is running (python3 server.py) and you are viewing this page at http://localhost:5000 — not by opening index.html directly.');
            return;
        }
        populateDropdowns();
        renderShelterScene();
        initEnvironmentCharts();
        initSimulationCharts();
        initOverviewSignalChart();
        initComparisonChart();
        await runActiveSimulation();
    }

    // -----------------------------------------------------------------
    // DATA LOADING
    // -----------------------------------------------------------------
    async function loadMaterials() {
        const res = await fetch(`${API}/api/materials`);
        if (!res.ok) throw new Error('materials fetch failed');
        state.materials = await res.json();
        state.materialsByName = {};
        state.materials.forEach(m => state.materialsByName[m.name] = m);
        state.layer1.material = state.materials[0].name;
        state.layer2.material = state.materials.length > 3 ? state.materials[3].name : state.materials[1].name;
    }

    async function loadEnvironment() {
        const res = await fetch(`${API}/api/environment`);
        if (!res.ok) throw new Error('environment fetch failed');
        state.env = await res.json();
        DOM.envMinTemp.innerText = `${state.env.stats.min_temp}°C`;
        DOM.envMaxTemp.innerText = `${state.env.stats.max_temp}°C`;
        DOM.envPeakSolar.innerText = `${state.env.stats.peak_solar} W/m²`;
        DOM.envAvgTemp.innerText = `${state.env.stats.avg_temp}°C`;
        updateHomeDashboard(state.env);

        // Constrain the start-date picker to the real dataset range — never
        // let the user pick a date the backend has no real weather data for.
        if (state.env.date_range) {
            DOM.simStartDate.min = state.env.date_range.min;
            DOM.simStartDate.max = state.env.date_range.max;
            DOM.simStartDate.value = state.env.date_range.min;
            state.sim.startDate = state.env.date_range.min;
        }
    }

    function populateDropdowns() {
        const opts = state.materials.map(m => `<option value="${m.name}">${m.name}</option>`).join('');
        DOM.l1Mat.innerHTML = opts;
        DOM.l2Mat.innerHTML = opts;
        DOM.l1Mat.value = state.layer1.material;
        DOM.l2Mat.value = state.layer2.material;
        DOM.geoOri.value = state.geometry.orientation;
        updateMaterialSwatches();
    }

    function applyTheme(theme) { state.theme = theme; DOM.root.setAttribute('data-theme', theme); localStorage.setItem('thermal-theme', theme); restyleCharts(); }

    // -----------------------------------------------------------------
    // API CALLS
    // -----------------------------------------------------------------
    function currentLayers() {
        const layers = [{ material: state.layer1.material, thickness_mm: state.layer1.thickness }];
        if (state.layer2.enabled) layers.push({ material: state.layer2.material, thickness_mm: state.layer2.thickness });
        return layers;
    }

    async function callSimulate(layers, durationDays) {
        const res = await fetch(`${API}/api/simulate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                geometry: {
                    length: state.geometry.length, width: state.geometry.width, height: state.geometry.height,
                    window_area: state.geometry.windowArea, orientation: state.geometry.orientation,
                },
                layers, duration_days: durationDays, start_date: state.sim.startDate,
            }),
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: 'Unknown error' }));
            throw new Error(err.error || 'Simulation failed');
        }
        return res.json();
    }

    function updatePhysSliderFill() {
        if (!DOM.physSlider) return;
        const min = parseFloat(DOM.physSlider.min) || 0, max = parseFloat(DOM.physSlider.max) || 1;
        const pct = max > min ? ((DOM.physSlider.value - min) / (max - min)) * 100 : 0;
        DOM.physSlider.style.setProperty('--fill', `${pct}%`);
    }

    function syncPhysicsSlider() {
        const r = state.lastResult;
        if (!r || !r.interior_temp || !r.interior_temp.length || !DOM.physSlider) return;
        const n = r.interior_temp.length;
        DOM.physSlider.min = 0;
        DOM.physSlider.max = n - 1;
        DOM.physSlider.disabled = false;
        // default to the hour of peak solar gain so it opens on a visually interesting state
        let peakIdx = 0, peakVal = -Infinity;
        r.solar_flux_kw.forEach((v, i) => { if (v > peakVal) { peakVal = v; peakIdx = i; } });
        state.timeIndex = Math.min(peakIdx, n - 1);
        DOM.physSlider.value = state.timeIndex;
        updatePhysSliderFill();
        updateHomeHeatFlow(r);
        applyPhysicsToViewport('design');
        applyPhysicsToViewport('overview');
    }

    function stopTimePlayback() {
        if (state.timePlayInterval) { clearInterval(state.timePlayInterval); state.timePlayInterval = null; }
        if (DOM.physPlayBtn) { DOM.physPlayBtn.classList.remove('playing'); DOM.physPlayBtn.innerText = '▶'; }
    }

    async function runActiveSimulation() {
        readGeometryFromInputs();
        const result = await callSimulate(currentLayers(), state.sim.duration);
        state.lastResult = result;
        updateOverviewAndDesign(result);
        updateSimulationCharts(result);
        updateOverviewSignalChart(result);
        renderShelterScene();
        syncPhysicsSlider();
    }

    function readGeometryFromInputs() {
        state.geometry.length = parseFloat(DOM.geoL.value) || 4;
        state.geometry.width = parseFloat(DOM.geoW.value) || 4;
        state.geometry.height = parseFloat(DOM.geoH.value) || 2.5;
        state.geometry.windowArea = parseFloat(DOM.geoWin.value) || 2;
        state.geometry.orientation = DOM.geoOri.value;
        state.layer1.material = DOM.l1Mat.value;
        state.layer1.thickness = parseFloat(DOM.l1Thick.value);
        state.layer2.material = DOM.l2Mat.value;
        state.layer2.thickness = parseFloat(DOM.l2Thick.value);
        state.sim.duration = parseInt(DOM.simDuration.value) || 3;
        state.sim.startDate = DOM.simStartDate.value || state.sim.startDate;
    }

    function updateMaterialSwatches() {
        if (DOM.l1Swatch) DOM.l1Swatch.src = getMaterialCanvas(state.layer1.material).toDataURL();
        if (DOM.l2Swatch) DOM.l2Swatch.src = state.layer2.enabled ? getMaterialCanvas(state.layer2.material).toDataURL() : '';
    }

    function syncGeometryAndRedraw() {
        readGeometryFromInputs();
        renderShelterScene();
        updateMaterialSwatches();
    }

    // -----------------------------------------------------------------
    // UI UPDATE FROM REAL RESULTS
    // -----------------------------------------------------------------
    function updateOverviewAndDesign(result) {
        const s = result.summary;
        DOM.l1ThickVal.innerText = state.layer1.thickness;
        DOM.l2ThickVal.innerText = state.layer2.thickness;

        const m1 = state.materialsByName[state.layer1.material];
        if (m1) DOM.l1PropsInfo.innerHTML = `<span>k: ${m1.k} W/mK</span> <span>ρ: ${m1.rho} kg/m³</span> <span>Cp: ${m1.cp} J/kgK</span>`;
        if (state.layer2.enabled) {
            const m2 = state.materialsByName[state.layer2.material];
            DOM.l2PropsInfo.innerHTML = `<span>k: ${m2.k} W/mK</span> <span>ρ: ${m2.rho} kg/m³</span> <span>Cp: ${m2.cp} J/kgK</span>`;
            DOM.l2PropsInfo.style.opacity = '1';
        } else {
            DOM.l2PropsInfo.innerHTML = `<span>LAYER DISABLED / NO INSULATION</span>`;
            DOM.l2PropsInfo.style.opacity = '0.5';
        }

        DOM.visNameL1.innerText = state.layer1.material.toUpperCase();
        DOM.visThickL1.innerText = `${state.layer1.thickness} mm`;
        DOM.visBlockL1.style.flex = `${Math.max(state.layer1.thickness, 40)}`;
        if (state.layer2.enabled) {
            DOM.visBlockL2.style.display = 'flex';
            DOM.visNameL2.innerText = state.layer2.material.toUpperCase();
            DOM.visThickL2.innerText = `${state.layer2.thickness} mm`;
            DOM.visBlockL2.style.flex = `${Math.max(state.layer2.thickness, 20)}`;
        } else {
            DOM.visBlockL2.style.display = 'none';
        }

        DOM.propThick.innerText = `${s.total_thickness_mm} mm`;
        DOM.propR.innerText = `${s.R_value} m²K/W`;
        DOM.propU.innerText = `${s.U_value} W/m²K`;
        DOM.propMC.innerText = `${s.thermal_mass_MJ} MJ/K`;
        DOM.visExtTemp.innerText = `${s.avg_ambient_temp}°C`;
        DOM.visIntTemp.innerText = `${s.avg_interior_temp > 0 ? '+' : ''}${s.avg_interior_temp}°C`;

        DOM.ovInterior.innerText = `${s.avg_interior_temp}°C`;
        DOM.ovAmbient.innerText = `${s.avg_ambient_temp}°C`;
        DOM.ovDelta.innerText = `${(s.avg_interior_temp - s.avg_ambient_temp) >= 0 ? '+' : ''}${(s.avg_interior_temp - s.avg_ambient_temp).toFixed(1)}°C`;
        DOM.ovSolar.innerText = `${s.solar_captured_kwh} kWh`;
        DOM.ovLoss.innerText = `${s.heat_lost_kwh} kWh`;
        DOM.ovArea.innerText = `${s.footprint_m2} m²`;
        DOM.ovVol.innerText = `${s.volume_m3} m³`;
        DOM.ovGlazing.innerText = `${(s.glazing_ratio * 100).toFixed(1)}%`;
        DOM.ovOrientation.innerText = state.geometry.orientation.toUpperCase();
        DOM.ovDimLen.innerText = `L: ${state.geometry.length}m`;
        DOM.ovDimWid.innerText = `W: ${state.geometry.width}m`;
        DOM.ovDimHgt.innerText = `H: ${state.geometry.height}m`;

        const layerNames = [state.layer1.material] + (state.layer2.enabled ? ` + ${state.layer2.material}` : '');
        DOM.ovLayerPreview.innerHTML = `<div class="spec-row"><span>${state.layer1.material}</span><span class="mono">${state.layer1.thickness}mm</span></div>` +
            (state.layer2.enabled ? `<div class="spec-row"><span>${state.layer2.material}</span><span class="mono">${state.layer2.thickness}mm</span></div>` : '');
        updateHomeHeatFlow(result);
    }

    function updateHomeHeatFlow(result) {
        if (!result || !result.interior_temp || !result.interior_temp.length) return;
        const i = Math.min(state.timeIndex || 0, result.interior_temp.length - 1);
        const solar = result.solar_flux_kw?.[i] ?? 0;
        const loss = Math.abs(result.loss_flux_kw?.[i] ?? 0);
        const interior = result.interior_temp?.[i] ?? 0;
        const ambient = result.ambient_temp?.[i] ?? 0;
        const net = solar - loss;
        const solarEl = document.getElementById('home2-flow-solar');
        const lossEl = document.getElementById('home2-flow-wall');
        const deltaEl = document.getElementById('home2-flow-window');
        const netEl = document.getElementById('home2-flow-net');
        if (solarEl) solarEl.innerText = `${solar.toFixed(1)} kW`;
        if (lossEl) lossEl.innerText = `${loss.toFixed(1)} kW`;
        if (deltaEl) deltaEl.innerText = `${(interior - ambient) >= 0 ? '+' : ''}${(interior - ambient).toFixed(1)}°C`;
        if (netEl) netEl.innerText = `${net >= 0 ? '+' : ''}${net.toFixed(1)} kW`;
    }

    // -----------------------------------------------------------------
    // CHARTS
    // -----------------------------------------------------------------
    function getChartColors() {
        const dark = state.theme === 'dark';
        return {
            text: dark ? '#9fb3c8' : '#3a4552', grid: dark ? 'rgba(159,179,200,0.12)' : 'rgba(58,69,82,0.12)',
            red: '#e63946', blue: '#457b9d', yellow: '#ffb703',
        };
    }
    function getCommonChartOptions(c, unitStr) {
        return {
            responsive: true, maintainAspectRatio: false,
            plugins: { legend: { labels: { color: c.text, font: { family: 'JetBrains Mono', size: 10 } } } },
            scales: {
                x: { grid: { color: c.grid }, ticks: { color: c.text, font: { family: 'JetBrains Mono', size: 9 }, maxTicksLimit: 12 } },
                y: { grid: { color: c.grid }, ticks: { color: c.text, font: { family: 'JetBrains Mono', size: 9 } } },
            },
        };
    }
    function restyleCharts() {
        const c = getChartColors();
        Object.values(charts).forEach(chart => {
            if (!chart) return;
            if (chart.options.scales && chart.options.scales.x) {
                chart.options.scales.x.grid.color = c.grid; chart.options.scales.x.ticks.color = c.text;
                chart.options.scales.y.grid.color = c.grid; chart.options.scales.y.ticks.color = c.text;
            }
            if (chart.options.plugins && chart.options.plugins.legend && chart.options.plugins.legend.labels) {
                chart.options.plugins.legend.labels.color = c.text;
            }
            chart.update();
        });
    }

    function initEnvironmentCharts() {
        const c = getChartColors();
        const labels = state.env.timestamps.map(t => t.slice(5, 16));
        charts.envTemp = new Chart(document.getElementById('chart-env-temp').getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ label: 'Ambient Temperature (°C) — real NASA POWER data', data: state.env.ambient_temp, borderColor: c.blue, backgroundColor: 'rgba(69,123,157,0.15)', fill: true, tension: 0.3, borderWidth: 1.5, pointRadius: 0 }] },
            options: getCommonChartOptions(c, '°C'),
        });
        charts.envSolar = new Chart(document.getElementById('chart-env-solar').getContext('2d'), {
            type: 'line',
            data: { labels, datasets: [{ label: 'Solar Irradiance (W/m²) — real NASA POWER data', data: state.env.solar_irradiance, borderColor: c.yellow, backgroundColor: 'rgba(255,183,3,0.15)', fill: true, tension: 0.2, borderWidth: 1.5, pointRadius: 0 }] },
            options: getCommonChartOptions(c, 'W/m²'),
        });
    }

    function initSimulationCharts() {
        const c = getChartColors();
        charts.simTemp = new Chart(document.getElementById('chart-sim-temp').getContext('2d'), { type: 'line', data: { labels: [], datasets: [] }, options: getCommonChartOptions(c, '°C') });
        charts.simFlux = new Chart(document.getElementById('chart-sim-flux').getContext('2d'), { type: 'line', data: { labels: [], datasets: [] }, options: getCommonChartOptions(c, 'kW') });
    }

    function updateSimulationCharts(result) {
        const c = getChartColors();
        const labels = result.timestamps.map(t => t.slice(5, 16));
        charts.simTemp.data = {
            labels, datasets: [
                { label: 'Predicted Interior (°C) — real simulation', data: result.interior_temp, borderColor: c.red, backgroundColor: 'rgba(230,57,70,0.1)', fill: true, borderWidth: 2, pointRadius: 0 },
                { label: 'Outdoor Ambient (°C) — real data', data: result.ambient_temp, borderColor: c.blue, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
            ],
        };
        charts.simTemp.update();
        charts.simFlux.data = {
            labels, datasets: [
                { label: 'Solar Heat Gain (+kW)', data: result.solar_flux_kw, borderColor: c.yellow, backgroundColor: 'rgba(255,183,3,0.2)', fill: true, borderWidth: 1.5, pointRadius: 0 },
                { label: 'Envelope Loss (-kW)', data: result.loss_flux_kw, borderColor: c.blue, backgroundColor: 'rgba(69,123,157,0.2)', fill: true, borderWidth: 1.5, pointRadius: 0 },
            ],
        };
        charts.simFlux.update();
    }

    function initOverviewSignalChart() {
        const c = getChartColors();
        charts.overviewSignal = new Chart(document.getElementById('chart-overview-signal').getContext('2d'), {
            type: 'line',
            data: { labels: [], datasets: [] },
            options: {
                ...getCommonChartOptions(c, '°C'),
                plugins: { legend: { display: false } },
                elements: { line: { tension: 0.35 } },
            },
        });
    }

    function updateOverviewSignalChart(result) {
        if (!charts.overviewSignal) return;
        const c = getChartColors();
        const labels = result.timestamps.map(t => t.slice(5, 16));
        charts.overviewSignal.data = {
            labels, datasets: [
                { label: 'Interior', data: result.interior_temp, borderColor: c.red, backgroundColor: 'rgba(230,57,70,0.12)', fill: true, borderWidth: 2, pointRadius: 0 },
                { label: 'Ambient', data: result.ambient_temp, borderColor: c.blue, borderDash: [4, 4], borderWidth: 1.5, pointRadius: 0 },
            ],
        };
        charts.overviewSignal.update();

        const peakSolar = Math.max(...result.solar_flux_kw);
        DOM.ovPeakSolar && (DOM.ovPeakSolar.innerText = `${peakSolar.toFixed(2)} kW`);
        if (DOM.ovNightAdv) {
            const s = result.summary;
            const nightAdv = s.avg_night_interior_temp - s.avg_ambient_temp;
            DOM.ovNightAdv.innerText = `${nightAdv >= 0 ? '+' : ''}${nightAdv.toFixed(1)}°C`;
        }
    }

    function initComparisonChart() {
        const c = getChartColors();
        charts.compBar = new Chart(document.getElementById('chart-comp-bars').getContext('2d'), { type: 'bar', data: { labels: [], datasets: [] }, options: getCommonChartOptions(c, '') });
    }

    // -----------------------------------------------------------------
    // COMPARISON WORKFLOW (save configs -> run real /api/compare)
    // -----------------------------------------------------------------
    function renderSavedConfigsList() {
        if (state.savedConfigs.length === 0) {
            DOM.compSavedList.innerHTML = `<div class="dim mono" style="padding:.5rem 0">No configurations saved yet — go to Design, build a wall, then click "SAVE TO COMPARISON".</div>`;
            DOM.btnRunComparison.disabled = true;
            return;
        }
        DOM.compSavedList.innerHTML = state.savedConfigs.map((cfg, i) => {
            const layersStr = cfg.layers.map(l => `${l.material} (${l.thickness_mm}mm)`).join(' + ');
            return `<div class="spec-row"><span>${cfg.name} — <span class="dim">${layersStr}</span></span><button class="icon-btn remove-config-btn" data-index="${i}" title="Remove">✕</button></div>`;
        }).join('');
        DOM.btnRunComparison.disabled = state.savedConfigs.length < 1;
        document.querySelectorAll('.remove-config-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                state.savedConfigs.splice(parseInt(btn.dataset.index), 1);
                renderSavedConfigsList();
            });
        });
    }

    function saveCurrentToComparison() {
        readGeometryFromInputs();
        const layers = currentLayers();
        const name = layers.length > 1
            ? `${state.layer1.material.split('/')[0].trim()} + ${state.layer2.material.split('(')[0].trim()}`
            : state.layer1.material;
        state.savedConfigs.push({ name: `${name} #${state.savedConfigs.length + 1}`, layers });
        renderSavedConfigsList();
    }

    async function runComparison() {
        if (state.savedConfigs.length === 0) return;
        readGeometryFromInputs();
        DOM.btnRunComparison.innerText = 'RUNNING...';
        DOM.btnRunComparison.disabled = true;
        try {
            const res = await fetch(`${API}/api/compare`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    geometry: {
                        length: state.geometry.length, width: state.geometry.width, height: state.geometry.height,
                        window_area: state.geometry.windowArea, orientation: state.geometry.orientation,
                    },
                    duration_days: state.sim.duration,
                    start_date: state.sim.startDate,
                    configs: state.savedConfigs,
                }),
            });
            if (!res.ok) throw new Error((await res.json()).error || 'Comparison failed');
            const data = await res.json();
            renderComparisonResults(data);
        } catch (e) {
            alert('Comparison failed: ' + e.message);
        } finally {
            DOM.btnRunComparison.innerText = 'RUN COMPARISON ▶';
            DOM.btnRunComparison.disabled = false;
        }
    }

    function renderComparisonResults(data) {
        const c = getChartColors();
        DOM.compTableBody.innerHTML = data.rows.map(r => {
            const isBest = r.name === data.best_config;
            return `<tr class="${isBest ? 'row-best' : ''}"><td>${r.name}</td><td>${r.layer1}</td><td>${r.layer2}</td><td class="${r.u_value < 0.5 ? 'accent-red' : ''}">${r.u_value.toFixed(2)}</td><td class="accent-blue">${r.thermal_mass_MJ.toFixed(1)} MJ/K</td><td>${r.min_temp.toFixed(1)}°C</td><td class="accent-red">${r.avg_temp.toFixed(1)}°C</td><td>${isBest ? '<span class="badge-tag">BEST</span>' : '<span class="dim">—</span>'}</td></tr>`;
        }).join('');

        charts.compBar.data = {
            labels: data.rows.map(r => r.name),
            datasets: [
                { label: 'U-Value (W/m²K) [Lower is Better]', data: data.rows.map(r => r.u_value), backgroundColor: c.red },
                { label: 'Thermal Mass (MJ/K ÷10)', data: data.rows.map(r => r.thermal_mass_MJ / 10), backgroundColor: c.blue },
            ],
        };
        charts.compBar.update();

        const best = data.rows.find(r => r.name === data.best_config);
        const isLowestU = data.rows.every(r => best.u_value <= r.u_value);
        const isHighestMass = data.rows.every(r => best.thermal_mass_MJ >= r.thermal_mass_MJ);
        const lowestURow = data.rows.reduce((a, r) => (r.u_value < a.u_value ? r : a), data.rows[0]);

        DOM.compEvalTitle.innerText = `EVALUATION: ${best.name} ACHIEVES THE HIGHEST AVERAGE INTERIOR TEMPERATURE`;

        let body;
        if (isLowestU && isHighestMass) {
            body = `${best.name} wins on both the lowest effective U-value and the highest thermal mass among saved configurations, so it minimizes heat loss to the sub-zero Ladakh night while also damping the daily swing. This is computed from real wall thermal resistance and real hourly weather data, not an approximation.`;
        } else if (isLowestU) {
            body = `${best.name} has the lowest effective U-value among saved configurations, meaning it loses heat to the sub-zero Ladakh night the slowest, and that's the main driver of its higher average interior temperature.`;
        } else if (isHighestMass) {
            body = `${best.name} does not have the lowest U-value here — ${lowestURow.name} does, at U=${lowestURow.u_value.toFixed(2)} W/m²K vs ${best.u_value.toFixed(2)} W/m²K for ${best.name}. ${best.name} instead wins on average interior temperature mainly through higher thermal mass, which damps the daily swing and raises the night-time floor even with a less insulating wall. Over a longer simulation window this ranking could change.`;
        } else {
            body = `${best.name} does not have the lowest U-value or the highest thermal mass here (${lowestURow.name} has the lowest U-value, at U=${lowestURow.u_value.toFixed(2)} W/m²K). It still produced the highest average interior temperature over this simulation window — likely a combination of solar gain, wall dynamics, and thermal mass rather than any single property. Worth re-checking across a longer duration before treating this as conclusive.`;
        }
        DOM.compEvalBody.innerText = body;

        DOM.takeaway1.innerText = `Best config keeps interior ${best.night_advantage_c.toFixed(1)}°C above ambient at night on average.`;
        DOM.takeaway2.innerText = `Comparison computed via real RK4 simulation on real weather data across all saved wall configurations.`;
    }

    // -----------------------------------------------------------------
    // EVENT LISTENERS
    // -----------------------------------------------------------------
    function switchToTab(target) {
        DOM.navBtns.forEach(b => b.classList.toggle('active', b.dataset.target === target));
        DOM.sections.forEach(s => s.classList.toggle('active', s.id === target));
        if (HAS_THREE && target === 'design') {
            requestAnimationFrame(() => resizeShelterViewport('design'));
        }
    }

    // -----------------------------------------------------------------
    // HOME PAGE — real-data ticker + ambient star field
    // -----------------------------------------------------------------
    function updateHomeDashboard(env) {
        if (!env) return;
        const statLow = document.getElementById('home2-stat-low');
        const statRecords = document.getElementById('home2-stat-records');
        if (statLow && env.stats) statLow.innerText = `${env.stats.min_temp}°C`;
        if (statRecords && env.timestamps) statRecords.innerText = env.timestamps.length.toLocaleString();

        const envSolar = document.getElementById('home2-env-solar');
        const envTemp = document.getElementById('home2-env-temp');
        const envWind = document.getElementById('home2-env-wind');
        if (env.latest) {
            if (envSolar) envSolar.innerText = `${env.latest.solar_irradiance} W/m²`;
            if (envTemp) envTemp.innerText = `${env.latest.ambient_temp}°C`;
            if (envWind) envWind.innerText = `${env.latest.wind_speed} m/s`;
            const sub = document.getElementById('home2-sidebar-loc');
            if (sub) sub.innerText = `Leh (34.15°N, 77.58°E) · ${env.latest.timestamp}`;
        }
    }

    function attachEventListeners() {
        DOM.themeBtn.addEventListener('click', () => applyTheme(state.theme === 'dark' ? 'light' : 'dark'));

        DOM.navBtns.forEach(btn => btn.addEventListener('click', () => switchToTab(btn.dataset.target)));

        document.querySelectorAll('#home [data-target]').forEach(el => {
            el.addEventListener('click', () => switchToTab(el.dataset.target));
        });

        function updateRangeFill(rangeEl) {
            const pct = ((rangeEl.value - rangeEl.min) / (rangeEl.max - rangeEl.min)) * 100;
            rangeEl.style.setProperty('--fill', `${pct}%`);
        }
        DOM.l1Thick.addEventListener('input', () => { DOM.l1ThickVal.innerText = DOM.l1Thick.value; updateRangeFill(DOM.l1Thick); syncGeometryAndRedraw(); });
        DOM.l2Thick.addEventListener('input', () => { DOM.l2ThickVal.innerText = DOM.l2Thick.value; updateRangeFill(DOM.l2Thick); syncGeometryAndRedraw(); });
        updateRangeFill(DOM.l1Thick); updateRangeFill(DOM.l2Thick);

        // Live parametric shelter redraw — fires on every geometry/material/orientation
        // change, independent of the backend simulation call. The diagram is pure
        // client-side geometry rendering; the actual physics still only comes from
        // /api/simulate when "APPLY CONFIGURATION" or "RUN SIMULATION" is pressed.
        [DOM.geoL, DOM.geoW, DOM.geoH, DOM.geoWin].forEach(el => el.addEventListener('input', syncGeometryAndRedraw));
        [DOM.geoOri, DOM.l1Mat, DOM.l2Mat].forEach(el => el.addEventListener('change', syncGeometryAndRedraw));

        DOM.btnApplyConfig.addEventListener('click', async () => {
            DOM.btnApplyConfig.innerText = 'COMPUTING...';
            DOM.btnApplyConfig.disabled = true;
            try { await runActiveSimulation(); }
            catch (e) { alert('Simulation failed: ' + e.message); }
            finally { DOM.btnApplyConfig.innerText = 'APPLY CONFIGURATION →'; DOM.btnApplyConfig.disabled = false; }
        });

        DOM.btnSaveComparison.addEventListener('click', saveCurrentToComparison);
        DOM.btnRunComparison.addEventListener('click', runComparison);

        DOM.btnRunSim.addEventListener('click', async () => {
            if (state.sim.isRunning) return;
            state.sim.isRunning = true;
            DOM.btnRunSim.innerText = 'SOLVING RK4...';
            DOM.simProgressFill.style.width = '10%';
            try {
                readGeometryFromInputs();
                const result = await callSimulate(currentLayers(), state.sim.duration);
                state.lastResult = result;
                DOM.simProgressFill.style.width = '100%';
                updateOverviewAndDesign(result);
                updateSimulationCharts(result);
                updateOverviewSignalChart(result);
                renderShelterScene();
                syncPhysicsSlider();
            } catch (e) {
                alert('Simulation failed: ' + e.message);
            } finally {
                setTimeout(() => { DOM.simProgressFill.style.width = '0%'; }, 500);
                state.sim.isRunning = false;
                DOM.btnRunSim.innerText = 'RUN SIMULATION ▶';
            }
        });

        DOM.simStartDate.addEventListener('change', () => { state.sim.startDate = DOM.simStartDate.value; });

        if (DOM.physSlider) {
            DOM.physSlider.addEventListener('input', () => {
                stopTimePlayback();
                state.timeIndex = parseInt(DOM.physSlider.value, 10) || 0;
                updatePhysSliderFill();
                updateHomeHeatFlow(state.lastResult);
                applyPhysicsToViewport('design');
                applyPhysicsToViewport('overview');
            });
        }
        if (DOM.physPlayBtn) {
            DOM.physPlayBtn.addEventListener('click', () => {
                if (state.timePlayInterval) { stopTimePlayback(); return; }
                if (!state.lastResult || !state.lastResult.interior_temp || !state.lastResult.interior_temp.length) return;
                DOM.physPlayBtn.classList.add('playing');
                DOM.physPlayBtn.innerText = '⏸';
                state.timePlayInterval = setInterval(() => {
                    const n = state.lastResult.interior_temp.length;
                    state.timeIndex = (state.timeIndex + 1) % n;
                    DOM.physSlider.value = state.timeIndex;
                    updatePhysSliderFill();
                    updateHomeHeatFlow(state.lastResult);
                    applyPhysicsToViewport('design');
                    applyPhysicsToViewport('overview');
                }, 220);
            });
        }

        DOM.btnResetSim.addEventListener('click', async () => {
            DOM.simDuration.value = 3;
            state.sim.duration = 3;
            if (state.env && state.env.date_range) {
                DOM.simStartDate.value = state.env.date_range.min;
                state.sim.startDate = state.env.date_range.min;
            }
            await runActiveSimulation();
        });
    }

    init();
});
