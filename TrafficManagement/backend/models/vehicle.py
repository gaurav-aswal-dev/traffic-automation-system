import uuid

class Vehicle:
    def __init__(self, v_type, lane, destination=None):
        self.id = str(uuid.uuid4())
        self.type = v_type
        self.lane = lane
        self.destination = destination
        self.position = 0
