const API = "http://127.0.0.1:8000";
const SIMULATION_TICK_INTERVAL = 1000;
const MIN_VEHICLE_SPEED = 0.25;
const DEFAULT_VEHICLE_SPEED = 1.0;
const MAX_VEHICLE_SPEED = 3.0;
const QUEUE_SPACING = 55;
const VEHICLE_POSITION_SCALE = 15;
const STOP_LINE_POSITION = 2;

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const LANE_ORDER = ['north', 'east', 'south', 'west'];
const staticLayer = document.createElement("canvas");
const staticCtx = staticLayer.getContext("2d");
const priorityRows = new Map();

function resizeCanvas() {
    const parent = canvas.parentElement;
    const width = Math.max(1, parent.clientWidth);
    const height = Math.max(1, parent.clientHeight);
    canvas.width = width;
    canvas.height = height;
    staticLayer.width = width;
    staticLayer.height = height;
    updateCenters();
    renderStaticLayer();
}
window.addEventListener('resize', resizeCanvas);

let currentGreen = "north";
let timeLeft = 20;
let isRunning = true;
let currentVehicleSpeed = DEFAULT_VEHICLE_SPEED;
let pollIntervalId = null;
let animationId = null;
let isPolling = false;

let vehiclesMap = new Map();

const ROAD_WIDTH = 120;
const LANE_WIDTH = ROAD_WIDTH / 2;
let CENTER_X = canvas.width / 2;
let CENTER_Y = canvas.height / 2;

function updateCenters() {
    CENTER_X = canvas.width / 2;
    CENTER_Y = canvas.height / 2;
}

function renderStaticLayer() {
    updateCenters();

    staticCtx.clearRect(0, 0, staticLayer.width, staticLayer.height);

    staticCtx.fillStyle = "#1e293b";
    staticCtx.fillRect(0, 0, canvas.width, canvas.height);

    staticCtx.fillStyle = "#334155";

    staticCtx.fillRect(CENTER_X - ROAD_WIDTH/2, 0, ROAD_WIDTH, canvas.height);

    staticCtx.fillRect(0, CENTER_Y - ROAD_WIDTH/2, canvas.width, ROAD_WIDTH);

    staticCtx.fillStyle = "#2a3648";
    staticCtx.fillRect(CENTER_X - ROAD_WIDTH/2, CENTER_Y - ROAD_WIDTH/2, ROAD_WIDTH, ROAD_WIDTH);

    staticCtx.strokeStyle = "#cbd5e1";
    staticCtx.lineWidth = 3;
    staticCtx.setLineDash([15, 15]);
    staticCtx.beginPath();

    staticCtx.moveTo(CENTER_X, 0); staticCtx.lineTo(CENTER_X, CENTER_Y - ROAD_WIDTH/2);

    staticCtx.moveTo(CENTER_X, CENTER_Y + ROAD_WIDTH/2); staticCtx.lineTo(CENTER_X, canvas.height);

    staticCtx.moveTo(0, CENTER_Y); staticCtx.lineTo(CENTER_X - ROAD_WIDTH/2, CENTER_Y);

    staticCtx.moveTo(CENTER_X + ROAD_WIDTH/2, CENTER_Y); staticCtx.lineTo(canvas.width, CENTER_Y);
    staticCtx.stroke();
    staticCtx.setLineDash([]);

    staticCtx.strokeStyle = "#f8fafc";
    staticCtx.lineWidth = 6;
    staticCtx.beginPath();

    staticCtx.moveTo(CENTER_X - ROAD_WIDTH/2, CENTER_Y - ROAD_WIDTH/2);
    staticCtx.lineTo(CENTER_X, CENTER_Y - ROAD_WIDTH/2);

    staticCtx.moveTo(CENTER_X, CENTER_Y + ROAD_WIDTH/2);
    staticCtx.lineTo(CENTER_X + ROAD_WIDTH/2, CENTER_Y + ROAD_WIDTH/2);

    staticCtx.moveTo(CENTER_X - ROAD_WIDTH/2, CENTER_Y);
    staticCtx.lineTo(CENTER_X - ROAD_WIDTH/2, CENTER_Y + ROAD_WIDTH/2);

    staticCtx.moveTo(CENTER_X + ROAD_WIDTH/2, CENTER_Y - ROAD_WIDTH/2);
    staticCtx.lineTo(CENTER_X + ROAD_WIDTH/2, CENTER_Y);
    staticCtx.stroke();
}

