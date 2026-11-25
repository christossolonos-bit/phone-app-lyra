// Lyra's 3D face for the phone (1.2.0): her real model as a cyan hologram, head and shoulders.
// She breathes, blinks and glances around; her expression follows her mood (feelingsNow() in app.js);
// her mouth moves with the loudness of her voice (Web Audio on the <audio> element).
// Draws at most 30 frames a second, and nothing at all while hidden, so it's light on the battery.
import * as THREE from 'three';
import { GLTFLoader } from './lib/addons/loaders/GLTFLoader.js';

const stage = document.getElementById('stage');
const canvas = document.createElement('canvas');
stage.appendChild(canvas);
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: 'low-power' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(24, 1, 0.05, 20);
scene.add(new THREE.HemisphereLight('#dfefff', '#3a2a22', 1.4));
const key = new THREE.DirectionalLight('#fff4e6', 2.2); key.position.set(1.5, 3, 3); scene.add(key);
const rim = new THREE.DirectionalLight('#9fe8ff', 1.4); rim.position.set(-2, 2.5, -3); scene.add(rim);

const cyan = new THREE.Color('#3fe0ff');
const U = { uTime: { value: 0 }, uCyan: { value: cyan } };
// her own shading becomes cyan light, with edge glow, scanlines and a faint flicker (as on the PC hologram)
function hologram(mat, hair) {
  mat.onBeforeCompile = (sh) => {
    Object.assign(sh.uniforms, U);
    sh.fragmentShader = 'uniform float uTime; uniform vec3 uCyan;\n' + sh.fragmentShader.replace('#include <dithering_fragment>', `#include <dithering_fragment>
      float l = dot(gl_FragColor.rgb, vec3(.3,.59,.11));
      l = ${hair ? '0.10 + l * 1.6' : 'l'};
      float fr = pow(1.0 - abs(dot(normalize(normal), normalize(vViewPosition))), 2.5);
      float scan = 0.86 + 0.14 * sin(gl_FragCoord.y * 1.6 - uTime * 6.0);
      float band = 0.92 + 0.08 * smoothstep(0.96, 1.0, sin(gl_FragCoord.y * 0.02 - uTime * 1.5));
      float flick = 0.97 + 0.03 * sin(uTime * 41.0);
      vec3 c = uCyan * (0.04 + 1.45 * pow(clamp(l, 0.0, 1.5), 1.3));
      c = mix(c, vec3(0.85, 1.0, 1.0), smoothstep(0.75, 1.1, l) * 0.35);
      c += uCyan * fr * 0.8;
      gl_FragColor = vec4(c * scan * band * flick, gl_FragColor.a);`);
  };
  mat.customProgramCacheKey = () => (hair ? 'holo-hair' : 'holo');
  mat.needsUpdate = true;
}

let model, bones = {}, morphs = new Map(), ready = false;
const rest = new Map();
function setMorph(name, w) { for (const { mesh, i } of morphs.get(name) || []) mesh.morphTargetInfluences[i] = w; }

new GLTFLoader().load('models/lyra.glb', (g) => {
  model = g.scene;
  model.traverse((o) => {
    if (o.isBone) { bones[o.name] = o; rest.set(o, o.quaternion.clone()); }
    if (!o.isMesh) return;
    o.frustumCulled = false;
    const hair = /hair/i.test(o.name);
    for (const m of [].concat(o.material)) hologram(m, hair);
    if (o.morphTargetDictionary) for (const [n, i] of Object.entries(o.morphTargetDictionary)) (morphs.get(n) || morphs.set(n, []).get(n)).push({ mesh: o, i });
  });
  scene.add(model);
  // arms down along her sides (the model comes in a T pose): each arm is aimed in world space
  model.updateMatrixWorld(true);
  for (const [arm, elbow, side] of [['bone_ArmL', 'bone_ElbowL', 1], ['bone_ArmR', 'bone_ElbowR', -1]]) {
    aim(bones[arm], bones[elbow], new THREE.Vector3(0.16 * side, -0.98, 0.06));
  }
  model.updateMatrixWorld(true);
  frame();
  ready = true;
  stage.classList.add('ready');
}, undefined, (e) => { stage.classList.add('failed'); console.warn('avatar', e); });

// turns a bone so the direction to its child points at `dir` (world space), and keeps that as its rest
function aim(bone, child, dir) {
  if (!bone || !child) return;
  const from = child.getWorldPosition(new THREE.Vector3()).sub(bone.getWorldPosition(new THREE.Vector3())).normalize();
  const turn = new THREE.Quaternion().setFromUnitVectors(from, dir.clone().normalize());
  const world = bone.getWorldQuaternion(new THREE.Quaternion());
  const parent = bone.parent.getWorldQuaternion(new THREE.Quaternion());
  bone.quaternion.copy(parent.invert().multiply(turn.multiply(world)));
  bone.updateMatrixWorld(true);
  rest.set(bone, bone.quaternion.clone());
}

