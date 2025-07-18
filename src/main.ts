import './style.css'
import * as THREE from 'three';
import { TextureLoader, RepeatWrapping, NearestFilter, LinearMipMapLinearFilter } from 'three';

// --- Screen definitions ---
type ScreenConfig = {
  groundColor: number;
  cameraPosition: THREE.Vector3;
  cameraLookAt: THREE.Vector3;
  hotspotPosition: THREE.Vector3;
  hotspotTargetScreen: number;
  itemPosition: THREE.Vector3;
  itemMessage: string;
};

const PLAYER_HEIGHT = 0.62; // top of head
const CAMERA_HEIGHT = PLAYER_HEIGHT * 3; // 1.86
const screens: ScreenConfig[] = [
  {
    groundColor: 0x4444aa,
    cameraPosition: new THREE.Vector3(-4, CAMERA_HEIGHT, 4), // left-front, higher
    cameraLookAt: new THREE.Vector3(0, 0.25, 0),
    hotspotPosition: new THREE.Vector3(4, 0.1, 0),
    hotspotTargetScreen: 1,
    itemPosition: new THREE.Vector3(-2, 0.5, 2),
    itemMessage: 'You found a mysterious blue artifact!'
  },
  {
    groundColor: 0x44aa44,
    cameraPosition: new THREE.Vector3(0, CAMERA_HEIGHT, -4), // back, higher
    cameraLookAt: new THREE.Vector3(0, 0.25, 0),
    hotspotPosition: new THREE.Vector3(-4, 0.1, 0),
    hotspotTargetScreen: 2,
    itemPosition: new THREE.Vector3(2, 0.5, -2),
    itemMessage: 'This green relic hums with energy.'
  },
  {
    groundColor: 0xaa4444,
    cameraPosition: new THREE.Vector3(4, CAMERA_HEIGHT, -4), // right-back, higher
    cameraLookAt: new THREE.Vector3(0, 0.25, 0),
    hotspotPosition: new THREE.Vector3(0, 0.1, 4),
    hotspotTargetScreen: 0,
    itemPosition: new THREE.Vector3(0, 0.5, -2),
    itemMessage: 'A red cube. It feels important.'
  },
];

let currentScreen = 0;