function drawEnvironment() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(staticLayer, 0, 0);
}

function drawTrafficLights() {
    const lights = [
        { lane: 'north', x: CENTER_X - ROAD_WIDTH/2 - 30, y: CENTER_Y - ROAD_WIDTH/2 - 50 },
        { lane: 'south', x: CENTER_X + ROAD_WIDTH/2 + 30, y: CENTER_Y + ROAD_WIDTH/2 + 50 },
        { lane: 'east',  x: CENTER_X + ROAD_WIDTH/2 + 50, y: CENTER_Y - ROAD_WIDTH/2 - 30 },
        { lane: 'west',  x: CENTER_X - ROAD_WIDTH/2 - 50, y: CENTER_Y + ROAD_WIDTH/2 + 30 }
    ];

    lights.forEach(l => {
        const isGreen = (currentGreen === l.lane);
        const lightColor = isGreen ? "#10b981" : "#ef4444";

        ctx.fillStyle = "#1e293b";
        ctx.strokeStyle = isGreen ? "#10b981" : "#475569";
        ctx.lineWidth = isGreen ? 2 : 1;
        ctx.fillRect(l.x - 14, l.y - 14, 28, 28);
        ctx.strokeRect(l.x - 14, l.y - 14, 28, 28);

        ctx.shadowColor = lightColor;
        ctx.shadowBlur = isGreen ? 6 : 0;
        ctx.fillStyle = lightColor;
        ctx.beginPath();
        ctx.arc(l.x, l.y, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        const label = isGreen ? String(Math.max(0, timeLeft)) : 'WAIT';
        const pillW = isGreen ? 36 : 42;
        const pillH = 20;
        const pillX = l.x - pillW / 2;
        const pillY = l.y - 14 - pillH - 6;

        ctx.fillStyle = isGreen ? 'rgba(16,185,129,0.9)' : 'rgba(239,68,68,0.75)';
        ctx.beginPath();
        ctx.roundRect(pillX, pillY, pillW, pillH, 6);
        ctx.fill();

        ctx.fillStyle = '#fff';
        ctx.font = isGreen ? 'bold 12px monospace' : '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, l.x, pillY + pillH / 2);

        ctx.fillStyle = '#94a3b8';
        ctx.font = '10px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(l.lane.toUpperCase(), l.x, l.y + 14 + 4);
    });
}

function drawVehicle(v, timestamp) {
    ctx.save();
    ctx.translate(v.currentX, v.currentY);
    ctx.rotate(v.angle);

    const length = 35;
    const width = 18;

    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.roundRect(-length/2 + 3, -width/2 + 3, length, width, 4);
    ctx.fill();

    if (v.type === 'ambulance') {

        ctx.fillStyle = '#f8fafc';
        ctx.beginPath();
        ctx.roundRect(-length/2, -width/2, length, width, 4);
        ctx.fill();

        ctx.fillStyle = '#ef4444';
        ctx.fillRect(-length/4, -3, length/2, 6);

        const isFlash = Math.floor(timestamp / 150) % 2 === 0;
        ctx.fillStyle = isFlash ? '#3b82f6' : '#ef4444';
        ctx.beginPath();
        ctx.arc(0, 0, 4, 0, Math.PI*2);
        ctx.fill();

    } else {

        ctx.fillStyle = '#3b82f6';
        ctx.beginPath();
        ctx.roundRect(-length/2, -width/2, length, width, 4);
        ctx.fill();

        ctx.fillStyle = '#1e293b';
        ctx.fillRect(length/4 - 2, -width/2 + 2, 6, width - 4);
        ctx.fillRect(-length/4 - 4, -width/2 + 2, 4, width - 4);
    }

    ctx.fillStyle = '#fbbf24';
    ctx.beginPath(); ctx.arc(length/2, -width/2 + 3, 2, 0, Math.PI*2); ctx.fill();
    ctx.beginPath(); ctx.arc(length/2, width/2 - 3, 2, 0, Math.PI*2); ctx.fill();

    ctx.restore();
}

function updateAnimatedVehiclePosition(v, timestamp) {
    const duration = Math.max(1, v.animationDuration || SIMULATION_TICK_INTERVAL);
    const progress = Math.min(
        1,
        Math.max(0, (timestamp - (v.animationStart || timestamp)) / duration)
    );

    v.currentX = v.startX + (v.targetX - v.startX) * progress;
    v.currentY = v.startY + (v.targetY - v.startY) * progress;
}

function updateVehiclesState(data) {
    const newKeys = new Set();
    const now = performance.now();
    const animationDuration = SIMULATION_TICK_INTERVAL * 1.05;

    updateCenters();

    Object.keys(data.lanes).forEach(lane => {
        let queue = data.lanes[lane];
        queue.forEach((v, index) => {
            if (!v.id) return;
            newKeys.add(v.id);

            let targetX, targetY, angle;
            const rawPos = Number(v.pos || 0);
            const laneIsGreen = lane === currentGreen;
            const hasEnteredIntersection = Boolean(
                v.entered_intersection || rawPos > STOP_LINE_POSITION
            );
            const displayPos = laneIsGreen || hasEnteredIntersection
                ? rawPos
                : Math.min(rawPos, STOP_LINE_POSITION);

            if (lane === "north") {
                targetX = CENTER_X - LANE_WIDTH / 2;
                targetY = CENTER_Y - ROAD_WIDTH/2 - 30 - (index * QUEUE_SPACING) + (displayPos * VEHICLE_POSITION_SCALE);
                angle = Math.PI / 2;
            } else if (lane === "south") {
                targetX = CENTER_X + LANE_WIDTH / 2;
                targetY = CENTER_Y + ROAD_WIDTH/2 + 30 + (index * QUEUE_SPACING) - (displayPos * VEHICLE_POSITION_SCALE);
                angle = -Math.PI / 2;
            } else if (lane === "east") {
                targetX = CENTER_X + ROAD_WIDTH/2 + 30 + (index * QUEUE_SPACING) - (displayPos * VEHICLE_POSITION_SCALE);
                targetY = CENTER_Y - LANE_WIDTH / 2;
                angle = Math.PI;
            } else if (lane === "west") {
                targetX = CENTER_X - ROAD_WIDTH/2 - 30 - (index * QUEUE_SPACING) + (displayPos * VEHICLE_POSITION_SCALE);
                targetY = CENTER_Y + LANE_WIDTH / 2;
                angle = 0;
            }

            if (!vehiclesMap.has(v.id)) {

                vehiclesMap.set(v.id, {
                    id: v.id, type: v.type, lane: lane,
                    currentX: targetX, currentY: targetY,
                    startX: targetX, startY: targetY,
                    targetX: targetX, targetY: targetY,
                    animationStart: now,
                    animationDuration: 1,
                    angle: angle
                });
            } else {

                let tracked = vehiclesMap.get(v.id);
                updateAnimatedVehiclePosition(tracked, now);
                if (
                    Math.abs(tracked.targetX - targetX) > 0.5 ||
                    Math.abs(tracked.targetY - targetY) > 0.5
                ) {
                    tracked.startX = tracked.currentX;
                    tracked.startY = tracked.currentY;
                    tracked.animationStart = now;
                    tracked.animationDuration = animationDuration;
                }
                tracked.targetX = targetX;
                tracked.targetY = targetY;
                tracked.angle = angle;
                tracked.lane = lane;
            }
        });
    });

    for (let id of vehiclesMap.keys()) {
        if (!newKeys.has(id)) {
            vehiclesMap.delete(id);
        }
    }
}

function updatePriorityPanel(priorityData = {}) {
    const priorityList = document.getElementById('priorityList');
    const priorityLeader = document.getElementById('priorityLeader');
    const priorityReason = document.getElementById('priorityReason');
    const template = document.getElementById('priorityRowTemplate');
    if (!priorityList || !priorityLeader || !priorityReason) return;

    const rows = LANE_ORDER.map(lane => {
        const priority = priorityData[lane] || {};
        return {
            lane,
            score: Number(priority.score || 0),
            vehicles: Number(priority.vehicles || 0),
            ambulances: Number(priority.ambulances || 0),
            blocked: Number(priority.blocked_ambulance_vehicles || 0),
            wait: Number(priority.wait_seconds || 0),
        };
    }).sort((a, b) => b.score - a.score);

    const leader = rows[0];
    const maxScore = Math.max(1, ...rows.map(row => row.score));
    priorityLeader.textContent = leader && leader.score > 0
        ? `${leader.lane.toUpperCase()} - ${leader.score.toFixed(1)}`
        : 'Balanced';
    priorityReason.textContent = leader && leader.score > 0
        ? getPriorityReason(leader)
        : 'No lane has waiting traffic.';

    rows.forEach((row, index) => {
        let item = priorityRows.get(row.lane);
        if (!item) {
            item = template
                ? template.content.firstElementChild.cloneNode(true)
                : document.createElement('div');
            item.dataset.lane = row.lane;
            priorityRows.set(row.lane, item);
        }

        item.classList.toggle('is-leader', index === 0 && row.score > 0);
        item.style.setProperty('--priority-fill', `${Math.round((row.score / maxScore) * 100)}%`);
        item.querySelector('.priority-rank').textContent = `#${index + 1}`;
        item.querySelector('.priority-lane').textContent = row.lane.toUpperCase();
        item.querySelector('.priority-state').textContent = row.lane === currentGreen
            ? 'GREEN'
            : index === 0 && row.score > 0
                ? 'TOP'
                : '';
        item.querySelector('.priority-score').textContent = `Score ${row.score.toFixed(1)}`;
        item.querySelector('[data-priority-value="vehicles"]').textContent = row.vehicles;
        item.querySelector('[data-priority-value="ambulances"]').textContent = row.ambulances;
        item.querySelector('[data-priority-value="blocked"]').textContent = row.blocked;
        item.querySelector('[data-priority-value="wait"]').textContent = `${Math.round(row.wait)}s`;
        item.querySelector('.priority-row-reason').textContent = getPriorityReason(row);
        priorityList.appendChild(item);
    });
}

function getPriorityReason(row) {
    if (row.score <= 0) return 'No queued vehicles.';

    const reasons = [];
    if (row.ambulances > 0) {
        reasons.push(`${row.ambulances} ambulance${row.ambulances === 1 ? '' : 's'}`);
    }
    if (row.blocked > 0) {
        reasons.push(`${row.blocked} vehicle${row.blocked === 1 ? '' : 's'} ahead of an ambulance`);
    }
    if (row.vehicles > 0) {
        reasons.push(`${row.vehicles} total vehicle${row.vehicles === 1 ? '' : 's'}`);
    }
    if (row.wait > 0) {
        reasons.push(`${Math.round(row.wait)}s waiting`);
    }

    return reasons.join(' + ');
}

function loop(timestamp) {
    drawEnvironment();
    drawTrafficLights();

    vehiclesMap.forEach(v => {
        updateAnimatedVehiclePosition(v, timestamp);
        drawVehicle(v, timestamp);
    });

    animationId = requestAnimationFrame(loop);
}

function fetchState() {
    return fetch(API + "/state")
    .then(res => res.json())
    .then(data => {
        currentGreen = data.current_green;
        const greenDuration = Number(data.green_duration ?? 0);
        const greenTimer = Number(data.green_timer ?? 0);
        const remainingTicks = Math.max(0, greenDuration - greenTimer);
        timeLeft = Math.ceil(remainingTicks);
        document.getElementById("currentGreen").textContent = currentGreen.toUpperCase();
        const timerText = Math.max(0, timeLeft) + 's';
        document.getElementById("timeLeft").textContent = timerText;
        const sidebarTimer = document.getElementById("timeLeft-sidebar");
        if (sidebarTimer) sidebarTimer.textContent = timerText;

        let totalCars = 0, totalAmbulances = 0;
        LANE_ORDER.forEach(l => {
            const count = data.lanes[l]?.length || 0;
            document.getElementById(l + 'Count').textContent = count;
            (data.lanes[l] || []).forEach(v => {
                if (v.type === 'ambulance') totalAmbulances++; else totalCars++;
            });
        });
        document.getElementById("cars").textContent = totalCars;
        document.getElementById("ambulances").textContent = totalAmbulances;
        updatePriorityPanel(data.lane_priorities);

        updateVehiclesState(data);
    })
    .catch(err => console.error("Error fetching state:", err));
}

function stepSimulation(force = false) {
    const params = new URLSearchParams({
        interval_ms: String(SIMULATION_TICK_INTERVAL),
        vehicle_speed: String(currentVehicleSpeed),
    });
    if (force) params.set("force", "1");

    return fetch(API + "/step?" + params.toString()).catch(console.error);
}

async function runSimulationTick() {
    if (!isRunning || isPolling) {
        scheduleNextTick();
        return;
    }

    isPolling = true;
    try {
        await stepSimulation();
        await fetchState();
    } finally {
        isPolling = false;
        scheduleNextTick();
    }
}

function scheduleNextTick() {
    if (pollIntervalId) clearTimeout(pollIntervalId);
    pollIntervalId = setTimeout(runSimulationTick, SIMULATION_TICK_INTERVAL);
}

function startPolling() {
    scheduleNextTick();
}

function toggleSim() {
    const startBtn = document.getElementById('startBtn');
    const simStatus = document.getElementById('simStatus');

    isRunning = !isRunning;
    if (isRunning) {
        startBtn.textContent = '⏸ Pause';
        startBtn.classList.replace('btn-warning', 'btn-primary');
        simStatus.textContent = 'Running';
        simStatus.className = 'value status-running';
    } else {
        startBtn.textContent = '▶ Start';
        startBtn.classList.replace('btn-primary', 'btn-warning');
        simStatus.textContent = 'Paused';
        simStatus.className = 'value status-paused';
    }
}

async function nextStep() {
    if (isPolling) return;

    isPolling = true;
    try {
        await stepSimulation(true);
        await fetchState();
    } finally {
        isPolling = false;
    }
}

const lightOrder = LANE_ORDER;
function cycleLight() {
    const currentIndex = lightOrder.indexOf(currentGreen);
    currentGreen = lightOrder[(currentIndex + 1) % 4];
    document.getElementById('currentGreen').textContent = currentGreen.toUpperCase();
}

function showFeedback(msg, type = 'success') {
    const feedback = document.getElementById('feedback');
    feedback.textContent = msg;
    feedback.className = `feedback ${type}`;
    setTimeout(() => feedback.className = 'feedback', 3000);
}

window.addVehicle = function() {
    const type = document.getElementById("type").value;
    const lane = document.getElementById("lane").value;

    fetch(API + "/add_vehicle", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({type, lane})
    })
    .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
    })
    .then(data => {
        if (data.error) throw new Error(data.error);
        showFeedback('✅ Vehicle dispatched!');
        fetchState();
    })
    .catch(err => {
        console.error("Dispatch error:", err);
        showFeedback('❌ Dispatch failed: ' + err.message, 'error');
    });
}

function updateClock() {
    const now = new Date();
    document.getElementById('currentTime').textContent = now.toLocaleTimeString();
}
setInterval(updateClock, 1000);
updateClock();

document.addEventListener('DOMContentLoaded', function() {
    resizeCanvas();
    document.getElementById('startBtn').addEventListener('click', toggleSim);
    document.getElementById('stepBtn').addEventListener('click', nextStep);
    document.getElementById('cycleLightBtn').addEventListener('click', cycleLight);

    const speedSlider = document.getElementById('speedSlider');
    speedSlider.addEventListener('input', function() {
        currentVehicleSpeed = Math.max(
            MIN_VEHICLE_SPEED,
            Math.min(
                parseFloat(speedSlider.value) || DEFAULT_VEHICLE_SPEED,
                MAX_VEHICLE_SPEED
            )
        );
        speedSlider.value = currentVehicleSpeed;
        document.getElementById('speedValue').textContent = currentVehicleSpeed.toFixed(1) + 'x';
    });

    fetchState();
    startPolling();
    requestAnimationFrame(loop);
});
