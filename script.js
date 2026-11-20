const videoElement = document.querySelector('.input_video');
const gameContainer = document.getElementById('game-container');
const webcamCanvas = document.getElementById('webcam_canvas');
const webcamCtx = webcamCanvas.getContext('2d');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('start-btn');
const gameStatus = document.getElementById('game-status');

let scene, camera, renderer;
let targetCube;
let targetCubePos = new THREE.Vector3(0, 0.81, -0.9);

// ตัวแปรสำหรับโหลดโมเดล 3D (.glb / .gltf)
const gltfLoader = new THREE.GLTFLoader();

// ตัวแปรระบบตำแหน่งผู้เล่น และการหมุน 360 องศา
let playerPos = new THREE.Vector3(0, 0, 0);
let targetPlayerPos = new THREE.Vector3(0, 0, 0);
let playerYaw = 0; 

// ตัวแปรสำหรับระบบหมุนกล้อง
let targetYawSpeed = 0;
let currentYawSpeed = 0;

let moveTargetMarker;
let moveTargetPoint = new THREE.Vector3();
let lastAimPoint = null;

let grabbedHandIndex = -1; // -1: ไม่มีใครจับ, 0: มือเขียว, 1: มือชมพู
let grabbedSummonedObject = null; // โมเดล Summon ที่กำลังถูกจับอยู่

// ตัวแปรระบบ Summon, เมนู และ Preview
let pendingSummonItem = null; // เก็บไอเทมที่เลือกไว้
let previewObject = null;     // โมเดลตัวอย่างที่ลอยตามมือเขียวก่อนวางจริง

let isMoveEnabled = false;        
let isMenuOpen = false;
let lastMenuToggleTime = 0;

// สถานะของเมนู (MAIN, CATEGORIES, ITEMS)
let currentMenuPage = "MAIN"; 
let selectedCategoryIndex = 0;

// โครงสร้างข้อมูล Summon
const SUMMON_DATA = [
    {
        category: "Cars",
        icon: "🚗",
        items: [
            { 
                name: "Sports Car", 
                modelPath: "summon/cars/free_1975_porsche_911_930_turbo.glb", 
                scale: [0.4, 0.4, 0.4] 
            },
            { name: "Sedan", color: 0x2288ff, shape: "box", scale: [0.4, 0.24, 0.6] },
            { name: "SUV Truck", color: 0x33cc55, shape: "box", scale: [0.44, 0.32, 0.64] }
        ]
    },
    {
        category: "Animals",
        icon: "🐶",
        items: [
            { 
                name: "Dargon", 
                modelPath: "summon/animals/tarisland_-_dragon_high_poly.glb", 
                scale: [0.1, 0.1, 0.1] 
            },
            { 
                name: "Ninja", 
                modelPath: "summon/animals/ninja_of_obscurity_costume__rig_a-_pose.glb", 
                scale: [0.3, 0.3, 0.3] 
            },
            { name: "Bear", color: 0x8b4513, shape: "sphere", scale: [0.18, 0.18, 0.18] }
        ]
    },
    {
        category: "Furniture",
        icon: "🪑",
        items: [
            { 
                name: "Mimic Chest", 
                modelPath: "summon/furniture/mimic_chest.glb", 
                scale: [0.1, 0.1, 0.1] 
            },
            { name: "Table", color: 0xaa5522, shape: "box", scale: [0.3, 0.12, 0.2] },
            { name: "Sofa", color: 0x9933ff, shape: "box", scale: [0.35, 0.15, 0.18] }
        ]
    }
];

// รายการโมเดลที่ถูก Summon ออกมาในฉาก 3D
let summonedSceneObjects = [];
let greenHandAuraRing; 

// ตัวแปรล็อกสถานะการจิ้มปุ่ม และ คูลดาวน์
let isFingerPressed = false; 
let lastButtonClickTime = 0;
const BUTTON_COOLDOWN = 1500; 

// ตัวแปรสำหรับตรวจเช็คสภาวะจีบนิ้วแบบ Hysteresis
let isHandPinching = [false, false];

// ตัวแปรตรวจจับการ Swipe Down ของมือชมพู
let pinkSwipeStartY = null;
let pinkSwipeStartTime = 0;

// Three.js Menu UI Objects & Cursor
let menuMesh, menuCanvas, menuContext, menuTexture;
let menuCursorMesh; 

// ตัวแปรสำหรับ Head Tracking
let targetCamRotX = 0, targetCamRotY = 0;
let currentCamRotX = 0, currentCamRotY = 0;

// ตัวแปรป้องกันมือชักกลับ (Smoothing & Grace Period)
let smoothReach = [0, 0];
let handLostBuffer = [0, 0]; 

const HAND_CONNECTIONS = [
    [0,1],[1,2],[2,3],[3,4],       
    [0,5],[5,6],[6,7],[7,8],       
    [5,9],[9,10],[10,11],[11,12],   
    [9,13],[13,14],[14,15],[15,16], 
    [13,17],[17,18],[18,19],[19,20],
    [0,17]                         
];

const hands3D = [
    { name: "GreenHand", joints: [], targetJoints: [], lineSegments: null, color: 0x00ff88, visible: false },
    { name: "PinkHand", joints: [], targetJoints: [], lineSegments: null, color: 0xff0077, visible: false }
];

