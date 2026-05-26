class Vehicle:
    def __init__(self,v_type,lane,destination=None):
        self.type = v_type
        self.lane = lane
        self.destination = destination
        self.position = 0