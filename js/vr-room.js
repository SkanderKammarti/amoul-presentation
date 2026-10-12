/* ==========================================================================
   vr-room.js — Salle d'urgence 3D interactive + WebXR (Three.js r128)
   Modèles procéduraux Amoul : Ventilateur (T6/VK600), Défibrillateur i5,
   Dispositif RCP (E6/E8), scope, lit. Navigation souris + casque VR.
   ========================================================================== */
(function () {
  'use strict';

  const DEVICES = {
    vent: {
      title: 'Ventilateur de transport & soins intensifs',
      model: 'Amoul T6 · VK600',
      specs: ['Turbine sans air comprimé', 'Volume courant 2 mL → néonatal', 'Modes invasifs / non invasifs', 'Écran tactile + courbes Paw/Débit/Volume'],
      color: 0x00C8EE
    },
    defib: {
      title: 'Défibrillateur semi-automatique',
      model: 'Amoul i5 (DAE)',
      specs: ['Écran HD 7" · GPS + gestion à distance', 'Onde biphasique auto-impédance', '1 000 événements / 24 h', "Jusqu'à 200 chocs"],
      color: 0xFF5A5F
    },
    cpr: {
      title: 'Réanimation cardio-pulmonaire automatique',
      model: 'Amoul E6 · E8',
      specs: ['Compressions 3D précises', 'Profondeur 50–70 mm · 100–120/min', 'Synchronisation avec respirateurs Amoul', 'EN 1789 · RTCA/DO-160G'],
      color: 0x5EE9C4
    },
    monitor: {
      title: 'Moniteur multiparamétrique',
      model: 'Amoul i6',
      specs: ['ECG · SpO₂ · NIBP · EtCO₂', 'Défibrillation + monitorage 4-en-1', 'Écran couleur haute résolution'],
      color: 0x7BF0D2
    }
  };

  function create(slide) {
    const host = slide.querySelector('.vrstage');
    const canvas = slide.querySelector('.vrstage canvas');
    const loadEl = slide.querySelector('.vrload');
    const infoEl = slide.querySelector('#vrInfo');
    const infoBody = slide.querySelector('#vrInfoBody');
    const infoClose = slide.querySelector('#vrInfoClose');
    const enterBtn = slide.querySelector('#vrEnter');

    if (!window.THREE) { if (loadEl) loadEl.textContent = 'Three.js indisponible'; return { start: function () {}, stop: function () {} }; }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false });
    } catch (e) { if (loadEl) loadEl.textContent = 'WebGL indisponible sur ce poste'; return { start: function () {}, stop: function () {} }; }

    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x050f19, 1);
    renderer.outputEncoding = THREE.sRGBEncoding;
    renderer.xr.enabled = true;

    const scene = new THREE.Scene();
    scene.fog = new THREE.Fog(0x050f19, 8, 20);
    const camera = new THREE.PerspectiveCamera(52, 1, 0.05, 100);
    const target = new THREE.Vector3(0, 1.05, -0.2);
    let theta = 0.85, phi = 1.18, radius = 5.2;

    // lights
    scene.add(new THREE.HemisphereLight(0x88c8ff, 0x0a1a26, 0.7));
    const key = new THREE.PointLight(0x9fe8ff, 0.9, 24); key.position.set(2.4, 3, 2.6); scene.add(key);
    const warm = new THREE.PointLight(0x00c8ee, 0.7, 20); warm.position.set(-3, 2.6, -2); scene.add(warm);
    const amb = new THREE.AmbientLight(0x203748, 0.9); scene.add(amb);

    // ---- room shell ----
    const room = new THREE.Group(); scene.add(room);
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(10, 8),
      new THREE.MeshStandardMaterial({ color: 0x0b1a27, metalness: 0.1, roughness: 0.85 }));
    floor.rotation.x = -Math.PI / 2; room.add(floor);
    const grid = new THREE.GridHelper(10, 40, 0x0e4a63, 0x0c2c3d); grid.position.y = 0.01; room.add(grid);
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x0d2233, metalness: 0.05, roughness: 0.95 });
    const wallB = new THREE.Mesh(new THREE.PlaneGeometry(10, 3.4), wallMat); wallB.position.set(0, 1.7, -4); room.add(wallB);
    const wallL = new THREE.Mesh(new THREE.PlaneGeometry(8, 3.4), wallMat); wallL.rotation.y = Math.PI / 2; wallL.position.set(-5, 1.7, 0); room.add(wallL);
    // neon strip
    const strip = new THREE.Mesh(new THREE.BoxGeometry(9.4, 0.05, 0.06),
      new THREE.MeshBasicMaterial({ color: 0x00c8ee }));
    strip.position.set(0, 3.05, -3.94); room.add(strip);

    // ---- helpers ----
    const emissive = function (color, intensity) {
      return new THREE.MeshStandardMaterial({ color: 0x08151f, emissive: color, emissiveIntensity: intensity == null ? 0.9 : intensity, metalness: 0.3, roughness: 0.4 });
    };
    const shell = new THREE.MeshStandardMaterial({ color: 0xe9eef3, metalness: 0.25, roughness: 0.55 });

    function makeLabel(text, color) {
      const c = document.createElement('canvas'); c.width = 512; c.height = 128;
      const x = c.getContext('2d');
      x.fillStyle = 'rgba(4,16,27,.86)';
      x.beginPath(); x.moveTo(14, 6); x.lineTo(498, 6); x.quadraticCurveTo(506, 6, 506, 14);
      x.lineTo(506, 114); x.quadraticCurveTo(506, 122, 498, 122); x.lineTo(14, 122);
      x.quadraticCurveTo(6, 122, 6, 114); x.lineTo(6, 14); x.quadraticCurveTo(6, 6, 14, 6); x.fill();
      x.strokeStyle = 'rgba(0,200,238,.5)'; x.lineWidth = 3; x.stroke();
      x.fillStyle = color || '#5EE9C4'; x.font = '700 58px Segoe UI, Arial'; x.textAlign = 'center';
      x.fillText(text, 256, 84);
      const tex = new THREE.CanvasTexture(c); tex.minFilter = THREE.LinearFilter;
      const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthTest: false }));
      spr.scale.set(1.05, 0.26, 1);
      return spr;
    }

    const pickables = [];
    function register(group, key) {
      pickables.push({ obj: group, key: key });
      return group;
    }
    function addHalo(group, color, scale) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(scale, 0.012, 8, 48),
        new THREE.MeshBasicMaterial({ color: color, transparent: true, opacity: 0.65 }));
      ring.rotation.x = Math.PI / 2; ring.position.y = 0.02; group.userData.halo = ring; group.add(ring);
    }

    // ---- lit d'hôpital + patient ----
    const bed = new THREE.Group();
    const bedFrame = new THREE.Mesh(new THREE.BoxGeometry(2.1, 0.16, 0.95), new THREE.MeshStandardMaterial({ color: 0x1b3243, metalness: 0.5, roughness: 0.5 }));
    bedFrame.position.y = 0.72; bed.add(bedFrame);
    const mattress = new THREE.Mesh(new THREE.BoxGeometry(2, 0.2, 0.88), new THREE.MeshStandardMaterial({ color: 0xcfd8e0, roughness: 0.9 }));
    mattress.position.y = 0.9; bed.add(mattress);
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.24, 0.5), new THREE.MeshStandardMaterial({ color: 0x2a4256, roughness: 0.8 }));
    torso.position.set(-0.35, 1.06, 0); bed.add(torso);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.14, 20, 16), new THREE.MeshStandardMaterial({ color: 0x2a4256, roughness: 0.8 }));
    head.position.set(-0.72, 1.08, 0); bed.add(head);
    [-0.95, 0.95].forEach(function (x) { [-0.42, 0.42].forEach(function (z) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.7, 10), shell); leg.position.set(x, 0.35, z); bed.add(leg);
    }); });
    bed.position.set(0, 0, 0); scene.add(bed);

    // ---- respirateur T6 / VK600 sur chariot ----
    const vent = new THREE.Group();
    const vBase = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.14, 0.42), shell); vBase.position.y = 0.09; vent.add(vBase);
    [[-0.19, -0.15], [0.19, -0.15], [-0.19, 0.15], [0.19, 0.15]].forEach(function (p) {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.72, 8), shell);
      leg.position.set(p[0], 0.39, p[1]); vent.add(leg);
    });
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.52, 0.62, 0.34), shell); body.position.y = 1.06; vent.add(body);
    const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.34), emissive(0x00c8ee, 1.0));
    screen.position.set(0, 1.2, 0.176); vent.add(screen);
    const screen2 = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.2), emissive(0x5EE9C4, 0.8));
    screen2.position.set(0, 1.0, 0.176); vent.add(screen2);
    const valve = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.12, 14), new THREE.MeshStandardMaterial({ color: 0x00c8ee, metalness: 0.6, roughness: 0.3 }));
    valve.rotation.z = Math.PI / 2; valve.position.set(0.3, 1.1, 0); vent.add(valve);
    const hb = new THREE.Mesh(new THREE.TorusGeometry(0.12, 0.014, 8, 24), shell); hb.rotation.y = Math.PI / 2; hb.position.set(0, 1.5, 0); vent.add(hb);
    const vl = makeLabel('Ventilateur T6 / VK600', '#7BF0D2'); vl.position.set(0, 1.78, 0); vent.add(vl);
    addHalo(vent, 0x00c8ee, 0.35);
    vent.position.set(-1.95, 0, 0.15); scene.add(vent); register(vent, 'vent');

    // ---- défibrillateur i5 (armoire murale) ----
    const defib = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.34, 0.2), new THREE.MeshStandardMaterial({ color: 0xff5a5f, metalness: 0.3, roughness: 0.5 }));
    defib.add(box);
    const dscreen = new THREE.Mesh(new THREE.PlaneGeometry(0.28, 0.2), emissive(0x7bf0d2, 1.0));
    dscreen.position.set(-0.06, 0.02, 0.101); defib.add(dscreen);
    const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.045, 0.03, 18), new THREE.MeshStandardMaterial({ color: 0xffb020, emissive: 0xffb020, emissiveIntensity: 0.7 }));
    btn.rotation.x = Math.PI / 2; btn.position.set(0.15, 0, 0.1); defib.add(btn);
    const dl = makeLabel('DAE i5', '#FFB020'); dl.position.set(0, 0.32, 0); defib.add(dl);
    defib.position.set(-3.4, 1.55, -3.6); scene.add(defib); register(defib, 'defib');

    // ---- dispositif RCP automatique E6/E8 (au-dessus du lit) ----
    const cpr = new THREE.Group();
    const cbase = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.1, 0.4), shell); cbase.position.y = 0.05; cpr.add(cbase);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.72, 16), shell); col.position.y = 0.45; cpr.add(col);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.14, 0.42), shell); arm.position.set(0, 0.86, 0); cpr.add(arm);
    const piston = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.16, 16), new THREE.MeshStandardMaterial({ color: 0x0fa37f, metalness: 0.5, roughness: 0.4 }));
    piston.position.set(0, 0.74, 0); cpr.add(piston);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.085, 0.016, 10, 28), emissive(0x5EE9C4, 1.2));
    ring.rotation.x = Math.PI / 2; ring.position.set(0, 0.83, 0); cpr.add(ring);
    const cl = makeLabel('RCP automatique E6 / E8', '#5EE9C4'); cl.position.set(0, 1.15, 0); cpr.add(cl);
    cpr.position.set(-0.3, 1.16, 0); cpr.scale.set(0.62, 0.62, 0.62); scene.add(cpr); register(cpr, 'cpr');

    // ---- moniteur i6 sur potence ----
    const mon = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 1.6, 10), shell); pole.position.y = 0.8; mon.add(pole);
    const mbase = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.22, 0.05, 20), shell); mbase.position.y = 0.03; mon.add(mbase);
    const mscreen = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.36, 0.06), shell); mscreen.position.y = 1.5; mon.add(mscreen);
    const mface = new THREE.Mesh(new THREE.PlaneGeometry(0.44, 0.3), emissive(0x0fa37f, 1.0)); mface.position.set(0, 1.5, 0.031); mon.add(mface);
    const ml = makeLabel('Moniteur i6', '#7BF0D2'); ml.position.set(0, 1.78, 0); mon.add(ml);
    mon.position.set(2.05, 0, -0.6); scene.add(mon); register(mon, 'monitor');

    // ---- branchements : alimentation, circuit respiratoire, électrodes, sondes ----
    const wire = function (pts, radius, color, seg) {
      const curve = new THREE.CatmullRomCurve3(pts.map(function (p) { return new THREE.Vector3(p[0], p[1], p[2]); }));
      const mat = new THREE.MeshStandardMaterial({ color: color, metalness: 0.35, roughness: 0.5 });
      const m = new THREE.Mesh(new THREE.TubeGeometry(curve, seg || 60, radius || 0.012, 8, false), mat);
      scene.add(m); return m;
    };
    const outlet = function (x, y, z) {
      const gp = new THREE.Group();
      gp.add(new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.18, 0.02),
        new THREE.MeshStandardMaterial({ color: 0x0e1e2a, metalness: 0.2, roughness: 0.8 })));
      [-0.03, 0.03].forEach(function (dy) {
        const slot = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.05, 0.012), new THREE.MeshBasicMaterial({ color: 0x040c14 }));
        slot.position.set(0, dy, 0.013); gp.add(slot);
      });
      gp.position.set(x, y, z); scene.add(gp); return gp;
    };

    // prises murales (mur du fond)
    outlet(-3.4, 0.35, -3.98); outlet(-0.95, 0.35, -3.98);
    outlet(0.6, 0.35, -3.98); outlet(2.05, 0.35, -3.98);

    // câbles d'alimentation : appareil -> sol -> prise
    wire([[-1.95, 0.10, 0.15], [-1.9, 0.04, 0.5], [-1.2, 0.03, -2.0], [-0.95, 0.12, -3.6], [-0.95, 0.35, -3.97]], 0.012, 0x1c2b38);
    wire([[2.05, 0.04, -0.55], [2.15, 0.03, -1.8], [2.05, 0.10, -3.4], [2.05, 0.35, -3.97]], 0.012, 0x1c2b38);
    wire([[-3.4, 1.42, -3.6], [-3.6, 0.9, -3.72], [-3.5, 0.45, -3.9], [-3.4, 0.35, -3.97]], 0.012, 0x1c2b38);
    wire([[-0.3, 1.19, 0.0], [0.1, 0.6, 0.35], [0.6, 0.04, -2.0], [0.62, 0.12, -3.6], [0.6, 0.35, -3.97]], 0.012, 0x1c2b38);

    // circuit respiratoire : ventilateur -> interface patient (double branche)
    wire([[-1.65, 1.10, 0.16], [-1.45, 1.42, 0.30], [-1.05, 1.40, 0.34], [-0.80, 1.14, 0.26], [-0.72, 1.06, 0.15]], 0.022, 0x9fd8ea, 64);
    wire([[-1.63, 1.05, 0.21], [-1.40, 1.30, 0.38], [-1.02, 1.28, 0.40], [-0.78, 1.10, 0.28], [-0.72, 1.03, 0.13]], 0.017, 0x6fb8d4, 64);
    const mask = new THREE.Mesh(new THREE.SphereGeometry(0.12, 18, 14),
      new THREE.MeshStandardMaterial({ color: 0x9fe8ff, transparent: true, opacity: 0.45, metalness: 0.1, roughness: 0.2 }));
    mask.scale.set(1, 0.85, 0.9); mask.position.set(-0.72, 1.06, 0.10); scene.add(mask);
    const ett = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.16, 12),
      new THREE.MeshStandardMaterial({ color: 0xcfe8f2, roughness: 0.5 }));
    ett.rotation.z = Math.PI / 2; ett.position.set(-0.82, 1.06, 0.06); scene.add(ett);

    // électrodes de défibrillation + câble vers l'armoire i5
    const padMat = new THREE.MeshStandardMaterial({ color: 0xffe0a6, roughness: 0.6 });
    [-0.47, -0.23].forEach(function (px2, i) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.014, 0.12), padMat);
      p.position.set(px2, 1.186, i ? 0.13 : -0.13); scene.add(p);
    });
    wire([[-0.35, 1.19, 0.0], [-0.7, 1.05, -0.4], [-1.6, 0.5, -1.6], [-2.8, 0.15, -3.1], [-3.35, 1.45, -3.62]], 0.013, 0xffcf7a);

    // sondes du moniteur -> patient (ECG + brassard)
    [[0xff5a5f, -0.02], [0x5ee9c4, 0.0], [0xffb020, 0.02]].forEach(function (ld) {
      wire([[2.05, 1.36, -0.6], [1.5, 1.32, -0.3], [0.7, 1.34, 0.05], [-0.15, 1.19, ld[1]]], 0.008, ld[0], 50);
    });
    wire([[2.05, 1.30, -0.62], [1.4, 1.10, -0.5], [0.6, 1.00, 0.1], [0.05, 1.05, 0.22]], 0.01, 0x00c8ee);

    // sangle du dispositif RCP autour du thorax
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.33, 0.02, 8, 32),
      new THREE.MeshStandardMaterial({ color: 0x2a4256, roughness: 0.7 }));
    strap.rotation.x = Math.PI / 2; strap.scale.set(1, 0.8, 1); strap.position.set(-0.35, 1.06, 0); scene.add(strap);

    // bouteille d'oxygène + ligne vers le ventilateur
    const o2 = new THREE.Group();
    const o2cyl = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.7, 20),
      new THREE.MeshStandardMaterial({ color: 0x0f8f6f, metalness: 0.5, roughness: 0.4 }));
    o2cyl.position.y = 0.35; o2.add(o2cyl);
    const o2cap = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.1, 16), shell); o2cap.position.y = 0.72; o2.add(o2cap);
    const o2reg = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 0.1),
      new THREE.MeshStandardMaterial({ color: 0xb8c6d2, metalness: 0.6, roughness: 0.4 }));
    o2reg.position.set(0, 0.78, 0); o2.add(o2reg);
    o2.position.set(-2.7, 0, 0.9); scene.add(o2);
    wire([[-2.7, 0.78, 0.95], [-2.4, 1.0, 0.7], [-2.1, 1.05, 0.35], [-1.72, 1.02, 0.2]], 0.014, 0x2fd6a8);

    // potence à perfusion + ligne vers le patient
    const iv = new THREE.Group();
    const ipole = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 1.7, 10), shell); ipole.position.y = 0.85; iv.add(ipole);
    const ibase = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.2, 0.05, 18), shell); ibase.position.y = 0.03; iv.add(ibase);
    const bag = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.05),
      new THREE.MeshStandardMaterial({ color: 0xdff3ff, transparent: true, opacity: 0.6, roughness: 0.3 }));
    bag.position.set(0, 1.55, 0); iv.add(bag);
    iv.position.set(0.95, 0, 0.75); scene.add(iv);
    wire([[0.95, 1.45, 0.75], [0.7, 1.25, 0.5], [0.2, 1.12, 0.25], [-0.05, 1.08, 0.12]], 0.008, 0xdff3ff);

    // ---- interaction : orbit ----
    let dragging = false, px = 0, py = 0, idleAt = 0, autoRotate = true;
    const raycaster = new THREE.Raycaster(); const ndc = new THREE.Vector2();
    let selected = null;

    function onDown(e) { dragging = true; autoRotate = false; px = e.clientX; py = e.clientY; }
    function onMove(e) {
      if (!dragging) return;
      theta -= (e.clientX - px) * 0.006; phi -= (e.clientY - py) * 0.006;
      phi = Math.max(0.35, Math.min(1.5, phi)); px = e.clientX; py = e.clientY;
    }
    function onUp(e) {
      if (dragging && Math.abs(e.clientX - px) < 4 && Math.abs(e.clientY - py) < 4) pick(e);
      dragging = false; idleAt = performance.now();
    }
    function onWheel(e) { radius = Math.max(3, Math.min(8.5, radius + e.deltaY * 0.002)); e.preventDefault(); }

    function pick(e) {
      const r = canvas.getBoundingClientRect();
      ndc.x = ((e.clientX - r.left) / r.width) * 2 - 1;
      ndc.y = -((e.clientY - r.top) / r.height) * 2 + 1;
      raycaster.setFromCamera(ndc, camera);
      const objs = pickables.map(function (p) { return p.obj; });
      const hits = raycaster.intersectObjects(objs, true);
      if (!hits.length) { if (infoEl) infoEl.classList.remove('on'); return; }
      let node = hits[0].object, key = null;
      while (node && !key) { const f = pickables.filter(function (p) { return p.obj === node; }); if (f.length) key = f[0].key; node = node.parent; }
      if (key) showInfo(key);
    }

    function showInfo(key) {
      const d = DEVICES[key]; if (!d || !infoEl) return;
      if (selected) selected.userData.halo.visible = true;
      selected = pickables.filter(function (p) { return p.key === key; })[0].obj;
      if (selected.userData.halo) selected.userData.halo.visible = false;
      infoBody.innerHTML = '<span class="tag">' + d.model + '</span><h3 style="margin-top:10px">' + d.title +
        '</h3><div class="feats">' + d.specs.map(function (s) { return '<div class="feat"><svg viewBox="0 0 24 24"><path d="M20 6 9 17l-5-5"/></svg><span>' + s + '</span></div>'; }).join('') + '</div>';
      infoEl.classList.add('on');
    }
    if (infoClose) infoClose.addEventListener('click', function () { infoEl.classList.remove('on'); });

    // ---- resize ----
    function resize() {
      const r = host.getBoundingClientRect();
      if (!r.width || !r.height) return;
      renderer.setSize(r.width, r.height, false);
      camera.aspect = r.width / r.height; camera.updateProjectionMatrix();
    }

    // ---- XR ----
    if (enterBtn) {
      const xr = navigator.xr;
      if (!xr || !xr.isSessionSupported) { enterBtn.style.display = 'none'; }
      else xr.isSessionSupported('immersive-vr').then(function (ok) { if (!ok) enterBtn.style.display = 'none'; });
      enterBtn.addEventListener('click', function () {
        navigator.xr.requestSession('immersive-vr', { optionalFeatures: ['local-floor', 'bounded-floor', 'hand-tracking'] })
          .then(function (session) { renderer.xr.setSession(session); })
          .catch(function () { enterBtn.textContent = 'Casque non disponible'; });
      });
    }

    // ---- animation ----
    const clock = new THREE.Clock();
    let running = false;
    function frame() {
      const dt = clock.getDelta();
      const tt = clock.elapsedTime;
      if (autoRotate) theta += dt * 0.12;
      if (!dragging && idleAt && performance.now() - idleAt > 6000) autoRotate = true;
      camera.position.set(
        target.x + radius * Math.sin(phi) * Math.cos(theta),
        target.y + radius * Math.cos(phi) + 0.5,
        target.z + radius * Math.sin(phi) * Math.sin(theta)
      );
      camera.lookAt(target);
      // ambience
      if (ring) ring.material.emissiveIntensity = 0.7 + Math.sin(tt * 4) * 0.5;
      if (pickables) pickables.forEach(function (p) { if (p.obj.userData.halo) p.obj.userData.halo.rotation.z = tt * 0.6; });
      if (screen) screen.material.emissiveIntensity = 0.85 + Math.sin(tt * 3) * 0.15;
      renderer.render(scene, camera);
    }

    canvas.addEventListener('pointerdown', onDown);
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', resize);

    return {
      start: function () {
        if (running) return; running = true;
        if (loadEl) loadEl.style.display = 'none';
        resize(); clock.start();
        renderer.setAnimationLoop(frame);
      },
      stop: function () { if (!running) return; running = false; renderer.setAnimationLoop(null); }
    };
  }

  window.SIMS = window.SIMS || {};
  window.SIMS.vr = {
    _inst: null,
    start: function (slide) { if (!this._inst) this._inst = create(slide); if (this._inst) this._inst.start(); },
    stop: function () { if (this._inst && this._inst.stop) this._inst.stop(); }
  };
})();
