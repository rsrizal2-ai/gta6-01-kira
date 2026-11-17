// Parametric people for Porto Luna: one low-poly humanoid rig shared by the
// player, pedestrians, cops and guards, with walk, aim and fall animation.
import * as THREE from 'three';

const boxGeo = new THREE.BoxGeometry(1, 1, 1);
const headGeo = new THREE.BoxGeometry(0.42, 0.46, 0.42);
const matCache = new Map();
function mat(color) {
  if (!matCache.has(color)) matCache.set(color, new THREE.MeshLambertMaterial({ color }));
  return matCache.get(color);
}
function limb(parent, w, h, d, x, y, z, material) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const m = new THREE.Mesh(boxGeo, material);
  m.scale.set(w, h, d);
  m.position.y = -h / 2;
  m.castShadow = true;
  pivot.add(m);
  parent.add(pivot);
  return pivot;
}

export function makeHumanoid({ shirt = 0x3a6ac2, pants = 0x2c3240, skin = 0xd9a37a, hair = 0x2a2018, hat = null } = {}) {
  const group = new THREE.Group();
  const torso = new THREE.Mesh(boxGeo, mat(shirt));
  torso.scale.set(0.62, 0.72, 0.34);
  torso.position.y = 1.22;
  torso.castShadow = true;
  group.add(torso);
  const head = new THREE.Mesh(headGeo, mat(skin));
  head.position.y = 1.78;
  head.castShadow = true;
  group.add(head);
  const hairM = new THREE.Mesh(boxGeo, mat(hair));
  hairM.scale.set(0.44, 0.16, 0.44);
  hairM.position.y = 2.02;
  group.add(hairM);
  if (hat) {
    const brim = new THREE.Mesh(boxGeo, mat(hat));
    brim.scale.set(0.6, 0.06, 0.6);
    brim.position.y = 2.08;
    group.add(brim);
    const top = new THREE.Mesh(boxGeo, mat(hat));
    top.scale.set(0.34, 0.18, 0.34);
    top.position.y = 2.18;
    group.add(top);
  }
  const lArm = limb(group, 0.18, 0.62, 0.18, -0.4, 1.52, 0, mat(shirt));
  const rArm = limb(group, 0.18, 0.62, 0.18, 0.4, 1.52, 0, mat(shirt));
  const lLeg = limb(group, 0.24, 0.78, 0.24, -0.17, 0.86, 0, mat(pants));
  const rLeg = limb(group, 0.24, 0.78, 0.24, 0.17, 0.86, 0, mat(pants));
  // A small pistol mesh in the right hand, shown only while aiming.
  const gun = new THREE.Mesh(boxGeo, mat(0x222222));
  gun.scale.set(0.07, 0.1, 0.34);
  gun.position.set(0, -0.66, 0.12);
  gun.visible = false;
  rArm.add(gun);

  let phase = 0;
  return {
    group, gun,
    setAim(aiming) { gun.visible = aiming; },
    // Walk cycle: limbs swing with distance travelled; aiming holds the right
    // arm forward; falling tips the whole body onto its back.
    animate(dt, speed, aiming, dead, deadTime) {
      if (dead) {
        const k = Math.min(1, deadTime * 3);
        group.rotation.x = -Math.PI / 2 * k;
        group.position.y = 0.25 * k;
        return;
      }
      phase += dt * (2 + speed * 1.6);
      const swing = Math.min(0.85, speed * 0.22) * Math.sin(phase);
      lLeg.rotation.x = swing;
      rLeg.rotation.x = -swing;
      if (aiming) {
        rArm.rotation.x = -Math.PI / 2 + 0.08;
        lArm.rotation.x = -0.5;
      } else {
        lArm.rotation.x = -swing * 0.8;
        rArm.rotation.x = swing * 0.8;
      }
      group.position.y = Math.abs(Math.cos(phase)) * 0.03 * Math.min(1, speed);
    },
  };
}