const app = document.querySelector<HTMLDivElement>('#app');
if (app) {
  app.innerHTML = '';
  const canvas = document.createElement('canvas');
  app.appendChild(canvas);
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Scene and camera
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);

  // --- Texture setup ---
  // --- Procedural textures ---
  function createCheckerboardTexture(size = 512, squares = 8): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const squareSize = size / squares;
    for (let y = 0; y < squares; y++) {
      for (let x = 0; x < squares; x++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#22224a' : '#eeeeee';
        ctx.fillRect(x * squareSize, y * squareSize, squareSize, squareSize);
      }
    }
    const tex = new THREE.Texture(canvas);
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.minFilter = LinearMipMapLinearFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }
  function createStripesTexture(size = 512, stripes = 8): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const stripeWidth = size / stripes;
    for (let i = 0; i < stripes; i++) {
      ctx.fillStyle = i % 2 === 0 ? '#44aa44' : '#eeeeee';
      ctx.fillRect(i * stripeWidth, 0, stripeWidth, size);
    }
    const tex = new THREE.Texture(canvas);
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.minFilter = LinearMipMapLinearFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }
  function createDotsTexture(size = 512, dots = 8): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#aa4444';
    ctx.fillRect(0, 0, size, size);
    ctx.fillStyle = '#eeeeee';
    const dotRadius = size / (dots * 4);
    for (let y = 0; y < dots; y++) {
      for (let x = 0; x < dots; x++) {
        ctx.beginPath();
        ctx.arc((x + 0.5) * size / dots, (y + 0.5) * size / dots, dotRadius, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    const tex = new THREE.Texture(canvas);
    tex.needsUpdate = true;
    tex.wrapS = tex.wrapT = RepeatWrapping;
    tex.repeat.set(4, 4);
    tex.minFilter = LinearMipMapLinearFilter;
    tex.magFilter = NearestFilter;
    return tex;
  }
  const checkerTexture = createCheckerboardTexture();
  const stripesTexture = createStripesTexture();
  const dotsTexture = createDotsTexture();

  // --- Objects ---
  let ground: THREE.Mesh;
  let hotspot: THREE.Mesh;
  let item: THREE.Mesh;
  let player: THREE.Group;
  let playerTarget: THREE.Vector3 | null = null;
  const playerSpeed = 0.07;

  // --- Overlay for messages ---
  let overlay = document.createElement('div');
  overlay.style.position = 'fixed';
  overlay.style.top = '50%';
  overlay.style.left = '50%';
  overlay.style.transform = 'translate(-50%, -50%)';
  overlay.style.background = 'rgba(0,0,0,0.8)';
  overlay.style.color = 'white';
  overlay.style.padding = '24px 32px';
  overlay.style.borderRadius = '12px';
  overlay.style.fontSize = '1.2rem';
  overlay.style.display = 'none';
  overlay.style.zIndex = '10';
  document.body.appendChild(overlay);

  function showOverlay(message: string) {
    overlay.textContent = message;
    overlay.style.display = 'block';
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 2000);
  }

  // Track pending navigation
  let pendingScreenChange: number | null = null;
  let pendingEntrySide: 'left' | 'right' | null = null;
  // Helper: determine entry/exit side for contextual positioning
  function getEntrySide(fromScreen: number): 'left' | 'right' {
    // For this MVP, right exit (hotspot x > 0) means enter left, left exit (hotspot x < 0) means enter right
    const hotspotX = screens[fromScreen].hotspotPosition.x;
    return hotspotX > 0 ? 'left' : 'right';
  }

  // --- Stick Figure Construction ---
  function createStickFigure(): THREE.Group {
    const group = new THREE.Group();
    // Head
    const headGeo = new THREE.SphereGeometry(0.18, 12, 12);
    const headMat = new THREE.MeshPhongMaterial({ color: 0xffffff });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 0.62, 0);
    group.add(head);
    // Body
    const bodyGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.32, 8);
    const bodyMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    body.position.set(0, 0.38, 0);
    group.add(body);
    // Arms
    const armGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.32, 8);
    const armMat = new THREE.MeshPhongMaterial({ color: 0xcccccc });
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.position.set(-0.16, 0.46, 0);
    leftArm.rotation.z = Math.PI / 2.5;
    group.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.position.set(0.16, 0.46, 0);
    rightArm.rotation.z = -Math.PI / 2.5;
    group.add(rightArm);
    // Legs
    const legGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.36, 8);
    const legMat = new THREE.MeshPhongMaterial({ color: 0x888888 });
    const leftLeg = new THREE.Mesh(legGeo, legMat);
    leftLeg.position.set(-0.07, 0.13, 0);
    leftLeg.rotation.z = Math.PI / 16;
    group.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, legMat);
    rightLeg.position.set(0.07, 0.13, 0);
    rightLeg.rotation.z = -Math.PI / 16;
    group.add(rightLeg);
    // Tag for animation
    (group as any)._parts = { leftArm, rightArm, leftLeg, rightLeg };
    return group;
  }

  function setupScreen(screenIdx: number, entrySide?: 'left' | 'right') {
    // Remove previous objects
    while (scene.children.length > 0) scene.remove(scene.children[0]);

    // Ground
    const groundGeo = new THREE.PlaneGeometry(8, 8);
    let groundMat: THREE.MeshPhongMaterial;
    if (screenIdx === 0) {
      groundMat = new THREE.MeshPhongMaterial({ map: checkerTexture });
    } else if (screenIdx === 1) {
      groundMat = new THREE.MeshPhongMaterial({ map: stripesTexture });
    } else {
      groundMat = new THREE.MeshPhongMaterial({ map: dotsTexture });
    }
    ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    // Lighting
    const light = new THREE.DirectionalLight(0xffffff, 1.1);
    light.position.set(5, 10, 7);
    light.castShadow = true;
    light.shadow.mapSize.width = 1024;
    light.shadow.mapSize.height = 1024;
    light.shadow.camera.near = 1;
    light.shadow.camera.far = 30;
    light.shadow.camera.left = -8;
    light.shadow.camera.right = 8;
    light.shadow.camera.top = 8;
    light.shadow.camera.bottom = -8;
    scene.add(light);
    scene.add(new THREE.AmbientLight(0x888888, 0.5));

    // Hotspot (navigation)
    const hotspotGeo = new THREE.SphereGeometry(0.3, 16, 16);
    const hotspotMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    hotspot = new THREE.Mesh(hotspotGeo, hotspotMat);
    hotspot.position.copy(screens[screenIdx].hotspotPosition);
    hotspot.position.y = 0.3; // radius
    hotspot.castShadow = true;
    scene.add(hotspot);

    // Interactive item (red cube)
    const itemGeo = new THREE.BoxGeometry(0.6, 0.6, 0.6);
    const itemMat = new THREE.MeshPhongMaterial({ color: 0xff2222 });
    item = new THREE.Mesh(itemGeo, itemMat);
    item.position.copy(screens[screenIdx].itemPosition);
    item.position.y = 0.3; // half box height
    item.castShadow = true;
    scene.add(item);

    // Player (stick figure)
    player = createStickFigure();
    if (entrySide === 'left') {
      player.position.set(-3.5, 0, 0);
    } else if (entrySide === 'right') {
      player.position.set(3.5, 0, 0);
    } else {
      player.position.set(0, 0, 0); // Center start
    }
    player.traverse((obj: any) => { if (obj.isMesh) obj.castShadow = true; });
    scene.add(player);

    // Camera
    camera.position.copy(screens[screenIdx].cameraPosition);
    camera.lookAt(screens[screenIdx].cameraLookAt);

    // Reset player target
    playerTarget = null;
  }

  setupScreen(currentScreen);

  // --- Raycaster for interaction ---
  const raycaster = new THREE.Raycaster();
  const mouse = new THREE.Vector2();

  // Path queue for multi-step movement
  let playerPath: THREE.Vector3[] = [];

  // Helper: check if line segment from A to B intersects the item (red box)
  function pathIntersectsBox(a: THREE.Vector3, b: THREE.Vector3, box: THREE.Mesh): boolean {
    // Use the box's bounding box
    const box3 = new THREE.Box3().setFromObject(box);
    // Ray from a to b
    const dir = b.clone().sub(a).normalize();
    const ray = new THREE.Ray(a, dir);
    // Check intersection within segment length
    const dist = a.distanceTo(b);
    const intersect = ray.intersectBox(box3, new THREE.Vector3());
    if (!intersect) return false;
    // Only count if intersection is between a and b
    const t = intersect.clone().sub(a).length();
    return t > 0.2 && t < dist - 0.2; // fudge factor to avoid edge cases
  }

  // Helper: get detour point to the left or right of the box
  function getDetourPoint(a: THREE.Vector3, b: THREE.Vector3, box: THREE.Mesh): THREE.Vector3 {
    // Get box center and size
    const box3 = new THREE.Box3().setFromObject(box);
    const center = box3.getCenter(new THREE.Vector3());
    const size = box3.getSize(new THREE.Vector3());
    // Vector from a to b
    const ab = b.clone().sub(a).normalize();
    // Perpendicular vector (on ground plane)
    const perp = new THREE.Vector3(-ab.z, 0, ab.x).normalize();
    // Try both sides
    const left = center.clone().add(perp.clone().multiplyScalar(size.x * 0.7 + 0.3));
    const right = center.clone().add(perp.clone().multiplyScalar(-size.x * 0.7 - 0.3));
    // Pick the one closer to the target
    return left.distanceTo(b) < right.distanceTo(b) ? left.setY(0) : right.setY(0);
  }

  function onClick(event: MouseEvent) {
    // Use canvas bounds for correct mouse mapping
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    const y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    mouse.x = x;
    mouse.y = y;
    raycaster.setFromCamera(mouse, camera);
    // Check hotspot first
    const hotspotHit = raycaster.intersectObject(hotspot);
    if (hotspotHit.length > 0) {
      playerTarget = hotspot.position.clone();
      playerTarget.y = 0; // move to base of hotspot
      playerPath = [];
      pendingScreenChange = screens[currentScreen].hotspotTargetScreen;
      pendingEntrySide = getEntrySide(currentScreen);
      return;
    }
    // Check item
    const itemHit = raycaster.intersectObject(item);
    if (itemHit.length > 0) {
      playerTarget = item.position.clone();
      playerTarget.y = 0; // move to base of item
      playerPath = [];
      return;
    }
    // Check ground
    const groundHit = raycaster.intersectObject(ground);
    if (groundHit.length > 0) {
      const target = groundHit[0].point.clone();
      target.y = 0;
      // Check for obstacle
      if (pathIntersectsBox(player.position, target, item)) {
        // Detour path
        const detour = getDetourPoint(player.position, target, item);
        detour.y = 0;
        playerPath = [detour, target];
        playerTarget = playerPath.shift()!;
      } else {
        playerTarget = target;
        playerPath = [];
      }
    }
  }
  window.addEventListener('click', onClick);

  // --- Animation loop ---
  let showItemMessage = false;
  function animate() {
    requestAnimationFrame(animate);
    // Move player if needed
    let isWalking = false;
    if (playerTarget) {
      const dist = player.position.distanceTo(playerTarget);
      if (dist > playerSpeed) {
        const dir = playerTarget.clone().sub(player.position).normalize();
        player.position.add(dir.multiplyScalar(playerSpeed));
        isWalking = true;
        // Face direction of movement
        const angle = Math.atan2(dir.x, dir.z);
        player.rotation.y = angle;
      } else {
        player.position.copy(playerTarget);
        // If there is a queued path, go to next point
        if (playerPath.length > 0) {
          playerTarget = playerPath.shift()!;
        } else {
          // If target is item, show message (use x/z distance only)
          const dx = player.position.x - item.position.x;
          const dz = player.position.z - item.position.z;
          const flatDist = Math.sqrt(dx * dx + dz * dz);
          if (flatDist < 0.45 && !showItemMessage) {
            showItemMessage = true;
            showOverlay(screens[currentScreen].itemMessage);
            setTimeout(() => { showItemMessage = false; }, 2000);
          }
          // If target is hotspot and pending screen change, do it now
          if (pendingScreenChange !== null) {
            currentScreen = pendingScreenChange;
            setupScreen(currentScreen, pendingEntrySide!);
            pendingScreenChange = null;
            pendingEntrySide = null;
          }
          playerTarget = null;
        }
      }
    }
    // Animate stick figure walk
    const t = performance.now() * 0.003;
    const swing = isWalking ? Math.sin(t * 6) * 0.7 : 0;
    const parts = (player as any)._parts;
    if (parts) {
      parts.leftArm.rotation.x = swing;
      parts.rightArm.rotation.x = -swing;
      parts.leftLeg.rotation.x = -swing;
      parts.rightLeg.rotation.x = swing;
    }
    renderer.render(scene, camera);
  }
  animate();

  // --- Resize ---
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}
