from collections import deque

class Lane:
    def __init__(self,name):
        self.name = name
        self.queue = deque()

    def add_vehicle(self,vehicle):
        self.queue.append(vehicle)
    
    def remove_vehicle(self):
        if self.queue:
            return self.queue.popleft()
        return None

    def size(self):
        return len(self.queue)
    
    def has_ambulance(self):
        return any(v.type == "ambulance" for v in self.queue)
    
    