from models.lane import Lane
from collections import deque

class Intersection:

    def __init__(self,name):
        self.name = name
        self.lanes = {
                        "north":Lane("north"),
                        "south":Lane("south"),
                        "east" :Lane("east"),
                        "west" :Lane("west")
                     }
        self.current_green = "north"

    def add_vehicle(self,vehicle):
        self.lanes[vehicle.lane].add_vehicle(vehicle)

    def select_next_lane(self):
        # Priority to ambulance lanes
        for lane in self.lanes.values():
            if lane.has_ambulance():
                return lane.name
        
        # Otherwise longest queue
        return max(self.lanes.values(),key=lambda l:l.size()).name
    
    def step(self):
        current_green_lane = self.lanes[self.current_green]
        has_ambulance_green = current_green_lane.has_ambulance()
        
        # BOOST green lane movement (chain reaction)
        for i in range(len(current_green_lane.queue)-1, -1, -1):  # Reverse to propagate
            vehicle = current_green_lane.queue[i]
            
            # Front vehicles faster
            if i == 0:
                vehicle.position += 3 if vehicle.type == "ambulance" else 2
            else:
                # Followers move if space ahead
                ahead_vehicle = current_green_lane.queue[i-1] if i > 0 else None
                if ahead_vehicle is None or vehicle.position + 1 < ahead_vehicle.position - 5:
                    vehicle.position += 1.5 if has_ambulance_green else 1
        
        # POP completed vehicles (multiple)
        completed = []
        for vehicle in current_green_lane.queue:
            if vehicle.position > 25:
                completed.append(vehicle)
        for vehicle in completed:
            current_green_lane.queue.remove(vehicle)
        
        # Non-green lanes slow creep (keep traffic flowing)
        for lane_name, lane in self.lanes.items():
            if lane_name != self.current_green and lane.size() > 0:
                front_vehicle = lane.queue[0]
                front_vehicle.position += 0.5  # Slow but steady
        
        # Next green
        self.current_green = self.select_next_lane()
        
        return {
            "current_green": self.current_green
        }

    def get_state(self):
        return {
            "lanes":{
                name:[
                    {"type": v.type, "pos":v.position}
                    for v in lane.queue
                ]
                for name, lane in self.lanes.items()
            },
            "current_green":self.current_green
        }

