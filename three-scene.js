// Simple Three.js scene to visualise a coach (primitive model) and KSB shapes around them.
// Exposes a minimal API on window.ThreeScene: init(containerCanvas), updateShape(id, rating), updateAll(map), resize()

(function(){
  const THREE_NS = window.THREE;
  if(!THREE_NS){
    console.warn('Three.js not available — 3D view disabled.');
    window.ThreeScene = { init: ()=>{}, updateShape: ()=>{}, updateAll: ()=>{}, resize: ()=>{} };
    return;
  }

  let renderer, scene, camera, raycaster, mouse;
  const shapes = {}; // id -> mesh
  let canvas;
  // orbit/interaction state
  let isPointerDown = false;
  let activePointerId = null;
  let lastPointerX = 0, lastPointerY = 0;
  let theta = 0, phi = Math.PI / 2, radius = 4;
  let orbitTarget = null; // THREE.Vector3 set in init
  let tooltipEl = null;
  let pointerMode = null; // 'orbit' | 'pan'
  // inertia / momentum
  let angularVelocityTheta = 0;
  let angularVelocityPhi = 0;
  let panVelocity = new THREE_NS.Vector3(0,0,0);
  const ANGULAR_DAMPING = 0.92;
  const PAN_DAMPING = 0.82;

  function randomSpherePoint(i, total, radius){
    // deterministic-ish spread using golden angle
    const phi = Math.acos(1 - 2*(i+0.5)/total);
    const theta = Math.PI * (1 + Math.sqrt(5)) * i;
    const x = radius * Math.sin(phi) * Math.cos(theta);
    const y = radius * Math.sin(phi) * Math.sin(theta);
    const z = radius * Math.cos(phi);
    return new THREE_NS.Vector3(x,y,z);
  }

  function buildCoach(options = {}) {
  const THREE = THREE_NS;
  const { envMap = null, skinTone = 0xf2d3b0, suitColor = 0x22313f, shirtColor = 0xf5f7fa, tieColor = 0x8a2731 } = options;

  const group = new THREE.Group();
  group.name = 'ExecutiveCoach';

  // ---------- Materials ----------
  const mkStd = (color, rough = 0.55, metal = 0.0) =>
    new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, envMap, envMapIntensity: envMap ? 0.6 : 0.0 });

  const skinMat  = mkStd(skinTone, 0.5, 0.0);
  const suitMat  = mkStd(suitColor, 0.6, 0.0);
  const shirtMat = mkStd(shirtColor, 0.25, 0.0);
  const tieMat   = mkStd(tieColor, 0.35, 0.0);
  const beltMat  = mkStd(0x222222, 0.45, 0.0);
  const shoeMat  = mkStd(0x111111, 0.35, 0.2);
  const hairMat  = mkStd(0x2a1b12, 0.75, 0.0);
  const browMat  = mkStd(0x1b140f, 0.75, 0.0);
  const btnMat   = mkStd(0x333333, 0.35, 0.2);
  const watchMat = mkStd(0xcccccc, 0.25, 0.6);
  const glassMat = new THREE.MeshPhysicalMaterial({ color: 0xffffff, transmission: 0.96, thickness: 0.4, roughness: 0.05, envMap, envMapIntensity: envMap ? 0.7 : 0.0 });

  // Helper to add pivoted limb pieces
  const makePivot = (name, pos) => {
    const p = new THREE.Group();
    p.name = name;
    if (pos) p.position.copy(pos);
    return p;
  };

  // ---------- Proportions reference ----------
  // Head ~ 0.26 radius earlier was small; we’ll upscale for realistic 7.5-head proportions
  // Final total height ≈ 1.75m in scene units (here ~1.75)
  // We’ll work around origin at pelvis.

  // ---------- Pelvis / Hips ----------
  const pelvis = new THREE.Group();
  pelvis.position.set(0, 0.0, 0);
  group.add(pelvis);

  const pelvisGeom = new THREE.BoxGeometry(0.38, 0.22, 0.32);
  const pelvisMesh = new THREE.Mesh(pelvisGeom, suitMat);
  pelvisMesh.position.y = 0.0;
  pelvisMesh.castShadow = pelvisMesh.receiveShadow = true;
  pelvis.add(pelvisMesh);

  // Belt
  const belt = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.04, 0.34), beltMat);
  belt.position.y = 0.13;
  pelvis.add(belt);
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.035, 0.02), watchMat);
  buckle.position.set(0.12, 0.13, 0.165);
  pelvis.add(buckle);

  // ---------- Torso (shirt + jacket shell + lapels) ----------
  const torso = new THREE.Group();
  torso.position.y = 0.23;
  pelvis.add(torso);

  // Shirt core
  const rib = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.9, 0.34), shirtMat);
  rib.position.y = 0.45;
  rib.castShadow = rib.receiveShadow = true;
  torso.add(rib);

  // Jacket shell (slightly larger, with rounded chest cap)
  const jacketCore = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.92, 0.38), suitMat);
  jacketCore.position.y = 0.46;
  jacketCore.castShadow = jacketCore.receiveShadow = true;
  torso.add(jacketCore);

  const chestCap = new THREE.Mesh(new THREE.SphereGeometry(0.5, 24, 18), suitMat);
  chestCap.scale.set(0.5, 0.4, 0.4);
  chestCap.position.y = 0.88;
  torso.add(chestCap);

  // Lapels (thin wedges)
  const lapelGeom = new THREE.BoxGeometry(0.26, 0.38, 0.02);
  const leftLapel = new THREE.Mesh(lapelGeom, suitMat);
  leftLapel.position.set(-0.17, 0.68, 0.20);
  leftLapel.rotation.z = Math.PI * 0.06;
  leftLapel.rotation.y = Math.PI * 0.04;
  torso.add(leftLapel);

  const rightLapel = leftLapel.clone();
  rightLapel.position.x *= -1;
  rightLapel.rotation.z *= -1;
  rightLapel.rotation.y *= -1;
  torso.add(rightLapel);

  // Tie + knot
  const knot = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.08, 12), tieMat);
  knot.position.set(0, 0.78, 0.19);
  knot.rotation.x = Math.PI;
  torso.add(knot);
  const tie = new THREE.Mesh(new THREE.CylinderGeometry(0.055, 0.035, 0.42, 12), tieMat);
  tie.position.set(0, 0.55, 0.195);
  torso.add(tie);

  // Jacket buttons
  const btn = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.01, 16), btnMat);
  btn.rotation.x = Math.PI / 2;
  btn.position.set(0.07, 0.53, 0.19);
  torso.add(btn);
  const btn2 = btn.clone(); btn2.position.y = 0.35; torso.add(btn2);

  // ---------- Neck + Head ----------
  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.12, 0.16, 16), skinMat);
  neck.position.set(0, 1.05, 0);
  torso.add(neck);

  const head = new THREE.Group();
  head.position.set(0, 1.23, 0);
  torso.add(head);

  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.26, 28, 22), skinMat);
  skull.scale.set(1.0, 1.08, 1.0);
  head.add(skull);

  // Ears
  const earGeom = new THREE.SphereGeometry(0.07, 16, 12);
  const leftEar = new THREE.Mesh(earGeom, skinMat);
  leftEar.scale.set(0.7, 1.0, 0.4);
  leftEar.position.set(-0.27, 0.02, 0.0);
  head.add(leftEar);
  const rightEar = leftEar.clone();
  rightEar.position.x *= -1;
  head.add(rightEar);

  // Nose (small wedge)
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.05, 0.1, 16), skinMat);
  nose.position.set(0, -0.02, 0.24);
  nose.rotation.x = Math.PI * 0.5;
  head.add(nose);

  // Brows
  const browGeom = new THREE.BoxGeometry(0.12, 0.02, 0.02);
  const leftBrow = new THREE.Mesh(browGeom, browMat);
  leftBrow.position.set(-0.08, 0.09, 0.22);
  leftBrow.rotation.z = Math.PI * 0.04;
  head.add(leftBrow);
  const rightBrow = leftBrow.clone();
  rightBrow.position.x *= -1;
  rightBrow.rotation.z *= -1;
  head.add(rightBrow);

  // Eyes
  const eyeWhiteMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.55, metalness: 0.0, envMap, envMapIntensity: envMap ? 0.6 : 0.0 });
  const irisMat = new THREE.MeshStandardMaterial({ color: 0x2c3e50, roughness: 0.4, metalness: 0.0, envMap, envMapIntensity: envMap ? 0.6 : 0.0 });

  const eyeWhiteGeom = new THREE.SphereGeometry(0.055, 14, 10);
  const leftEyeWhite = new THREE.Mesh(eyeWhiteGeom, eyeWhiteMat);
  leftEyeWhite.position.set(-0.075, 0.03, 0.23);
  head.add(leftEyeWhite);
  const rightEyeWhite = leftEyeWhite.clone();
  rightEyeWhite.position.x *= -1;
  head.add(rightEyeWhite);

  const irisGeom = new THREE.SphereGeometry(0.028, 12, 10);
  const leftIris = new THREE.Mesh(irisGeom, irisMat);
  leftIris.position.set(-0.075, 0.03, 0.255);
  head.add(leftIris);
  const rightIris = leftIris.clone();
  rightIris.position.x *= -1;
  head.add(rightIris);

  // Simple mouth
  const mouth = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.01, 8, 24, Math.PI), new THREE.MeshStandardMaterial({ color: 0x7a4a3a, roughness: 0.6 }));
  mouth.rotation.set(Math.PI, 0, 0);
  mouth.position.set(0, -0.09, 0.22);
  head.add(mouth);

  // Hair cap
  const hair = new THREE.Mesh(new THREE.SphereGeometry(0.275, 24, 18), hairMat);
  hair.scale.set(1.0, 0.65, 1.0);
  hair.position.set(0, 0.11, 0);
  head.add(hair);

  // Glasses (thin frames + transparent lenses)
  const frameMat = mkStd(0x222222, 0.35, 0.6);
  const rimGeom = new THREE.TorusGeometry(0.065, 0.007, 10, 24);
  const leftRim = new THREE.Mesh(rimGeom, frameMat);
  leftRim.position.set(-0.075, 0.03, 0.245);
  head.add(leftRim);
  const rightRim = leftRim.clone(); rightRim.position.x *= -1; head.add(rightRim);
  const bridge = new THREE.Mesh(new THREE.CylinderGeometry(0.005, 0.005, 0.05, 8), frameMat);
  bridge.rotation.z = Math.PI / 2;
  bridge.position.set(0, 0.03, 0.245);
  head.add(bridge);
  // Lenses
  const lensGeom = new THREE.CircleGeometry(0.061, 20);
  const leftLens = new THREE.Mesh(lensGeom, glassMat);
  leftLens.position.copy(leftRim.position); leftLens.rotation.x = -Math.PI/2; head.add(leftLens);
  const rightLens = leftLens.clone(); rightLens.position.copy(rightRim.position); head.add(rightLens);

  // ---------- Shoulders & Arms (with clean pivots) ----------
  const shoulderY = 0.92;
  const shoulderSpread = 0.38;

  const shoulders = makePivot('shoulders', new THREE.Vector3(0, shoulderY, 0));
  torso.add(shoulders);

  function makeArm(side = 'L') {
    const s = side === 'L' ? -1 : 1;
    const armRoot = makePivot(`arm_${side}`, new THREE.Vector3(s * shoulderSpread, 0, 0));

    // shoulder cover
    const pad = new THREE.Mesh(new THREE.SphereGeometry(0.18, 18, 14), suitMat);
    pad.scale.set(1.0, 0.65, 0.9);
    pad.position.set(0, -0.02, 0);
    armRoot.add(pad);

    // upper arm
    const upperPivot = makePivot(`upper_${side}`, new THREE.Vector3(0, -0.02, 0));
    armRoot.add(upperPivot);

    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.34, 8, 16), suitMat);
    upper.rotation.z = s * -0.08;
    upper.position.set(0, -0.26, 0);
    upper.castShadow = upper.receiveShadow = true;
    upperPivot.add(upper);

    // elbow + lower arm
    const elbowPivot = makePivot(`elbow_${side}`, new THREE.Vector3(0, -0.44, 0));
    upperPivot.add(elbowPivot);

    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.085, 0.32, 8, 16), suitMat);
    lower.position.set(0, -0.18, 0);
    lower.castShadow = lower.receiveShadow = true;
    elbowPivot.add(lower);

    // cuff + hand
    const cuff = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.06, 16), shirtMat);
    cuff.position.set(0, -0.36, 0);
    elbowPivot.add(cuff);

    const hand = new THREE.Mesh(new THREE.SphereGeometry(0.085, 16, 12), skinMat);
    hand.scale.set(1.0, 0.85, 0.9);
    hand.position.set(0, -0.43, 0.0);
    elbowPivot.add(hand);

    // Watch on left wrist
    if (side === 'L') {
      const watchBand = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 10, 18), beltMat);
      watchBand.rotation.x = Math.PI / 2;
      watchBand.position.set(0, -0.36, 0);
      elbowPivot.add(watchBand);
      const watchFace = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.01, 20), watchMat);
      watchFace.rotation.x = Math.PI / 2;
      watchFace.position.set(0.055, -0.36, 0);
      elbowPivot.add(watchFace);
    }

    // Store pivots for animation
    armRoot.userData = { upperPivot, elbowPivot };
    return armRoot;
  }

  const armL = makeArm('L');
  const armR = makeArm('R');
  shoulders.add(armL);
  shoulders.add(armR);

  // ---------- Legs & Feet ----------
  const hips = makePivot('hips', new THREE.Vector3(0, 0.11, 0));
  pelvis.add(hips);

  function makeLeg(side = 'L') {
    const s = side === 'L' ? -1 : 1;
    const legRoot = makePivot(`leg_${side}`, new THREE.Vector3(s * 0.16, 0, 0));

  const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.46, 10, 18), suitMat);
  upper.position.set(0, -0.36, 0);
    upper.castShadow = upper.receiveShadow = true;
    legRoot.add(upper);

  // adjust pivots so legs sit slightly higher and contact the torso
  const kneePivot = makePivot(`knee_${side}`, new THREE.Vector3(0, -0.56, 0));
  upper.position.set(0, -0.60, 0);
  legRoot.add(kneePivot);

    const lower = new THREE.Mesh(new THREE.CapsuleGeometry(0.095, 0.44, 10, 18), suitMat);
    lower.position.set(0, -0.28, 0);
    lower.castShadow = lower.receiveShadow = true;
    kneePivot.add(lower);

    // Ankle/foot
  const anklePivot = makePivot(`ankle_${side}`, new THREE.Vector3(0, -0.48, 0));
    kneePivot.add(anklePivot);

  const shoeBody = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.11, 0.36), shoeMat);
  shoeBody.position.set(0, -0.02, 0.11);
    anklePivot.add(shoeBody);

    const toe = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), shoeMat);
  toe.scale.set(1.0, 0.6, 1.1);
  toe.position.set(0, -0.02, 0.28);
    anklePivot.add(toe);

    // Store pivots
    legRoot.userData = { kneePivot, anklePivot };
    return legRoot;
  }

  const legL = makeLeg('L');
  const legR = makeLeg('R');
  hips.add(legL);
  hips.add(legR);

  // ---------- Subtle pose ----------
  // slight contrapposto + friendly openness
  pelvis.rotation.y = 0.0;
  shoulders.rotation.y = 0.05;
  armL.userData.upperPivot.rotation.z = 0.15;   // left arm relaxed forward
  armR.userData.upperPivot.rotation.z = -0.05;  // right arm closer to body
  armL.userData.elbowPivot.rotation.z = -0.25;  // slight bend
  armR.userData.elbowPivot.rotation.z = -0.05;

  legL.userData.kneePivot.rotation.x = 0.08;
  legR.userData.kneePivot.rotation.x = -0.04;
  legR.userData.anklePivot.rotation.x = 0.05;

  // ---------- Scale & placement ----------
  group.scale.set(1.1, 1.1, 1.1);
  group.position.y = -0.2;

  // ---------- Animation helpers ----------
  group.userData = {
    breatheOffset: Math.random() * 100,
    refs: {
      shoulders,
      armL, armR,
      legL, legR,
      head,
    }
  };

  return group;
}


  function colourForType(type){
    if(type === 'Knowledge') return 0xff8a65; // orange
    if(type === 'Skill') return 0x66bb6a; // green
    return 0x42a5f5; // blue for Behaviour
  }

  function createShapes(items){
    const total = items.length;
    items.forEach((it,i)=>{
      const geom = new THREE_NS.IcosahedronGeometry(0.18,0);
      const mat = new THREE_NS.MeshStandardMaterial({color: colourForType(it.type), roughness:0.4, metalness:0.2});
      const mesh = new THREE_NS.Mesh(geom, mat);
      const pos = randomSpherePoint(i, total, 2.0);
      mesh.position.copy(pos);
      // store base position & base color so we can offset height and tint by rating
      mesh.userData = { id: it.id, basePosition: pos.clone(), baseColor: mesh.material.color.clone(), type: it.type };
      // label-ish offset property
      scene.add(mesh);
      shapes[it.id] = mesh;
    });
  }

  function onWindowResize(){
    if(!canvas) return;
    const w = canvas.clientWidth; const h = canvas.clientHeight;
    renderer.setSize(w,h); camera.aspect = w/h; camera.updateProjectionMatrix();
  }

  function init(canvasEl){
    canvas = canvasEl || document.getElementById('sceneCanvas');
    if(!canvas) return;
    renderer = new THREE_NS.WebGLRenderer({canvas, antialias:true, alpha:false});
    renderer.setPixelRatio(window.devicePixelRatio ? window.devicePixelRatio : 1);
    renderer.setSize(canvas.clientWidth || 800, canvas.clientHeight || 400);
    scene = new THREE_NS.Scene();
    scene.fog = new THREE_NS.Fog(0x081020, 5, 12);
    camera = new THREE_NS.PerspectiveCamera(45, canvas.clientWidth / canvas.clientHeight, 0.1, 100);
  camera.position.set(0,1.2,4);

  // set orbit target (around coach) and initialise spherical coords
  orbitTarget = new THREE_NS.Vector3(0, -0.1, 0);
  // compute radius from initial camera
  radius = camera.position.distanceTo(orbitTarget) || 4;
  // set sensible starting angles (theta on Y, phi from up)
  theta = 0; phi = Math.acos((camera.position.y - orbitTarget.y) / radius);
  updateCameraPosition();

    // lights
    const hemi = new THREE_NS.HemisphereLight(0xffffff, 0x444444, 0.6); hemi.position.set(0,20,0); scene.add(hemi);
    const dir = new THREE_NS.DirectionalLight(0xffffff, 0.8); dir.position.set(5,10,7); scene.add(dir);

    // coach model
    const coach = buildCoach(); coach.position.y = -0.2; scene.add(coach);

    // KSB shapes
    createShapes(window.KSB_ITEMS || []);

    // ground subtle
    const groundMat = new THREE_NS.MeshStandardMaterial({color:0x071226, roughness:1});
    const ground = new THREE_NS.Mesh(new THREE_NS.PlaneGeometry(20,20), groundMat); ground.rotation.x = -Math.PI/2; ground.position.y = -1.1; scene.add(ground);

    raycaster = new THREE_NS.Raycaster(); mouse = new THREE_NS.Vector2();

    // interactions
  canvas.addEventListener('click', onClick, false);
  canvas.addEventListener('mousemove', onMouseMove, false);
  canvas.addEventListener('mouseleave', onMouseLeave, false);
  // pointer interactions: orbit and pan
  canvas.addEventListener('pointerdown', onPointerDown, false);
  canvas.addEventListener('pointermove', onPointerMove, false);
  canvas.addEventListener('pointerup', onPointerUp, false);
  canvas.addEventListener('pointercancel', onPointerUp, false);
  // prevent context menu on right-click over canvas
  canvas.addEventListener('contextmenu', (e)=>{ e.preventDefault(); }, false);
  canvas.addEventListener('wheel', onWheel, { passive: false });
    window.addEventListener('resize', onWindowResize, false);

    // animate
    const clock = new THREE_NS.Clock();
    function animate(){
      requestAnimationFrame(animate);
      const t = clock.getElapsedTime();
      // subtle rotation of shapes and smooth transitions to target properties
      Object.values(shapes).forEach((m, idx) => {
        m.rotation.x = 0.2 * Math.sin(t + idx);
        m.rotation.y = 0.3 * Math.cos(t + idx);
        // smooth lerp for position.y and scale
        if(m.userData && (m.userData.targetY !== undefined)){
          m.position.y += (m.userData.targetY - m.position.y) * 0.12;
        }
        if(m.userData && (m.userData.targetScale !== undefined)){
          const cur = m.scale.x;
          const tar = m.userData.targetScale;
          const next = cur + (tar - cur) * 0.12;
          m.scale.setScalar(next);
        }
        // color lerp
        if(m.userData && m.userData.targetColor){
          m.material.color.lerp(m.userData.targetColor, 0.08);
        }
      });
      // apply inertia for orbit if any angular velocity remains
      if(Math.abs(angularVelocityTheta) > 1e-5 || Math.abs(angularVelocityPhi) > 1e-5){
        theta += angularVelocityTheta;
        phi += angularVelocityPhi;
        // damping
        angularVelocityTheta *= ANGULAR_DAMPING;
        angularVelocityPhi *= ANGULAR_DAMPING;
        const eps = 0.05; phi = Math.max(eps, Math.min(Math.PI - eps, phi));
        updateCameraPosition();
      }
      // apply pan inertia
      if(panVelocity.lengthSq() > 1e-8){
        orbitTarget.add(panVelocity);
        panVelocity.multiplyScalar(PAN_DAMPING);
        updateCameraPosition();
      }
      // subtle breathing of coach group
      if(scene){
        const coachGroup = scene.children.find(c=>c.userData && c.userData.breatheOffset !== undefined);
        if(coachGroup){ const bo = coachGroup.userData.breatheOffset || 0; coachGroup.scale.y = 1 + 0.01 * Math.sin(t*1.8 + bo); }
      }
      renderer.render(scene, camera);
    }
    animate();
  }

  function onClick(ev){
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(shapes));
    if(intersects.length){
      const id = intersects[0].object.userData.id;
      if(id){
        const node = document.querySelector(`.item[data-id="${id}"]`);
        if(node){ node.scrollIntoView({behavior:'smooth', block:'center'}); node.style.transition='background-color 0.6s';
          const prev = node.style.backgroundColor; node.style.backgroundColor='rgba(255,255,0,0.08)'; setTimeout(()=>node.style.backgroundColor=prev,900);
        }
      }
    }
  }

  function onPointerDown(ev){
    // decide mode: pan if right-button OR shiftKey pressed; otherwise orbit
    pointerMode = (ev.button === 2 || ev.shiftKey) ? 'pan' : 'orbit';
    // begin drag
    isPointerDown = true; activePointerId = ev.pointerId;
    lastPointerX = ev.clientX; lastPointerY = ev.clientY;
    // while dragging, hide tooltip
    if(tooltipEl) { tooltipEl.classList.add('hidden'); tooltipEl.style.opacity='0'; }
    // reset instantaneous velocities while user actively drags
    angularVelocityTheta = 0; angularVelocityPhi = 0;
    // small immediate pan velocity reset
    panVelocity.set(0,0,0);
    // capture pointer to continue receiving events outside canvas
    try{ ev.target.setPointerCapture && ev.target.setPointerCapture(ev.pointerId); }catch(e){}
  }

  function onPointerMove(ev){
    if(isPointerDown && ev.pointerId === activePointerId){
      const dx = ev.clientX - lastPointerX; const dy = ev.clientY - lastPointerY;
      lastPointerX = ev.clientX; lastPointerY = ev.clientY;
      if(pointerMode === 'orbit'){
        const rotSpeed = 0.005;
        // apply immediate rotation
        theta -= dx * rotSpeed;
        phi -= dy * rotSpeed;
        const eps = 0.05;
        phi = Math.max(eps, Math.min(Math.PI - eps, phi));
        // set angular velocities for inertia (scaled)
        angularVelocityTheta = (-dx * rotSpeed) * 0.85 + angularVelocityTheta * 0.15;
        angularVelocityPhi = (-dy * rotSpeed) * 0.85 + angularVelocityPhi * 0.15;
        updateCameraPosition();
      } else if(pointerMode === 'pan'){
        // pan: translate orbitTarget along camera's right and up vectors
        const panSpeed = 0.0025 * radius; // scale with distance for consistent feel
        // camera basis
        const camRight = new THREE_NS.Vector3();
        camera.getWorldDirection(camRight);
        camRight.cross(camera.up).normalize();
        const camUp = new THREE_NS.Vector3(); camUp.copy(camera.up).normalize();
        // compute pan vector (screen dx -> world)
        const pan = new THREE_NS.Vector3();
        pan.copy(camRight).multiplyScalar(-dx * panSpeed);
        pan.addScaledVector(camUp, dy * panSpeed);
        orbitTarget.add(pan);
        // accumulate pan velocity for inertia
        panVelocity.add(pan.multiplyScalar(0.7));
        updateCameraPosition();
      }
      return;
    }
    // otherwise treat as hover for tooltip
    onMouseMove(ev);
  }

  function onPointerUp(ev){
    if(ev.pointerId !== activePointerId) return;
    isPointerDown = false; activePointerId = null; pointerMode = null;
    // leave angularVelocity / panVelocity as-is to allow inertia to continue
    try{ ev.target.releasePointerCapture && ev.target.releasePointerCapture(ev.pointerId); }catch(e){}
  }

  function onWheel(ev){
    ev.preventDefault();
    const delta = ev.deltaY;
    const zoomSpeed = 0.0015;
    radius += delta * zoomSpeed * radius;
    radius = Math.max(1.5, Math.min(12, radius));
    updateCameraPosition();
  }

  function updateCameraPosition(){
    if(!camera || !orbitTarget) return;
    // spherical -> cartesian
    const sinPhi = Math.sin(phi);
    const x = radius * sinPhi * Math.sin(theta);
    const y = radius * Math.cos(phi);
    const z = radius * sinPhi * Math.cos(theta);
    camera.position.set(orbitTarget.x + x, orbitTarget.y + y, orbitTarget.z + z);
    camera.lookAt(orbitTarget);
  }

  function ensureTooltip(){
    if(tooltipEl) return tooltipEl;
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'ksb-tooltip hidden';
    tooltipEl.style.position = 'fixed';
    tooltipEl.style.pointerEvents = 'none';
    tooltipEl.style.zIndex = 9999;
    tooltipEl.style.background = 'rgba(12,18,28,0.92)';
    tooltipEl.style.color = '#e6f0ff';
    tooltipEl.style.padding = '8px 10px';
    tooltipEl.style.borderRadius = '8px';
    tooltipEl.style.fontSize = '13px';
    tooltipEl.style.boxShadow = '0 6px 22px rgba(2,6,23,0.6)';
    tooltipEl.style.transition = 'transform 0.08s ease, opacity 0.12s ease';
    document.body.appendChild(tooltipEl);
    return tooltipEl;
  }

  function onMouseMove(ev){
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    mouse.x = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(Object.values(shapes));
    const tt = ensureTooltip();
    if(intersects.length){
  const id = intersects[0].object.userData.id;
  const mesh = intersects[0].object;
  const item = (window.KSB_ITEMS || []).find(i => i.id === id) || { title: id };
  const rating = (mesh.userData && mesh.userData.rating) ? mesh.userData.rating : 'n/a';
  // avoid duplicating the id if the title already starts with it
  const titleText = (item.title || '').trim();
  const titleStartsWithId = titleText.toLowerCase().startsWith(String(item.id).toLowerCase());
  const headerText = titleStartsWithId ? titleText : `${item.id} — ${titleText}`;
  tt.innerHTML = `<strong>${headerText}</strong><div style="font-size:12px;color:#dbe9ff;margin-top:6px">Confidence: ${rating}</div>`;
      tt.classList.remove('hidden'); tt.style.opacity = '1';
      const pad = 12;
      let left = ev.clientX + pad;
      let top = ev.clientY + pad;
      const winW = window.innerWidth; const winH = window.innerHeight;
      const bbox = tt.getBoundingClientRect();
      if(left + bbox.width + 16 > winW) left = ev.clientX - bbox.width - pad;
      if(top + bbox.height + 16 > winH) top = ev.clientY - bbox.height - pad;
      tt.style.left = left + 'px'; tt.style.top = top + 'px';
    } else {
      if(tooltipEl){ tooltipEl.classList.add('hidden'); tooltipEl.style.opacity = '0'; }
    }
  }

  function onMouseLeave(){ if(tooltipEl){ tooltipEl.classList.add('hidden'); tooltipEl.style.opacity='0'; } }

  function updateShape(id, rating){
    const mesh = shapes[id];
    if(!mesh) return;
    // ensure rating is in 1..5
    const r = Math.max(1, Math.min(5, (typeof rating === 'number' ? rating : 3)));
    const rNorm = (r - 1) / 4; // 0..1
    // scale target
    const targetScale = 0.6 + rNorm * 1.4; // 0.6 .. 2.0
    // height: compute targetY based on stored base position
    const baseY = (mesh.userData && mesh.userData.basePosition) ? mesh.userData.basePosition.y : mesh.position.y;
    const heightOffset = -0.4 + rNorm * 1.4; // -0.4 .. +1.0
    const targetY = baseY + heightOffset;
    // compute target color (a slight tint toward white)
    let targetColor = null;
    if(mesh.userData && mesh.userData.baseColor){
      targetColor = mesh.userData.baseColor.clone().lerp(new THREE_NS.Color(0xffffff), rNorm * 0.45);
    }
    // store targets for the animator to smooth
    mesh.userData.targetScale = targetScale;
    mesh.userData.targetY = targetY;
    if(targetColor) mesh.userData.targetColor = targetColor;
    mesh.userData.rating = r;
  }

  function updateAll(map){
    if(!map) return;
    Object.keys(map).forEach(id => { const r = (map[id] && map[id].rating) ? map[id].rating : 3; updateShape(id, r); });
  }

  window.ThreeScene = { init: (el)=>init(el), updateShape, updateAll, resize: onWindowResize };

})();
