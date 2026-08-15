const disposedResources = new WeakSet();

function disposeOnce(resource) {
  if (!resource || typeof resource !== 'object' || typeof resource.dispose !== 'function') return false;
  if (disposedResources.has(resource)) return false;
  disposedResources.add(resource);
  resource.dispose();
  return true;
}

function materialsOf(material) {
  if (!material) return [];
  return Array.isArray(material) ? material : [material];
}

export function disposeObject3D(object) {
  const counts = { geometries: 0, materials: 0, textures: 0 };
  if (!object) return counts;

  const visit = node => {
    if (node?.geometry?.userData?.shared !== true && disposeOnce(node?.geometry)) counts.geometries++;
    for (const material of materialsOf(node?.material)) {
      if (!material) continue;
      for (const value of Object.values(material)) {
        if (value?.isTexture && value.userData?.shared !== true && disposeOnce(value)) counts.textures++;
      }
      if (material.userData?.shared !== true && disposeOnce(material)) counts.materials++;
    }
  };

  if (typeof object.traverse === 'function') object.traverse(visit);
  else visit(object);
  return counts;
}

export function removeAndDispose(scene, object) {
  if (!object) return { geometries: 0, materials: 0, textures: 0 };
  if (typeof object.removeFromParent === 'function') object.removeFromParent();
  else if (scene && typeof scene.remove === 'function') scene.remove(object);
  return disposeObject3D(object);
}
