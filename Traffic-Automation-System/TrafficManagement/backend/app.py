from flask import Flask, request, jsonify
from flask_cors import CORS

# Import your modules
from models.vehicle import Vehicle
from models.intersection import Intersection
from utils.scheduler import run_simulation

# Initialize app
app = Flask(__name__)
CORS(app)

# Create global intersection object
intersection = Intersection("A1")


# -------------------- ROUTES --------------------

@app.route('/')
def home():
    return jsonify({
        "message": "Traffic Management API Running 🚦"
    })


@app.route('/add_vehicle', methods=['POST'])
def add_vehicle():
    try:
        data = request.get_json()

        # Validation
        if not data or "type" not in data or "lane" not in data:
            return jsonify({"error": "Invalid data"}), 400

        v_type = data["type"]
        lane = data["lane"]

        # Validation for valid types and lanes
        valid_types = ["car", "ambulance"]
        valid_lanes = ["north", "south", "east", "west"]
        if v_type not in valid_types or lane not in valid_lanes:
            return jsonify({"error": "Invalid type or lane"}), 400

        v = Vehicle(
            v_type=v_type,
            lane=lane,
            destination=data.get("destination")
        )

        intersection.add_vehicle(v)

        return jsonify({
            "status": "Vehicle added successfully",
            "vehicle_id": v.id
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
        result = run_simulation(intersection)
        return jsonify(result)
    except Exception as e:
        return jsonify({
            "error": str(e)
        }), 500

if __name__ == '__main__':
    app.run(debug=True)