// head and shoulders, whichever way the model faces
function frame() {
  const head = bones.bone_Head; if (!head) return;
  const p = head.getWorldPosition(new THREE.Vector3());
  const fwd = new THREE.Vector3(0, 0, 1).applyQuaternion(model.getWorldQuaternion(new THREE.Quaternion()));
  camera.position.copy(p).add(new THREE.Vector3(0, -0.02, 0)).addScaledVector(fwd, window.LYRA_CAM_DIST ?? 1.25);
  camera.lookAt(p.x, p.y - 0.06, p.z);
}

function resize() {
  const w = stage.clientWidth, h = stage.clientHeight;
  if (!w || !h) return;
  renderer.setSize(w, h, false);
  camera.aspect = w / h; camera.updateProjectionMatrix();
}
new ResizeObserver(resize).observe(stage);

// ---- her voice's loudness, for the mouth ----
let analyser, levelBuf;
function hookAudio() {
  if (analyser) return;
  try {
    const audio = document.getElementById('audio');
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const src = ctx.createMediaElementSource(audio);
    analyser = ctx.createAnalyser(); analyser.fftSize = 512;
    src.connect(analyser); analyser.connect(ctx.destination);
    levelBuf = new Uint8Array(analyser.fftSize);
    audio.addEventListener('play', () => ctx.resume());
  } catch (e) { console.warn('lip sync', e); }
}
// the AudioContext may only start after a tap
document.addEventListener('pointerdown', hookAudio, { once: true });
function voiceLevel() {
  if (!analyser) return 0;
  analyser.getByteTimeDomainData(levelBuf);
  let s = 0; for (let i = 0; i < levelBuf.length; i++) { const v = (levelBuf[i] - 128) / 128; s += v * v; }
  return Math.min(1, Math.sqrt(s / levelBuf.length) * 5);
}

// ---- moods to faces ----
const FACE = {
  joy: { mouthSmile: 0.55, cheekSquintLeft: 0.3, cheekSquintRight: 0.3 },
  amused: { mouthSmile: 0.6, cheekSquintLeft: 0.4, cheekSquintRight: 0.4, eyeSquintLeft: 0.2, eyeSquintRight: 0.2 },
  fond: { mouthSmile: 0.35, browInnerUp: 0.15 },
  playful: { mouthSmileLeft: 0.5, browOuterUpRight: 0.35 },
  flirty: { mouthSmile: 0.3, eyeSquintLeft: 0.25, eyeSquintRight: 0.25, browOuterUpLeft: 0.25 },
  excited: { mouthSmile: 0.5, eyeWideLeft: 0.35, eyeWideRight: 0.35, browInnerUp: 0.3 },
  proud: { mouthSmile: 0.25, browOuterUpLeft: 0.15, browOuterUpRight: 0.15 },
  curious: { browOuterUpLeft: 0.35, browOuterUpRight: 0.2, eyeWideLeft: 0.1 },
  pensive: { browInnerUp: 0.25, mouthPressLeft: 0.2, mouthPressRight: 0.2, eyesLookDown: 0.15 },
  confused: { browDownLeft: 0.35, browOuterUpRight: 0.35, mouthLeft: 0.2 },
  skeptical: { browDownLeft: 0.35, mouthLeft: 0.25, eyeSquintLeft: 0.2 },
  surprised: { eyeWideLeft: 0.55, eyeWideRight: 0.55, browInnerUp: 0.5, jawOpen: 0.12 },
  worried: { browInnerUp: 0.55, mouthFrownLeft: 0.2, mouthFrownRight: 0.2 },
  sad: { browInnerUp: 0.5, mouthFrownLeft: 0.4, mouthFrownRight: 0.4, eyesLookDown: 0.2 },
  lonely: { browInnerUp: 0.4, mouthFrownLeft: 0.25, mouthFrownRight: 0.25, eyesLookDown: 0.25 },
  embarrassed: { mouthSmile: 0.25, eyesLookDown: 0.35, browInnerUp: 0.25 },
  annoyed: { browDownLeft: 0.45, browDownRight: 0.45, mouthPressLeft: 0.3, mouthPressRight: 0.3 },
  bored: { eyeBlinkLeft: 0.25, eyeBlinkRight: 0.25, mouthLeft: 0.15 },
  tired: { eyeBlinkLeft: 0.35, eyeBlinkRight: 0.35, browInnerUp: 0.15 },
  determined: { browDownLeft: 0.25, browDownRight: 0.25, mouthPressLeft: 0.25, mouthPressRight: 0.25 },
  scared: { eyeWideLeft: 0.5, eyeWideRight: 0.5, browInnerUp: 0.6, mouthStretchLeft: 0.3, mouthStretchRight: 0.3 },
  calm: { mouthSmile: 0.08 },
};
let moodTarget = {}, moodNow = {};
function readMood() {
  const f = typeof window.feelingsNow === 'function' ? window.feelingsNow() : {};
  const t = {};
  for (const [feel, v] of Object.entries(f)) for (const [m, w] of Object.entries(FACE[feel] || {})) t[m] = Math.min(1, (t[m] || 0) + w * Math.min(1, v * 1.6));
  moodTarget = t;
}
setInterval(readMood, 1000);