function init3DScene() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.1);

    camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.rotation.order = 'YXZ';
    camera.position.set(0, 1.2, 0);

    renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    gameContainer.appendChild(renderer.domElement);

    scene.add(new THREE.AmbientLight(0xffffff, 0.6));
    const spotLight = new THREE.SpotLight(0x00f0ff, 1.5);
    spotLight.position.set(0, 3, 0);
    spotLight.castShadow = true;
    scene.add(spotLight);

    scene.add(new THREE.GridHelper(20, 20, 0x00f0ff, 0x1e293b));

    const tableMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.3 });
    const tableTop = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.08, 0.9), tableMat);
    tableTop.position.set(0, 0.7, -1.0);
    tableTop.receiveShadow = true;
    scene.add(tableTop);

    const cubeMat = new THREE.MeshStandardMaterial({ color: 0x00f0ff, roughness: 0.1, metalness: 0.8 });
    targetCube = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.14, 0.14), cubeMat);
    targetCube.position.copy(targetCubePos);
    targetCube.castShadow = true;
    scene.add(targetCube);

    // วงแหวนเขียวเป้าหมายสำหรับ Summon และจับวัตถุ
    const ringGeo = new THREE.RingGeometry(0.06, 0.09, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide, transparent: true, opacity: 0.85 });
    greenHandAuraRing = new THREE.Mesh(ringGeo, ringMat);
    greenHandAuraRing.visible = false;
    scene.add(greenHandAuraRing);

    initVRLocomotionVisuals();
    initHands3D();
    initVRMenu3D();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateMatrixWorld();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function initVRMenu3D() {
    menuCanvas = document.createElement('canvas');
    menuCanvas.width = 512;
    menuCanvas.height = 512;
    menuContext = menuCanvas.getContext('2d');

    menuTexture = new THREE.CanvasTexture(menuCanvas);
    const menuGeo = new THREE.PlaneGeometry(0.42, 0.42);
    const menuMat = new THREE.MeshBasicMaterial({ map: menuTexture, transparent: true, side: THREE.DoubleSide });

    menuMesh = new THREE.Mesh(menuGeo, menuMat);
    menuMesh.visible = false;
    scene.add(menuMesh);

    const cursorGeo = new THREE.RingGeometry(0.008, 0.015, 16);
    const cursorMat = new THREE.MeshBasicMaterial({ color: 0x00ff88, side: THREE.DoubleSide });
    menuCursorMesh = new THREE.Mesh(cursorGeo, cursorMat);
    menuCursorMesh.visible = false;
    scene.add(menuCursorMesh);

    updateMenuTexture(0);
}

function updateMenuTexture(pressedBtnId = 0) {
    const ctx = menuContext;
    ctx.clearRect(0, 0, 512, 512);

    ctx.fillStyle = 'rgba(10, 15, 30, 0.95)';
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(12, 12, 488, 488, 28);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(40, 12);
    ctx.lineTo(472, 12);
    ctx.stroke();

    if (currentMenuPage === "MAIN") {
        renderMainMenuUI(ctx, pressedBtnId);
    } else if (currentMenuPage === "CATEGORIES") {
        renderCategoriesMenuUI(ctx, pressedBtnId);
    } else if (currentMenuPage === "ITEMS") {
        renderItemsMenuUI(ctx, pressedBtnId);
    }

    menuTexture.needsUpdate = true;
}

function renderMainMenuUI(ctx, pressedBtnId) {
    ctx.fillStyle = '#00f0ff';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('⚙️ MAIN CONTROL MENU', 256, 52);

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 14px sans-serif';
    ctx.fillText('👈 Green Hand Only | Swipe 3 fingers to Open/Close', 256, 78);

    const isP1 = (pressedBtnId === 1);
    ctx.fillStyle = isP1 ? '#00ff88' : (isMoveEnabled ? 'rgba(0, 255, 136, 0.15)' : 'rgba(255, 51, 102, 0.15)');
    ctx.strokeStyle = isMoveEnabled ? '#00ff88' : '#ff3366';
    ctx.lineWidth = isP1 ? 5 : 2;
    ctx.beginPath();
    ctx.roundRect(32, 95, 448, 85, 16);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = isP1 ? '#000000' : (isMoveEnabled ? '#00ff88' : '#ff3366');
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText(isMoveEnabled ? '🟢 SYSTEM MOVE: ONLINE' : '🔴 SYSTEM MOVE: OFFLINE', 256, 135);

    const isP2 = (pressedBtnId === 2);
    ctx.fillStyle = isP2 ? '#a855f7' : 'rgba(168, 85, 247, 0.2)';
    ctx.strokeStyle = '#a855f7';
    ctx.lineWidth = isP2 ? 5 : 2;
    ctx.beginPath();
    ctx.roundRect(32, 195, 448, 85, 16);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 22px sans-serif';
    ctx.fillText('✨ SUMMON MENU', 256, 245);

    const isP3 = (pressedBtnId === 3);
    ctx.fillStyle = isP3 ? '#38bdf8' : 'rgba(30, 41, 59, 0.7)';
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = isP3 ? 5 : 2;
    ctx.beginPath();
    ctx.roundRect(32, 295, 448, 85, 16);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = isP3 ? '#000000' : '#38bdf8';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('🔄 RECENTER PLAYER', 256, 345);

    const isP4 = (pressedBtnId === 4);
    ctx.fillStyle = isP4 ? '#ff0077' : 'rgba(255, 0, 119, 0.2)';
    ctx.strokeStyle = '#ff0077';
    ctx.lineWidth = isP4 ? 5 : 2;
    ctx.beginPath();
    ctx.roundRect(32, 395, 448, 75, 16);
    ctx.fill(); ctx.stroke();

    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 20px sans-serif';
    ctx.fillText('❌ CLOSE MENU', 256, 440);
}

