# Traffic Automation System

## Structure

```text
TrafficManagement/
  backend/
    app.py
    repository.py
    models/
      intersection.py
      vehicle.py
    utils/
      scheduler.py
  frontend/
    index.html
    script.js
    style.css
```

## Run

```bash
cd TrafficManagement/backend
python3 -B app.py
```

```bash
cd TrafficManagement/frontend
python3 -m http.server 8080
```

Open `http://127.0.0.1:8080/`.