// ---- the loop ----
const VIS = ['viseme_aa', 'viseme_O', 'viseme_E', 'viseme_I', 'viseme_U'];
let last = 0, t0 = performance.now(), blinkAt = 2, blinkT = -1, gaze = { x: 0, y: 0, tx: 0, ty: 0, next: 1 }, mouth = 0, vis = 0, visNext = 0;
const tmpQ = new THREE.Quaternion(), e = new THREE.Euler();
function visible() { return !document.hidden && stage.offsetParent !== null && !stage.hidden; }
function tick(now) {
  requestAnimationFrame(tick);
  if (!ready || !visible() || now - last < 33) return;
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const t = (now - t0) / 1000;
  U.uTime.value = t;

  // breathing and a slow, living head
  const head = bones.bone_Head, neck = bones.bone_EXP_C1_Neck1, chest = bones.bone_EXP_C1_Spine2;
  if (chest) { e.set(Math.sin(t * 1.25) * 0.012, 0, 0); chest.quaternion.copy(rest.get(chest)).multiply(tmpQ.setFromEuler(e)); }
  if (head) {
    e.set(Math.sin(t * 0.37) * 0.05 + Math.sin(t * 0.91) * 0.015, Math.sin(t * 0.23) * 0.08 + gaze.x * 0.25, Math.sin(t * 0.31) * 0.03);
    head.quaternion.copy(rest.get(head)).multiply(tmpQ.setFromEuler(e));
  }
  if (neck) { e.set(0, Math.sin(t * 0.19) * 0.04, 0); neck.quaternion.copy(rest.get(neck)).multiply(tmpQ.setFromEuler(e)); }

  // eyes: glances and blinks
  if (t > gaze.next) { gaze.tx = (Math.random() - 0.5) * 0.5; gaze.ty = (Math.random() - 0.5) * 0.3; gaze.next = t + 1.5 + Math.random() * 3.5; }
  gaze.x += (gaze.tx - gaze.x) * Math.min(1, dt * 6); gaze.y += (gaze.ty - gaze.y) * Math.min(1, dt * 6);
  setMorph('eyeLookOutLeft', Math.max(0, gaze.x)); setMorph('eyeLookInRight', Math.max(0, gaze.x));
  setMorph('eyeLookInLeft', Math.max(0, -gaze.x)); setMorph('eyeLookOutRight', Math.max(0, -gaze.x));
  setMorph('eyeLookUpLeft', Math.max(0, gaze.y)); setMorph('eyeLookUpRight', Math.max(0, gaze.y));
  if (t > blinkAt && blinkT < 0) blinkT = 0;
  let blink = 0;
  if (blinkT >= 0) { blinkT += dt; blink = blinkT < 0.08 ? blinkT / 0.08 : blinkT < 0.18 ? 1 - (blinkT - 0.08) / 0.1 : 0; if (blinkT >= 0.18) { blinkT = -1; blinkAt = t + 2 + Math.random() * 4; } }

  // mood, eased in slowly
  const names = new Set([...Object.keys(moodNow), ...Object.keys(moodTarget)]);
  for (const n of names) { moodNow[n] = (moodNow[n] || 0) + ((moodTarget[n] || 0) - (moodNow[n] || 0)) * Math.min(1, dt * 1.5); setMorph(n, moodNow[n]); }
  setMorph('eyeBlinkLeft', Math.min(1, blink + (moodNow.eyeBlinkLeft || 0)));
  setMorph('eyeBlinkRight', Math.min(1, blink + (moodNow.eyeBlinkRight || 0)));

  // mouth: loudness opens the jaw, the vowel shape changes every few frames so it reads as speech
  const lvl = voiceLevel();
  mouth += (lvl - mouth) * Math.min(1, dt * 18);
  if (t > visNext) { vis = Math.floor(Math.random() * VIS.length); visNext = t + 0.09 + Math.random() * 0.08; }
  for (let i = 0; i < VIS.length; i++) setMorph(VIS[i], i === vis ? mouth * 0.85 : 0);
  setMorph('jawOpen', Math.max(moodNow.jawOpen || 0, mouth * 0.35));
  if (mouth > 0.05) setMorph('mouthSmile', (moodNow.mouthSmile || 0) * 0.6);

  renderer.render(scene, camera);
}
requestAnimationFrame(tick);
window.lyraAvatar = { frame, resize };
