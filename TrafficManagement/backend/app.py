import socket
import time

from flask import Flask, request, jsonify
from flask_cors import CORS

from models.vehicle import Vehicle
from models.intersection import Intersection

from repository import VehicleRepository, IntersectionRepository, save_to_file

from utils.scheduler import run_simulation

app = Flask(__name__)
CORS(app)

vehicle_repo = VehicleRepository()
intersection_repo = IntersectionRepository()

intersection = Intersection("A1", vehicle_repo=vehicle_repo)
intersection_repo.add(intersection)
last_step_at = 0.0

DEFAULT_STEP_INTERVAL_MS = 1000
MIN_STEP_INTERVAL_MS = 1000
MAX_STEP_INTERVAL_MS = 1000
MIN_VEHICLE_SPEED = 0.25
MAX_VEHICLE_SPEED = 3.0
STEP_INTERVAL_TOLERANCE_SECONDS = 0.15

def get_intersection_timer_state(stepped=False):
    return {
        "current_green": intersection.current_green,
        "green_timer": intersection.green_timer,
        "green_duration": intersection.green_duration,
        "lane_priorities": intersection.lane_priorities(),
        "switch_reason": intersection.last_switch_reason,
        "stepped": stepped,
    }

@app.route('/')
def home():
    return jsonify({
        "message": "Traffic Management API Running 🚦",
        "repositories": {
            "vehicles": vehicle_repo.size(),
            "intersections": intersection_repo.size(),
        }
    })

@app.route('/add_vehicle', methods=['POST'])
def add_vehicle():
    try:
        data = request.get_json()

        if not data or "type" not in data or "lane" not in data:
            return jsonify({"error": "Invalid data"}), 400

        v_type = data["type"]
        lane = data["lane"]

        valid_types = ["car", "ambulance"]
        if v_type not in valid_types or lane not in VehicleRepository.VALID_LANES:
            return jsonify({"error": "Invalid type or lane"}), 400

        v = Vehicle(
            v_type=v_type,
            lane=lane,
            destination=data.get("destination")
        )

        vehicle_id = intersection.add_vehicle(v)

        return jsonify({
            "status": "Vehicle added successfully",
            "vehicle_id": vehicle_id
        })

    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/state', methods=['GET'])
def state():
    try:
        return jsonify(intersection.get_state())
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/step', methods=['GET'])
def step():
    try:
        global last_step_at

        interval_ms = request.args.get(
            "interval_ms",
            default=DEFAULT_STEP_INTERVAL_MS,
            type=int,
        )
        interval_ms = max(
            MIN_STEP_INTERVAL_MS,
            min(interval_ms, MAX_STEP_INTERVAL_MS),
        )
        vehicle_speed = request.args.get("vehicle_speed", default=1.0, type=float)
        vehicle_speed = max(
            MIN_VEHICLE_SPEED,
            min(vehicle_speed, MAX_VEHICLE_SPEED),
        )
        force = request.args.get("force") == "1"
        now = time.monotonic()

        due_after = max(
            0.25,
            interval_ms / 1000 - STEP_INTERVAL_TOLERANCE_SECONDS,
        )
        if force or now - last_step_at >= due_after:
            last_step_at = now
            result = run_simulation(intersection, vehicle_speed=vehicle_speed)
            result["stepped"] = True
            return jsonify(result)

        return jsonify(get_intersection_timer_state(stepped=False))
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

@app.route('/repo/stats', methods=['GET'])
def repo_stats():
    try:
        stats = {
            "total_vehicles": vehicle_repo.size(),
            "lanes": {
                lane: vehicle_repo.lane_size(lane)
                for lane in VehicleRepository.VALID_LANES
            },
            "index_size": len(vehicle_repo._index),
            "intersections": intersection_repo.size(),
        }
        return jsonify(stats)
    except Exception as e:
        return jsonify({"error": str(e)}), 500

@app.route('/repo/save', methods=['POST'])
def save_state():
    try:
        save_to_file(vehicle_repo, "data/vehicle_snapshot.json")
        return jsonify({"status": "State saved to data/vehicle_snapshot.json"})
    except Exception as e:
        return jsonify({"error": str(e)}), 500

def choose_port(candidates=(8000, 8002)):
    for port in candidates:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as sock:
            try:
                sock.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise OSError(f"No available ports in {candidates}")

if __name__ == '__main__':
    port = choose_port()
    print(f"Starting Traffic Management API on http://127.0.0.1:{port}")
    app.run(host="127.0.0.1", port=port, debug=True, use_reloader=False)
