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

  function buildCoach(){
    // build a slightly more detailed stylised coach made from primitives
    const group = new THREE_NS.Group();
    // torso: rounded box using box + chest cap
    const torsoMat = new THREE_NS.MeshStandardMaterial({color:0x284e63, roughness:0.6});
    const torsoCore = new THREE_NS.Mesh(new THREE_NS.BoxGeometry(0.7,1.0,0.38), torsoMat);
    torsoCore.position.y = 0.05;
    group.add(torsoCore);
    // chest cap
    const chest = new THREE_NS.Mesh(new THREE_NS.SphereGeometry(0.4,16,12), torsoMat);
    chest.scale.set(1,0.6,1); chest.position.y = 0.55; group.add(chest);

  // neck + head (moved downwards so it contacts the torso)
  const neck = new THREE_NS.Mesh(new THREE_NS.CylinderGeometry(0.12,0.12,0.18,12), new THREE_NS.MeshStandardMaterial({color:0xedd1b0}));
  neck.position.y = 0.65; group.add(neck);
  const headMat = new THREE_NS.MeshStandardMaterial({color:0xffe0c8, roughness:0.7});
  const head = new THREE_NS.Mesh(new THREE_NS.SphereGeometry(0.26,20,16), headMat);
  head.position.y = 0.95; group.add(head);
  // simple hair cap (slightly lower to sit on the head)
  const hair = new THREE_NS.Mesh(new THREE_NS.SphereGeometry(0.28,12,10), new THREE_NS.MeshStandardMaterial({color:0x2b1f15}));
  hair.scale.set(1,0.6,1); hair.position.y = 1.05; group.add(hair);
  // eyes (adjusted to new head position)
  const eyeMat = new THREE_NS.MeshStandardMaterial({color:0x111111});
  const leftEye = new THREE_NS.Mesh(new THREE_NS.SphereGeometry(0.03,8,6), eyeMat); leftEye.position.set(-0.07,0.97,0.23); group.add(leftEye);
  const rightEye = leftEye.clone(); rightEye.position.x = 0.07; group.add(rightEye);

    // arms with elbow joint (one on each side)
    const armMat = new THREE_NS.MeshStandardMaterial({color:0x3a6b84, roughness:0.6});
    // left arm
    const upperArmL = new THREE_NS.Mesh(new THREE_NS.CylinderGeometry(0.08,0.09,0.45,12), armMat);
    upperArmL.position.set(-0.6,0.45,0); upperArmL.rotation.z = 0.35; group.add(upperArmL);
    const lowerArmL = new THREE_NS.Mesh(new THREE_NS.CylinderGeometry(0.07,0.07,0.45,10), armMat);
    lowerArmL.position.set(-0.4,0.05,0); lowerArmL.rotation.z = 0.9; group.add(lowerArmL);
    // right arm (mirrored)
    const upperArmR = upperArmL.clone(); upperArmR.position.x = 0.6; upperArmR.rotation.z = -0.35; group.add(upperArmR);
    const lowerArmR = lowerArmL.clone(); lowerArmR.position.x = 0.4; lowerArmR.rotation.z = -0.9; group.add(lowerArmR);

    // legs
    const legMat = new THREE_NS.MeshStandardMaterial({color:0x1f2a38, roughness:0.7});
    const leftLeg = new THREE_NS.Mesh(new THREE_NS.CylinderGeometry(0.11,0.12,0.9,12), legMat); leftLeg.position.set(-0.18,-0.9,0); group.add(leftLeg);
    const rightLeg = leftLeg.clone(); rightLeg.position.x = 0.18; group.add(rightLeg);

    group.scale.set(1.1,1.1,1.1);
    group.position.y = -0.2;
    // small subtle animation params
    group.userData = { breatheOffset: Math.random() * 100 };
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
