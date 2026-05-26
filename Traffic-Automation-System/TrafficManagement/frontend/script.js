const API = "http://127.0.0.1:5000";

const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");

canvas.width = 800;
canvas.height = 600;

let currentGreen = "north";
let latestData = null;
let isRunning = true;
let currentInterval = 150;  // Much faster default
let pollIntervalId = null;
let animationId = null;
let lastTime = 0;

// ================= DRAW ENHANCED ROAD =================
function drawRoad(){
    ctx.fillStyle = "#4a5568";
    ctx.fillRect(340, 0, 120, 600);  // Vertical thicker
    ctx.fillRect(0, 240, 800, 120);  // Horizontal thicker
    
    // Lane dividers
    ctx.strokeStyle = "#f7fafc";
    ctx.lineWidth = 3;
    ctx.setLineDash([10, 10]);
    ctx.beginPath();
    ctx.moveTo(400, 0); ctx.lineTo(400, 600);  // Center vertical
    ctx.moveTo(0, 300); ctx.lineTo(800, 300);  // Center horizontal
    ctx.stroke();
    ctx.setLineDash([]);
}

// ================= DRAW CLEARER VEHICLES =================
function drawVehicle(x, y, type, lane, progress) {
    ctx.save();
    ctx.translate(x + 12.5, y + 7.5);
    
    // Shadow
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 5;
    ctx.shadowOffsetX = 2;
    ctx.shadowOffsetY = 2;
    
    // Car body - rounded rect
    if (type === 'ambulance') {
        ctx.fillStyle = '#ff4444';
        ctx.strokeStyle = '#ff0000';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(0, 0, 25, 15, 3);
        ctx.fill();
        ctx.stroke();
        
        // Siren
        ctx.fillStyle = '#ffff00';
        ctx.beginPath();
        ctx.arc(12, -2, 3, 0, Math.PI*2);
        ctx.fill();
    } else {
        ctx.fillStyle = '#3b82f6';
        ctx.strokeStyle = '#2563eb';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(0, 0, 25, 15, 3);
        ctx.fill();
        ctx.stroke();
    }
    
    ctx.shadowColor = 'transparent';  // Reset shadow
    
    // Direction arrow
    ctx.fillStyle = 'white';
    ctx.font = '12px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    if (lane === 'north') ctx.fillText('↑', 12.5, 17);
    if (lane === 'south') ctx.fillText('↓', 12.5, -2);
    if (lane === 'east') ctx.fillText('→', 27, 7.5);
    if (lane === 'west') ctx.fillText('←', -2, 7.5);
    
    ctx.restore();
}

function drawVehiclesFromBackend(data) {
    Object.keys(data.lanes).forEach(lane => {
        let queue = data.lanes[lane];
        queue.forEach((v, index) => {
            let startX = getStartX(lane);
            let startY = getStartY(lane);
            let progress = (v.pos || 0) * 0.3;  // Much faster visual movement
            
            let x = startX;
            let y = startY;
            
            if (lane === "north") y += index * 25 + progress * 150;  // Tighter + faster
            if (lane === "south") y -= index * 25 + progress * 150;
            if (lane === "east") x -= index * 25 + progress * 150;
            if (lane === "west") x += index * 25 + progress * 150;  // Tighter + faster
            
            drawVehicle(x, y, v.type, lane, progress);
        });
    });
}

// ================= ENHANCED TRAFFIC LIGHT =================
function drawTrafficLight() {
    const colors = {
        north: {green: "#00ff88", red: "#ff4444"},
        south: {green: "#00ff88", red: "#ff4444"},
        east: {green: "#00ff88", red: "#ff4444"},
        west: {green: "#00ff88", red: "#ff4444"}
    };
    
    // North
    ctx.fillStyle = currentGreen === "north" ? colors.north.green : colors.north.red;
    ctx.shadowBlur = 8;
    ctx.shadowColor = currentGreen === "north" ? '#00ff88' : 'transparent';
    ctx.beginPath();
    ctx.arc(400, 220, 12, 0, Math.PI*2);
    ctx.fill();
    
    // South
    ctx.shadowColor = currentGreen === "south" ? '#00ff88' : 'transparent';
    ctx.fillStyle = currentGreen === "south" ? colors.south.green : colors.south.red;
    ctx.beginPath();
    ctx.arc(400, 380, 12, 0, Math.PI*2);
    ctx.fill();
    
    // East
    ctx.shadowColor = currentGreen === "east" ? '#00ff88' : 'transparent';
    ctx.fillStyle = currentGreen === "east" ? colors.east.green : colors.east.red;
    ctx.beginPath();
    ctx.arc(450, 300, 12, 0, Math.PI*2);
    ctx.fill();
    
    // West
    ctx.shadowColor = currentGreen === "west" ? '#00ff88' : 'transparent';
    ctx.fillStyle = currentGreen === "west" ? colors.west.green : colors.west.red;
    ctx.beginPath();
    ctx.arc(350, 300, 12, 0, Math.PI*2);
    ctx.fill();
    
    ctx.shadowBlur = 0;
}