function renderCategoriesMenuUI(ctx, pressedBtnId) {
    ctx.fillStyle = '#a855f7';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('📦 SELECT CATEGORY', 256, 52);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('Select a category to summon 3D models', 256, 78);

    SUMMON_DATA.forEach((cat, idx) => {
        const btnId = idx + 1;
        const isP = (pressedBtnId === btnId);
        const yPos = 100 + (idx * 85);

        ctx.fillStyle = isP ? '#a855f7' : 'rgba(30, 41, 59, 0.8)';
        ctx.strokeStyle = '#a855f7';
        ctx.lineWidth = isP ? 5 : 2;
        ctx.beginPath();
        ctx.roundRect(32, yPos, 448, 70, 16);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.font = 'bold 22px sans-serif';
        ctx.fillText(`${cat.icon} ${cat.category}`, 256, yPos + 43);
    });

    const isBack = (pressedBtnId === 4);
    ctx.fillStyle = isBack ? '#e2e8f0' : 'rgba(148, 163, 184, 0.2)';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = isBack ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(32, 370, 215, 80, 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('🔙 BACK', 139, 418);

    const isClose = (pressedBtnId === 5);
    ctx.fillStyle = isClose ? '#ff0077' : 'rgba(255, 0, 119, 0.2)';
    ctx.strokeStyle = '#ff0077';
    ctx.lineWidth = isClose ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(265, 370, 215, 80, 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('❌ CLOSE', 372, 418);
}

function renderItemsMenuUI(ctx, pressedBtnId) {
    const activeCat = SUMMON_DATA[selectedCategoryIndex];

    ctx.fillStyle = '#00ff88';
    ctx.font = 'bold 26px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${activeCat.icon} ${activeCat.category.toUpperCase()}`, 256, 52);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '14px sans-serif';
    ctx.fillText('Tap model name then make a Green Fist ✊ to Place', 256, 78);

    activeCat.items.forEach((item, idx) => {
        const btnId = idx + 1;
        const isP = (pressedBtnId === btnId);
        const yPos = 100 + (idx * 85);

        ctx.fillStyle = isP ? '#00ff88' : 'rgba(15, 23, 42, 0.85)';
        ctx.strokeStyle = '#00ff88';
        ctx.lineWidth = isP ? 5 : 2;
        ctx.beginPath();
        ctx.roundRect(32, yPos, 448, 70, 16);
        ctx.fill(); ctx.stroke();

        ctx.fillStyle = isP ? '#000000' : '#ffffff';
        ctx.font = 'bold 20px sans-serif';
        ctx.fillText(`✨ ${item.name}`, 256, yPos + 43);
    });

    const isBack = (pressedBtnId === 4);
    ctx.fillStyle = isBack ? '#e2e8f0' : 'rgba(148, 163, 184, 0.2)';
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = isBack ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(32, 370, 215, 80, 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('🔙 BACK', 139, 418);

    const isClose = (pressedBtnId === 5);
    ctx.fillStyle = isClose ? '#ff0077' : 'rgba(255, 0, 119, 0.2)';
    ctx.strokeStyle = '#ff0077';
    ctx.lineWidth = isClose ? 4 : 2;
    ctx.beginPath();
    ctx.roundRect(265, 370, 215, 80, 16);
    ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 18px sans-serif';
    ctx.fillText('❌ CLOSE', 372, 418);
}

function createPreviewModel(itemData) {
    if (previewObject) {
        scene.remove(previewObject);
        previewObject = null;
    }

    const previewScale = itemData.scale 
        ? new THREE.Vector3(itemData.scale[0] * 0.15, itemData.scale[1] * 0.15, itemData.scale[2] * 0.15) 
        : new THREE.Vector3(0.05, 0.05, 0.05);

    if (itemData.modelPath) {
        gltfLoader.load(itemData.modelPath, (gltf) => {
            if (pendingSummonItem !== itemData) return; 

            const model = gltf.scene;
            model.scale.copy(previewScale);

            model.traverse((child) => {
                if (child.isMesh) {
                    child.material = child.material.clone();
                    child.material.transparent = true;
                    child.material.opacity = 0.75; 
                }
            });

            previewObject = model;
            scene.add(previewObject);
        });
    } else {
        let geo;
        if (itemData.shape === "box") {
            geo = new THREE.BoxGeometry(previewScale.x, previewScale.y, previewScale.z);
        } else if (itemData.shape === "sphere") {
            geo = new THREE.SphereGeometry(previewScale.x, 16, 16);
        } else if (itemData.shape === "cylinder") {
            geo = new THREE.CylinderGeometry(previewScale.x, previewScale.x, previewScale.y, 16);
        }

        const mat = new THREE.MeshStandardMaterial({ color: itemData.color, transparent: true, opacity: 0.75 });
        previewObject = new THREE.Mesh(geo, mat);
        scene.add(previewObject);
    }
}

function removePreviewModel() {
    if (previewObject) {
        scene.remove(previewObject);
        previewObject = null;
    }
}

function spawnSummonedModel(itemData, spawnPos) {
    grabbedHandIndex = -1;
    grabbedSummonedObject = null;
    if (greenHandAuraRing) greenHandAuraRing.visible = false;
    removePreviewModel();

    const originalScale = itemData.scale ? new THREE.Vector3(itemData.scale[0], itemData.scale[1], itemData.scale[2]) : new THREE.Vector3(0.2, 0.2, 0.2);
    const heldScale = originalScale.clone().multiplyScalar(0.15);

    if (itemData.modelPath) {
        gltfLoader.load(
            itemData.modelPath,
            (gltf) => {
                const model = gltf.scene;

                model.scale.copy(originalScale);
                model.position.copy(spawnPos);
                scene.add(model);

                model.updateMatrixWorld(true);

                const box = new THREE.Box3().setFromObject(model);
                const currentBottomOffset = model.position.y - box.min.y; 
                const baseBottomOffset = currentBottomOffset / model.scale.y; 

                const size = new THREE.Vector3();
                box.getSize(size);
                const maxDim = Math.max(size.x, size.y, size.z);
                
                const dynamicGrabRadius = Math.max(0.15, maxDim * 0.3);

                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });

                model.userData = {
                    isSummoned: true,
                    name: itemData.name,
                    vy: 0,
                    originalScale: originalScale,
                    heldScale: heldScale,         
                    baseBottomOffset: baseBottomOffset,
                    grabRadius: dynamicGrabRadius
                };

                summonedSceneObjects.push(model);
            },
            undefined,
            (error) => {
                console.error("เกิดข้อผิดพลาดในการโหลดโมเดล GLB:", error);
            }
        );
        return;
    }

    let geo, halfHeight = 0.1, maxDim = 0.2;
    if (itemData.shape === "box") {
        geo = new THREE.BoxGeometry(itemData.scale[0], itemData.scale[1], itemData.scale[2]);
        halfHeight = itemData.scale[1] / 2;
        maxDim = Math.max(...itemData.scale);
    } else if (itemData.shape === "sphere") {
        geo = new THREE.SphereGeometry(itemData.scale[0], 16, 16);
        halfHeight = itemData.scale[0];
        maxDim = itemData.scale[0] * 2;
    } else if (itemData.shape === "cylinder") {
        geo = new THREE.CylinderGeometry(itemData.scale[0], itemData.scale[0], itemData.scale[1], 16);
        halfHeight = itemData.scale[1] / 2;
        maxDim = Math.max(itemData.scale[0] * 2, itemData.scale[1]);
    }

    const mat = new THREE.MeshStandardMaterial({ color: itemData.color, roughness: 0.3, metalness: 0.5 });
    const mesh = new THREE.Mesh(geo, mat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    mesh.position.copy(spawnPos);

    mesh.userData = {
        isSummoned: true,
        name: itemData.name,
        vy: 0,
        originalScale: originalScale,
        heldScale: heldScale,
        baseBottomOffset: halfHeight / originalScale.y,
        grabRadius: Math.max(0.12, maxDim * 0.3)
    };

    scene.add(mesh);
    summonedSceneObjects.push(mesh);
}

function initVRLocomotionVisuals() {
    const ringGeo = new THREE.RingGeometry(0.12, 0.18, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({ color: 0xff0077, side: THREE.DoubleSide });
    moveTargetMarker = new THREE.Mesh(ringGeo, ringMat);
    moveTargetMarker.visible = false;
    scene.add(moveTargetMarker);
}

function initHands3D() {
    hands3D.forEach(hand => {
        const jointGeo = new THREE.SphereGeometry(0.007, 12, 12);
        const jointMat = new THREE.MeshBasicMaterial({ color: hand.color });

        for (let i = 0; i < 21; i++) {
            const joint = new THREE.Mesh(jointGeo, jointMat);
            joint.visible = false;
            scene.add(joint);
            hand.joints.push(joint);
            hand.targetJoints.push(new THREE.Vector3());
        }

        const lineGeo = new THREE.BufferGeometry();
        const positions = new Float32Array(HAND_CONNECTIONS.length * 2 * 3);
        lineGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        const lineMat = new THREE.LineBasicMaterial({ color: hand.color, linewidth: 1.5 });

        hand.lineSegments = new THREE.LineSegments(lineGeo, lineMat);
        hand.lineSegments.visible = false;
        hand.lineSegments.frustumCulled = false;

        scene.add(hand.lineSegments);
    });
}

function onFaceResults(results) {
    if (results.multiFaceLandmarks && results.multiFaceLandmarks.length > 0) {
        const nose = results.multiFaceLandmarks[0][1];
        const center = 0.5; // จุดตรงกลางจอ
        
        // ⚙️ [1. แยกความเร็วสูงสุด ซ้าย - ขวา]
        const maxSpeedLeft = 0.07;   // ความเร็วเวลาหันซ้าย
        const maxSpeedRight = 0.07;  // ความเร็วเวลาหันขวา

        // ⚙️ [2. แยกระยะ Deadzone (ระยะเอียงหัวก่อนจะเริ่มหมุน) ซ้าย - ขวา]
        const deadzoneLeft = 0.007;  // เอียงซ้ายแค่ไหนถึงเริ่มหมุน
        const deadzoneRight = 0.007; // เอียงขวาแค่ไหนถึงเริ่มหมุน

        const maxOffset = 0.07; // ระยะเอียงสุดกรอบ
        const offset = nose.x - center;

        // 🔄 สลับทิศทางหมุน (ถ้ากล้องกลับข้างให้เปลี่ยนเป็น true)
        const invertDirection = false; 

        // 📌 [3. แยกการคำนวณฝั่งซ้าย และ ฝั่งขวา]
        if (offset < -deadzoneLeft) {
            // --- คำนวณฝั่งซ้าย ---
            const absOffset = Math.abs(offset);
            const normalized = Math.min((absOffset - deadzoneLeft) / (maxOffset - deadzoneLeft), 1.0);
            
            // คำนวณความเร็วซ้าย
            targetYawSpeed = -normalized * maxSpeedLeft; 

        } else if (offset > deadzoneRight) {
            // --- คำนวณฝั่งขวา ---
            const absOffset = Math.abs(offset);
            const normalized = Math.min((absOffset - deadzoneRight) / (maxOffset - deadzoneRight), 1.0);
            
            // คำนวณความเร็วขวา
            targetYawSpeed = normalized * maxSpeedRight; 

        } else {
            // อยู่ในระยะตรงกลาง (หยุดหมุน)
            targetYawSpeed = 0;
        }

        // กรณีกลับทิศทางกล้อง
        if (invertDirection) {
            targetYawSpeed *= -1;
        }

        // --- ระบบล็อกหมุนมุมกล้องตามตำแหน่งหัว (ปรับให้ใช้ความเร็วปกติ 1.0 เสมอ) ---
        const rotDamp = 1.0; 
        const rawY = (nose.x - 0.5) * 4.0 * rotDamp; 
        const rawX = -(nose.y - 0.5) * 2.5 * rotDamp; 

        targetCamRotY += (rawY - targetCamRotY) * 0.2;
        targetCamRotX += (rawX - targetCamRotX) * 0.2;
    } else {
        targetYawSpeed = 0;
    }
}

function detectGesture(targetJoints) {
    const wrist = targetJoints[0];
    const isFingerExtended = (tipIdx, pipIdx) => {
        return wrist.distanceTo(targetJoints[tipIdx]) > wrist.distanceTo(targetJoints[pipIdx]);
    };

    const indexUp = isFingerExtended(8, 6);   
    const middleUp = isFingerExtended(12, 10); 
    const ringUp = isFingerExtended(16, 14);   
    const pinkyUp = isFingerExtended(20, 18);  

    if (indexUp && middleUp && ringUp && !pinkyUp) {
        return "THREE_FINGERS";
    }
    if (indexUp && middleUp && !ringUp && !pinkyUp) {
        return "TWO_FINGERS"; 
    }
    if (!indexUp && !middleUp && !ringUp && !pinkyUp) {
        return "FIST";        
    }
    return "NONE";             
}

function onHandResults(results) {
    let detectedHands = [false, false];
    let currentHoldingHand = -1;
    let currentHoldingObject = null;
    const totalYaw = playerYaw + currentCamRotY;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        results.multiHandLandmarks.forEach((landmarks, i) => {
            const handednessInfo = results.multiHandedness ? results.multiHandedness[i] : null;
            const label = handednessInfo ? handednessInfo.label : "Right";

            const handIdx = (label === "Left") ? 0 : 1; 

            if (detectedHands[handIdx]) return;
            detectedHands[handIdx] = true;
            handLostBuffer[handIdx] = 0; 

            const hand = hands3D[handIdx];
            hand.visible = true;

            const wrist = landmarks[0];

            const palmSize = Math.hypot(landmarks[9].x - wrist.x, landmarks[9].y - wrist.y);
            const minPalm = 0.07; 
            const maxPalm = 0.28; 

            let targetReach = Math.min(Math.max((palmSize - minPalm) / (maxPalm - minPalm), 0), 1.0);
            
            smoothReach[handIdx] += (targetReach - smoothReach[handIdx]) * 0.25;
            const reachFactor = smoothReach[handIdx] * smoothReach[handIdx] * (3 - 2 * smoothReach[handIdx]);

            const maxArmReach = 1.25;
            const localWristZ = -0.30 - (reachFactor * maxArmReach);

            const screenX = (0.5 - wrist.x);
            const screenY = -(wrist.y - 0.5);

            const localWristX = screenX * (2.0 + reachFactor * 1.0); 
            const localWristY = screenY * (1.8 + reachFactor * 0.6) + 0.82 - (reachFactor * 0.10);

            landmarks.forEach((pt, j) => {
                const relX = (wrist.x - pt.x) * 1.8;
                const relY = -(pt.y - wrist.y) * 1.4;
                const relZ = (pt.z - wrist.z) * 1.8;

                const localPt = new THREE.Vector3(
                    localWristX + relX,
                    localWristY + relY,
                    localWristZ + relZ
                );

                localPt.applyAxisAngle(new THREE.Vector3(0, 1, 0), totalYaw);
                hand.targetJoints[j].copy(playerPos).add(localPt);
            });

            const thumbTarget = hand.targetJoints[4];
            const indexTarget = hand.targetJoints[8];
            const pinchDist = thumbTarget.distanceTo(indexTarget);
            const pinchCenter = new THREE.Vector3().addVectors(thumbTarget, indexTarget).multiplyScalar(0.5);

            const PINCH_ON_DIST = 0.045; 
            const PINCH_OFF_DIST = (grabbedHandIndex === handIdx) ? 0.110 : 0.085;

            if (isHandPinching[handIdx]) {
                if (pinchDist > PINCH_OFF_DIST) {
                    isHandPinching[handIdx] = false;
                }
            } else {
                if (pinchDist < PINCH_ON_DIST) {
                    isHandPinching[handIdx] = true;
                }
            }

            const OBJECT_GRAB_RADIUS = 0.15;

            if (grabbedHandIndex === handIdx) {
                if (isHandPinching[handIdx]) {
                    currentHoldingHand = handIdx;
                    if (grabbedSummonedObject) {
                        currentHoldingObject = grabbedSummonedObject;
                        currentHoldingObject.position.copy(pinchCenter);
                        greenHandAuraRing.position.set(pinchCenter.x, pinchCenter.y - 0.08, pinchCenter.z);
                    } else {
                        targetCubePos.copy(pinchCenter);
                    }
                } else {
                    currentHoldingHand = -1;
                    currentHoldingObject = null;
                }
            } 
            else if (grabbedHandIndex === -1) {
                if (isHandPinching[handIdx]) { 
                    if (handIdx === 0) {
                        for (let obj of summonedSceneObjects) {
                            const objBox = new THREE.Box3().setFromObject(obj);
                            const objCenter = new THREE.Vector3();
                            objBox.getCenter(objCenter);

                            const currentGrabRadius = obj.userData.grabRadius || 0.18;

                            if (pinchCenter.distanceTo(objCenter) < currentGrabRadius) {
                                currentHoldingHand = 0;
                                currentHoldingObject = obj;
                                obj.position.copy(pinchCenter);
                                greenHandAuraRing.position.set(pinchCenter.x, pinchCenter.y - 0.08, pinchCenter.z);
                                greenHandAuraRing.visible = true;
                                break;
                            }
                        }
                    }

                    if (currentHoldingHand === -1 && pinchCenter.distanceTo(targetCube.position) < OBJECT_GRAB_RADIUS) {
                        currentHoldingHand = handIdx;
                        targetCubePos.copy(pinchCenter);
                    }
                }
            }
        });
    }

    hands3D.forEach((hand, idx) => {
        if (!detectedHands[idx]) {
            if (grabbedHandIndex === idx && handLostBuffer[idx] < 12) {
                handLostBuffer[idx]++;
                hand.visible = true; 
                currentHoldingHand = idx; 
                if (grabbedSummonedObject) currentHoldingObject = grabbedSummonedObject;
            } else {
                hand.visible = false;
            }
        }
    });

    grabbedHandIndex = currentHoldingHand;
    grabbedSummonedObject = currentHoldingObject;

    if (!grabbedSummonedObject && pendingSummonItem === null && greenHandAuraRing) {
        greenHandAuraRing.visible = false;
    }

    const greenHand = hands3D[0];
    const pinkHand = hands3D[1]; 
    const now = Date.now();

    if (greenHand.visible && pendingSummonItem !== null && !isMenuOpen) {
        const greenPalmPos = greenHand.targetJoints[9];
        greenHandAuraRing.position.copy(greenPalmPos);
        greenHandAuraRing.visible = true;

        if (previewObject) {
            previewObject.position.copy(greenPalmPos);
            previewObject.visible = true;
        }

        const greenGesture = detectGesture(greenHand.targetJoints);
        if (greenGesture === "FIST") {
            spawnSummonedModel(pendingSummonItem, greenHandAuraRing.position.clone());
            pendingSummonItem = null;
        }
    } else {
        if (previewObject) previewObject.visible = false;
    }

    if (pinkHand.visible) {
        const pinkGesture = detectGesture(pinkHand.targetJoints);

        if (pinkGesture === "THREE_FINGERS") {
            const currentWristY = pinkHand.targetJoints[0].y;

            if (pinkSwipeStartY === null) {
                pinkSwipeStartY = currentWristY;
                pinkSwipeStartTime = now;
            } else {
                const swipeDistance = pinkSwipeStartY - currentWristY; 
                const swipeDuration = now - pinkSwipeStartTime;

                if (swipeDistance > 0.12 && swipeDuration < 700) {
                    if (now - lastMenuToggleTime > 600) {
                        isMenuOpen = !isMenuOpen;
                        menuMesh.visible = isMenuOpen;
                        
                        currentMenuPage = "MAIN"; 

                        if (!isMenuOpen) {
                            if (menuCursorMesh) menuCursorMesh.visible = false;
                        } else {
                            updateMenuTexture(0);
                        }
                        lastMenuToggleTime = now;
                    }
                    pinkSwipeStartY = null;
                } else if (swipeDuration >= 700 || swipeDistance < -0.04) {
                    pinkSwipeStartY = currentWristY;
                    pinkSwipeStartTime = now;
                }
            }
        } else {
            pinkSwipeStartY = null;
        }
    } else {
        pinkSwipeStartY = null;
    }

    if (isMenuOpen) {
        const camDir = new THREE.Vector3();
        camera.getWorldDirection(camDir);
        menuMesh.position.copy(camera.position).addScaledVector(camDir, 0.75);
        menuMesh.rotation.copy(camera.rotation);
    }

    if (isMenuOpen && greenHand.visible) {
        const greenIndexTip = greenHand.targetJoints[8]; 
        const localPoint = greenIndexTip.clone();
        menuMesh.worldToLocal(localPoint);

        if (Math.abs(localPoint.z) < 0.08) {
            const u = (localPoint.x + 0.21) / 0.42;
            const v = (0.21 - localPoint.y) / 0.42;

            if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
                const canvasX = u * 512;
                const canvasY = v * 512;

                menuCursorMesh.position.copy(greenIndexTip);
                menuCursorMesh.rotation.copy(menuMesh.rotation);
                menuCursorMesh.visible = true;

                let hoveredBtn = 0;

                if (currentMenuPage === "MAIN") {
                    if (canvasX >= 32 && canvasX <= 480) {
                        if (canvasY >= 95 && canvasY <= 180) hoveredBtn = 1;
                        else if (canvasY >= 195 && canvasY <= 280) hoveredBtn = 2; 
                        else if (canvasY >= 295 && canvasY <= 380) hoveredBtn = 3;
                        else if (canvasY >= 395 && canvasY <= 470) hoveredBtn = 4; 
                    }
                } else if (currentMenuPage === "CATEGORIES") {
                    if (canvasX >= 32 && canvasX <= 480 && canvasY >= 100 && canvasY <= 170) hoveredBtn = 1;
                    else if (canvasX >= 32 && canvasX <= 480 && canvasY >= 185 && canvasY <= 255) hoveredBtn = 2;
                    else if (canvasX >= 32 && canvasX <= 480 && canvasY >= 270 && canvasY <= 340) hoveredBtn = 3;
                    else if (canvasX >= 32 && canvasX <= 247 && canvasY >= 370 && canvasY <= 450) hoveredBtn = 4; 
                    else if (canvasX >= 265 && canvasX <= 480 && canvasY >= 370 && canvasY <= 450) hoveredBtn = 5; 
                } else if (currentMenuPage === "ITEMS") {
                    if (canvasX >= 32 && canvasX <= 480 && canvasY >= 100 && canvasY <= 170) hoveredBtn = 1;
                    else if (canvasX >= 32 && canvasX <= 480 && canvasY >= 185 && canvasY <= 255) hoveredBtn = 2;
                    else if (canvasX >= 32 && canvasX <= 480 && canvasY >= 270 && canvasY <= 340) hoveredBtn = 3;
                    else if (canvasX >= 32 && canvasX <= 247 && canvasY >= 370 && canvasY <= 450) hoveredBtn = 4; 
                    else if (canvasX >= 265 && canvasX <= 480 && canvasY >= 370 && canvasY <= 450) hoveredBtn = 5; 
                }

                const isPushing = (hoveredBtn > 0 && Math.abs(localPoint.z) < 0.035);

                if (isPushing) {
                    if (!isFingerPressed && (now - lastButtonClickTime > BUTTON_COOLDOWN)) {
                        isFingerPressed = true; 
                        lastButtonClickTime = now; 

                        if (currentMenuPage === "MAIN") {
                            if (hoveredBtn === 1) isMoveEnabled = !isMoveEnabled;
                            else if (hoveredBtn === 2) currentMenuPage = "CATEGORIES";
                            else if (hoveredBtn === 3) {
                                playerPos.set(0, 0, 0); targetPlayerPos.set(0, 0, 0); playerYaw = 0;
                            } else if (hoveredBtn === 4) {
                                isMenuOpen = false; menuMesh.visible = false; menuCursorMesh.visible = false;
                            }
                        } else if (currentMenuPage === "CATEGORIES") {
                            if (hoveredBtn >= 1 && hoveredBtn <= 3) {
                                selectedCategoryIndex = hoveredBtn - 1;
                                currentMenuPage = "ITEMS";
                            } else if (hoveredBtn === 4) currentMenuPage = "MAIN";
                            else if (hoveredBtn === 5) {
                                isMenuOpen = false; menuMesh.visible = false; menuCursorMesh.visible = false;
                            }
                        } else if (currentMenuPage === "ITEMS") {
                            if (hoveredBtn >= 1 && hoveredBtn <= 3) {
                                const selectedItem = SUMMON_DATA[selectedCategoryIndex].items[hoveredBtn - 1];
                                pendingSummonItem = selectedItem;
                                createPreviewModel(selectedItem); 
                                isMenuOpen = false; menuMesh.visible = false; menuCursorMesh.visible = false;
                            } else if (hoveredBtn === 4) currentMenuPage = "CATEGORIES";
                            else if (hoveredBtn === 5) {
                                isMenuOpen = false; menuMesh.visible = false; menuCursorMesh.visible = false;
                            }
                        }

                        if (isMenuOpen) updateMenuTexture(hoveredBtn);
                    }
                } else {
                    isFingerPressed = false;
                }
            } else {
                menuCursorMesh.visible = false;
                isFingerPressed = false;
            }
        } else {
            menuCursorMesh.visible = false;
            isFingerPressed = false;
        }
    } else {
        if (menuCursorMesh) menuCursorMesh.visible = false;
        isFingerPressed = false;
    }

    if (pinkHand.visible && isMoveEnabled && !isMenuOpen) {
        const pinkGesture = detectGesture(pinkHand.targetJoints);

        if (pinkGesture === "TWO_FINGERS") {
            const wrist = pinkHand.targetJoints[0];
            const j8 = pinkHand.targetJoints[8];

            let dirWorld = new THREE.Vector3().subVectors(j8, wrist).normalize();

            if (dirWorld.y > -0.15) {
                dirWorld.y = -0.15;
                dirWorld.normalize();
            }

            if (dirWorld.y < 0) {
                const origin = j8.clone();
                const t = -origin.y / dirWorld.y;
                let rawTarget = origin.clone().addScaledVector(dirWorld, t);

                const dx = rawTarget.x - playerPos.x;
                const dz = rawTarget.z - playerPos.z;
                const distFromPlayer = Math.hypot(dx, dz);

                const MIN_MOVE_DIST = 0.4;
                const MAX_MOVE_DIST = 2.8; 
                const clampedDist = Math.min(Math.max(distFromPlayer, MIN_MOVE_DIST), MAX_MOVE_DIST);

                if (distFromPlayer > 0.001) {
                    moveTargetPoint.set(
                        playerPos.x + (dx / distFromPlayer) * clampedDist,
                        0.01,
                        playerPos.z + (dz / distFromPlayer) * clampedDist
                    );
                } else {
                    moveTargetPoint.set(rawTarget.x, 0.01, rawTarget.z);
                }

                if (!moveTargetMarker.visible) {
                    moveTargetMarker.position.copy(moveTargetPoint);
                } else {
                    moveTargetMarker.position.lerp(moveTargetPoint, 0.35);
                }
                moveTargetMarker.visible = true;

                lastAimPoint = moveTargetPoint.clone();
                targetPlayerPos.copy(playerPos);

                gameStatus.innerText = "🎯 เล็งเป้าหมายอยู่ | กำมือเพื่อพุ่งตัวไป!";
                gameStatus.style.color = "#ff0077";
            }
        } else if (pinkGesture === "FIST") {
            if (lastAimPoint) {
                targetPlayerPos.set(lastAimPoint.x, playerPos.y, lastAimPoint.z);

                if (playerPos.distanceTo(targetPlayerPos) < 0.2) {
                    moveTargetMarker.visible = false;
                    lastAimPoint = null;
                } else {
                    moveTargetMarker.position.set(lastAimPoint.x, 0.01, lastAimPoint.z);
                    moveTargetMarker.visible = true;
                }

                gameStatus.innerText = "⚡ พุ่งตัวไปยังเป้าหมาย!";
                gameStatus.style.color = "#00ff88";
            }
        } else {
            resetMoveVisuals();
            updateDefaultStatus();
        }
    } else {
        resetMoveVisuals();
        updateDefaultStatus();
    }
}

function resetMoveVisuals() {
    lastAimPoint = null;
    targetPlayerPos.copy(playerPos);
    if (moveTargetMarker) moveTargetMarker.visible = false;
}

function updateDefaultStatus() {
    if (pendingSummonItem !== null) {
        gameStatus.innerText = `🟢 โมเดลพรีวิวตามมือเขียว | กำมือเขียว ✊ เพื่อวาง: [${pendingSummonItem.name}]`;
        gameStatus.style.color = "#00ff88";
    } else if (isMenuOpen) {
        gameStatus.innerText = `⚙️ MENU (${currentMenuPage}) | ใช้เฉพาะมือเขียวจิ้มปุ่มเท่านั้น`;
        gameStatus.style.color = "#00f0ff";
    } else if (grabbedHandIndex !== -1) {
        if (grabbedSummonedObject) {
            gameStatus.innerText = `🟢 มือเขียวกำลังถือโมเดล: [${grabbedSummonedObject.userData.name}]`;
            gameStatus.style.color = "#00ff88";
        } else {
            const handText = (grabbedHandIndex === 0) ? "มือสีเขียว" : "มือสีชมพู";
            targetCube.material.color.setHex(0x00ff88);
            gameStatus.innerText = `✊ ${handText} กำลังจับกล่อง!`;
            gameStatus.style.color = "#00ff88";
        }
    } else {
        targetCube.material.color.setHex(0xff0077);
        if (isMoveEnabled) {
            gameStatus.innerText = "✌️ ชู 2 นิ้ว = เล็ง | ✊ กำมือ = พุ่ง | 🤟 ชู 3 นิ้วมือชมพู + ลากลง = เปิดเมนู";
        } else {
            gameStatus.innerText = "🛑 ระบบ Move ปิดอยู่ | 🤟 ชู 3 นิ้วมือชมพู + ลากลง = เปิดเมนู";
        }
        gameStatus.style.color = isMoveEnabled ? "#ff0077" : "#ff5555";
    }
}

function animate() {
    requestAnimationFrame(animate);

    playerPos.lerp(targetPlayerPos, 0.35); 

    currentYawSpeed += (targetYawSpeed - currentYawSpeed) * 0.35;
    playerYaw += currentYawSpeed;

    currentCamRotX += (targetCamRotX - currentCamRotX) * 0.3;
    currentCamRotY += (targetCamRotY - currentCamRotY) * 0.3;
    
    camera.position.set(playerPos.x, playerPos.y + 1.2, playerPos.z);
    camera.rotation.order = 'YXZ';
    camera.rotation.set(currentCamRotX, playerYaw + currentCamRotY, 0);

    const dt = 0.016; 
    const gravity = 9.8;
    const floorY = 0.7; 

    summonedSceneObjects.forEach(obj => {
        const isHeld = (obj === grabbedSummonedObject);
        
        const targetScale = isHeld 
            ? (obj.userData.heldScale || new THREE.Vector3(0.05, 0.05, 0.05)) 
            : obj.userData.originalScale;

        if (targetScale) {
            obj.scale.lerp(targetScale, 0.2); 
        }

        if (isHeld) {
            obj.userData.vy = 0;
            return;
        }

        const dynamicBottomOffset = (obj.userData.baseBottomOffset || 0) * obj.scale.y;
        const targetGroundY = floorY + dynamicBottomOffset; 

        if (obj.position.y > targetGroundY) {
            obj.userData.vy = (obj.userData.vy || 0) - gravity * dt;
            obj.position.y += obj.userData.vy * dt;

            if (obj.position.y <= targetGroundY) {
                obj.position.y = targetGroundY;
                obj.userData.vy = 0; 
            }
        } else {
            obj.position.y = targetGroundY;
            obj.userData.vy = 0;
        }
    });

    hands3D.forEach(hand => {
        if (hand.visible) {
            const linePositions = hand.lineSegments.geometry.attributes.position.array;

            for (let i = 0; i < 21; i++) {
                hand.joints[i].position.lerp(hand.targetJoints[i], 0.35); 
                hand.joints[i].visible = true;
            }

            let idx = 0;
            HAND_CONNECTIONS.forEach(pair => {
                const p1 = hand.joints[pair[0]].position;
                const p2 = hand.joints[pair[1]].position;

                linePositions[idx++] = p1.x; linePositions[idx++] = p1.y; linePositions[idx++] = p1.z;
                linePositions[idx++] = p2.x; linePositions[idx++] = p2.y; linePositions[idx++] = p2.z;
            });

            hand.lineSegments.geometry.attributes.position.needsUpdate = true;
            hand.lineSegments.visible = true;
        } else {
            hand.joints.forEach(j => j.visible = false);
            if (hand.lineSegments) hand.lineSegments.visible = false;
        }
    });

    if (grabbedHandIndex !== -1 && !grabbedSummonedObject) {
        targetCube.position.lerp(targetCubePos, 0.25);
    }

    webcamCtx.drawImage(videoElement, 0, 0, webcamCanvas.width, webcamCanvas.height);
    renderer.render(scene, camera);
}

async function startGame() {
    overlay.style.display = 'none';
    init3DScene();

    const faceMesh = new FaceMesh({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/face_mesh/${file}`
    });
    faceMesh.setOptions({ 
        maxNumFaces: 1, 
        refineLandmarks: false, 
        minDetectionConfidence: 0.5,
        minTrackingConfidence: 0.5 
    });
    faceMesh.onResults(onFaceResults);

    const hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    hands.setOptions({ 
        maxNumHands: 2, 
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });
    hands.onResults(onHandResults);

    let isProcessing = false;

    const cameraUtils = new Camera(videoElement, {
        onFrame: async () => {
            if (videoElement.readyState >= 2 && !isProcessing) {
                isProcessing = true;
                try {
                    await faceMesh.send({ image: videoElement });
                    await hands.send({ image: videoElement });
                } catch (e) {
                    console.error("Tracking Error:", e);
                } finally {
                    isProcessing = false;
                }
            }
        },
        width: 640,
        height: 480
    });

    await cameraUtils.start();
    animate();
}

startBtn.addEventListener('click', startGame);