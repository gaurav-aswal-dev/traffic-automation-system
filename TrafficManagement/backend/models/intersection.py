import math

from repository import VehicleRepository

class Intersection:
    CLOCKWISE_LANES = ("north", "east", "south", "west")
    MIN_GREEN_DURATION = 5
    MAX_GREEN_DURATION = 35
    BASE_GREEN_DURATION = 4
    CAR_GREEN_SECONDS = 1.6
    AMBULANCE_GREEN_SECONDS = 6
    BLOCKED_AMBULANCE_SECONDS = 2

    CAR_WEIGHT = 1
    AMBULANCE_WEIGHT = 10
    BLOCKED_AMBULANCE_WEIGHT = 3
    WAIT_WEIGHT_PER_SECOND = 0.4
    EMERGENCY_PREEMPT_MARGIN = 5

    AMBULANCE_BOOST_SPEED = 3
    CAR_SPEED = 2
    FOLLOWER_SPEED = 1
    FOLLOWER_AMBULANCE_BOOST = 1.5
    STOP_LINE_POSITION = 2
    EXIT_THRESHOLD = 25

    def __init__(self, name, vehicle_repo=None):
        self.name = name
        self.current_green = "north"
        self.green_timer = 0
        self.green_duration = self.MIN_GREEN_DURATION
        self.last_switch_reason = "initial"
        self.lane_wait_seconds = {
            lane: 0 for lane in self.CLOCKWISE_LANES
        }

        self.vehicle_repo: VehicleRepository = vehicle_repo or VehicleRepository()

    def add_vehicle(self, vehicle):
        vehicle_id = self.vehicle_repo.add(vehicle)
        if vehicle.lane == self.current_green:
            self.green_duration = max(
                self.green_duration,
                self.calculate_green_duration(self.current_green),
            )
        return vehicle_id

    def lane_priority(self, lane_name):
        queue = list(self.vehicle_repo.list_by_lane(lane_name))
        vehicle_count = len(queue)
        ambulance_positions = [
            index
            for index, vehicle in enumerate(queue)
            if vehicle.type == "ambulance"
        ]
        ambulance_count = len(ambulance_positions)
        blocked_vehicle_count = ambulance_positions[0] if ambulance_positions else 0
        wait_seconds = self.lane_wait_seconds.get(lane_name, 0)

        score = (
            vehicle_count * self.CAR_WEIGHT
            + ambulance_count * self.AMBULANCE_WEIGHT
            + blocked_vehicle_count * self.BLOCKED_AMBULANCE_WEIGHT
            + wait_seconds * self.WAIT_WEIGHT_PER_SECOND
        )

        return {
            "vehicles": vehicle_count,
            "ambulances": ambulance_count,
            "blocked_ambulance_vehicles": blocked_vehicle_count,
            "wait_seconds": wait_seconds,
            "score": round(score, 2),
        }

    def lane_priorities(self):
        return {
            lane_name: self.lane_priority(lane_name)
            for lane_name in self.CLOCKWISE_LANES
        }

    def calculate_green_duration(self, lane_name):
        priority = self.lane_priority(lane_name)
        if priority["vehicles"] == 0:
            return self.MIN_GREEN_DURATION

        duration = (
            self.BASE_GREEN_DURATION
            + priority["vehicles"] * self.CAR_GREEN_SECONDS
            + priority["ambulances"] * self.AMBULANCE_GREEN_SECONDS
            + priority["blocked_ambulance_vehicles"] * self.BLOCKED_AMBULANCE_SECONDS
        )
        return max(
            self.MIN_GREEN_DURATION,
            min(self.MAX_GREEN_DURATION, math.ceil(duration))
        )

    def select_next_lane(self):
        lanes = self.CLOCKWISE_LANES

        priorities = self.lane_priorities()
        if not any(
            lane_priority["vehicles"]
            for lane_priority in priorities.values()
        ):
            current_index = lanes.index(self.current_green)
            return lanes[(current_index + 1) % len(lanes)]

        current_index = lanes.index(self.current_green)
        tie_break_order = (
            lanes[current_index + 1:]
            + lanes[:current_index + 1]
        )
        return max(
            tie_break_order,
            key=lambda lane_name: priorities[lane_name]["score"]
        )

    def switch_green(self, lane_name, reason):
        self.current_green = lane_name
        self.green_timer = 0
        self.green_duration = self.calculate_green_duration(lane_name)
        self.lane_wait_seconds[lane_name] = 0
        self.last_switch_reason = reason

    def best_competing_lane(self):
        priorities = self.lane_priorities()
        candidates = [
            lane_name
            for lane_name in self.CLOCKWISE_LANES
            if lane_name != self.current_green
        ]
        best_lane = max(
            candidates,
            key=lambda lane_name: priorities[lane_name]["score"]
        )
        return best_lane, priorities[best_lane], priorities[self.current_green]

    def should_preempt_current_green(self):
        best_lane, best_priority, current_priority = self.best_competing_lane()
        if best_priority["vehicles"] == 0:
            return None

        current_empty = current_priority["vehicles"] == 0
        if current_empty and self.green_timer >= 1:
            return best_lane

        has_emergency = best_priority["ambulances"] > 0
        score_gap = best_priority["score"] - current_priority["score"]
        if (
            has_emergency
            and self.green_timer >= self.MIN_GREEN_DURATION
            and score_gap >= self.EMERGENCY_PREEMPT_MARGIN
        ):
            return best_lane

        return None

    def advance_vehicle(self, vehicle, distance):
        was_waiting = vehicle.position <= self.STOP_LINE_POSITION
        vehicle.position += distance
        if was_waiting and vehicle.position > self.STOP_LINE_POSITION:
            vehicle.has_entered_intersection = True

    def remove_exited_vehicles(self, lane_name):
        lane = self.vehicle_repo.list_by_lane(lane_name)
        exited_ids = [v.id for v in lane if v.position > self.EXIT_THRESHOLD]
        for vid in exited_ids:
            self.vehicle_repo.remove(vid)

    def move_committed_vehicles(self, vehicle_speed=1.0):
        vehicle_speed = max(0.25, min(float(vehicle_speed), 3.0))
        for lane_name in self.CLOCKWISE_LANES:
            if lane_name == self.current_green:
                continue
            for vehicle in list(self.vehicle_repo.list_by_lane(lane_name)):
                if vehicle.position > self.STOP_LINE_POSITION:
                    vehicle.has_entered_intersection = True
                    self.advance_vehicle(
                        vehicle,
                        vehicle_speed * (
                            self.AMBULANCE_BOOST_SPEED
                            if vehicle.type == "ambulance"
                            else self.CAR_SPEED
                        )
                    )
            self.remove_exited_vehicles(lane_name)

    def move_vehicles(self, vehicle_speed=1.0):
        vehicle_speed = max(0.25, min(float(vehicle_speed), 3.0))
        green_lane = self.vehicle_repo.list_by_lane(self.current_green)
        has_ambulance_green = self.vehicle_repo.has_ambulance(self.current_green)

        for i in range(len(green_lane) - 1, -1, -1):
            vehicle = green_lane[i]

            if i == 0:
                self.advance_vehicle(
                    vehicle,
                    vehicle_speed * (
                        self.AMBULANCE_BOOST_SPEED
                        if vehicle.type == "ambulance"
                        else self.CAR_SPEED
                    )
                )
            else:
                ahead_vehicle = green_lane[i - 1]
                if vehicle.position + 1 < ahead_vehicle.position - 5:
                    self.advance_vehicle(
                        vehicle,
                        vehicle_speed * (
                            self.FOLLOWER_AMBULANCE_BOOST
                            if has_ambulance_green
                            else self.FOLLOWER_SPEED
                        )
                    )

        self.remove_exited_vehicles(self.current_green)

    def update_waiting_lanes(self, seconds):
        for lane_name in self.CLOCKWISE_LANES:
            lane_has_vehicles = self.vehicle_repo.lane_size(lane_name) > 0
            if lane_name == self.current_green or not lane_has_vehicles:
                self.lane_wait_seconds[lane_name] = 0
            else:
                self.lane_wait_seconds[lane_name] += seconds

    def update_signal(self, seconds=1):
        self.update_waiting_lanes(seconds)
        self.green_timer += seconds

        preempt_lane = self.should_preempt_current_green()
        if preempt_lane:
            self.switch_green(preempt_lane, "emergency_priority")
        elif self.green_timer >= self.green_duration:
            self.switch_green(self.select_next_lane(), "weighted_schedule")

    def step(self, vehicle_speed=1.0, signal_seconds=1):
        self.move_committed_vehicles(vehicle_speed=vehicle_speed)
        self.move_vehicles(vehicle_speed=vehicle_speed)
        self.update_signal(seconds=signal_seconds)

        return {
            "current_green": self.current_green,
            "green_timer": self.green_timer,
            "green_duration": self.green_duration,
            "lane_priorities": self.lane_priorities(),
            "switch_reason": self.last_switch_reason,
        }

    def get_state(self):
        return {
            "lanes": self.vehicle_repo.get_state(),
            "current_green": self.current_green,
            "green_timer": self.green_timer,
            "green_duration": self.green_duration,
            "lane_priorities": self.lane_priorities(),
            "switch_reason": self.last_switch_reason,
        }
