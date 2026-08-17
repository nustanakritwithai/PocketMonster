export const BIGHEAD_MARK = Object.freeze({
  ringHalf: 0.50,
  ringThick: 0.055,
  ringY: 0.045,
  crestY: 1.40,
  bossCrestY: 1.78,
  crestSize: 0.12,
  bossCrestSize: 0.16,
});

export function isBigheadMonsterRoot(node) {
  return node?.userData?.assetForm === 'blocky-bighead';
}

export function visualGrowthFactors(training) {
  if (!training) return null;
  const power = Math.min(1, (training.power || 0) / 80);
  const defense = Math.min(1, (training.defense || 0) / 80);
  const speed = Math.min(1, (training.speed || 0) / 80);
  const spirit = Math.min(1, (training.spirit || 0) / 80);
  return {
    power,
    defense,
    speed,
    spirit,
    x: 1 + power * 0.06 + defense * 0.04,
    y: 1 + power * 0.02 + defense * 0.03 + spirit * 0.01,
    z: 1 + speed * 0.06 + spirit * 0.02,
  };
}

function multiplyScale(node, sx, sy, sz) {
  if (!node?.scale) return;
  if (typeof node.scale.set === 'function') {
    node.scale.set((node.scale.x || 1) * sx, (node.scale.y || 1) * sy, (node.scale.z || 1) * sz);
  } else {
    node.scale.x *= sx;
    node.scale.y *= sy;
    node.scale.z *= sz;
  }
}

export function applyBigheadVisualGrowth(root, inst) {
  const factors = visualGrowthFactors(inst?.training);
  if (!root || !factors) return root;
  const visual = root.children?.[0];
  const base = visual?.userData?.baseScale;
  if (base) {
    base.x *= factors.x;
    base.y *= factors.y;
    base.z *= factors.z;
    multiplyScale(visual, factors.x, factors.y, factors.z);
  } else {
    multiplyScale(root, factors.x, factors.y, factors.z);
  }
  root.userData.visualGrowth = {
    power: factors.power,
    defense: factors.defense,
    speed: factors.speed,
    spirit: factors.spirit,
  };
  return root;
}

export function markRingScale({
  boss = false,
  elite = false,
  formScale = 1,
  lifeScale = 1,
  bighead = false,
} = {}) {
  const rank = boss ? 1.65 : (elite ? 1.35 : 1);
  return rank * (formScale || 1) * (bighead ? 1 : (lifeScale || 1));
}

export function addBigheadGroundRing(g, { THREE, box, basicMaterial, color, scale }) {
  if (!THREE?.Mesh || typeof box !== 'function' || typeof basicMaterial !== 'function') {
    throw new Error('bighead ground ring needs THREE.Mesh, box(), and basicMaterial()');
  }
  const half = BIGHEAD_MARK.ringHalf * scale;
  const t = BIGHEAD_MARK.ringThick;
  const y = BIGHEAD_MARK.ringY;
  const mat = basicMaterial(color);
  const bars = [
    [0, y, -half, half * 2 + t, t, t],
    [0, y, half, half * 2 + t, t, t],
    [-half, y, 0, t, t, half * 2 + t],
    [half, y, 0, t, t, half * 2 + t],
  ];
  const meshes = [];
  for (const [x, py, z, w, h, d] of bars) {
    const mesh = new THREE.Mesh(box(w, h, d), mat);
    mesh.position.set(x, py, z);
    mesh.userData.part = 'groundRing';
    mesh.name = 'groundRing';
    g.add(mesh);
    meshes.push(mesh);
  }
  return meshes;
}

export function addBigheadCrest(g, { THREE, box, material, boss = false, scale = 1 }) {
  if (!THREE?.Mesh || typeof box !== 'function' || typeof material !== 'function') {
    throw new Error('bighead crest needs THREE.Mesh, box(), and material()');
  }
  const size = (boss ? BIGHEAD_MARK.bossCrestSize : BIGHEAD_MARK.crestSize) * scale;
  const mesh = new THREE.Mesh(box(size, size * 1.25, size * 0.55), material(boss ? 0xffd166 : 0xfde047, 0.4, 0.15));
  mesh.position.set(0, boss ? BIGHEAD_MARK.bossCrestY : BIGHEAD_MARK.crestY, 0);
  mesh.castShadow = true;
  mesh.userData.part = 'eliteCrest';
  mesh.name = 'eliteCrest';
  g.add(mesh);
  return mesh;
}

export function addBigheadMonsterMarks(g, {
  THREE,
  box,
  basicMaterial,
  material,
  owned = false,
  eliteOverride = false,
  speciesElite = false,
  boss = false,
  formScale = 1,
} = {}) {
  const elite = !!(eliteOverride || speciesElite);
  const scale = markRingScale({ boss, elite, formScale, bighead: true });
  const color = owned ? 0x60a5fa : (boss ? 0xf43f5e : eliteOverride ? 0xfacc15 : 0xef4444);
  const ring = addBigheadGroundRing(g, { THREE, box, basicMaterial, color, scale });
  let crest = null;
  if (elite || boss) crest = addBigheadCrest(g, { THREE, box, material, boss, scale });
  return { scale, color, ring, crest };
}