// ================= INIT & CONTROLS (unchanged core logic) =================
document.addEventListener('DOMContentLoaded', function() {
    const startBtn = document.getElementById('startBtn');
    const stepBtn = document.getElementById('stepBtn');
    const cycleLightBtn = document.getElementById('cycleLightBtn');
    const speedSlider = document.getElementById('speedSlider');
    const speedValue = document.getElementById('speedValue');
    const simStatus = document.getElementById('simStatus');
    const startBtnEl = document.getElementById('startBtn');

    startBtn.addEventListener('click', toggleSim);
    stepBtn.addEventListener('click', nextStep);
    cycleLightBtn.addEventListener('click', cycleLight);
    speedSlider.addEventListener('input', function() {
        currentInterval = parseInt(speedSlider.value);
        speedValue.textContent = currentInterval + 'ms';
        if (isRunning) {
            clearInterval(pollIntervalId);
            startPolling();
        }
    });

    startPolling();
    updateState();
    loop();  // Start animation loop
});

// Toggle functions...
function toggleSim() {
    const startBtn = document.getElementById('startBtn');
    const simStatus = document.getElementById('simStatus');

    isRunning = !isRunning;
    if (isRunning) {
        startBtn.textContent = '⏸️ Pause';
        simStatus.textContent = 'Running';
        simStatus.classList.add('running');
        startPolling();
    } else {
        startBtn.textContent = '▶️ Start';
        simStatus.textContent = 'Paused';
        simStatus.classList.remove('running');
        if (pollIntervalId) clearInterval(pollIntervalId);
    }
}

function startPolling() {
    pollIntervalId = setInterval(() => {
        stepSimulation();
        updateState();
    }, currentInterval);
}

function nextStep() {
    stepSimulation();
    updateState();
}

const lightOrder = ['north', 'east', 'south', 'west'];
function cycleLight() {
    const currentIndex = lightOrder.indexOf(currentGreen);
    currentGreen = lightOrder[(currentIndex + 1) % 4];
    document.getElementById('currentGreen').textContent = currentGreen.toUpperCase();
}

function showFeedback(msg, type = 'success') {
    const feedback = document.getElementById('feedback');
    feedback.textContent = msg;
    feedback.className = `feedback ${type}`;
    setTimeout(() => feedback.textContent = '', 3000);
}

function addVehicle() {
    const type = document.getElementById("type").value;
    const lane = document.getElementById("lane").value;
    
    fetch(API + "/add_vehicle", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({type, lane})
    })
    .then(res => res.json())
    .then(() => showFeedback('Vehicle dispatched!'))
    .catch(() => showFeedback('Dispatch failed', 'error'));
}

function getStartX(lane) {
    return {north: 390, south: 390, east: 800, west: 0}[lane] || 0;
}

function getStartY(lane) {
    return {north: 0, south: 500, east: 290, west: 290}[lane] || 0;
}

function updateState() {
    fetch(API + "/state")
    .then(res => res.json())
    .then(data => {
        latestData = data;
        currentGreen = data.current_green;
        document.getElementById("currentGreen").textContent = currentGreen.toUpperCase();

        let totalCars = 0, totalAmbulances = 0;
        ['north', 'south', 'east', 'west'].forEach(l => {
            document.getElementById(l + 'Count').textContent = data.lanes[l]?.length || 0;
            (data.lanes[l] || []).forEach(v => {
                if (v.type === 'ambulance') totalAmbulances++; else totalCars++;
            });
        });
        document.getElementById("cars").textContent = totalCars;
        document.getElementById("ambulances").textContent = totalAmbulances;
    });
}

function stepSimulation() {
    fetch(API + "/step").catch(console.error);
}

function loop(currentTime) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawRoad();
    drawTrafficLight();
    if (latestData) drawVehiclesFromBackend(latestData);
    animationId = requestAnimationFrame(loop);
}

